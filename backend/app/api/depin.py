from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import logging

from app.services.pumpfun_service import PumpFunService
from app.api.recording import recording_service

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize PumpFunService locally
pumpfun_service = PumpFunService()

@router.post("/tick", response_model=Dict[str, Any])
async def depin_tick():
    """
    Trigger a 'tick' of the DePin Auto-Recording Agent.
    
    Logic:
    1. Fetch the most popular live stream from Pump Fun.
    2. Check if we are currently recording it.
    3. If not recording or if recording duration > 5 minutes:
       - Stop current recording (if any).
       - Start recording the new top stream.
    
    This endpoint is designed to be called periodically (e.g., every 1 minute) by the DePin node (frontend).
    """
    try:
        # 1. Get top live stream
        popular_streams = await pumpfun_service.get_popular_live_streams(limit=1)
        if not popular_streams:
            return {"success": True, "message": "No live streams found on Pump Fun."}
        
        top_stream = popular_streams[0]
        top_mint_id = top_stream.get("mint")
        top_participants = top_stream.get("num_participants", 0)
        top_name = top_stream.get("name", "Unknown")
        top_symbol = top_stream.get("symbol", "N/A")
        
        if not top_mint_id:
            return {"success": False, "message": "Top stream has no mint ID."}
            
        logger.info(
            f"DePin Tick: Top stream is {top_mint_id} "
            f"({top_name} / {top_symbol}) - {top_participants} participants"
        )
        
        # 2. Check current recording status
        active_recordings = recording_service.active_recordings
        current_mint_id = None
        current_recorder = None
        
        if active_recordings:
            # Assuming we only want one recording active at a time for DePin mode
            # We'll grab the first one we find.
            current_mint_id = list(active_recordings.keys())[0]
            current_recorder = active_recordings[current_mint_id]
            
        # 3. Decision Logic
        should_stop_current = False
        should_start_new = False
        reason = ""
        
        if current_mint_id:
            # Calculate duration
            duration = 0
            if current_recorder.start_time:
                duration = (datetime.now(timezone.utc) - current_recorder.start_time).total_seconds()
            
            logger.info(f"Current recording: {current_mint_id}, Duration: {duration:.1f}s")
            
            if current_mint_id != top_mint_id:
                should_stop_current = True
                should_start_new = True
                reason = f"Swapping to more popular stream (Current: {current_mint_id}, New: {top_mint_id})"
            elif duration > 300: # 5 minutes
                should_stop_current = True
                should_start_new = True
                reason = "Recording duration exceeded 5 minutes (chunking)"
            else:
                return {
                    "success": True, 
                    "message": f"Continuing to record {current_mint_id} ({duration:.1f}s elapsed). Top stream: {top_name} ({top_participants} participants).",
                    "current_mint_id": current_mint_id,
                    "duration": duration,
                    "top_stream": {
                        "mint_id": top_mint_id,
                        "name": top_name,
                        "symbol": top_symbol,
                        "participants": top_participants
                    }
                }
        else:
            should_start_new = True
            reason = "No active recording"
            
        # Execute Actions
        result_data = {"actions": []}
        
        if should_stop_current and current_mint_id:
            logger.info(f"DePin Action: Stopping {current_mint_id} - {reason}")
            stop_result = await recording_service.stop_recording(current_mint_id)
            result_data["actions"].append(f"Stopped {current_mint_id}")
            if not stop_result.get("success"):
                logger.error(f"Failed to stop recording {current_mint_id}: {stop_result.get('error')}")
        
        if should_start_new:
            logger.info(f"DePin Action: Starting {top_mint_id} - {reason}")
            # Ensure we wait a bit if we just stopped, although stop_recording handles some cleanup
            # Start the new recording
            start_result = await recording_service.start_recording(
                mint_id=top_mint_id,
                output_format="webm",
                video_quality="best"
            )
            
            if start_result.get("success"):
                result_data["actions"].append(f"Started {top_mint_id}")
                return {
                    "success": True,
                    "message": f"Switched recording to {top_name} ({top_participants} participants). Reason: {reason}",
                    "actions": result_data["actions"],
                    "top_stream": {
                        "mint_id": top_mint_id,
                        "name": top_name,
                        "symbol": top_symbol,
                        "participants": top_participants
                    }
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to start recording {top_mint_id}: {start_result.get('error')}",
                    "actions": result_data["actions"]
                }
                
        return {"success": True, "message": "No action taken."}

    except Exception as e:
        logger.error(f"Error in DePin tick: {e}")
        raise HTTPException(status_code=500, detail=str(e))

