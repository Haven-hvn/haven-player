"""
Recording API endpoints using shared StreamManager.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.services.aiortc_recording_service import AioRTCRecordingService

# Initialize the recording service
recording_service = AioRTCRecordingService()

router = APIRouter()


class StartRecordingRequest(BaseModel):
    mint_id: str
    output_format: str = "av1"  # av1, h264, vp9
    video_quality: str = "medium"  # low, medium, high


class StopRecordingRequest(BaseModel):
    mint_id: str


@router.post("/start", response_model=Dict[str, Any])
async def start_recording(request: StartRecordingRequest):
    """
    Start recording a pump.fun stream using shared StreamManager.
    
    - **mint_id**: Pump.fun mint ID of the stream to record
    - **output_format**: Output format (av1, h264, vp9)
    - **video_quality**: Video quality preset (low, medium, high)
    
    Note: Requires an active stream session first via /api/live-sessions/start
    """
    try:
        result = await recording_service.start_recording(
            mint_id=request.mint_id,
            output_format=request.output_format,
            video_quality=request.video_quality
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=Dict[str, Any])
async def stop_recording(request: StopRecordingRequest):
    """
    Stop recording a pump.fun stream.
    
    - **mint_id**: Pump.fun mint ID of the recording to stop
    """
    try:
        result = await recording_service.stop_recording(
            mint_id=request.mint_id
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{mint_id}", response_model=Dict[str, Any])
async def get_recording_status(mint_id: str):
    """
    Get recording status for a specific stream.
    
    - **mint_id**: Pump.fun mint ID to check status for
    """
    try:
        result = await recording_service.get_recording_status(mint_id)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active", response_model=Dict[str, Any])
async def get_active_recordings():
    """
    Get status of all active recordings.
    """
    try:
        result = await recording_service.get_all_recordings()
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/formats", response_model=Dict[str, Any])
async def get_supported_formats():
    """
    Get supported recording formats and quality presets.
    """
    return {
        "success": True,
        "formats": {
            "av1": {
                "description": "AV1 codec (recommended)",
                "codec": "libaom-av1",
                "container": "mp4"
            },
            "h264": {
                "description": "H.264 codec",
                "codec": "libx264", 
                "container": "mp4"
            },
            "vp9": {
                "description": "VP9 codec",
                "codec": "libvpx-vp9",
                "container": "webm"
            }
        },
        "quality_presets": {
            "low": {
                "video_bitrate": "1000k",
                "audio_bitrate": "64k"
            },
            "medium": {
                "video_bitrate": "2000k",
                "audio_bitrate": "128k"
            },
            "high": {
                "video_bitrate": "4000k",
                "audio_bitrate": "192k"
            }
        }
    }