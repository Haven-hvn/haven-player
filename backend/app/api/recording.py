"""
Recording API endpoints using shared StreamManager.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.services.webrtc_recording_service import WebRTCRecordingService

# Initialize the FFmpeg-based recording service
recording_service = WebRTCRecordingService()

router = APIRouter()


class StartRecordingRequest(BaseModel):
    mint_id: str
    video_quality: str = "high"  # low, medium, high (all use maximum quality settings)


class StopRecordingRequest(BaseModel):
    mint_id: str


@router.post("/start", response_model=Dict[str, Any])
async def start_recording(request: StartRecordingRequest):
    """
    Start recording a pump.fun stream using Boombox pull-based recording.

    - **mint_id**: Pump.fun mint ID of the stream to record
    - **video_quality**: Video quality preset (low, medium, high)

    Note: Requires an active stream session first via /api/live-sessions/start

    This implementation uses Boombox for:
    - Pull-based stream ingestion from LiveKit ingest URLs
    - MP4 format (H.264 video, AAC audio)
    - Better audio quality and resilience
    - Memory-efficient recording without FFI handles
    """
    try:
        result = await recording_service.start_recording(
            mint_id=request.mint_id,
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
    Stop recording a pump.fun stream using Boombox.

    - **mint_id**: Pump.fun mint ID of the recording to stop

    This gracefully stops the recording by:
    - Stopping Boombox recording and finalizing MP4 file
    - Cleaning up recording resources
    - Returning final statistics and file path
    """
    try:
        result = await recording_service.stop_recording(
            mint_id=request.mint_id
        )

        if not result["success"]:
            error_msg = result.get("error", "Unknown error")
            # Provide helpful context for memory errors
            if "memory" in error_msg.lower() or "allocation" in error_msg.lower():
                error_msg = f"{error_msg}. Try closing other applications to free up memory, or restart the server."
            raise HTTPException(status_code=500, detail=error_msg)

        return result

    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        # Provide helpful context for memory errors
        if "memory" in error_str.lower() or "allocation" in error_str.lower():
            error_str = f"Memory allocation failed during recording stop: {error_str}. Try closing other applications or restart the server."
        raise HTTPException(status_code=500, detail=error_str)


@router.get("/status/{mint_id}", response_model=Dict[str, Any])
async def get_recording_status(mint_id: str):
    """
    Get recording status for a specific stream.

    - **mint_id**: Pump.fun mint ID to check status for

    Returns comprehensive status including:
    - Recording state machine state
    - Packet processing statistics
    - File size and output path
    - Boombox recording status
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

    Returns status for all active Boombox recordings including:
    - State machine state for each recording
    - Packet processing statistics
    - File sizes and output paths
    - Boombox recording status
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
            "mp4": {
                "description": "MP4 - Universal format with H.264/AAC (ONLY SUPPORTED FORMAT)",
                "video_codec": "h264",
                "audio_codec": "aac",
                "container": "mp4",
                "encoding_speed": "fast",
                "file_size": "medium",
                "note": "Boombox outputs MP4 directly with excellent compatibility and quality."
            }
        },
        "quality_presets": {
            "low": {
                "video_bitrate": "4000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, high quality (H.264 codec)"
            },
            "medium": {
                "video_bitrate": "6000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, high quality (H.264 codec)"
            },
            "high": {
                "video_bitrate": "8000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, maximum quality (H.264 codec, best quality setting)"
            }
        }
    }