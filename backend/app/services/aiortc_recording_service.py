"""
aiortc-based recording service using shared StreamManager.
Handles AV1 recording with proper WebRTC connection management.
"""

import asyncio
import json
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime, timezone

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRecorder
from aiortc.rtcrtpsender import RTCRtpSender
from aiortc.mediastreams import MediaStreamTrack
from aiortc.codecs import get_encoder

from app.services.stream_manager import StreamManager
from app.models.database import get_db


class AioRTCRecordingService:
    """
    aiortc-based recording service using shared StreamManager.
    Handles AV1 recording with proper WebRTC connection management.
    """

    def __init__(self, output_dir: str = "recordings"):
        self.stream_manager = StreamManager()
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Active recordings
        self.active_recordings: Dict[str, 'StreamRecorder'] = {}
        
        # Default recording configuration
        self.default_config = {
            "video_codec": "libaom-av1",
            "audio_codec": "aac",
            "video_bitrate": "2000k",
            "audio_bitrate": "128k",
            "format": "mp4"
        }
        
        # Quality presets
        self.quality_presets = {
            "low": {
                "video_bitrate": "1000k",
                "audio_bitrate": "64k",
                "video_codec": "libaom-av1"
            },
            "medium": {
                "video_bitrate": "2000k", 
                "audio_bitrate": "128k",
                "video_codec": "libaom-av1"
            },
            "high": {
                "video_bitrate": "4000k",
                "audio_bitrate": "192k", 
                "video_codec": "libaom-av1"
            }
        }

    async def start_recording(self, mint_id: str, output_format: str = "av1", 
                            video_quality: str = "medium") -> Dict[str, Any]:
        """
        Start recording a stream using shared StreamManager.
        Connects MediaRecorder to the existing LiveKit WebRTC stream.
        """
        try:
            if mint_id in self.active_recordings:
                return {"success": False, "error": f"Recording already active for {mint_id}"}
            
            # Get stream info from StreamManager
            stream_info = await self.stream_manager.get_stream_info(mint_id)
            if not stream_info:
                return {"success": False, "error": f"No active stream found for {mint_id}"}
            
            # Get the LiveKit room from StreamManager
            room = self.stream_manager.room
            if not room:
                return {"success": False, "error": "No active LiveKit room found"}
            
            # Create recording configuration
            config = self._get_recording_config(output_format, video_quality)
            
            # Create stream recorder with LiveKit room
            recorder = StreamRecorder(
                mint_id=mint_id,
                stream_info=stream_info,
                output_dir=self.output_dir,
                config=config,
                room=room
            )
            
            # Start recording
            result = await recorder.start()
            if result["success"]:
                self.active_recordings[mint_id] = recorder
                
                return {
                    "success": True,
                    "mint_id": mint_id,
                    "output_path": str(recorder.output_path),
                    "config": config
                }
            else:
                return result
                
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def stop_recording(self, mint_id: str) -> Dict[str, Any]:
        """Stop recording a stream."""
        try:
            if mint_id not in self.active_recordings:
                return {"success": False, "error": f"No active recording for {mint_id}"}
            
            recorder = self.active_recordings[mint_id]
            result = await recorder.stop()
            
            # Remove from active recordings
            del self.active_recordings[mint_id]
            
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_recording_status(self, mint_id: str) -> Dict[str, Any]:
        """Get recording status for a stream."""
        if mint_id not in self.active_recordings:
            return {"success": False, "error": f"No active recording for {mint_id}"}
        
        recorder = self.active_recordings[mint_id]
        return await recorder.get_status()

    async def get_all_recordings(self) -> Dict[str, Any]:
        """Get status of all active recordings."""
        recordings = {}
        for mint_id, recorder in self.active_recordings.items():
            recordings[mint_id] = await recorder.get_status()
        return {"success": True, "recordings": recordings}

    def _get_recording_config(self, output_format: str, video_quality: str) -> Dict[str, Any]:
        """Get recording configuration based on format and quality."""
        config = self.default_config.copy()
        
        if output_format == "av1":
            config.update({
                "video_codec": "libaom-av1",
                "format": "mp4"
            })
        elif output_format == "h264":
            config.update({
                "video_codec": "libx264",
                "format": "mp4"
            })
        elif output_format == "vp9":
            config.update({
                "video_codec": "libvpx-vp9",
                "format": "webm"
            })
        
        # Apply quality preset
        if video_quality in self.quality_presets:
            config.update(self.quality_presets[video_quality])
        
        return config


class StreamRecorder:
    """
    Individual stream recorder for AV1 recording.
    Uses MediaRecorder to record directly from WebRTC stream.
    """
    
    def __init__(self, mint_id: str, stream_info, output_dir: Path, 
                 config: Dict[str, Any], room):
        self.mint_id = mint_id
        self.stream_info = stream_info
        self.output_dir = output_dir
        self.config = config
        self.room = room
        
        # Recording state
        self.is_recording = False
        self.start_time = None
        self.output_path: Optional[Path] = None
        self.recorder: Optional[MediaRecorder] = None
        
        # Get output filename
        self.output_path = self._get_output_filename()

    def _get_output_filename(self) -> Path:
        """Generate output filename based on mint_id and timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.mint_id}_{timestamp}.{self.config['format']}"
        return self.output_dir / filename

    async def start(self) -> Dict[str, Any]:
        """Start recording using MediaRecorder connected to LiveKit WebRTC tracks."""
        try:
            if self.is_recording:
                return {"success": False, "error": "Recording already started"}
            
            # Create MediaRecorder
            self.recorder = MediaRecorder(
                str(self.output_path),
                format=self.config["format"],
                video_codec=self.config["video_codec"],
                audio_codec=self.config["audio_codec"],
                video_bitrate=self.config["video_bitrate"],
                audio_bitrate=self.config["audio_bitrate"]
            )
            
            # Connect MediaRecorder to LiveKit WebRTC tracks
            for participant in self.room.remote_participants.values():
                for track_publication in participant.track_publications.values():
                    if track_publication.track:
                        # Add the track to the recorder
                        self.recorder.addTrack(track_publication.track)
            
            # Start recording
            await self.recorder.start()
            
            self.is_recording = True
            self.start_time = datetime.now(timezone.utc)
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat()
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop recording."""
        try:
            if not self.is_recording:
                return {"success": False, "error": "No active recording"}
            
            if self.recorder:
                await self.recorder.stop()
                self.recorder = None
            
            self.is_recording = False
            end_time = datetime.now(timezone.utc)
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": end_time.isoformat()
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}


    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        return {
            "mint_id": self.mint_id,
            "is_recording": self.is_recording,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "config": self.config
        }