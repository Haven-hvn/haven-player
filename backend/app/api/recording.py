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
    output_format: str = "mpegts"  # mpegts, mp4, webm (mpegts recommended for streaming)
    video_quality: str = "medium"  # low, medium, high


class StopRecordingRequest(BaseModel):
    mint_id: str


@router.post("/start", response_model=Dict[str, Any])
async def start_recording(request: StartRecordingRequest):
    """
    Start recording a pump.fun stream using FFmpeg subprocess.
    
    - **mint_id**: Pump.fun mint ID of the stream to record
    - **output_format**: Output format (mpegts, mp4, webm) - mpegts recommended for streaming
    - **video_quality**: Video quality preset (low, medium, high)
    
    Note: Requires an active stream session first via /api/live-sessions/start
    
    This implementation uses FFmpeg subprocess for:
    - Direct disk writes (no memory buffering)
    - Streaming-friendly formats (MPEG-TS)
    - Professional-grade encoding
    - No PyAV memory leaks
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
    Stop recording a pump.fun stream using FFmpeg subprocess.
    
    - **mint_id**: Pump.fun mint ID of the recording to stop
    
    This gracefully stops the recording by:
    - Closing FFmpeg stdin to signal end of stream
    - Waiting for FFmpeg to finish writing
    - Cleaning up subprocess resources
    - Finalizing output file
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
    - FFmpeg process status
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
    
    Returns status for all active FFmpeg recordings including:
    - State machine state for each recording
    - Frame processing statistics
    - File sizes and output paths
    - FFmpeg process status
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
            "mpegts": {
                "description": "MPEG Transport Stream - Streaming format, writes directly to disk (RECOMMENDED)",
                "video_codec": "libx264",
                "audio_codec": "aac",
                "container": "ts",
                "encoding_speed": "fast",
                "file_size": "medium",
                "note": "Best for real-time recording - streams directly to disk, no memory buffering"
            },
            "mp4": {
                "description": "MP4 - Standard format, good compatibility",
                "video_codec": "libx264",
                "audio_codec": "aac",
                "container": "mp4",
                "encoding_speed": "fast",
                "file_size": "medium",
                "note": "Standard format with good compatibility, may buffer in memory"
            },
            "webm": {
                "description": "WebM - Web-optimized format",
                "video_codec": "libvpx-vp9",
                "audio_codec": "opus",
                "container": "webm",
                "encoding_speed": "medium",
                "file_size": "small",
                "note": "Web-optimized format with good compression"
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