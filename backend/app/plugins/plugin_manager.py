"""
Plugin manager for Haven Player.

This module provides the PluginManager class which handles:
- Plugin discovery from directories
- Dynamic plugin loading/unloading
- Plugin lifecycle management
- Plugin registry
- Control/Data plane separation with worker processes
"""

import importlib
import inspect
import logging
from pathlib import Path
from typing import Dict, List, Type, Optional, Set, Any

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
)
from app.plugins.plugin_worker_manager import PluginWorkerManager
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.job_scheduler import JobScheduler

logger = logging.getLogger(__name__)


class PluginManager:
    """
    Manages plugin lifecycle and loading with control/data plane support.
    
    The plugin manager is responsible for:
    - Discovering plugins from configured directories
    - Loading plugins dynamically at runtime
    - Managing plugin lifecycle (initialize, start, stop)
    - Maintaining a registry of loaded plugins
    - Controlling data plane workers for heavy I/O operations
    
    Control/Data Plane Architecture:
    - Control Plane: FastAPI main process (this class) - lightweight operations
    - Data Plane: Worker processes (PluginWorkerManager) - heavy I/O operations
    
    Example:
        plugin_manager = PluginManager(
            plugin_dirs=["app/plugins/builtin", "/opt/haven/plugins"]
        )
        plugin_manager.discover_plugins()
        await plugin_manager.load_plugin("MyPlugin", {"config": "value"})
    """
    
    def __init__(self, plugin_dirs: Optional[List[str]] = None, max_workers: int = 4):
        """
        Initialize the plugin manager.

        Args:
            plugin_dirs: List of directories to scan for plugins
            max_workers: Maximum number of worker processes for data plane
        """
        self.plugin_dirs = plugin_dirs or []
        self.plugins: Dict[str, ArchiverPlugin] = {}  # Loaded plugin instances
        self.plugin_classes: Dict[str, Type[ArchiverPlugin]] = {}  # Discovered plugin classes
        self.plugin_configs: Dict[str, Dict] = {}  # Plugin configurations
        self.job_scheduler: Optional['JobScheduler'] = None  # Job scheduler for creating default jobs

        # Control/Data plane: Worker manager for data plane operations
        self.worker_manager = PluginWorkerManager(max_workers=max_workers)
        
        # Plugins that should run in worker processes (heavy I/O)
        # Plugin names that match will use worker mode
        self.worker_plugins: Set[str] = {
            "BitTorrentPlugin",
            "YouTubePlugin",
            # Add more heavy I/O plugins here
        }
    
    def set_worker_plugins(self, plugin_names: List[str]) -> None:
        """
        Set which plugins should run in worker processes.

        Args:
            plugin_names: List of plugin names that should use worker mode
        """
        self.worker_plugins = set(plugin_names)
        logger.info(f"Worker mode enabled for plugins: {plugin_names}")

    def set_job_scheduler(self, job_scheduler: 'JobScheduler') -> None:
        """
        Set the job scheduler for creating default plugin jobs.

        Args:
            job_scheduler: JobScheduler instance
        """
        self.job_scheduler = job_scheduler
        logger.info("Job scheduler set in plugin manager")

    async def _create_default_jobs(self, plugin: ArchiverPlugin) -> None:
        """
        Create default jobs for a plugin on first load only.

        This method only creates default jobs when a plugin is loaded for the
        first time. Once default jobs have been initialized (even if empty),
        this method will not recreate them, allowing users to delete default
        jobs without them being automatically restored.

        Args:
            plugin: The loaded plugin instance
        """
        if not self.job_scheduler:
            logger.debug("No job scheduler set, skipping default job creation")
            return

        metadata = plugin.get_metadata()
        if not hasattr(metadata, 'default_jobs') or not metadata.default_jobs:
            return

        # Check if default jobs have already been initialized for this plugin
        from app.models.database import SessionLocal
        from app.models.plugin import Plugin as PluginModel
        from sqlalchemy.exc import IntegrityError
        
        db = SessionLocal()
        try:
            db_plugin = db.query(PluginModel).filter(
                PluginModel.name == metadata.name
            ).first()
            
            logger.info(f"[_create_default_jobs] {metadata.name}: db_plugin={db_plugin is not None}, "
                       f"default_jobs_initialized={db_plugin.default_jobs_initialized if db_plugin else 'N/A'}")
            
            if db_plugin and db_plugin.default_jobs_initialized:
                logger.info(f"Default jobs already initialized for {metadata.name}, skipping")
                return
            
            # If plugin record doesn't exist yet, create it now
            # (the API layer will update it with config later)
            if not db_plugin:
                logger.info(f"Creating plugin record for {metadata.name}")
                db_plugin = PluginModel(
                    name=metadata.name,
                    enabled=True,
                    config={},
                    default_jobs_initialized=False
                )
                db.add(db_plugin)
                try:
                    db.commit()
                    db.refresh(db_plugin)
                    logger.info(f"Created plugin record for {metadata.name}, id={db_plugin.id}")
                except IntegrityError:
                    # Race condition: another process created the record
                    db.rollback()
                    db_plugin = db.query(PluginModel).filter(
                        PluginModel.name == metadata.name
                    ).first()
                    logger.info(f"Race condition: plugin record for {metadata.name} already exists, "
                               f"default_jobs_initialized={db_plugin.default_jobs_initialized if db_plugin else 'N/A'}")
                    if db_plugin and db_plugin.default_jobs_initialized:
                        logger.info(f"Default jobs already initialized for {metadata.name} (race condition), skipping")
                        return
            
            # Create default jobs
            logger.info(f"Creating {len(metadata.default_jobs)} default job(s) for {metadata.name}...")
            for job_config in metadata.default_jobs:
                try:
                    await self.job_scheduler.ensure_job(
                        plugin_name=metadata.name,
                        job_name=job_config.job_name,
                        schedule=job_config.schedule,
                        method=job_config.method,
                        on_success=job_config.on_success,
                        config=job_config.config,
                        enabled=job_config.enabled
                    )
                    logger.info(f"✅ Created default job: {job_config.job_name}")
                except Exception as e:
                    logger.warning(f"⚠️  Failed to create default job {job_config.job_name}: {e}")
            
            # Mark default jobs as initialized so they won't be recreated
            db_plugin.default_jobs_initialized = True
            db.commit()
            logger.info(f"✅ Default jobs initialized for {metadata.name}")
            
        finally:
            db.close()
    
    def is_worker_plugin(self, plugin_name: str) -> bool:
        """
        Check if a plugin should run in worker mode.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            True if plugin should use worker mode, False otherwise
        """
        return plugin_name in self.worker_plugins
    
    def discover_plugins(self) -> int:
        """
        Scan plugin directories and discover plugin classes.

        This method recursively scans all configured plugin directories
        for Python files containing classes that inherit from ArchiverPlugin.

        Returns:
            Number of plugins discovered
        """
        logger.info("Starting plugin discovery process")
        logger.info(f"Configured plugin directories: {self.plugin_dirs}")
        
        discovered = 0
        
        for plugin_dir in self.plugin_dirs:
            plugin_path = Path(plugin_dir)
            if not plugin_path.exists():
                logger.warning(f"Plugin directory not found: {plugin_dir}")
                continue
            
            logger.info(f"Scanning plugin directory: {plugin_dir}")
            
            # Scan for Python files
            for py_file in plugin_path.glob("**/*.py"):
                # Skip __init__.py and test files
                if py_file.name.startswith("__") or py_file.name.startswith("test_"):
                    continue
                
                # Convert file path to module name relative to plugin directory
                relative_path = py_file.relative_to(plugin_path)
                module_name = str(relative_path.with_suffix("")).replace("/", ".").replace("\\", ".")
                
                # Build full module path by prepending base package to module name
                # For backend/app/plugins/builtin/bittorrent_plugin.py:
                # - plugin_dir is backend/app/plugins/builtin
                # - plugin_path is backend/app/plugins/builtin
                # - relative_path is bittorrent_plugin.py
                # - module_name becomes bittorrent_plugin
                # - Need to prepend 'app.plugins.builtin'
                
                # Get the absolute path of plugin_dir and find its Python package name
                plugin_abs_path = Path(plugin_dir).resolve()
                
                # Try to determine the Python package path from the project structure
                # The plugin files are typically under backend/app/plugins/
                # So we need to find where the Python source root is
                module_path_parts = []
                
                # Walk up from plugin file to find the Python source root
                # and build the full module import path
                current_path = py_file.resolve()
                
                # Find the 'backend' directory or 'app' directory to start the module path
                parts = current_path.parts
                app_index = -1
                backend_index = -1
                
                for i, part in enumerate(parts):
                    if part == "app" and i + 1 < len(parts) and parts[i + 1] == "plugins":
                        app_index = i
                        break
                    elif part == "backend":
                        backend_index = i
                        break
                
                if app_index != -1:
                    # Use backend/app as the project root for imports
                    # backend/app/plugins/builtin/bittorrent_plugin.py
                    # -> app.plugins.builtin.bittorrent_plugin
                    module_path_parts = list(parts[app_index:-1])  # ['app', 'plugins', 'builtin']
                    module_path_parts.append(py_file.stem)  # ['app', 'plugins', 'builtin', 'bittorrent_plugin']
                elif backend_index != -1:
                    # Find app directory under backend
                    for i in range(backend_index, len(parts)):
                        if parts[i] == "app":
                            module_path_parts = list(parts[i:-1])
                            module_path_parts.append(py_file.stem)
                            break
                else:
                    # Fallback: Use plugin_dir to construct module path
                    # Extract 'plugins' and everything after it
                    plugin_dir_parts = plugin_abs_path.parts
                    plugins_index = -1
                    for i, part in enumerate(plugin_dir_parts):
                        if part == "plugins":
                            plugins_index = i
                            break
                    
                    if plugins_index != -1 and plugins_index > 0:
                        # Include 'app' and everything after 'plugins'
                        module_path_parts = list(plugin_dir_parts[plugins_index - 1:])
                        module_path_parts.append(module_name)
                    else:
                        # Last resort: use just the module_name (might not work for complex structures)
                        module_path_parts = [module_name]
                
                import_path = ".".join(module_path_parts)
                
                # Import module dynamically
                try:
                    logger.info(f"Attempting to import module: {import_path} from file: {py_file}")
                    self._load_module_plugins(import_path, py_file)
                    discovered += 1
                    logger.info(f"Successfully processed module: {import_path}")
                except Exception as e:
                    logger.error(f"Failed to import module {import_path} from {py_file}", exc_info=True)
        
        logger.info(f"Discovered {discovered} plugins")
        return discovered
    
    def _load_module_plugins(self, module_name: str, py_file: Path) -> None:
        """
        Load plugins from a module.

        Args:
            module_name: Name of the module to import
            py_file: Path to the Python file (for error reporting)
        """
        logger.info(f"Loading plugins from module: {module_name}")
        try:
            module = importlib.import_module(module_name)
            logger.info(f"Successfully imported module: {module_name}")

            # Find all classes that inherit from ArchiverPlugin
            classes_found = inspect.getmembers(module, inspect.isclass)
            logger.info(f"Found {len(classes_found)} classes in module {module_name}")

            for name, obj in classes_found:
                logger.info(f"Examining class: {name} from module {obj.__module__}")
                # Check if class inherits from ArchiverPlugin
                is_subclass = issubclass(obj, ArchiverPlugin) if hasattr(obj, '__mro__') else False
                is_not_base = obj is not ArchiverPlugin
                is_correct_module = obj.__module__ == module_name
                is_not_abstract = not inspect.isabstract(obj)

                if (is_subclass and
                    is_not_base and
                    is_correct_module and
                    is_not_abstract):

                    # Register the plugin class
                    self.plugin_classes[name] = obj
                    logger.info(f"✓ Discovered plugin class: {name} from {module_name}")

                    # Get metadata for logging
                    try:
                        # Create temporary instance to get metadata
                        temp_plugin = obj()
                        metadata = temp_plugin.get_metadata()
                        logger.info(
                            f"  - {metadata.name} v{metadata.version}: "
                            f"{metadata.description}"
                        )
                    except Exception as e:
                        logger.warning(f"  - Could not get metadata for {name}: {e}")
        
        except ImportError as e:
            logger.error(f"Failed to import module {module_name}: {e}")
        except Exception as e:
            logger.error(f"Error loading plugins from {module_name}: {e}")
    
    async def load_plugin(self, plugin_name: str, config: Optional[Dict] = None) -> bool:
        """
        Load and initialize a specific plugin.

        If the plugin is in the worker_plugins set, it will be loaded in a
        separate worker process (data plane). Otherwise, it runs in the
        same process (control plane).

        Args:
            plugin_name: Name of the plugin (can be class name or metadata.name)
            config: Configuration dictionary for the plugin

        Returns:
            True if plugin loaded successfully, False otherwise
        """
        if plugin_name in self.plugins:
            logger.warning(f"Plugin {plugin_name} already loaded")
            return True

        # First try direct class name lookup
        if plugin_name not in self.plugin_classes:
            logger.info(f"Plugin '{plugin_name}' not found by class name, searching by metadata name")
            # Try to find plugin by metadata name
            found = False
            logger.info(f"Checking metadata for {len(self.plugin_classes)} discovered plugin classes")
            for cls_name, cls in self.plugin_classes.items():
                temp_plugin = cls()
                metadata = temp_plugin.get_metadata()
                logger.debug(f"Checking class '{cls_name}' with metadata.name '{metadata.name}'")
                if metadata.name == plugin_name:
                    plugin_name = cls_name  # Use class name for actual loading
                    found = True
                    logger.info(f"✓ Found plugin class '{cls_name}' for metadata name '{metadata.name}'")
                    break

            if not found:
                logger.error(f"✗ Plugin '{plugin_name}' not found in discovered plugins")
                if self.plugin_classes:
                    logger.error(f"Available plugin classes: {list(self.plugin_classes.keys())}")
                    # Also show metadata names for better debugging
                    logger.info("Available plugin metadata names:")
                    for cls_name, cls in self.plugin_classes.items():
                        try:
                            temp_plugin = cls()
                            metadata = temp_plugin.get_metadata()
                            logger.info(f"  - {metadata.name} (class: {cls_name})")
                        except Exception as e:
                            logger.error(f"  - {cls_name} (failed to get metadata: {e})")
                return False
        
        config = config or {}
        
        # Check if plugin should run in worker process
        if self.is_worker_plugin(plugin_name):
            logger.info(f"Loading {plugin_name} in worker process (data plane)")
            return await self._load_plugin_worker(plugin_name, config)
        else:
            logger.info(f"Loading {plugin_name} in same process (control plane)")
            return await self._load_plugin_same_process(plugin_name, config)
    
    async def _load_plugin_same_process(self, plugin_name: str, config: Dict) -> bool:
        """
        Load plugin in same process (control plane).
        
        Args:
            plugin_name: Name of the plugin
            config: Plugin configuration
            
        Returns:
            True if loaded successfully, False otherwise
        """
        try:
            # Instantiate plugin
            plugin_class = self.plugin_classes[plugin_name]
            plugin = plugin_class()
            
            # Get metadata
            metadata = plugin.get_metadata()
            logger.info(f"Loading plugin: {metadata.name} v{metadata.version}")
            
            # Initialize plugin
            init_success = await plugin.initialize(config)
            if not init_success:
                logger.error(f"Plugin {metadata.name} failed to initialize")
                return False
            
            # Store config
            self.plugin_configs[metadata.name] = config
            
            # Register plugin
            self.plugins[metadata.name] = plugin
            logger.info(f"✅ Loaded plugin: {metadata.name} v{metadata.version} (control plane)")

            # Create default jobs
            await self._create_default_jobs(plugin)

            return True
        
        except Exception as e:
            logger.error(f"Failed to load plugin {plugin_name}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    async def _load_plugin_worker(self, plugin_name: str, config: Dict) -> bool:
        """
        Load plugin in worker process (data plane).

        Args:
            plugin_name: Name of the plugin
            config: Plugin configuration

        Returns:
            True if loaded successfully, False otherwise
        """
        logger.info(f"Loading plugin '{plugin_name}' in worker process (data plane)")
        logger.info(f"Plugin configuration: {config}")
        try:
            # Start worker process
            logger.info(f"Starting worker process for plugin: {plugin_name}")
            success = await self.worker_manager.start_worker(plugin_name, config)
            
            if not success:
                logger.error(f"Failed to start worker for {plugin_name}")
                return False
            
            # Also load plugin in control plane for lightweight operations
            # (like discover_sources which doesn't require heavy I/O)
            plugin_class = self.plugin_classes[plugin_name]
            plugin = plugin_class()
            
            init_success = await plugin.initialize(config)
            if not init_success:
                logger.error(f"Plugin {plugin_name} failed to initialize in control plane")
                await self.worker_manager.stop_worker(plugin_name)
                return False
            
            # Store config
            self.plugin_configs[plugin_name] = config

            # Register plugin in control plane
            self.plugins[plugin_name] = plugin

            metadata = plugin.get_metadata()
            logger.info(f"✅ Loaded plugin: {metadata.name} v{metadata.version} (data plane)")

            # Create default jobs
            await self._create_default_jobs(plugin)

            return True
        
        except Exception as e:
            logger.error(f"Failed to load plugin {plugin_name} in worker: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    async def unload_plugin(self, plugin_name: str) -> bool:
        """
        Unload a plugin.

        If the plugin is running in worker mode, the worker process will be stopped.
        All jobs associated with the plugin will also be deleted.

        Args:
            plugin_name: Name of the plugin to unload

        Returns:
            True if plugin unloaded successfully, False otherwise
        """
        if plugin_name not in self.plugins:
            logger.warning(f"Plugin {plugin_name} not loaded")
            return False

        try:
            # Stop worker if running
            if self.is_worker_plugin(plugin_name):
                logger.info(f"Stopping worker for {plugin_name}")
                await self.worker_manager.stop_worker(plugin_name)

            # Delete all jobs for this plugin
            if self.job_scheduler:
                logger.info(f"Deleting jobs for plugin {plugin_name}")
                deleted_count = await self.job_scheduler.delete_jobs_for_plugin(plugin_name)
                logger.info(f"Deleted {deleted_count} job(s) for plugin {plugin_name}")

            # Remove plugin from registry
            del self.plugins[plugin_name]
            if plugin_name in self.plugin_configs:
                del self.plugin_configs[plugin_name]

            logger.info(f"Unloaded plugin: {plugin_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to unload plugin {plugin_name}: {e}")
            return False
    
    async def shutdown(self) -> None:
        """
        Shutdown all workers and cleanup resources.
        
        This should be called when the application is shutting down.
        """
        logger.info("Shutting down plugin manager")
        
        # Stop all workers
        await self.worker_manager.stop_all_workers()
        
        # Clear plugins
        self.plugins.clear()
        self.plugin_configs.clear()
        
        logger.info("Plugin manager shutdown complete")
    
    def get_plugin(self, plugin_name: str) -> Optional[ArchiverPlugin]:
        """
        Get a loaded plugin instance.
        
        Args:
            plugin_name: Name of the plugin to get
            
        Returns:
            Plugin instance if found and loaded, None otherwise
        """
        return self.plugins.get(plugin_name)
    
    def list_plugins(self) -> List[PluginMetadata]:
        """
        List all available plugins (both loaded and discovered).
        
        Returns:
            List of PluginMetadata objects
        """
        metadata_list = []
        seen_names = set()
        
        # Loaded plugins
        for plugin in self.plugins.values():
            metadata = plugin.get_metadata()
            metadata_list.append(metadata)
            seen_names.add(metadata.name)
        
        # Discovered but unloaded plugins
        for plugin_name, plugin_class in self.plugin_classes.items():
            try:
                # Create temporary instance to get metadata
                temp_plugin = plugin_class()
                metadata = temp_plugin.get_metadata()
                
                # Only add if not already in loaded plugins
                if metadata.name not in seen_names:
                    metadata_list.append(metadata)
                    seen_names.add(metadata.name)
            except Exception as e:
                logger.error(f"Failed to get metadata for {plugin_name}: {e}")
        
        return metadata_list
    
    def get_loaded_plugins(self) -> List[str]:
        """
        Get list of loaded plugin names.
        
        Returns:
            List of plugin names that are currently loaded
        """
        return list(self.plugins.keys())
    
    def is_plugin_loaded(self, plugin_name: str) -> bool:
        """
        Check if a plugin is loaded.
        
        Args:
            plugin_name: Name of the plugin to check
            
        Returns:
            True if plugin is loaded, False otherwise
        """
        return plugin_name in self.plugins
    
    async def discover_all_sources(self) -> Dict[str, List[MediaSource]]:
        """
        Discover sources from all loaded plugins.
        
        Returns:
            Dictionary mapping plugin names to lists of MediaSource objects
        """
        all_sources = {}
        
        for plugin_name, plugin in self.plugins.items():
            try:
                sources = await plugin.discover_sources()
                all_sources[plugin_name] = sources
                logger.info(f"Plugin {plugin_name} discovered {len(sources)} sources")
            except Exception as e:
                logger.error(f"Failed to discover sources from {plugin_name}: {e}")
                all_sources[plugin_name] = []
        
        return all_sources
    
    async def archive_source(
        self,
        plugin_name: str,
        source: MediaSource
    ) -> ArchiveResult:
        """
        Archive a source using a specific plugin.
        
        If the plugin is in worker mode, the task will be dispatched to the
        worker process. Otherwise, it executes in the same process.
        
        Args:
            plugin_name: Name of the plugin to use
            source: MediaSource to archive
            
        Returns:
            ArchiveResult from the plugin
        """
        plugin = self.get_plugin(plugin_name)
        
        if not plugin:
            logger.error(f"Plugin {plugin_name} not loaded")
            return ArchiveResult(
                success=False,
                error=f"Plugin {plugin_name} not loaded"
            )
        
        try:
            # Check if plugin runs in worker
            if self.is_worker_plugin(plugin_name):
                logger.info(f"Archiving source {source.source_id} using {plugin_name} (data plane)")
                return await self._archive_source_worker(plugin_name, source)
            else:
                logger.info(f"Archiving source {source.source_id} using {plugin_name} (control plane)")
                result = await plugin.archive(source)
                
                if result.success:
                    logger.info(f"✅ Successfully archived {source.source_id}")
                else:
                    logger.error(f"❌ Failed to archive {source.source_id}: {result.error}")
                
                return result
        
        except Exception as e:
            logger.error(f"Error archiving source {source.source_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return ArchiveResult(
                success=False,
                error=str(e)
            )
    
    async def _archive_source_worker(self, plugin_name: str, source: MediaSource) -> ArchiveResult:
        """
        Archive source using worker process (data plane).
        
        Args:
            plugin_name: Name of the plugin
            source: MediaSource to archive
            
        Returns:
            ArchiveResult
        """
        try:
            # Prepare source data for IPC
            source_dict = {
                "source_id": source.source_id,
                "media_type": source.media_type.value,
                "uri": source.uri,
                "metadata": source.metadata,
                "priority": source.priority,
                "estimated_size_bytes": source.estimated_size_bytes,
                "estimated_duration_seconds": source.estimated_duration_seconds,
            }
            
            # Submit task to worker
            task_info = await self.worker_manager.submit_task(
                plugin_name=plugin_name,
                task_type="archive",
                source=source_dict
            )
            
            # Wait for result (with timeout)
            task_id = task_info["task_id"]
            result = await self.worker_manager.get_task_result(task_id, timeout=300.0)  # 5 minutes
            
            if result is None:
                logger.error(f"Timeout waiting for archive task {task_id}")
                return ArchiveResult(
                    success=False,
                    error=f"Archive task timed out after 5 minutes"
                )
            
            if not result["success"]:
                logger.error(f"Worker task failed: {result.get('error')}")
                return ArchiveResult(
                    success=False,
                    error=result.get("error", "Unknown error")
                )
            
            # Return successful result
            data = result.get("data", {})
            return ArchiveResult(
                success=True,
                output_path=data.get("output_path"),
                file_size_bytes=data.get("file_size_bytes"),
                duration_seconds=data.get("duration_seconds"),
                metadata=data.get("metadata", {}),
            )
        
        except Exception as e:
            logger.error(f"Error archiving source {source.source_id} in worker: {e}")
            return ArchiveResult(
                success=False,
                error=str(e)
            )
    
    async def health_check_all(self) -> Dict[str, bool]:
        """
        Health check all loaded plugins.
        
        For worker plugins, also checks worker process health.
        
        Returns:
            Dictionary mapping plugin names to health status (True=healthy)
        """
        health_status = {}
        
        # Check worker health
        worker_health = await self.worker_manager.health_check_all_workers()
        
        for plugin_name, plugin in self.plugins.items():
            try:
                # For worker plugins, check both plugin and worker health
                if self.is_worker_plugin(plugin_name):
                    worker_healthy = worker_health.get(plugin_name, False)
                    
                    if not worker_healthy:
                        health_status[plugin_name] = False
                        logger.warning(f"Plugin {plugin_name} worker is unhealthy")
                        continue
                
                # Check plugin health
                is_healthy = await plugin.health_check()
                health_status[plugin_name] = is_healthy
                
                status = "✅ healthy" if is_healthy else "❌ unhealthy"
                mode = "data plane" if self.is_worker_plugin(plugin_name) else "control plane"
                logger.info(f"Plugin {plugin_name} ({mode}) health: {status}")
            
            except Exception as e:
                logger.error(f"Health check failed for {plugin_name}: {e}")
                health_status[plugin_name] = False
        
        return health_status
    
    async def restart_plugin(self, plugin_name: str) -> bool:
        """
        Restart a plugin (unload and reload with same config).
        
        For worker plugins, this will restart the worker process.
        
        Args:
            plugin_name: Name of the plugin to restart
            
        Returns:
            True if restart successful, False otherwise
        """
        if plugin_name not in self.plugins:
            logger.warning(f"Plugin {plugin_name} not loaded, cannot restart")
            return False
        
        # Get current config
        config = self.plugin_configs.get(plugin_name, {})
        mode = "data plane" if self.is_worker_plugin(plugin_name) else "control plane"
        
        logger.info(f"Restarting plugin {plugin_name} ({mode})")
        
        # Unload
        unload_success = await self.unload_plugin(plugin_name)
        if not unload_success:
            logger.error(f"Failed to unload plugin {plugin_name} during restart")
            return False
        
        # Reload
        load_success = await self.load_plugin(plugin_name, config)
        return load_success
    
    def get_worker_status(self, plugin_name: str) -> Optional[Dict[str, Any]]:
        """
        Get worker process status for a plugin.
        
        Args:
            plugin_name: Name of the plugin
            
        Returns:
            Worker status or None if plugin not in worker mode
        """
        if not self.is_worker_plugin(plugin_name):
            return None
        
        return self.worker_manager.get_worker_status(plugin_name)
    
    def list_workers(self) -> List[Dict[str, Any]]:
        """
        List all worker processes and their status.
        
        Returns:
            List of worker status information
        """
        return self.worker_manager.list_workers()
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get status of a worker task.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Task status or None if not found
        """
        return await self.worker_manager.get_task_status(task_id)