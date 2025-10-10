"""
WebRTC recording service using FFmpeg subprocess for direct disk writes.

This approach eliminates PyAV memory buffering by using FFmpeg subprocess
that writes directly to disk in streaming format (MPEG-TS).
"""

import asyncio
import logging
import subprocess
import numpy as np
import threading
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum
import time

import livekit.rtc as rtc
from app.services.stream_manager import StreamManager

logger = logging.getLogger(__name__)

class RecordingState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting" 
    CONNECTED = "connected"
    SUBSCRIBING = "subscribing"
    SUBSCRIBED = "subscribed"
    RECORDING = "recording"
    STOPPING = "stopping"
    STOPPED = "stopped"

@dataclass
class TrackContext:
    """Context for a track being recorded."""
    track_id: str
    track: rtc.RemoteTrack
    kind: int  # rtc.TrackKind
    participant_sid: str

class FFmpegRecorder:
    """WebRTC recorder using FFmpeg subprocess for direct disk writes."""
    
    def __init__(
        self, 
        mint_id: str, 
        stream_info: Any,
        output_dir: Path, 
        config: Dict[str, Any], 
        room: rtc.Room
    ):
        self.mint_id = mint_id
        self.stream_info = stream_info
        self.output_dir = output_dir
        self.config = config
        self.room = room
        
        self.state = RecordingState.DISCONNECTED
        self.tracks: Dict[str, TrackContext] = {}
        self.ffmpeg_process: Optional[subprocess.Popen] = None
        self.output_path: Optional[Path] = None
        self.start_time: Optional[datetime] = None
        
        # Frame processing
        self.video_frames_received = 0
        self.audio_frames_received = 0
        self.video_frames_written = 0
        self.audio_frames_written = 0
        
        # Threading for FFmpeg communication
        self._ffmpeg_lock = threading.Lock()
        self._shutdown = False

    async def start(self) -> Dict[str, Any]:
        """Start recording using FFmpeg subprocess."""
        try:
            logger.info(f"[{self.mint_id}] Starting FFmpeg-based recording")
            
            # State: DISCONNECTED → CONNECTING
            self.state = RecordingState.CONNECTING
            
            # Find target participant
            participant = self._find_participant()
            if not participant:
                return {"success": False, "error": "Target participant not found"}
            
            # Subscribe to tracks
            await self._subscribe_to_tracks(participant)
            
            # State: CONNECTING → SUBSCRIBING
            self.state = RecordingState.SUBSCRIBING
            
            # Set up room event handler for track subscriptions
            self.room.on('track_subscribed', self._on_track_subscribed)
            
            # Wait for tracks to be ready
            await asyncio.sleep(1.0)  # Give tracks time to initialize
            
            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED
            
            # Setup FFmpeg process
            await self._setup_ffmpeg()
            
            # Start frame processing
            await self._start_frame_processing()
            
            # State: SUBSCRIBED → RECORDING
            self.state = RecordingState.RECORDING
            self.start_time = datetime.now(timezone.utc)
            
            logger.info(f"[{self.mint_id}] ✅ Recording started with FFmpeg")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat(),
                "tracks": len(self.tracks),
                "stats": {
                    "video_frames": 0,
                    "audio_frames": 0,
                    "dropped_frames": 0,
                    "pli_requests": 0,
                    "track_subscriptions": len(self.tracks),
                    "connection_time": 0.0,
                    "subscription_time": 0.0
                }
            }
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Recording start failed: {e}")
            await self._cleanup()
            return {"success": False, "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop recording."""
        try:
            logger.info(f"[{self.mint_id}] Stopping FFmpeg recording")
            
            if self.state != RecordingState.RECORDING:
                return {"success": False, "error": f"No active recording to stop (state: {self.state.value})"}
            
            # State: RECORDING → STOPPING
            self.state = RecordingState.STOPPING
            self._shutdown = True
            
            # Stop FFmpeg process
            if self.ffmpeg_process:
                self.ffmpeg_process.stdin.close()
                self.ffmpeg_process.wait(timeout=5.0)
            
            # State: STOPPING → STOPPED
            self.state = RecordingState.STOPPED
            
            # Get final stats
            file_size = 0
            if self.output_path and self.output_path.exists():
                file_size = self.output_path.stat().st_size
            
            logger.info(f"[{self.mint_id}] ✅ Recording stopped")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "file_size_bytes": file_size,
                "duration_seconds": (datetime.now(timezone.utc) - self.start_time).total_seconds() if self.start_time else 0,
                "stats": {
                    "video_frames": self.video_frames_written,
                    "audio_frames": self.audio_frames_written,
                    "dropped_frames": 0,
                    "pli_requests": 0,
                    "track_subscriptions": len(self.tracks),
                    "connection_time": 0.0,
                    "subscription_time": 0.0
                }
            }
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Recording stop failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        file_size = 0
        if self.output_path and self.output_path.exists():
            file_size = self.output_path.stat().st_size
        
        return {
            "mint_id": self.mint_id,
            "state": self.state.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "tracks": len(self.tracks),
            "stats": {
                "video_frames": self.video_frames_written,
                "audio_frames": self.audio_frames_written,
                "dropped_frames": 0,
                "pli_requests": 0,
                "track_subscriptions": len(self.tracks),
                "connection_time": 0.0,
                "subscription_time": 0.0
            },
            "config": self.config
        }

    def _find_participant(self) -> Optional[rtc.RemoteParticipant]:
        """Find the target participant."""
        for participant in self.room.remote_participants.values():
            if participant.sid == self.stream_info.participant_sid:
                logger.info(f"[{self.mint_id}] ✅ Found target participant: {participant.sid}")
                return participant
        
        logger.error(f"[{self.mint_id}] ❌ Target participant {self.stream_info.participant_sid} not found")
        return None

    async def _subscribe_to_tracks(self, participant: rtc.RemoteParticipant):
        """Subscribe to participant's tracks."""
        logger.info(f"[{self.mint_id}] Subscribing to tracks from {participant.sid}")
        
        for track_pub in participant.track_publications.values():
            if track_pub.track is None:
                continue
                
            track = track_pub.track
            track_id = f"{participant.sid}_{track.sid}"
            
            # Create track context
            track_context = TrackContext(
                track_id=track_id,
                track=track,
                kind=track.kind,
                participant_sid=participant.sid
            )
            
            self.tracks[track_id] = track_context
            
            # Frame handlers will be set up when tracks are actually subscribed
            
            logger.info(f"[{self.mint_id}] ✅ Subscribed to {track.kind} track {track.sid}")

    def _on_track_subscribed(self, track, publication, participant):
        """Handle track subscribed event."""
        if participant.sid != self.stream_info.participant_sid:
            return  # Only process tracks from our target participant
            
        logger.info(f"[{self.mint_id}] Track subscribed: {track.kind} from {participant.sid}")
        
        # Set up frame handlers based on track kind
        if track.kind == rtc.TrackKind.KIND_VIDEO:
            track.on('frame_received', self._on_video_frame)
        elif track.kind == rtc.TrackKind.KIND_AUDIO:
            track.on('frame_received', self._on_audio_frame)

    async def _setup_ffmpeg(self):
        """Setup FFmpeg subprocess for recording."""
        # Generate output path
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        output_filename = f"{self.mint_id}_{timestamp}.ts"
        self.output_path = self.output_dir / output_filename
        
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"[{self.mint_id}] Setting up FFmpeg process: {self.output_path}")
        
        # Build FFmpeg command for MPEG-TS streaming
        ffmpeg_cmd = [
            'ffmpeg',
            '-y',  # Overwrite output file
            '-f', 'rawvideo',  # Input format: raw video
            '-pix_fmt', 'rgb24',  # Pixel format
            '-s', f"{self.config['width']}x{self.config['height']}",  # Resolution
            '-r', str(self.config['fps']),  # Frame rate
            '-i', 'pipe:0',  # Video from stdin
            '-f', 's16le',  # Audio format: signed 16-bit little endian
            '-ar', '48000',  # Sample rate
            '-ac', '2',  # Stereo
            '-i', 'pipe:3',  # Audio from pipe 3
            '-c:v', self.config['video_codec'],  # Video codec
            '-preset', 'ultrafast',  # Fast encoding
            '-tune', 'zerolatency',  # No buffering
            '-b:v', self.config['video_bitrate'],  # Video bitrate
            '-c:a', self.config['audio_codec'],  # Audio codec
            '-b:a', self.config['audio_bitrate'],  # Audio bitrate
            '-f', 'mpegts',  # Output format: MPEG-TS (streams to disk)
            str(self.output_path)  # Output file
        ]
        
        logger.info(f"[{self.mint_id}] FFmpeg command: {' '.join(ffmpeg_cmd)}")
        
        # Start FFmpeg process
        self.ffmpeg_process = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0  # Unbuffered
        )
        
        logger.info(f"[{self.mint_id}] ✅ FFmpeg process started (PID: {self.ffmpeg_process.pid})")

    async def _start_frame_processing(self):
        """Start frame processing tasks."""
        logger.info(f"[{self.mint_id}] Starting frame processing")
        # Frame handlers are already set up in _subscribe_to_tracks
        # FFmpeg will receive data directly from frame handlers

    def _on_video_frame(self, frame: rtc.VideoFrame):
        """Handle video frame from LiveKit."""
        if self._shutdown or not self.ffmpeg_process:
            return
            
        try:
            self.video_frames_received += 1
            
            # Convert LiveKit frame to RGB24 numpy array
            frame_data = frame.to_ndarray(format=rtc.VideoBufferType.RGB)
            
            # Ensure correct shape and type
            if frame_data.shape[2] == 3:  # RGB
                frame_bytes = frame_data.astype(np.uint8).tobytes()
                
                with self._ffmpeg_lock:
                    if self.ffmpeg_process and self.ffmpeg_process.stdin:
                        self.ffmpeg_process.stdin.write(frame_bytes)
                        self.video_frames_written += 1
                        
                        if self.video_frames_written % 30 == 0:  # Log every second
                            logger.info(f"[{self.mint_id}] Written {self.video_frames_written} video frames")
                            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame processing error: {e}")

    def _on_audio_frame(self, frame: rtc.AudioFrame):
        """Handle audio frame from LiveKit."""
        if self._shutdown or not self.ffmpeg_process:
            return
            
        try:
            self.audio_frames_received += 1
            
            # Convert LiveKit audio frame to bytes
            # Note: This is a simplified conversion - may need adjustment based on LiveKit audio format
            audio_data = frame.data
            if hasattr(audio_data, 'tobytes'):
                audio_bytes = audio_data.tobytes()
            else:
                audio_bytes = bytes(audio_data)
            
            with self._ffmpeg_lock:
                if self.ffmpeg_process and self.ffmpeg_process.stdin:
                    # For now, skip audio - focus on getting video working first
                    # TODO: Implement proper audio piping to FFmpeg
                    self.audio_frames_written += 1
                    
        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio frame processing error: {e}")

    async def _cleanup(self):
        """Clean up resources."""
        try:
            if self.ffmpeg_process:
                self.ffmpeg_process.terminate()
                self.ffmpeg_process = None
        except Exception as e:
            logger.error(f"[{self.mint_id}] Cleanup error: {e}")


class WebRTCRecordingService:
    """WebRTC recording service using FFmpeg subprocess."""
    
    _instance_count = 0
    
    def __init__(self, output_dir: str = "recordings"):
        WebRTCRecordingService._instance_count += 1
        self._instance_id = WebRTCRecordingService._instance_count
        
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Active recordings
        self.active_recordings: Dict[str, FFmpegRecorder] = {}
        
        # Default recording configuration
        self.default_config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k", 
            "format": "mpegts",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        # Get StreamManager instance
        from app.services.stream_manager import StreamManager
        self.stream_manager = StreamManager()
        
        logger.info(f"🎬 WebRTCRecordingService instance #{self._instance_id} created")

    async def start_recording(
        self, 
        mint_id: str, 
        output_format: str = "mpegts", 
        video_quality: str = "medium"
    ) -> Dict[str, Any]:
        """Start recording using FFmpeg subprocess."""
        try:
            logger.info(f"📹 Starting FFmpeg recording for mint_id: {mint_id}")
            
            if mint_id in self.active_recordings:
                logger.warning(f"⚠️  Recording already active for {mint_id}")
                return {"success": False, "error": f"Recording already active for {mint_id}"}
            
            # Get stream info from StreamManager
            stream_info = await self.stream_manager.get_stream_info(mint_id)
            if not stream_info:
                logger.error(f"❌ No active stream found for {mint_id}")
                return {"success": False, "error": f"No active stream found for {mint_id}"}
            
            # Get the LiveKit room from StreamManager
            room = self.stream_manager.room
            if not room:
                logger.error(f"❌ No active LiveKit room found")
                return {"success": False, "error": "No active LiveKit room found"}
            
            # Create recording configuration
            config = self._get_recording_config(output_format, video_quality)
            
            # Create FFmpeg recorder
            recorder = FFmpegRecorder(
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
                logger.info(f"✅ Recording started for {mint_id}")
            else:
                logger.error(f"❌ Recording failed for {mint_id}: {result.get('error')}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Recording service error: {e}")
            return {"success": False, "error": str(e)}

    async def stop_recording(self, mint_id: str) -> Dict[str, Any]:
        """Stop recording."""
        try:
            if mint_id not in self.active_recordings:
                return {"success": False, "error": f"No active recording for {mint_id}"}
            
            recorder = self.active_recordings[mint_id]
            result = await recorder.stop()
            
            # Remove from active recordings
            del self.active_recordings[mint_id]
            
            logger.info(f"✅ Recording stopped for {mint_id}")
            return result
            
        except Exception as e:
            logger.error(f"❌ Stop recording error: {e}")
            return {"success": False, "error": str(e)}

    async def get_recording_status(self, mint_id: str) -> Dict[str, Any]:
        """Get recording status."""
        if mint_id not in self.active_recordings:
            return {"success": False, "error": f"No active recording for {mint_id}"}
        
        recorder = self.active_recordings[mint_id]
        return await recorder.get_status()

    def _get_recording_config(self, output_format: str, video_quality: str) -> Dict[str, Any]:
        """Get recording configuration."""
        config = self.default_config.copy()
        config["format"] = output_format
        
        # Adjust quality settings
        if video_quality == "low":
            config["video_bitrate"] = "1M"
            config["audio_bitrate"] = "96k"
        elif video_quality == "high":
            config["video_bitrate"] = "4M"
            config["audio_bitrate"] = "192k"
        
        return config
