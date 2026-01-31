from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
import logging

from app.api.plugins import plugin_manager
from app.api.recording import recording_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/operations", response_model=Dict[str, Any])
async def get_active_operations():
    """
    Get currently active operations from all plugins.
    
    This is a lightweight endpoint that returns active/recording operations
    without calling discover_sources() on plugins. Used by the DePIN dashboard
    for status updates.
    
    This endpoint now uses the plugin interface's get_active_operations() method
    to retrieve active operations from all loaded plugins in a generalized way.
    """
    try:
        if not plugin_manager:
            return {"success": False, "operations": []}
        
        operations = []
        
        # Get active operations from all loaded plugins
        loaded_plugins = plugin_manager.get_loaded_plugins()
        
        for plugin_name in loaded_plugins:
            try:
                plugin = plugin_manager.get_plugin(plugin_name)
                if not plugin:
                    logger.warning(f"Plugin {plugin_name} not found in registry")
                    continue
                
                # Get active operations from this plugin
                plugin_operations = await plugin.get_active_operations()
                operations.extend(plugin_operations)
                
                logger.debug(f"Retrieved {len(plugin_operations)} active operations from {plugin_name}")
                
            except Exception as e:
                logger.error(f"Error getting active operations from plugin {plugin_name}: {e}", exc_info=True)
                # Continue with other plugins even if one fails
                continue
        
        return {"success": True, "operations": operations}
    
    except Exception as e:
        logger.error(f"Error getting active operations: {e}", exc_info=True)
        return {"success": False, "operations": [], "error": str(e)}


@router.post("/tick", response_model=Dict[str, Any])
async def depin_tick():
    """
    Trigger a 'tick' of the DePin Auto-Recording Agent (Plugin-Aware Version).
    
    Logic:
    1. Discover sources from all loaded plugins
    2. Rank sources by priority (participants + priority level)
    3. Check if we're currently recording
    4. Switch to better source if needed
    
    This endpoint is designed to be called periodically (e.g., every 1 minute) by the DePin node (frontend).
    """
    try:
        if not plugin_manager:
            return {"success": False, "message": "Plugin manager not initialized"}
        
        # 1. Discover sources from all loaded plugins
        all_sources = await plugin_manager.discover_all_sources()
        
        # Flatten and filter sources
        available_sources: List[Tuple[str, Dict[str, Any]]] = []
        for plugin_name, sources in all_sources.items():
            plugin = plugin_manager.get_plugin(plugin_name)
            if not plugin:
                continue
            
            for source in sources:
                available_sources.append((plugin_name, source))
        
        if not available_sources:
            return {"success": True, "message": "No sources available from plugins"}
        
        # 2. Rank sources by priority and participants
        def rank_source(item: Tuple[str, Dict[str, Any]]) -> tuple:
            plugin_name, source = item
            # Priority: high (3) > normal (2) > low (1)
            priority_score = {"high": 3, "normal": 2, "low": 1}.get(source.priority, 0)
            # Participants count
            participants = source.metadata.get("participants", 0)
            return (priority_score, participants)
        
        available_sources.sort(key=rank_source, reverse=True)
        
        # Get top source
        plugin_name, top_source = available_sources[0]
        
        logger.info(
            f"DePin Tick: Top source is {top_source.source_id} "
            f"(plugin: {plugin_name}, priority: {top_source.priority})"
        )
        
        # 3. Check current recording status
        active_recordings = recording_service.active_recordings
        current_mint_id = None
        current_recorder = None
        
        if active_recordings:
            current_mint_id = list(active_recordings.keys())[0]
            current_recorder = active_recordings[current_mint_id]
        
        # 4. Decision logic
        should_stop_current = False
        should_start_new = False
        reason = ""
        
        if current_mint_id:
            # Calculate duration
            duration = 0
            if current_recorder and current_recorder.start_time:
                duration = (datetime.now(timezone.utc) - current_recorder.start_time).total_seconds()
            
            logger.info(f"Current recording: {current_mint_id}, Duration: {duration:.1f}s")
            
            # Check if top source is different
            if current_mint_id != top_source.source_id:
                should_stop_current = True
                should_start_new = True
                reason = f"Swapping to higher priority source (Current: {current_mint_id}, New: {top_source.source_id})"
            elif duration > 30:
                should_stop_current = True
                should_start_new = True
                reason = "Recording duration exceeded 30 seconds (chunking)"
            else:
                return {
                    "success": True,
                    "message": f"Continuing to record {current_mint_id} ({duration:.1f}s elapsed). Top source: {top_source.source_id}",
                    "current_source": current_mint_id,
                    "duration": duration,
                    "top_source": {
                        "source_id": top_source.source_id,
                        "plugin": plugin_name,
                        "priority": top_source.priority,
                        "metadata": top_source.metadata,
                    }
                }
        else:
            should_start_new = True
            reason = "No active recording"
        
        # 5. Execute actions
        result_data = {"actions": []}
        
        if should_stop_current and current_mint_id:
            logger.info(f"DePin Action: Stopping {current_mint_id} - {reason}")
            stop_result = await recording_service.stop_recording(current_mint_id)
            result_data["actions"].append(f"Stopped {current_mint_id}")
            if not stop_result.get("success"):
                logger.error(f"Failed to stop recording {current_mint_id}: {stop_result.get('error')}")
        
        if should_start_new:
            # Check if plugin supports archiving
            plugin = plugin_manager.get_plugin(plugin_name)
            if not plugin:
                return {
                    "success": False,
                    "message": f"Plugin {plugin_name} not loaded",
                    "actions": result_data["actions"]
                }
            
            # Check if recording is currently stopping (encoding)
            if top_source.source_id in recording_service.active_recordings:
                recorder = recording_service.active_recordings[top_source.source_id]
                if recorder.state.value == "stopping":
                    logger.info(
                        f"DePin Action: Waiting for {top_source.source_id} to finish encoding "
                        f"before starting new recording"
                    )
                    return {
                        "success": True,
                        "message": f"Recording for {top_source.source_id} is currently encoding. Will retry next tick.",
                        "actions": result_data["actions"]
                    }
            
            logger.info(f"DePin Action: Starting {top_source.source_id} using {plugin_name} - {reason}")
            
            # Archive using plugin
            result = await plugin.archive(top_source)
            
            if result.success:
                result_data["actions"].append(f"Started {top_source.source_id}")
                return {
                    "success": True,
                    "message": f"Switched recording to {top_source.source_id} using {plugin_name}. Reason: {reason}",
                    "actions": result_data["actions"],
                    "top_source": {
                        "source_id": top_source.source_id,
                        "plugin": plugin_name,
                        "priority": top_source.priority,
                    },
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to start archiving {top_source.source_id}: {result.error}",
                    "actions": result_data["actions"]
                }
        
        return {"success": True, "message": "No action taken"}
    
    except Exception as e:
        logger.error(f"Error in DePIN tick: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
