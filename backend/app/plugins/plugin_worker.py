"""
Plugin worker process for Haven Player.

This module provides the worker process architecture for running plugins
in separate processes (data plane) while keeping the control plane lightweight
in the main FastAPI process.

The control plane handles:
- Plugin discovery and metadata
- Task scheduling and Queuing
- Lightweight operations

The data plane (workers) handles:
- Heavy I/O operations (downloads, streaming, torrents)
- File processing
- Long-running tasks
"""

import multiprocessing as mp
import logging
import asyncio
import sys
from typing import Dict, Any, Optional
import signal

from app.plugins.plugin_interface import MediaSource, ArchiveResult, MediaType

logger = logging.getLogger(__name__)


class WorkerTask:
    """Task sent from control plane to worker."""
    def __init__(
        self,
        task_id: str,
        task_type: str,
        plugin_name: str,
        source: Dict[str, Any]
    ):
        self.task_id = task_id
        self.task_type = task_type  # "archive", "discover", "shutdown"
        self.plugin_name = plugin_name
        self.source = source
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for IPC."""
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "plugin_name": self.plugin_name,
            "source": self.source,
        }


class WorkerResult:
    """Result sent from worker to control plane."""
    def __init__(
        self,
        task_id: str,
        success: bool,
        data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None
    ):
        self.task_id = task_id
        self.success = success
        self.data = data or {}
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for IPC."""
        return {
            "task_id": self.task_id,
            "success": self.success,
            "data": self.data,
            "error": self.error,
        }


class WorkerProgress:
    """Progress update sent from worker to control plane."""
    def __init__(
        self,
        task_id: str,
        progress: float,
        message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.task_id = task_id
        self.progress = progress  # 0.0 to 1.0
        self.message = message
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for IPC."""
        return {
            "task_id": self.task_id,
            "progress": self.progress,
            "message": self.message,
            "metadata": self.metadata,
        }


def setup_worker_logging(plugin_name: str):
    """Configure logging for worker process."""
    log_format = f'[{plugin_name} Worker] %(asctime)s - %(levelname)s - %(message)s'
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        force=True  # Override existing config
    )


async def worker_execute_archive(
    plugin,
    task: WorkerTask
) -> WorkerResult:
    """
    Execute archive task in worker process.
    
    Args:
        plugin: Plugin instance to execute
        task: Task to execute
        
    Returns:
        WorkerResult with execution results
    """
    try:
        # Convert source dict to MediaSource
        source_dict = task.source
        source = MediaSource(
            source_id=source_dict["source_id"],
            media_type=MediaType(source_dict["media_type"]),
            uri=source_dict["uri"],
            metadata=source_dict.get("metadata", {}),
            priority=source_dict.get("priority", "normal"),
            estimated_size_bytes=source_dict.get("estimated_size_bytes"),
            estimated_duration_seconds=source_dict.get("estimated_duration_seconds"),
        )
        
        logger.info(f"Executing archive task {task.task_id} for source {source.source_id}")
        
        # Execute archive operation
        result = await plugin.archive(source)
        
        # Convert result to dict for IPC
        if result.success:
            return WorkerResult(
                task_id=task.task_id,
                success=True,
                data={
                    "output_path": result.output_path,
                    "file_size_bytes": result.file_size_bytes,
                    "duration_seconds": result.duration_seconds,
                    "metadata": result.metadata,
                },
            )
        else:
            return WorkerResult(
                task_id=task.task_id,
                success=False,
                error=result.error,
                data={}
            )
    
    except Exception as e:
        logger.error(f"Error executing archive task {task.task_id}: {e}", exc_info=True)
        return WorkerResult(
            task_id=task.task_id,
            success=False,
            error=str(e),
            data={}
        )


async def worker_execute_discover(
    plugin,
    task: WorkerTask
) -> WorkerResult:
    """
    Execute discover task in worker process.
    
    Args:
        plugin: Plugin instance to execute
        task: Task to execute
        
    Returns:
        WorkerResult with discovery results
    """
    try:
        logger.info(f"Executing discover task {task.task_id}")
        
        # Execute discover operation
        sources = await plugin.discover_sources()
        
        # Convert sources to dict for IPC
        sources_data = [source.to_dict() for source in sources]
        
        return WorkerResult(
            task_id=task.task_id,
            success=True,
            data={
                "sources": sources_data,
                "count": len(sources),
            },
        )
    
    except Exception as e:
        logger.error(f"Error executing discover task {task.task_id}: {e}", exc_info=True)
        return WorkerResult(
            task_id=task.task_id,
            success=False,
            error=str(e),
            data={}
        )


async def worker_execute_health_check(
    plugin,
    task: WorkerTask
) -> WorkerResult:
    """
    Execute health check task in worker process.
    
    Args:
        plugin: Plugin instance to check
        task: Task to execute
        
    Returns:
        WorkerResult with health status
    """
    try:
        logger.info(f"Executing health check task {task.task_id}")
        
        # Execute health check
        is_healthy = await plugin.health_check()
        
        return WorkerResult(
            task_id=task.task_id,
            success=True,
            data={
                "healthy": is_healthy,
            },
        )
    
    except Exception as e:
        logger.error(f"Error executing health check task {task.task_id}: {e}", exc_info=True)
        return WorkerResult(
            task_id=task.task_id,
            success=True,  # Health check itself succeeded, but plugin is unhealthy
            data={
                "healthy": False,
                "error": str(e),
            }
        )


def worker_main(
    plugin_name: str,
    plugin_config: Dict[str, Any],
    task_queue: mp.Queue,
    result_queue: mp.Queue,
    progress_queue: Optional[mp.Queue] = None
):
    """
    Main worker process entry point.
    
    This function runs in a separate process and handles:
    - Loading the plugin
    - Executing tasks from the control plane
    - Sending results back to the control plane
    
    Args:
        plugin_name: Name of plugin to load
        plugin_config: Configuration for plugin
        task_queue: Queue for receiving tasks from control plane
        result_queue: Queue for sending results to control plane
        progress_queue: Optional queue for sending progress updates
    """
    # Setup logging for worker process
    setup_worker_logging(plugin_name)
    
    logger.info(f"Worker process started for plugin: {plugin_name} (PID: {mp.current_process().pid})")
    
    # Setup graceful shutdown
    shutdown_event = asyncio.Event()
    
    def signal_handler(signum, frame):
        """Handle shutdown signals."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")
        shutdown_event.set()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Import plugin module
        import importlib
        plugin_module_name = f"app.plugins.builtin.{plugin_name.lower()}_plugin"
        plugin_module = importlib.import_module(plugin_module_name)
        plugin_class = getattr(plugin_module, f"{plugin_name}Plugin")
        
        # Initialize plugin
        plugin = plugin_class()
        
        # Run async initialization
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        init_success = loop.run_until_complete(plugin.initialize(plugin_config))
        
        if not init_success:
            logger.error(f"Plugin {plugin_name} failed to initialize")
            result_queue.put(WorkerResult(
                task_id="init_error",
                success=False,
                error=f"Plugin {plugin_name} failed to initialize"
            ).to_dict())
            return
        
        logger.info(f"Plugin initialized: {plugin_name}")
        
        # Main worker loop
        while not shutdown_event.is_set():
            try:
                # Wait for task from control plane (with timeout)
                try:
                    task_dict = task_queue.get(block=True, timeout=1.0)
                except:
                    # No task available, check shutdown event
                    continue
                
                task = WorkerTask(
                    task_id=task_dict["task_id"],
                    task_type=task_dict["task_type"],
                    plugin_name=task_dict["plugin_name"],
                    source=task_dict.get("source", {})
                )
                
                logger.info(f"Received task: {task.task_id} ({task.task_type})")
                
                # Execute task based on type
                if task.task_type == "shutdown":
                    logger.info("Received shutdown signal, exiting")
                    break
                
                elif task.task_type == "archive":
                    result = loop.run_until_complete(worker_execute_archive(plugin, task))
                    result_queue.put(result.to_dict())
                
                elif task.task_type == "discover":
                    result = loop.run_until_complete(worker_execute_discover(plugin, task))
                    result_queue.put(result.to_dict())
                
                elif task.task_type == "health_check":
                    result = loop.run_until_complete(worker_execute_health_check(plugin, task))
                    result_queue.put(result.to_dict())
                
                else:
                    error_msg = f"Unknown task type: {task.task_type}"
                    logger.error(error_msg)
                    result_queue.put(WorkerResult(
                        task_id=task.task_id,
                        success=False,
                        error=error_msg
                    ).to_dict())
                
            except Exception as e:
                logger.error(f"Error processing task: {e}", exc_info=True)
                if 'task' in locals():
                    result_queue.put(WorkerResult(
                        task_id=task.task_id,
                        success=False,
                        error=str(e)
                    ).to_dict())
        
        # Cleanup
        logger.info(f"Worker process shutting down for plugin: {plugin_name}")
        loop.close()
    
    except ImportError as e:
        logger.error(f"Failed to import plugin module {plugin_module_name}: {e}")
        result_queue.put(WorkerResult(
            task_id="import_error",
            success=False,
            error=f"Failed to import plugin: {str(e)}"
        ).to_dict())
    
    except Exception as e:
        logger.error(f"Worker process crashed: {e}", exc_info=True)
        # Send error to control plane if possible
        try:
            result_queue.put(WorkerResult(
                task_id="worker_error",
                success=False,
                error=f"Worker crashed: {str(e)}"
            ).to_dict())
        except:
            pass


if __name__ == "__main__":
    # This allows the worker to be run directly for testing
    import json
    
    if len(sys.argv) < 2:
        print("Usage: python plugin_worker.py <plugin_name> <config_json>")
        sys.exit(1)
    
    plugin_name = sys.argv[1]
    plugin_config = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    # Create queues
    task_queue = mp.Queue(maxsize=100)
    result_queue = mp.Queue()
    
    # Run worker
    worker_main(plugin_name, plugin_config, task_queue, result_queue)