"""
Recording API endpoints using shared StreamManager.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.services.webrtc_recording_service import WebRTCRecordingService

# Initialize the WebRTC recording service
recording_service = WebRTCRecordingService()

router = APIRouter()


class StartRecordingRequest(BaseModel):
    mint_id: str
    output_format: str = "h264"  # h264, av1, svtav1, vp9 (h264 recommended for reliability)
    video_quality: str = "medium"  # low, medium, high


class StopRecordingRequest(BaseModel):
    mint_id: str


@router.post("/start", response_model=Dict[str, Any])
async def start_recording(request: StartRecordingRequest):
    """
    Start recording a pump.fun stream using WebRTC best practices.
    
    - **mint_id**: Pump.fun mint ID of the stream to record
    - **output_format**: Output codec (h264, av1, webm)
    - **video_quality**: Video quality preset (low, medium, high)
    
    Note: Requires an active stream session first via /api/live-sessions/start
    
    This implementation follows WebRTC fundamentals:
    - Proper state machine for connection lifecycle
    - Reliable track subscription with PLI/FIR support
    - Bounded queue frame reception with backpressure
    - RTP timestamp to PTS mapping for A/V sync
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
    Stop recording a pump.fun stream using WebRTC best practices.
    
    - **mint_id**: Pump.fun mint ID of the recording to stop
    
    This gracefully stops the recording by:
    - Signaling stop to all frame processing tasks
    - Draining bounded queues to capture remaining frames
    - Flushing encoders and closing the output container
    - Cleaning up all WebRTC resources
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
    - WebRTC state machine state
    - Frame processing statistics
    - Queue sizes and backpressure info
    - File size and output path
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
    
    Returns status for all active WebRTC recordings including:
    - State machine state for each recording
    - Frame processing statistics
    - Queue sizes and backpressure info
    - File sizes and output paths
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
            "h264": {
                "description": "H.264/AVC - Fast, compatible, good quality (RECOMMENDED - most reliable)",
                "video_codec": "libx264",
                "audio_codec": "aac",
                "container": "mp4",
                "encoding_speed": "fast",
                "file_size": "medium",
                "note": "Best choice for real-time recording - fast, stable, and widely compatible"
            },
            "av1": {
                "description": "AV1 - Best compression, excellent quality, slower encoding",
                "video_codec": "libaom-av1",
                "audio_codec": "aac",
                "container": "mp4",
                "encoding_speed": "slow",
                "file_size": "small",
                "note": "30-50% better compression than H.264, but takes longer to encode"
            },
            "svtav1": {
                "description": "SVT-AV1 - Faster AV1 encoder, good quality",
                "video_codec": "libsvtav1",
                "audio_codec": "aac",
                "container": "mp4",
                "encoding_speed": "medium",
                "file_size": "small",
                "note": "Faster than libaom-av1 while maintaining good quality"
            },
            "vp9": {
                "description": "VP9 - Good compression, WebM format",
                "video_codec": "libvpx-vp9",
                "audio_codec": "opus",
                "container": "webm",
                "encoding_speed": "medium",
                "file_size": "small"
            }
        },
        "quality_presets": {
            "low": {
                "video_bitrate": "1000000",
                "audio_bitrate": "64000",
                "resolution": "1280x720",
                "description": "720p, suitable for previews"
            },
            "medium": {
                "video_bitrate": "2000000",
                "audio_bitrate": "128000",
                "resolution": "1920x1080",
                "description": "1080p, balanced quality (recommended)"
            },
            "high": {
                "video_bitrate": "4000000",
                "audio_bitrate": "192000",
                "resolution": "1920x1080",
                "description": "1080p, maximum quality"
            }
        }
    }