"""
API endpoints for PumpFun chunk recorder status and control.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from app.services.pumpfun_recording_manager import PumpFunRecordingManager

router = APIRouter()


class RecordingStatusResponse(BaseModel):
    success: bool
    mint_id: str
    stats: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class RecordingControlRequest(BaseModel):
    mint_id: str
    action: str  # "start", "stop", "pause", "resume"


class RecordingControlResponse(BaseModel):
    success: bool
    mint_id: str
    action: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class AllRecordingsStatusResponse(BaseModel):
    success: bool
    active_recordings: Dict[str, Dict[str, Any]]
    recording_manager_initialized: bool


@router.get("/recorders/{mint_id}/status", response_model=RecordingStatusResponse)
async def get_recording_status(mint_id: str):
    """
    Get recording status for a specific mint_id using SegmentMetadata.
    
    Returns detailed statistics about the recording if active.
    """
    try:
        manager = PumpFunRecordingManager()
        
        # Get comprehensive stats from recording manager (uses SegmentMetadata)
        recording_stats = await manager.get_recording_stats(mint_id)
        
        if recording_stats:
            # Return the comprehensive stats from SegmentMetadata
            return RecordingStatusResponse(
                success=True,
                mint_id=mint_id,
                stats=recording_stats
            )
        else:
            return RecordingStatusResponse(
                success=False,
                mint_id=mint_id,
                error=f"No active recording for {mint_id}"
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recorders/{mint_id}/control", response_model=RecordingControlResponse)
async def control_recording(mint_id: str, request: RecordingControlRequest):
    """
    Control recording (start, stop, pause, resume).
    
    Actions:
    - "start": Start automated recording (requires stream to be live)
    - "stop": Stop active recording  
    - "pause": Pause recording (not implemented yet)
    - "resume": Resume paused recording (not implemented yet)
    """
    try:
        manager = PumpFunRecordingManager()
        action = request.action.lower()
        
        if action == "stop":
            if mint_id in manager.active_recordings:
                result = await manager._stop_recording(mint_id)
                return RecordingControlResponse(
                    success=result,
                    mint_id=mint_id,
                    action=action,
                    result={"stopped": result}
                )
            else:
                return RecordingControlResponse(
                    success=False,
                    mint_id=mint_id,
                    action=action,
                    error=f"No active recording to stop for {mint_id}"
                )
                
        elif action == "start":
            # Note: Starting requires the stream to be live and subscribed.
            # This endpoint is meant for manual control; normally recordings
            # are managed by the automated job scheduler.
            return RecordingControlResponse(
                success=False,
                mint_id=mint_id,
                action=action,
                error="Manual start not supported. Recording is managed automatically via subscriptions."
            )
            
        else:
            return RecordingControlResponse(
                success=False,
                mint_id=mint_id,
                action=action,
                error=f"Unsupported action: {action}"
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recorders/status", response_model=AllRecordingsStatusResponse)
async def get_all_recordings_status():
    """
    Get status of all active recordings using SegmentMetadata.
    """
    try:
        manager = PumpFunRecordingManager()
        
        # Get comprehensive summaries using SegmentMetadata
        recording_summaries = await manager.get_all_recording_summaries()
        
        return AllRecordingsStatusResponse(
            success=True,
            active_recordings=recording_summaries,
            recording_manager_initialized=True
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))