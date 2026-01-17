"""
Plugin management API endpoints for Haven Player.

This module provides REST API endpoints for managing plugins.
"""

from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging
from datetime import datetime
from pydantic import BaseModel, Field

from app.plugins.plugin_manager import PluginManager
from app.plugins.plugin_interface import MediaSource
from app.plugins.mixins import (
    CollectionPluginMixin,
    SourcePluginMixin,
    ConfigurablePluginMixin,
    ObservablePluginMixin,
)
from app.models.database import get_db
from app.models.plugin import Plugin as PluginModel

router = APIRouter()
logger = logging.getLogger(__name__)


# Pydantic models for plugin operations

class PluginOperationRequest(BaseModel):
    """Request model for executing plugin operations."""
    plugin_name: str = Field(..., description="Name of the plugin")
    operation: str = Field(..., description="Operation name to execute")
    params: Optional[Dict[str, Any]] = Field(None, description="Operation parameters")

# Global plugin manager instance (will be set in main.py)
plugin_manager: PluginManager = None


def get_plugin_manager() -> PluginManager:
    """Dependency to get plugin manager instance."""
    global plugin_manager
    if plugin_manager is None:
        raise HTTPException(status_code=500, detail="Plugin manager not initialized")
    return plugin_manager


def _serialize_operation_result(value: object) -> object:
    """Recursively serialize plugin operation results for JSON responses."""
    if hasattr(value, "to_dict"):
        to_dict = getattr(value, "to_dict")
        if callable(to_dict):
            return to_dict()

    if isinstance(value, dict):
        return {str(key): _serialize_operation_result(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_serialize_operation_result(item) for item in value]

    if isinstance(value, tuple):
        return [_serialize_operation_result(item) for item in value]

    if isinstance(value, set):
        return [_serialize_operation_result(item) for item in value]

    return value


@router.get("", response_model=List[Dict[str, Any]])
async def list_plugins(
    plugin_mgr: PluginManager = Depends(get_plugin_manager),
    db: Session = Depends(get_db)
):
    """
    List all available plugins (both loaded and discovered).
    
    Returns metadata for all plugins including their load status.
    """
    try:
        metadata_list = plugin_mgr.list_plugins()
        loaded_plugins = plugin_mgr.get_loaded_plugins()
        
        result = []
        for meta in metadata_list:
            # Check if plugin is loaded
            plugin_data = meta.to_dict()
            plugin_data["loaded"] = meta.name in loaded_plugins
            
            # Get configuration from database if exists
            db_plugin = db.query(PluginModel).filter(
                PluginModel.name == meta.name
            ).first()
            
            if db_plugin:
                plugin_data["enabled"] = db_plugin.enabled
                plugin_data["config"] = db_plugin.config
                plugin_data["priority"] = db_plugin.priority
            else:
                plugin_data["enabled"] = False
                plugin_data["config"] = None
                plugin_data["priority"] = 0
            
            result.append(plugin_data)
        
        return result
    
    except Exception as e:
        logger.error(f"Error listing plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover")
async def discover_plugins(plugin_mgr: PluginManager = Depends(get_plugin_manager)):
    """
    Scan plugin directories and discover new plugins.
    
    This should be called if new plugins have been added to the
    plugin directories after the server started.
    """
    try:
        discovered_count = plugin_mgr.discover_plugins()
        return {
            "message": f"Discovered {discovered_count} plugins",
            "count": discovered_count
        }
    except Exception as e:
        logger.error(f"Error discovering plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{plugin_name}/load")
async def load_plugin(
    plugin_name: str,
    config: Dict[str, Any] = {},
    plugin_mgr: PluginManager = Depends(get_plugin_manager),
    db: Session = Depends(get_db)
):
    """
    Load a specific plugin.
    
    Args:
        plugin_name: Name of the plugin to load
        config: Optional configuration for the plugin
    """
    try:
        # Load the plugin
        success = await plugin_mgr.load_plugin(plugin_name, config)
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to load plugin {plugin_name}"
            )
        
        # Update database if plugin entry exists
        db_plugin = db.query(PluginModel).filter(
            PluginModel.name == plugin_name
        ).first()

        persisted_config: Dict[str, object] = config.copy() if config else {}

        if not persisted_config:
            plugin = plugin_mgr.get_plugin(plugin_name)
            if plugin and hasattr(plugin, "get_default_config"):
                try:
                    persisted_config = plugin.get_default_config()
                except Exception as e:
                    logger.warning(
                        f"Failed to load default config for {plugin_name}: {e}"
                    )

        if not db_plugin:
            db_plugin = PluginModel(
                name=plugin_name,
                enabled=True,
                config=persisted_config if persisted_config else None,
            )
            db.add(db_plugin)
            db.commit()
            db.refresh(db_plugin)
        elif persisted_config:
            db_plugin.config = persisted_config
            db_plugin.updated_at = datetime.utcnow()
            db.commit()
        
        return {"message": f"Plugin {plugin_name} loaded successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading plugin {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{plugin_name}/unload")
async def unload_plugin(
    plugin_name: str,
    plugin_mgr: PluginManager = Depends(get_plugin_manager)
):
    """
    Unload a specific plugin.
    
    Args:
        plugin_name: Name of the plugin to unload
    """
    try:
        success = await plugin_mgr.unload_plugin(plugin_name)
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to unload plugin {plugin_name}"
            )
        
        return {"message": f"Plugin {plugin_name} unloaded successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unloading plugin {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{plugin_name}/restart")
async def restart_plugin(
    plugin_name: str,
    plugin_mgr: PluginManager = Depends(get_plugin_manager)
):
    """
    Restart a plugin (unload and reload with same config).
    
    Args:
        plugin_name: Name of the plugin to restart
    """
    try:
        success = await plugin_mgr.restart_plugin(plugin_name)
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to restart plugin {plugin_name}"
            )
        
        return {"message": f"Plugin {plugin_name} restarted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restarting plugin {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources")
async def discover_sources(plugin_mgr: PluginManager = Depends(get_plugin_manager)):
    """
    Discover sources from all loaded plugins.
    
    Returns a list of all available media sources from all plugins.
    """
    try:
        all_sources = await plugin_mgr.discover_all_sources()
        
        # Flatten results
        sources = []
        for plugin_name, plugin_sources in all_sources.items():
            for source in plugin_sources:
                sources.append({
                    "plugin": plugin_name,
                    "source_id": source.source_id,
                    "media_type": source.media_type.value,
                    "uri": source.uri,
                    "metadata": source.metadata,
                    "priority": source.priority,
                })
        
        return {"sources": sources, "count": len(sources)}
    
    except Exception as e:
        logger.error(f"Error discovering sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plugin_name}/sources")
async def discover_plugin_sources(
    plugin_name: str,
    plugin_mgr: PluginManager = Depends(get_plugin_manager)
):
    """
    Discover sources from a specific plugin.
    
    Args:
        plugin_name: Name of the plugin
    """
    try:
        plugin = plugin_mgr.get_plugin(plugin_name)
        
        if not plugin:
            raise HTTPException(
                status_code=404,
                detail=f"Plugin {plugin_name} not loaded"
            )
        
        sources = await plugin.discover_sources()
        
        return {
            "plugin": plugin_name,
            "sources": [source.to_dict() for source in sources],
            "count": len(sources)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error discovering sources for {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/archive")
async def archive_source(
    plugin_name: str,
    source_id: str,
    plugin_mgr: PluginManager = Depends(get_plugin_manager)
):
    """
    Archive a specific source using a plugin.
    
    Args:
        plugin_name: Name of the plugin to use
        source_id: ID of the source to archive
    """
    try:
        plugin = plugin_mgr.get_plugin(plugin_name)
        
        if not plugin:
            raise HTTPException(
                status_code=404,
                detail=f"Plugin {plugin_name} not loaded"
            )
        
        # Find source
        sources = await plugin.discover_sources()
        source = next((s for s in sources if s.source_id == source_id), None)
        
        if not source:
            raise HTTPException(
                status_code=404,
                detail=f"Source {source_id} not found in plugin {plugin_name}"
            )
        
        # Archive
        result = await plugin_mgr.archive_source(plugin_name, source)
        
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=f"Archive failed: {result.error}"
            )
        
        return {
            "success": True,
            "output_path": result.output_path,
            "file_size_bytes": result.file_size_bytes,
            "duration_seconds": result.duration_seconds,
            "metadata": result.metadata,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=List[Dict[str, Any]])
async def plugin_health(plugin_mgr: PluginManager = Depends(get_plugin_manager)):
    """
    Health check all loaded plugins.

    Returns the health status of all loaded plugins.
    """
    try:
        health_status_dict = await plugin_mgr.health_check_all()

        # Convert dict to array format expected by frontend
        health_status_array = []
        for plugin_name, is_healthy in health_status_dict.items():
            health_status_array.append({
                "plugin_name": plugin_name,
                "healthy": is_healthy,
                "last_check": datetime.utcnow().isoformat() + "Z",
                "error": None if is_healthy else "Plugin health check failed"
            })

        return health_status_array
    except Exception as e:
        logger.error(f"Error checking plugin health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{plugin_name}/config")
async def update_plugin_config(
    plugin_name: str,
    config: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Update plugin configuration in database.
    
    Args:
        plugin_name: Name of the plugin
        config: New configuration
    """
    try:
        db_plugin = db.query(PluginModel).filter(
            PluginModel.name == plugin_name
        ).first()
        
        if not db_plugin:
            # Create new plugin entry
            db_plugin = PluginModel(
                name=plugin_name,
                enabled=True,
                config=config,
            )
            db.add(db_plugin)
        else:
            # Update existing plugin entry
            current_config: Dict[str, object] = dict(db_plugin.config) if db_plugin.config else {}
            current_config.update(config)
            db_plugin.config = current_config
            db_plugin.updated_at = datetime.utcnow()
            flag_modified(db_plugin, "config")
        
        db.commit()
        db.refresh(db_plugin)
        
        return {"message": f"Plugin {plugin_name} configuration updated", "config": db_plugin.config}
    
    except Exception as e:
        logger.error(f"Error updating plugin config: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plugin_name}/config")
async def get_plugin_config(
    plugin_name: str,
    db: Session = Depends(get_db),
    plugin_mgr: PluginManager = Depends(get_plugin_manager)
):
    """
    Get plugin configuration from database or from plugin defaults.
    
    Args:
        plugin_name: Name of the plugin
    """
    try:
        db_plugin = db.query(PluginModel).filter(
            PluginModel.name == plugin_name
        ).first()
        
        # If configuration exists in database, return it
        if db_plugin:
            return db_plugin.to_dict()
        
        # If no database configuration, check if plugin is loaded and has default config
        plugin = plugin_mgr.get_plugin(plugin_name)
        
        if plugin and hasattr(plugin, 'get_default_config'):
            # Return default configuration from plugin
            default_config = plugin.get_default_config()
            return {
                "name": plugin_name,
                "enabled": False,
                "config": default_config,
                "priority": 0,
                "is_default": True
            }
        
        # Plugin doesn't exist or doesn't support configuration
        raise HTTPException(
            status_code=404,
            detail=f"Plugin {plugin_name} configuration not found and plugin does not support default configuration"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting plugin config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{plugin_name}/config")
async def delete_plugin_config(
    plugin_name: str,
    db: Session = Depends(get_db)
):
    """
    Delete plugin configuration from database.
    
    Args:
        plugin_name: Name of the plugin
    """
    try:
        db_plugin = db.query(PluginModel).filter(
            PluginModel.name == plugin_name
        ).first()
        
        if not db_plugin:
            raise HTTPException(
                status_code=404,
                detail=f"Plugin {plugin_name} configuration not found"
            )
        
        db.delete(db_plugin)
        db.commit()
        
        return {"message": f"Plugin {plugin_name} configuration deleted"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting plugin config: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ========== Generic Plugin Operation Endpoints ==========

@router.get("/{plugin_name}/operations")
async def list_plugin_operations(plugin_name: str, plugin_mgr: PluginManager = Depends(get_plugin_manager)):
    """
    List all available operations for a plugin.
    
    This endpoint uses introspection to discover what operations a plugin supports.
    It returns standardized operations based on implemented interfaces and mixins.
    
    All plugins support core operations:
    - discover_sources: Discover available media sources
    - archive: Archive a specific source
    - health_check: Check plugin health
    
    Additional operations depend on implemented mixins:
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, get_subscription, 
      discover_from_subscription, archive_from_subscription
    - SourcePluginMixin: list_sources, get_source_status
    - ConfigurablePluginMixin: get_config, update_config, get_default_config
    - ObservablePluginMixin: add_event_callback, remove_event_callback, get_event_stream
    """
    try:
        plugin = plugin_mgr.get_plugin(plugin_name)
        if not plugin:
            raise HTTPException(status_code=404, detail="Plugin not loaded")
        
        operations = []
        
        # Core operations (all plugins implement these)
        core_ops = [
            {
                "name": "discover_sources",
                "type": "query",
                "description": "Discover all available media sources from this plugin",
                "params": {},
                "returns": "List[MediaSource]"
            },
            {
                "name": "archive",
                "type": "command",
                "description": "Archive a specific media source",
                "params": {
                    "source": "MediaSource object with source_id, media_type, uri"
                },
                "returns": "ArchiveResult with output_path, file_size_bytes, etc."
            },
            {
                "name": "health_check",
                "type": "query",
                "description": "Check if plugin is healthy and operational",
                "params": {},
                "returns": "bool"
            },
        ]
        operations.extend(core_ops)
        
        # Check for collection operations
        if isinstance(plugin, CollectionPluginMixin) or hasattr(plugin, 'subscribe'):
            collection_ops = [
                {
                    "name": "subscribe",
                    "type": "command",
                    "description": "Subscribe to a collection (channel, tracker, playlist)",
                    "params": {
                        "collection_uri": "string - URI of the collection",
                        "config": "dict (optional) - Configuration (quality, format, etc.)"
                    },
                    "returns": "Dict with subscription info"
                },
                {
                    "name": "unsubscribe",
                    "type": "command",
                    "description": "Unsubscribe from a collection",
                    "params": {
                        "collection_id": "string - ID of the collection to unsubscribe from"
                    },
                    "returns": "Dict with result"
                },
                {
                    "name": "list_subscriptions",
                    "type": "query",
                    "description": "List all subscriptions",
                    "params": {},
                    "returns": "List[Dict] with subscription details"
                },
                {
                    "name": "get_subscription",
                    "type": "query",
                    "description": "Get subscription details",
                    "params": {
                        "collection_id": "string - ID of the subscription"
                    },
                    "returns": "Dict with full subscription details"
                },
                {
                    "name": "discover_from_subscription",
                    "type": "query",
                    "description": "Discover sources from a specific subscription",
                    "params": {
                        "collection_id": "string - ID of the subscription"
                    },
                    "returns": "List[MediaSource]"
                },
                {
                    "name": "archive_from_subscription",
                    "type": "command",
                    "description": "Archive all sources from a subscription",
                    "params": {
                        "collection_id": "string - ID of the subscription"
                    },
                    "returns": "List[ArchiveResult]"
                },
            ]
            operations.extend(collection_ops)
        
        # Check for source operations
        if isinstance(plugin, SourcePluginMixin) or hasattr(plugin, 'list_sources'):
            source_ops = [
                {
                    "name": "list_sources",
                    "type": "query",
                    "description": "List all known sources (discovered and archived)",
                    "params": {},
                    "returns": "List[Dict] with source details"
                },
                {
                    "name": "get_source_status",
                    "type": "query",
                    "description": "Get status of a specific source",
                    "params": {
                        "source_id": "string - ID of the source"
                    },
                    "returns": "Dict with source status"
                },
            ]
            operations.extend(source_ops)
        
        # Check for configuration operations
        if isinstance(plugin, ConfigurablePluginMixin) or hasattr(plugin, 'get_config'):
            config_ops = [
                {
                    "name": "get_config",
                    "type": "query",
                    "description": "Get current plugin configuration",
                    "params": {},
                    "returns": "Dict with current configuration"
                },
                {
                    "name": "update_config",
                    "type": "command",
                    "description": "Update plugin configuration",
                    "params": {
                        "config": "dict - New configuration (partial update allowed)"
                    },
                    "returns": "bool"
                },
                {
                    "name": "get_default_config",
                    "type": "query",
                    "description": "Get default configuration",
                    "params": {},
                    "returns": "Dict with default configuration"
                },
            ]
            operations.extend(config_ops)
        
        return {
            "plugin": plugin_name,
            "operations": operations
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing operations for {plugin_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_plugin_operation(request: PluginOperationRequest, plugin_mgr: PluginManager = Depends(get_plugin_manager)):
    """
    Execute any plugin operation dynamically.
    
    This is the UNIVERSAL endpoint for all plugin operations.
    No plugin-specific API files needed!
    
    Examples:
    
    1. Subscribe to YouTube channel:
    ```json
    {
        "plugin_name": "YouTubePlugin",
        "operation": "subscribe",
        "params": {
            "collection_uri": "https://youtube.com/@TED",
            "config": {
                "video_format": "1080p",
                "download_subtitles": false
            }
        }
    }
    ```
    
    2. List YouTube subscriptions:
    ```json
    {
        "plugin_name": "YouTubePlugin",
        "operation": "list_subscriptions",
        "params": {}
    }
    ```
    
    3. Archive specific video:
    ```json
    {
        "plugin_name": "YouTubePlugin",
        "operation": "archive",
        "params": {
            "source": {
                "source_id": "video_id",
                "media_type": "youtube",
                "uri": "https://youtube.com/watch?v=...",
                "metadata": {}
            }
        }
    }
    ```
    
    4. Discover all sources:
    ```json
    {
        "plugin_name": "YouTubePlugin",
        "operation": "discover_sources",
        "params": {}
    }
    ```
    """
    try:
        # Get plugin
        plugin = plugin_mgr.get_plugin(request.plugin_name)
        if not plugin:
            raise HTTPException(status_code=404, detail=f"Plugin {request.plugin_name} not loaded")
        
        # Check if operation exists
        if not hasattr(plugin, request.operation):
            # List available operations
            if isinstance(plugin, CollectionPluginMixin):
                available = [
                    "subscribe", "unsubscribe", "list_subscriptions", "get_subscription",
                    "discover_from_subscription", "archive_from_subscription"
                ]
                available_str = ", ".join(available)
            else:
                available_str = "discover_sources, archive, health_check"
            
            raise HTTPException(
                status_code=400,
                detail=f"Plugin does not support operation: {request.operation}. "
                f"Available operations: {available_str}"
            )
        
        # Get method dynamically (same pattern as job scheduler!)
        method = getattr(plugin, request.operation)
        
        # Validate it's callable
        if not callable(method):
            raise HTTPException(
                status_code=400,
                detail=f"Operation {request.operation} is not callable"
            )
        
        logger.info(f"Executing {request.plugin_name}.{request.operation}")
        
        # Call with parameters
        if request.params:
            result = await method(**request.params)
        else:
            result = await method()

        serialized_result: object = _serialize_operation_result(result)
        
        return {
            "success": True,
            "plugin": request.plugin_name,
            "operation": request.operation,
            "result": serialized_result
        }
    
    except HTTPException:
        raise
    except TypeError as e:
        # Parameter mismatch
        logger.error(f"Parameter mismatch for {request.plugin_name}.{request.operation}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid parameters for operation {request.operation}: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error executing {request.plugin_name}.{request.operation}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
