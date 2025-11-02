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
    output_format: str = "webm"  # Only WebM supported (mpegts/mp4 deprecated, converted to webm)
    video_quality: str = "high"  # low, medium, high (all use maximum quality settings)


class StopRecordingRequest(BaseModel):
    mint_id: str


@router.post("/start", response_model=Dict[str, Any])
async def start_recording(request: StartRecordingRequest):
    """
    Start recording a pump.fun stream using ParticipantRecorder.
    
    - **mint_id**: Pump.fun mint ID of the stream to record
    - **output_format**: Output format (webm only) - non-webm formats will be converted to webm
    - **video_quality**: Video quality preset (low, medium, high)
    
    Note: Requires an active stream session first via /api/live-sessions/start
    
    This implementation uses LiveKit's ParticipantRecorder for:
    - Memory-efficient frame streaming
    - WebM format (VP8/VP9 video, Opus audio)
    - Automatic resource cleanup
    - Production-tested implementation
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
    Stop recording a pump.fun stream using ParticipantRecorder.
    
    - **mint_id**: Pump.fun mint ID of the recording to stop
    
    This gracefully stops the recording by:
    - Stopping ParticipantRecorder and finalizing WebM file
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
    - Frame processing statistics
    - File size and output path
    - ParticipantRecorder status
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
    
    Returns status for all active ParticipantRecorder recordings including:
    - State machine state for each recording
    - Frame processing statistics
    - File sizes and output paths
    - ParticipantRecorder status
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
            "webm": {
                "description": "WebM - Web-optimized format (ONLY SUPPORTED FORMAT)",
                "video_codec": "vp8/vp9",
                "audio_codec": "opus",
                "container": "webm",
                "encoding_speed": "fast",
                "file_size": "small",
                "note": "Only format supported by ParticipantRecorder. Non-webm formats will be converted automatically.",
                "deprecated_formats": {
                    "mpegts": "Deprecated - will be converted to WebM",
                    "mp4": "Deprecated - will be converted to WebM"
                }
            }
        },
        "quality_presets": {
            "low": {
                "video_bitrate": "4000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, high quality (VP9 codec)"
            },
            "medium": {
                "video_bitrate": "6000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, high quality (VP9 codec)"
            },
            "high": {
                "video_bitrate": "8000000",
                "audio_bitrate": "256000",
                "resolution": "1920x1080",
                "description": "1080p, maximum quality (VP9 codec, best quality setting)"
            }
        }
    }