"""
WebRTC recording service using aiortc/PyAV for direct file recording.

This approach eliminates FFmpeg subprocess by using PyAV directly
for encoding and muxing to disk in various formats.
"""

import asyncio
import logging
import numpy as np
import json
import psutil
import gc
from typing import Dict, Any, Optional, Union
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum
import time

import livekit.rtc as rtc
from app.services.stream_manager import StreamManager

try:
    import av
    from av import VideoFrame, AudioFrame
    AV_AVAILABLE = True
except ImportError:
    AV_AVAILABLE = False
    av = None
    VideoFrame = None
    AudioFrame = None

logger = logging.getLogger(__name__)

# Valid container formats and their compatible codecs
VALID_FORMATS = {
    "mp4": {"video_codecs": ["libx264", "h264", "libx265", "h265"], "audio_codecs": ["aac"]},
    "mpegts": {"video_codecs": ["libx264", "h264", "libx265", "h265"], "audio_codecs": ["aac", "mp3"]},
    "webm": {"video_codecs": ["libvpx-vp9", "vp9"], "audio_codecs": ["opus", "vorbis"]},
    "mkv": {"video_codecs": ["libx264", "h264", "libx265", "h265", "libvpx-vp9"], "audio_codecs": ["aac", "opus", "mp3"]}
}

# Map codec names to appropriate container formats
CODEC_TO_FORMAT = {
    "h264": "mp4",
    "libx264": "mp4",
    "h265": "mp4",
    "libx265": "mp4",
    "vp9": "webm",
    "libvpx-vp9": "webm"
}

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


class VideoNormalizer:
    """Normalizes various video pixel formats to a consistent encoder format."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.rgb_order = config.get("rgb_order", "RGB")
        self.row_stride_bytes = config.get("row_stride_bytes")
        self.resolution_strategy = config.get("resolution_strategy", "scale_to_config")
        self.colorspace = config.get("colorspace", "bt709")
        self.range = config.get("range", "limited")
        self.coerce_unknown_to_rgb = config.get("coerce_unknown_to_rgb", False)

    def normalize_frame(self, frame: rtc.VideoFrame, target_width: int, target_height: int) -> Optional[av.VideoFrame]:
        """Normalize a video frame to the target format."""
        try:
            buffer = frame.data
            source_width = frame.width
            source_height = frame.height

            # Handle stride/alignment if specified
            if self.row_stride_bytes and self.row_stride_bytes != source_width * 3:
                buffer = self._fix_stride(buffer, source_width, source_height)

            # Detect and handle pixel format
            pixel_format = self._detect_pixel_format(buffer, source_width, source_height)

            if pixel_format == "unknown" and not self.coerce_unknown_to_rgb:
                logger.error(f"[{frame}] Unknown pixel format and coercion disabled")
                return None

            # Create PyAV frame based on detected format
            if pixel_format in ["rgb24", "bgr24"]:
                av_frame = self._handle_rgb_format(buffer, source_width, source_height, pixel_format)
            elif pixel_format == "rgba":
                av_frame = self._handle_rgba_format(buffer, source_width, source_height)
            elif pixel_format in ["i420", "yuv420p"]:
                av_frame = self._handle_yuv420_format(buffer, source_width, source_height)
            elif pixel_format == "nv12":
                av_frame = self._handle_nv12_format(buffer, source_width, source_height)
            elif pixel_format == "yuy2":
                av_frame = self._handle_yuy2_format(buffer, source_width, source_height)
            else:
                # Unknown format - try to coerce to RGB
                if self.coerce_unknown_to_rgb:
                    av_frame = self._coerce_to_rgb(buffer, source_width, source_height)
                else:
                    return None

            # Handle resolution strategy
            av_frame = self._handle_resolution(av_frame, source_width, source_height, target_width, target_height)

            return av_frame

        except Exception as e:
            logger.error(f"Frame normalization failed: {e}")
            return None

    def _fix_stride(self, buffer, width: int, height: int) -> bytes:
        """Fix row stride by copying to a contiguous buffer."""
        stride = self.row_stride_bytes
        expected_stride = width * 3

        if stride == expected_stride:
            return buffer

        # Create contiguous buffer
        contiguous = bytearray(width * height * 3)

        for y in range(height):
            src_offset = y * stride
            dst_offset = y * expected_stride
            # Copy only the valid pixels, ignore padding
            src_end = min(src_offset + expected_stride, len(buffer))
            dst_end = dst_offset + expected_stride
            contiguous[dst_offset:dst_end] = buffer[src_offset:src_end]

        return bytes(contiguous)

    def _detect_pixel_format(self, buffer, width: int, height: int) -> str:
        """Detect pixel format from buffer size and content."""
        size = len(buffer)

        # RGB24
        if size == width * height * 3:
            # Check if it looks like RGB or BGR by sampling
            if width > 10 and height > 10:
                # Sample a few pixels to detect RGB vs BGR order
                sample_points = [(10, 10), (width//2, height//2), (width-10, height-10)]
                rgb_score = 0
                bgr_score = 0

                for x, y in sample_points:
                    offset = (y * width + x) * 3
                    if offset + 3 <= len(buffer):
                        r, g, b = buffer[offset:offset+3]
                        # Simple heuristic: higher values in R channel suggest RGB order
                        rgb_score += r
                        bgr_score += b

                if rgb_score > bgr_score:
                    return "rgb24"
                else:
                    return "bgr24"
            return "rgb24"  # Default assumption

        # RGBA
        elif size == width * height * 4:
            return "rgba"

        # I420/YUV420p (1.5 bytes per pixel)
        elif size == int(width * height * 1.5):
            return "i420"

        # NV12 (1.5 bytes per pixel, different plane layout)
        elif size == int(width * height * 1.5):
            # NV12 has UV plane starting at width*height, check if it looks like UV data
            uv_start = width * height
            if uv_start + 10 < len(buffer):
                # UV plane should have lower variance (chroma vs luma)
                y_plane = buffer[:uv_start]
                uv_plane = buffer[uv_start:uv_start + width * height // 2]
                if len(uv_plane) > 0:
                    y_var = sum((y_plane[i] - y_plane[i-1])**2 for i in range(1, min(100, len(y_plane))))
                    uv_var = sum((uv_plane[i] - uv_plane[i-1])**2 for i in range(1, min(100, len(uv_plane))))
                    if uv_var < y_var * 0.1:  # UV variance much lower than Y
                        return "nv12"

        # YUY2 (2 bytes per pixel)
        elif size == width * height * 2:
            return "yuy2"

        return "unknown"

    def _handle_rgb_format(self, buffer, width: int, height: int, format_type: str) -> av.VideoFrame:
        """Handle RGB24 or BGR24 formats."""
        # Convert to numpy array
        frame_data = np.frombuffer(buffer, dtype=np.uint8)

        if format_type == "bgr24":
            # Convert BGR to RGB
            frame_data = frame_data.reshape(height, width, 3)
            frame_data = frame_data[:, :, [2, 1, 0]]  # BGR -> RGB
        else:
            # RGB24 - just reshape
            frame_data = frame_data.reshape(height, width, 3)

        # Create PyAV frame
        return av.VideoFrame.from_ndarray(frame_data, format='rgb24')

    def _handle_rgba_format(self, buffer, width: int, height: int) -> av.VideoFrame:
        """Handle RGBA format (drop alpha channel)."""
        frame_data = np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 4)
        # Drop alpha channel
        frame_data = frame_data[:, :, :3]
        return av.VideoFrame.from_ndarray(frame_data, format='rgb24')

    def _handle_yuv420_format(self, buffer, width: int, height: int) -> av.VideoFrame:
        """Handle I420/YUV420p format."""
        # I420: Y plane (width*height) + U plane (width*height/4) + V plane (width*height/4)
        y_size = width * height
        uv_size = width * height // 4

        y_plane = buffer[:y_size]
        u_plane = buffer[y_size:y_size + uv_size]
        v_plane = buffer[y_size + uv_size:y_size + 2 * uv_size]

        # Create YUV420P frame
        frame = av.VideoFrame(width, height, format='yuv420p')
        frame.planes[0].update(y_plane)
        frame.planes[1].update(u_plane)
        frame.planes[2].update(v_plane)

        return frame

    def _handle_nv12_format(self, buffer, width: int, height: int) -> av.VideoFrame:
        """Handle NV12 format."""
        # NV12: Y plane (width*height) + UV plane (width*height/2, interleaved)
        y_size = width * height
        uv_size = width * height // 2

        y_plane = buffer[:y_size]
        uv_plane = buffer[y_size:y_size + uv_size]

        # Create NV12 frame
        frame = av.VideoFrame(width, height, format='nv12')
        frame.planes[0].update(y_plane)
        frame.planes[1].update(uv_plane)

        return frame

    def _handle_yuy2_format(self, buffer, width: int, height: int) -> av.VideoFrame:
        """Handle YUY2 format (YUYV422)."""
        # YUY2 is packed YUYV, 2 bytes per pixel
        frame_data = np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 2)

        # Extract Y channel (every other byte)
        y_plane = frame_data[:, :, 0]

        # For simplicity, create grayscale RGB from Y
        # In a full implementation, we'd properly unpack U and V
        rgb_data = np.stack([y_plane, y_plane, y_plane], axis=2)

        return av.VideoFrame.from_ndarray(rgb_data, format='rgb24')

    def _coerce_to_rgb(self, buffer, width: int, height: int) -> av.VideoFrame:
        """Coerce unknown format to RGB as fallback."""
        frame_data = np.frombuffer(buffer, dtype=np.uint8)

        # Try to reshape as RGB
        expected_size = width * height * 3
        if len(frame_data) >= expected_size:
            frame_data = frame_data[:expected_size].reshape(height, width, 3)
        else:
            # Pad with zeros
            padding = np.zeros(expected_size - len(frame_data), dtype=np.uint8)
            frame_data = np.concatenate([frame_data, padding]).reshape(height, width, 3)

        return av.VideoFrame.from_ndarray(frame_data, format='rgb24')

    def _handle_resolution(self, av_frame: av.VideoFrame, source_width: int, source_height: int,
                          target_width: int, target_height: int) -> av.VideoFrame:
        """Handle resolution changes based on strategy."""
        strategy = self.resolution_strategy

        if source_width == target_width and source_height == target_height:
            return av_frame

        if strategy == "scale_to_config":
            # Scale to configured resolution
            return av_frame.reformat(width=target_width, height=target_height,
                                   format='yuv420p', src_colorspace=self.colorspace,
                                   src_range=self.range)

        elif strategy == "match_source":
            # Use source resolution (update target for next frames)
            return av_frame.reformat(width=source_width, height=source_height,
                                   format='yuv420p', src_colorspace=self.colorspace,
                                   src_range=self.range)

        elif strategy == "recreate_on_change":
            # For now, fall back to scale_to_config
            # In a full implementation, this would trigger container recreation
            logger.warning("Resolution change detected, recreating container not yet implemented")
            return av_frame.reformat(width=target_width, height=target_height,
                                   format='yuv420p', src_colorspace=self.colorspace,
                                   src_range=self.range)

        return av_frame

class AiortcFileRecorder:
    """WebRTC recorder using aiortc/PyAV for direct file recording."""

    def __init__(
        self,
        mint_id: str,
        stream_info: Any,
        output_dir: Path,
        config: Dict[str, Any],
        room: rtc.Room
    ):
        if not AV_AVAILABLE:
            raise ImportError("PyAV (av) is required for aiortc recording. Install with: pip install av")

        self.mint_id = mint_id
        self.stream_info = stream_info
        self.output_dir = output_dir
        self.config = config
        self.room = room

        self.state = RecordingState.DISCONNECTED
        self.tracks: Dict[str, TrackContext] = {}
        self.container: Optional[av.container.OutputContainer] = None
        self.output_path: Optional[Path] = None
        self.start_time: Optional[datetime] = None

        # Track references for frame access
        self.video_track: Optional[rtc.RemoteVideoTrack] = None
        self.audio_track: Optional[rtc.RemoteAudioTrack] = None

        # Frame processing
        self.video_frames_received = 0
        self.audio_frames_received = 0
        self.video_frames_written = 0
        self.audio_frames_written = 0

        # PyAV streams
        self.video_stream: Optional[av.video.VideoStream] = None
        self.audio_stream: Optional[av.audio.AudioStream] = None

        # Shutdown event for thread-safe signaling
        self._shutdown_event = asyncio.Event()

        # Polling guard to prevent duplicates
        self._polling_started = False

        # Timestamp tracking for A/V synchronization
        self.recording_start_time = None  # Wall clock time when recording started
        self.first_video_timestamp = None  # First video frame RTP timestamp
        self.first_audio_timestamp = None  # First audio frame RTP timestamp
        self.audio_samples_written = 0  # Cumulative audio samples written

        # Dynamic resolution tracking
        self.current_video_width = None
        self.current_video_height = None
        self.frame_count_since_last_resize = 0

        # A/V sync logging counter
        self.video_frames_logged = 0

        # Video normalization
        self.video_normalizer = VideoNormalizer(config)
        
        # Lazy initialization flag
        self._container_initialized = False
        
    def _log_memory_usage(self, context: str = ""):
        """Log current memory usage for debugging."""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            logger.info(f"[{context}] Memory usage: {memory_mb:.1f} MB")
        except Exception as e:
            logger.warning(f"[{context}] Could not get memory usage: {e}")

    def _parse_bitrate(self, bitrate_str: str) -> int:
        """Parse bitrate string (e.g., '2M', '128k') to integer."""
        if isinstance(bitrate_str, int):
            return bitrate_str

        bitrate_str = str(bitrate_str).upper()
        if bitrate_str.endswith('K'):
            return int(bitrate_str[:-1]) * 1000
        elif bitrate_str.endswith('M'):
            return int(bitrate_str[:-1]) * 1000000
        else:
            return int(bitrate_str)
    
    async def _continuous_track_detection(self):
        """Continuously try to find tracks and start frame processing."""
        logger.info(f"[{self.mint_id}] 🔍 Starting continuous track detection...")
        
        for attempt in range(10):  # Try for 10 seconds
            if self._shutdown_event.is_set():
                logger.info(f"[{self.mint_id}] 🛑 Shutdown requested, stopping track detection")
                return
                
            participant = self._find_participant()
            if participant:
                await self._setup_existing_track_handlers(participant)
                if self.video_track or self.audio_track:
                    logger.info(f"[{self.mint_id}] ✅ Found tracks after {attempt + 1} attempts, starting frame processing")
                    await self._start_frame_processing()
                    return
            
            logger.info(f"[{self.mint_id}] 🔍 Track detection attempt {attempt + 1}/10 - no tracks found")
            await asyncio.sleep(1.0)
        
        logger.warning(f"[{self.mint_id}] ⚠️  Could not find tracks after 10 attempts")

    async def start(self) -> Dict[str, Any]:
        """Start recording using aiortc/PyAV."""
        try:
            logger.info(f"[{self.mint_id}] Starting aiortc-based recording")

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
            logger.info(f"[{self.mint_id}] ✅ Room event handler set up for track_subscribed")

            # Also set up frame handlers on existing tracks (in case they're already subscribed)
            await self._setup_existing_track_handlers(participant)

            # Retry loop to wait for tracks before proceeding
            logger.info(f"[{self.mint_id}] ⏳ Waiting for tracks to be available...")
            for attempt in range(5):  # Try for 5 seconds
                if self.video_track or self.audio_track:
                    break
                await asyncio.sleep(1.0)
                participant = self._find_participant()
                if participant:
                    await self._setup_existing_track_handlers(participant)
            if not (self.video_track or self.audio_track):
                logger.warning(f"[{self.mint_id}] ⚠️  No tracks found after retries")
                # Schedule continuous detection as fallback
                asyncio.create_task(self._continuous_track_detection())

            # Frame processing will handle container initialization when first frame arrives
            logger.info(f"[{self.mint_id}] ⏳ Frame processing will initialize container on first frame")

            # Check LiveKit room connection status
            if not self.room.isconnected():
                logger.error(f"[{self.mint_id}] LiveKit room disconnected - stopping recording")
                await self._cleanup()
                return {"success": False, "error": "LiveKit room disconnected"}

            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED

            # Start frame processing (if we have tracks)
            if self.video_track or self.audio_track:
                await self._start_frame_processing()
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No tracks available for frame processing")
                # Try to find tracks again after a short delay
                await asyncio.sleep(1.0)
                participant = self._find_participant()
                if participant:
                    await self._setup_existing_track_handlers(participant)
                    if self.video_track or self.audio_track:
                        logger.info(f"[{self.mint_id}] ✅ Found tracks on retry, starting frame processing")
                        await self._start_frame_processing()
                    else:
                        logger.warning(f"[{self.mint_id}] ⚠️  Still no tracks found after retry")
                        # Start a background task to continuously look for tracks
                        asyncio.create_task(self._continuous_track_detection())

            # State: SUBSCRIBED → RECORDING
            self.state = RecordingState.RECORDING
            self.start_time = datetime.now(timezone.utc)
            self.recording_start_time = time.time()  # Wall clock for timestamp baseline

            logger.info(f"[{self.mint_id}] ✅ Recording started with aiortc/PyAV")

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
            logger.info(f"[{self.mint_id}] Stopping aiortc recording")

            if self.state != RecordingState.RECORDING:
                return {"success": False, "error": f"No active recording to stop (state: {self.state.value})"}

            # State: RECORDING → STOPPING
            self.state = RecordingState.STOPPING
            self._shutdown_event.set()

            # Close PyAV container
            await self._close_container()

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
        recording_mode = "unknown"

        # Debug logging
        logger.info(f"[{self.mint_id}] Status check: state={self.state.value}, frames_received={self.video_frames_received}, frames_written={self.video_frames_written}")
        logger.info(f"[{self.mint_id}] PyAV container: {self.container is not None}")

        # Determine recording mode and calculate file size
        recording_mode = "aiortc"
        file_size = 0

        if self.container:
            logger.info(f"[{self.mint_id}] PyAV container active")

            # Check if output file exists and its size
            if self.output_path and self.output_path.exists():
                file_size = self.output_path.stat().st_size
                logger.info(f"[{self.mint_id}] PyAV output file size: {file_size} bytes")
            else:
                logger.warning(f"[{self.mint_id}] PyAV output file does not exist: {self.output_path}")
        else:
            logger.warning(f"[{self.mint_id}] No recording mode active - no PyAV container")

        # Determine if we're actually recording based on state and frame activity
        is_recording = (self.state == RecordingState.RECORDING and
                       (self.video_frames_received > 0 or self.audio_frames_received > 0))

        # Also check if we have an active recording process (PyAV container)
        has_active_process = self.container is not None

        # Final recording status
        is_recording = is_recording and has_active_process

        logger.info(f"[{self.mint_id}] Recording status: mode={recording_mode}, is_recording={is_recording}")

        return {
            "mint_id": self.mint_id,
            "state": self.state.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "recording_mode": recording_mode,
            "is_recording": is_recording,
            "tracks": len(self.tracks),
            "timestamp_info": {
                "first_video_timestamp": self.first_video_timestamp,
                "first_audio_timestamp": self.first_audio_timestamp,
                "audio_samples_written": self.audio_samples_written,
                "recording_start_time": self.recording_start_time
            },
            "flexibility": {
                "rgb_order": self.config.get("rgb_order", "RGB"),
                "resolution_strategy": self.config.get("resolution_strategy", "scale_to_config"),
                "colorspace": self.config.get("colorspace", "bt709"),
                "range": self.config.get("range", "limited"),
                "coerce_unknown_to_rgb": self.config.get("coerce_unknown_to_rgb", False),
                "current_resolution": f"{self.current_video_width}x{self.current_video_height}" if self.current_video_width else None
            },
            "stats": {
                "video_frames_received": self.video_frames_received,
                "audio_frames_received": self.audio_frames_received,
                "video_frames_written": self.video_frames_written,
                "audio_frames_written": self.audio_frames_written,
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

    async def _setup_existing_track_handlers(self, participant: rtc.RemoteParticipant):
        """Set up direct track access for recording (no frame handlers needed)."""
        logger.info(f"[{self.mint_id}] Setting up direct track access for recording from {participant.sid}")
        
        # Store track references for direct access
        logger.info(f"[{self.mint_id}] 🔍 Found {len(participant.track_publications)} track publications")
        logger.info(f"[{self.mint_id}] 🔍 Target participant: {self.stream_info.participant_sid}")
        logger.info(f"[{self.mint_id}] 🔍 Current participant: {participant.sid}")
        
        for track_pub in participant.track_publications.values():
            logger.info(f"[{self.mint_id}] Track pub: {track_pub.sid}, kind={track_pub.kind}, track={track_pub.track}")
            if track_pub.track is None:
                logger.warning(f"[{self.mint_id}] ⚠️  Track publication {track_pub.sid} has no track object")
                continue
                
            track = track_pub.track
            logger.info(f"[{self.mint_id}] Track object: {type(track)}, kind={track.kind}, sid={track.sid}")
            logger.info(f"[{self.mint_id}] Track methods: {[m for m in dir(track) if not m.startswith('_')]}")
            
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                self.video_track = track
                logger.info(f"[{self.mint_id}] ✅ Video track reference stored for direct access")
                logger.info(f"[{self.mint_id}] Video track: {self.video_track}")
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                self.audio_track = track
                logger.info(f"[{self.mint_id}] ✅ Audio track reference stored for direct access")
                logger.info(f"[{self.mint_id}] Audio track: {self.audio_track}")
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  Unknown track kind: {track.kind}")
        
        # Start polling for frames since direct handlers aren't available
        logger.info(f"[{self.mint_id}] 🔄 Starting frame polling for direct track access...")
        logger.info(f"[{self.mint_id}] 🔍 Tracks available: video={self.video_track is not None}, audio={self.audio_track is not None}")
        if self.video_track:
            logger.info(f"[{self.mint_id}] Video track: {self.video_track}")
        if self.audio_track:
            logger.info(f"[{self.mint_id}] Audio track: {self.audio_track}")
        
        polling_task = asyncio.create_task(self._poll_frames())
        logger.info(f"[{self.mint_id}] 📋 Polling task created: {polling_task}")
        logger.info(f"[{self.mint_id}] 📋 Polling task done: {polling_task.done()}")
        logger.info(f"[{self.mint_id}] 📋 Polling task cancelled: {polling_task.cancelled()}")

    def _on_track_subscribed(self, track, publication, participant):
        """Handle track subscribed event."""
        logger.info(f"[{self.mint_id}] Track subscribed event: {track.kind} from {participant.sid} (target: {self.stream_info.participant_sid})")
        
        if participant.sid != self.stream_info.participant_sid:
            logger.info(f"[{self.mint_id}] Skipping non-target participant: {participant.sid}")
            return  # Only process tracks from our target participant
            
        logger.info(f"[{self.mint_id}] ✅ Setting up frame handlers for target participant")
        
        # Store track reference for direct access (no frame handlers needed)
        logger.info(f"[{self.mint_id}] Track subscribed - track: {type(track)}, kind={track.kind}, sid={track.sid}")
        logger.info(f"[{self.mint_id}] Track methods: {[m for m in dir(track) if not m.startswith('_')]}")
        
        if track.kind == rtc.TrackKind.KIND_VIDEO:
            self.video_track = track
            logger.info(f"[{self.mint_id}] ✅ Video track reference stored for direct access")
        elif track.kind == rtc.TrackKind.KIND_AUDIO:
            self.audio_track = track
            logger.info(f"[{self.mint_id}] ✅ Audio track reference stored for direct access")
        
        # Start polling for frames if not already started
        if not self._polling_started:
            logger.info(f"[{self.mint_id}] 🔄 Starting frame polling for direct track access...")
            logger.info(f"[{self.mint_id}] 🔍 Tracks available: video={self.video_track is not None}, audio={self.audio_track is not None}")
            asyncio.create_task(self._poll_frames())
            self._polling_started = True
        else:
            logger.info(f"[{self.mint_id}] 🔄 Frame polling already started, skipping...")

    async def _poll_frames(self):
        """Process frames using LiveKit's VideoStream and AudioStream (proven approach)."""
        logger.info(f"[{self.mint_id}] 🚀 _poll_frames() method called!")
        logger.info(f"[{self.mint_id}] 🔄 Starting frame processing with VideoStream/AudioStream...")
        
        try:
            # Create tasks for video and audio processing (like the working implementation)
            tasks = []
            
            logger.info(f"[{self.mint_id}] 🔍 Available tracks: video={self.video_track is not None}, audio={self.audio_track is not None}")
            logger.info(f"[{self.mint_id}] 🔍 Video track object: {self.video_track}")
            logger.info(f"[{self.mint_id}] 🔍 Audio track object: {self.audio_track}")
            
            if self.video_track:
                logger.info(f"[{self.mint_id}] ✅ Starting video stream processing")
                logger.info(f"[{self.mint_id}] Video track details: {self.video_track}")
                logger.info(f"[{self.mint_id}] Video track type: {type(self.video_track)}")
                logger.info(f"[{self.mint_id}] Video track kind: {getattr(self.video_track, 'kind', 'unknown')}")
                video_task = asyncio.create_task(self._process_video_stream())
                tasks.append(video_task)
                logger.info(f"[{self.mint_id}] Video task created: {video_task}")
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No video track available!")
            
            if self.audio_track:
                logger.info(f"[{self.mint_id}] ✅ Starting audio stream processing")
                logger.info(f"[{self.mint_id}] Audio track details: {self.audio_track}")
                audio_task = asyncio.create_task(self._process_audio_stream())
                tasks.append(audio_task)
                logger.info(f"[{self.mint_id}] Audio task created: {audio_task}")
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No audio track available!")
            
            if not tasks:
                logger.warning(f"[{self.mint_id}] ⚠️  No tracks available for processing")
                logger.warning(f"[{self.mint_id}] ⚠️  Video track: {self.video_track}")
                logger.warning(f"[{self.mint_id}] ⚠️  Audio track: {self.audio_track}")
                return
            
            logger.info(f"[{self.mint_id}] 🚀 Starting {len(tasks)} processing tasks...")
            # Wait for all tasks to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            logger.info(f"[{self.mint_id}] 📊 Task results: {results}")
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Frame processing error: {e}")
        finally:
            logger.info(f"[{self.mint_id}] 🛑 Frame processing stopped")

    async def _process_video_stream(self):
        """Process video frames using rtc.VideoStream (proven approach)."""
        try:
            logger.info(f"[{self.mint_id}] 🎥 Starting video stream processing")
            logger.info(f"[{self.mint_id}] Video track: {self.video_track}")
            logger.info(f"[{self.mint_id}] Video track type: {type(self.video_track)}")
            frame_count = 0
            last_frame_time = time.time()
            
            logger.debug(f"[{self.mint_id}] Entering VideoStream async loop for {self.video_track.sid}")
            async for event in rtc.VideoStream(self.video_track):
                current_time = time.time()
                time_since_last = current_time - last_frame_time
                logger.info(f"[{self.mint_id}] 📹 VideoStream event received! (time since last: {time_since_last:.2f}s)")
                
                # Check for frame timeout (if no frames for 10 seconds, something is wrong)
                if time_since_last > 10.0 and frame_count > 0:
                    logger.warning(f"[{self.mint_id}] ⚠️  Long gap between frames: {time_since_last:.2f}s")
                    self._log_memory_usage(f"{self.mint_id} frame_gap_warning")
                    
                    # If gap is too long, stop recording to prevent memory issues
                    if time_since_last > 60.0:  # 1 minute gap
                        logger.error(f"[{self.mint_id}] ⚠️  Frame gap too long ({time_since_last:.2f}s) - stopping recording")
                        logger.error(f"[{self.mint_id}] This indicates LiveKit connection issues or stream problems")
                        self._shutdown_event.set()
                        return
                
                last_frame_time = current_time
                
                if self._shutdown_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop signal received, ending video processing")
                    break
                
                frame = event.frame
                logger.info(f"[{self.mint_id}] 📹 Frame extracted from event: {type(frame)}")
                logger.info(f"[{self.mint_id}] 📹 Frame dimensions: {frame.width}x{frame.height}")
                logger.info(f"[{self.mint_id}] 📹 Frame data size: {len(frame.data) if hasattr(frame, 'data') else 'No data attr'}")
                try:
                    # Process the frame
                    logger.info(f"[{self.mint_id}] 📹 Calling _on_video_frame...")
                    await self._on_video_frame(frame)
                    frame_count += 1
                    logger.info(f"[{self.mint_id}] 📹 Frame processed successfully, count: {frame_count}")
                    
                    # Log progress and memory usage
                    if frame_count % 50 == 0:  # Log every 50 frames instead of 100
                        self._log_memory_usage(f"{self.mint_id} video_frame_{frame_count}")
                        logger.info(f"[{self.mint_id}] Processed {frame_count} video frames")
                        
                except Exception as e:
                    logger.error(f"[{self.mint_id}] Error processing video frame {frame_count}: {e}")
                    import traceback
                    logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")
                    continue
                    
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Video stream processing cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video stream processing error: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")
            
            # Check if this is a LiveKit connection issue
            if "connection" in str(e).lower() or "timeout" in str(e).lower():
                logger.error(f"[{self.mint_id}] LiveKit connection issue detected - stopping recording")
                self._shutdown_event.set()
        finally:
            logger.info(f"[{self.mint_id}] Video stream processing ended. Total frames: {frame_count}")

    async def _process_audio_stream(self):
        """Process audio frames using rtc.AudioStream (proven approach)."""
        try:
            logger.info(f"[{self.mint_id}] 🎵 Starting audio stream processing")
            frame_count = 0
            
            logger.debug(f"[{self.mint_id}] Entering AudioStream async loop for {self.audio_track.sid}")
            async for event in rtc.AudioStream(self.audio_track):
                if self._shutdown_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop signal received, ending audio processing")
                    break
                
                frame = event.frame
                try:
                    # Process the frame
                    await self._on_audio_frame(frame)
                    frame_count += 1
                    
                    # Log progress
                    if frame_count % 1000 == 0:
                        logger.info(f"[{self.mint_id}] Processed {frame_count} audio frames")
                        
                except Exception as e:
                    logger.error(f"[{self.mint_id}] Error processing audio frame {frame_count}: {e}")
                    continue
                    
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Audio stream processing cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio stream processing error: {e}")
        finally:
            logger.info(f"[{self.mint_id}] Audio stream processing ended. Total frames: {frame_count}")

    async def _setup_container(self):
        """Setup PyAV container for recording with lazy initialization."""
        # Idempotency check - if already initialized, return early
        if self._container_initialized:
            logger.info(f"[{self.mint_id}] Container already initialized, skipping setup")
            return
            
        # Generate output path
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        output_format = self.config.get('format', 'mpegts')

        if output_format == 'mpegts':
            output_filename = f"{self.mint_id}_{timestamp}.ts"
        elif output_format == 'mp4':
            output_filename = f"{self.mint_id}_{timestamp}.mp4"
        elif output_format == 'webm':
            output_filename = f"{self.mint_id}_{timestamp}.webm"
        else:
            output_filename = f"{self.mint_id}_{timestamp}.ts"  # Default to mpegts

        self.output_path = self.output_dir / output_filename

        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"[{self.mint_id}] Setting up PyAV container: {self.output_path} (format: {output_format})")
        logger.info(f"[{self.mint_id}] Available tracks: video={self.video_track is not None}, audio={self.audio_track is not None}")

        try:
            # Create PyAV output container
            self.container = av.open(str(self.output_path), mode='w', format=output_format)

            # Add video stream
            if self.video_track:
                self.video_stream = self.container.add_stream(
                    self.config['video_codec'],
                    rate=self.config['fps']
                )
                self.video_stream.width = self.config['width']
                self.video_stream.height = self.config['height']
                self.video_stream.pix_fmt = 'yuv420p'

                # Set video bitrate
                if 'video_bitrate' in self.config:
                    self.video_stream.bit_rate = self._parse_bitrate(self.config['video_bitrate'])

                logger.info(f"[{self.mint_id}] ✅ Video stream added: {self.config['video_codec']} at {self.config['width']}x{self.config['height']}")
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No video track available for container setup")

            # Add audio stream
            if self.audio_track:
                self.audio_stream = self.container.add_stream(
                    self.config['audio_codec'],
                    rate=48000  # Standard sample rate
                )
                self.audio_stream.channels = 2  # Stereo
                self.audio_stream.sample_rate = 48000

                # Set audio bitrate
                if 'audio_bitrate' in self.config:
                    self.audio_stream.bit_rate = self._parse_bitrate(self.config['audio_bitrate'])

                logger.info(f"[{self.mint_id}] ✅ Audio stream added: {self.config['audio_codec']} at 48kHz stereo")
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No audio track available for container setup")

            # Mark as initialized
            self._container_initialized = True
            logger.info(f"[{self.mint_id}] ✅ PyAV container setup complete")

        except Exception as e:
            error_msg = str(e)
            if "does not support" in error_msg and "codec" in error_msg:
                logger.error(f"[{self.mint_id}] ❌ Codec/format mismatch: {error_msg}")
                logger.error(f"[{self.mint_id}] Format: {output_format}, Video: {self.config.get('video_codec')}, Audio: {self.config.get('audio_codec')}")
                logger.error(f"[{self.mint_id}] Hint: Use 'mp4' for H.264/AAC, 'webm' for VP9/Opus, 'mpegts' for MPEG-TS")
            else:
                logger.error(f"[{self.mint_id}] ❌ Failed to setup PyAV container: {e}")
            
            if self.container:
                self.container.close()
                self.container = None
            self._container_initialized = False
            raise  # Re-raise to fail the recording start immediately

    async def _close_container(self):
        """Close PyAV container and finalize recording."""
        if self.container:
            try:
                logger.info(f"[{self.mint_id}] Closing PyAV container and flushing encoders")

                # Flush video encoder if available
                if self.video_stream:
                    logger.info(f"[{self.mint_id}] Flushing video encoder")
                    for packet in self.video_stream.encode(None):
                        self.container.mux(packet)

                # Flush audio encoder if available
                if self.audio_stream:
                    logger.info(f"[{self.mint_id}] Flushing audio encoder")
                    for packet in self.audio_stream.encode(None):
                        self.container.mux(packet)

                # Close container
                self.container.close()
                logger.info(f"[{self.mint_id}] ✅ PyAV container closed")
            except Exception as e:
                logger.error(f"[{self.mint_id}] Error closing container: {e}")
            finally:
                self.container = None

    async def _start_frame_processing(self):
        """Start frame processing tasks."""
        logger.info(f"[{self.mint_id}] Starting frame processing")

        if self.video_track:
            logger.info(f"[{self.mint_id}] Video track available: {self.video_track.sid}")
        if self.audio_track:
            logger.info(f"[{self.mint_id}] Audio track available: {self.audio_track.sid}")

        # Start the frame processing tasks
        logger.info(f"[{self.mint_id}] 🚀 Starting frame processing tasks...")
        await self._poll_frames()

    async def _on_video_frame(self, frame: rtc.VideoFrame):
        """Handle video frame from LiveKit."""
        if self._shutdown_event.is_set():
            return

        # Lazy initialization - setup container on first frame
        if not self._container_initialized:
            try:
                logger.info(f"[{self.mint_id}] 🎬 First video frame received, initializing container...")
                await self._setup_container()
                logger.info(f"[{self.mint_id}] ✅ Container initialized on first video frame")
            except Exception as e:
                logger.error(f"[{self.mint_id}] Failed to initialize container: {e}")
                return

        # Guard: Skip if video stream not available after initialization
        if not self.video_stream:
            logger.warning(f"[{self.mint_id}] Video stream not available after initialization, skipping frame")
            return

        try:
            self.video_frames_received += 1
            logger.info(f"[{self.mint_id}] 📹 Processing video frame #{self.video_frames_received}")
            logger.info(f"[{self.mint_id}] 📹 Frame details: {frame.width}x{frame.height}, data_len={len(frame.data) if hasattr(frame, 'data') else 'No data'}")

            if self.video_frames_received == 1:
                logger.info(f"[{self.mint_id}] 🎬 FIRST VIDEO FRAME RECEIVED!")
                logger.info(f"[{self.mint_id}] Frame type: {type(frame)}")
                logger.info(f"[{self.mint_id}] Frame attributes: {[attr for attr in dir(frame) if not attr.startswith('_')]}")
                self._log_memory_usage(f"{self.mint_id} first_frame")

            # Use VideoNormalizer for flexible frame handling
            target_width = self.config.get('width', 1920)
            target_height = self.config.get('height', 1080)

            # Update current resolution if needed
            if self.current_video_width != frame.width or self.current_video_height != frame.height:
                self.current_video_width = frame.width
                self.current_video_height = frame.height
                self.frame_count_since_last_resize = 0
                logger.info(f"[{self.mint_id}] Resolution changed to {frame.width}x{frame.height}")

            normalized_frame = self.video_normalizer.normalize_frame(frame, target_width, target_height)

            if normalized_frame is None:
                logger.warning(f"[{self.mint_id}] Failed to normalize frame, skipping")
                return

            # Use the normalized frame for encoding
            # normalized_frame is already a properly formatted PyAV frame
            av_frame = normalized_frame

            logger.info(f"[{self.mint_id}] ✅ Frame normalized: {av_frame.width}x{av_frame.height} {av_frame.format.name}")

            # Handle dynamic resolution - update config with actual dimensions
            actual_height, actual_width = av_frame.height, av_frame.width
            expected_height, expected_width = self.config['height'], self.config['width']

            # If dimensions don't match, update the config for dynamic resolution
            if actual_height != expected_height or actual_width != expected_width:
                logger.info(f"[{self.mint_id}] Dynamic resolution detected: {actual_width}x{actual_height} (was {expected_width}x{expected_height})")
                self.config['width'] = actual_width
                self.config['height'] = actual_height

            # Set proper PTS based on frame timestamp
            if hasattr(frame, 'timestamp_us') and frame.timestamp_us is not None:
                if self.first_video_timestamp is None:
                    self.first_video_timestamp = frame.timestamp_us
                # Convert microseconds to time_base units
                pts = int(frame.timestamp_us * self.video_stream.time_base.numerator / (self.video_stream.time_base.denominator * 1000000))
            else:
                # Fallback to frame count if no timestamp available
                pts = self.video_frames_written * int(self.video_stream.time_base.denominator / self.video_stream.time_base.numerator)

            av_frame.pts = pts
            av_frame.time_base = self.video_stream.time_base

            # A/V sync drift logging (every 60 frames)
            self.video_frames_logged += 1
            if self.video_frames_logged % 60 == 0 and self.audio_samples_written > 0:
                video_seconds = av_frame.pts * self.video_stream.time_base
                audio_seconds = self.audio_samples_written / self.audio_stream.sample_rate
                drift = abs(video_seconds - audio_seconds)
                if drift > 1.0:
                    logger.warning(f"[{self.mint_id}] A/V sync drift: {drift:.2f}s (video: {video_seconds:.2f}s, audio: {audio_seconds:.2f}s)")

            # PyAV mode: encode and mux frame to container
            if self.container and self.video_stream:
                try:
                    # Encode frame
                    packets = self.video_stream.encode(av_frame)
                    for packet in packets:
                        self.container.mux(packet)

                    self.video_frames_written += 1

                    if self.video_frames_written == 1:
                        logger.info(f"[{self.mint_id}] 🎬 FIRST VIDEO FRAME ENCODED TO PYAV!")

                    if self.video_frames_written % 30 == 0:  # Log every second
                        logger.info(f"[{self.mint_id}] Encoded {self.video_frames_written} video frames to PyAV")

                except Exception as e:
                    logger.error(f"[{self.mint_id}] Error encoding video frame: {e}")
                    # Continue processing other frames
            else:
                logger.warning(f"[{self.mint_id}] PyAV container or video stream not available")
                logger.warning(f"[{self.mint_id}] Container: {self.container is not None}")
                logger.warning(f"[{self.mint_id}] Video stream: {self.video_stream is not None}")
                logger.warning(f"[{self.mint_id}] This indicates a setup issue - recording may not work properly")

            # Check memory usage and stop if too high
            try:
                import psutil
                process = psutil.Process()
                memory_mb = process.memory_info().rss / 1024 / 1024
                if memory_mb > 1000:  # Stop if using more than 1GB
                    logger.error(f"[{self.mint_id}] ❌ Memory usage too high: {memory_mb:.1f}MB - stopping recording")
                    self._shutdown_event.set()
                    return
            except ImportError:
                pass  # psutil not available, continue

            # Log memory usage every 100 frames
            if self.video_frames_received % 100 == 0:
                self._log_memory_usage(f"{self.mint_id} frame_{self.video_frames_received}")
                            
        except MemoryError as e:
            logger.error(f"[{self.mint_id}] Memory allocation failed: {e}")
            self._log_memory_usage(f"{self.mint_id} memory_error")
            # Force garbage collection and continue
            gc.collect()
            return
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame processing error: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")
            # Log memory usage on error
            self._log_memory_usage(f"{self.mint_id} frame_error")

    async def _on_audio_frame(self, frame: rtc.AudioFrame):
        """Handle audio frame from LiveKit."""
        if self._shutdown_event.is_set():
            return

        # Lazy initialization - setup container on first frame (if not already done by video)
        if not self._container_initialized:
            try:
                logger.info(f"[{self.mint_id}] 🎵 First audio frame received, initializing container...")
                await self._setup_container()
                logger.info(f"[{self.mint_id}] ✅ Container initialized on first audio frame")
            except Exception as e:
                logger.error(f"[{self.mint_id}] Failed to initialize container: {e}")
                return

        # Guard: Skip if audio stream not available after initialization
        if not self.audio_stream:
            logger.warning(f"[{self.mint_id}] Audio stream not available after initialization, skipping frame")
            return

        try:
            self.audio_frames_received += 1

            # Convert LiveKit audio frame to bytes
            audio_data = frame.data
            if hasattr(audio_data, 'tobytes'):
                audio_bytes = audio_data.tobytes()
            else:
                audio_bytes = bytes(audio_data)

            # PyAV mode: encode and mux audio frame to container
            if self.container and self.audio_stream:
                try:
                    # Calculate samples in this frame (16-bit stereo)
                    samples_per_frame = len(audio_bytes) // (2 * 2)  # int16 stereo

                    # Create PyAV AudioFrame from audio data
                    av_audio_frame = AudioFrame.from_ndarray(
                        np.frombuffer(audio_bytes, dtype=np.int16).reshape(-1, 2),  # Stereo
                        format='s16',
                        layout='stereo'
                    )
                    # Set PTS based on cumulative samples
                    av_audio_frame.pts = self.audio_samples_written
                    av_audio_frame.time_base = self.audio_stream.time_base
                    av_audio_frame.sample_rate = self.audio_stream.sample_rate

                    # Encode frame
                    packets = self.audio_stream.encode(av_audio_frame)
                    for packet in packets:
                        self.container.mux(packet)

                    # Track samples for next frame's PTS
                    self.audio_samples_written += samples_per_frame
                    self.audio_frames_written += 1

                    # A/V sync drift logging (every 1000 frames)
                    if self.audio_frames_written % 1000 == 0 and self.first_video_timestamp is not None:
                        video_seconds = (self.audio_samples_written / self.audio_stream.sample_rate)  # Estimate from audio
                        # Note: This is approximate; full sync would need video PTS at this point
                        logger.debug(f"[{self.mint_id}] Audio at {self.audio_samples_written} samples (~{video_seconds:.2f}s)")

                    if self.audio_frames_written % 1000 == 0:  # Log every 1000 frames
                        logger.info(f"[{self.mint_id}] Encoded {self.audio_frames_written} audio frames ({self.audio_samples_written} samples) to PyAV")

                except Exception as e:
                    logger.error(f"[{self.mint_id}] Error encoding audio frame: {e}")
                    # Continue processing other frames
            else:
                logger.debug(f"[{self.mint_id}] PyAV container or audio stream not available for audio")

            # CRITICAL: Free memory immediately after processing
            del audio_bytes
            del audio_data

            # Force garbage collection to free memory
            import gc
            gc.collect()

        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio frame processing error: {e}")

    async def _cleanup(self):
        """Clean up resources."""
        try:
            await self._close_container()
        except Exception as e:
            logger.error(f"[{self.mint_id}] Cleanup error: {e}")


class WebRTCRecordingService:
    """WebRTC recording service using aiortc/PyAV."""

    _instance_count = 0

    def __init__(self, output_dir: str = "recordings"):
        WebRTCRecordingService._instance_count += 1
        self._instance_id = WebRTCRecordingService._instance_count

        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Active recordings
        self.active_recordings: Dict[str, AiortcFileRecorder] = {}

        # Default recording configuration
        self.default_config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            # Video flexibility options
            "rgb_order": "RGB",  # RGB or BGR
            "row_stride_bytes": None,  # Optional: force row stride (bytes per row)
            "resolution_strategy": "scale_to_config",  # scale_to_config, match_source, recreate_on_change
            "colorspace": "bt709",  # bt709 or bt601
            "range": "limited",  # limited or full
            "coerce_unknown_to_rgb": False,  # Fallback for unknown formats
        }

        # Get StreamManager instance
        from app.services.stream_manager import StreamManager
        self.stream_manager = StreamManager()

        logger.info(f"🎬 WebRTCRecordingService instance #{self._instance_id} created")
    
    def _log_memory_usage(self, context: str = ""):
        """Log current memory usage for debugging."""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            logger.info(f"[{context}] Memory usage: {memory_mb:.1f} MB")
        except Exception as e:
            logger.warning(f"[{context}] Could not get memory usage: {e}")

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
            
            # Get the LiveKit room for this mint_id from StreamManager
            room = self.stream_manager.get_room(mint_id)
            if not room:
                logger.error(f"❌ No active LiveKit room found for mint_id: {mint_id}")
                return {"success": False, "error": f"No active LiveKit room found for mint_id: {mint_id}"}
            
            # Create recording configuration
            config = self._get_recording_config(output_format, video_quality)
            
            # Create aiortc recorder
            recorder = AiortcFileRecorder(
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

    async def get_all_recordings(self) -> Dict[str, Any]:
        """Get status of all active recordings."""
        result = {}
        for mint_id, recorder in self.active_recordings.items():
            try:
                status = await recorder.get_status()
                result[mint_id] = status
            except Exception as e:
                logger.error(f"Error getting status for recording {mint_id}: {e}")
                result[mint_id] = {
                    "mint_id": mint_id,
                    "state": "error",
                    "error": str(e)
                }

        return {
            "success": True,
            "recordings": result,
            "count": len(result)
        }

    async def get_recording_status(self, mint_id: str) -> Dict[str, Any]:
        """Get recording status."""
        if mint_id not in self.active_recordings:
            return {"success": False, "error": f"No active recording for {mint_id}"}
        
        recorder = self.active_recordings[mint_id]
        return await recorder.get_status()

    def _get_recording_config(self, output_format: str, video_quality: str) -> Dict[str, Any]:
        """Get recording configuration with format validation."""
        config = self.default_config.copy()
        
        # Validate and correct format
        if output_format not in VALID_FORMATS:
            # Check if it's a codec name that was mistakenly passed as format
            if output_format in CODEC_TO_FORMAT:
                logger.warning(f"⚠️  '{output_format}' is a codec, not a format. Using '{CODEC_TO_FORMAT[output_format]}' as container format.")
                output_format = CODEC_TO_FORMAT[output_format]
            else:
                logger.warning(f"⚠️  Invalid format '{output_format}', defaulting to 'mp4'")
                output_format = "mp4"
        
        config["format"] = output_format
        
        # Adjust quality settings
        if video_quality == "low":
            config["video_bitrate"] = "1M"
            config["audio_bitrate"] = "96k"
        elif video_quality == "high":
            config["video_bitrate"] = "4M"
            config["audio_bitrate"] = "192k"
        
        # Ensure codec compatibility with format
        video_codec = config["video_codec"]
        audio_codec = config["audio_codec"]
        
        if output_format in VALID_FORMATS:
            valid_video_codecs = VALID_FORMATS[output_format]["video_codecs"]
            valid_audio_codecs = VALID_FORMATS[output_format]["audio_codecs"]
            
            if video_codec not in valid_video_codecs:
                logger.warning(f"⚠️  Video codec '{video_codec}' not compatible with '{output_format}', using '{valid_video_codecs[0]}'")
                config["video_codec"] = valid_video_codecs[0]
            
            if audio_codec not in valid_audio_codecs:
                logger.warning(f"⚠️  Audio codec '{audio_codec}' not compatible with '{output_format}', using '{valid_audio_codecs[0]}'")
                config["audio_codec"] = valid_audio_codecs[0]
        
        return config
