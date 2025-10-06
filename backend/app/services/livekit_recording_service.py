"""
LiveKit-native recording service.
Handles recording LiveKit streams directly by capturing video/audio frames.
Supports multiple concurrent recordings with start/stop control.
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime, timezone
import threading
from queue import Queue, Empty
import gc

import numpy as np
from livekit import rtc

from app.services.stream_manager import StreamManager

# Configure logging
logger = logging.getLogger(__name__)

# Import PyAV with NVDEC error handling
# Suppress FFmpeg hardware decoder initialization
import os
os.environ.setdefault('AV_LOG_FORCE_NOCOLOR', '1')
os.environ.setdefault('FFREPORT', 'level=0')

try:
    import av
    # Force PyAV to only use software codecs
    av.logging.set_level(av.logging.ERROR)
except Exception as e:
    # If PyAV fails to import due to NVDEC, the environment variables should handle it
    # This shouldn't happen if main.py sets env vars first
    logger.error(f"Failed to import PyAV: {e}")
    raise


class LiveKitRecordingService:
    """
    LiveKit-native recording service.
    Records streams by directly capturing and encoding video/audio frames.
    """

    def __init__(self, output_dir: str = "recordings"):
        self.stream_manager = StreamManager()
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Active recordings
        self.active_recordings: Dict[str, 'StreamRecorder'] = {}
        
        # Default recording configuration
        self.default_config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": 2000000,  # 2 Mbps
            "audio_bitrate": 128000,   # 128 kbps
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        # Codec configurations with specific settings
        self.codec_configs = {
            "h264": {
                "video_codec": "libx264",
                "audio_codec": "aac",
                "format": "mp4",
                "preset": "medium",
                "crf": 23
            },
            "av1": {
                "video_codec": "libaom-av1",  # Reference AV1 encoder
                "audio_codec": "aac",
                "format": "mp4",
                "preset": "good",  # good, realtime (libaom presets)
                "crf": 30,  # Higher CRF for AV1 (30-35 is good quality)
                "cpu_used": 4  # 0-8, higher = faster but lower quality
            },
            "svtav1": {
                "video_codec": "libsvtav1",  # Faster AV1 encoder
                "audio_codec": "aac",
                "format": "mp4",
                "preset": 8,  # 0-13, higher = faster
                "crf": 35
            },
            "vp9": {
                "video_codec": "libvpx-vp9",
                "audio_codec": "opus",
                "format": "webm",
                "preset": "good",
                "crf": 31
            }
        }
        
        # Quality presets
        self.quality_presets = {
            "low": {
                "video_bitrate": 1000000,
                "audio_bitrate": 64000,
                "width": 1280,
                "height": 720,
            },
            "medium": {
                "video_bitrate": 2000000,
                "audio_bitrate": 128000,
                "width": 1920,
                "height": 1080,
            },
            "high": {
                "video_bitrate": 4000000,
                "audio_bitrate": 192000,
                "width": 1920,
                "height": 1080,
            }
        }

    async def start_recording(
        self, 
        mint_id: str, 
        output_format: str = "mp4", 
        video_quality: str = "medium"
    ) -> Dict[str, Any]:
        """
        Start recording a stream using LiveKit native frame capture.
        """
        try:
            logger.info(f"📹 Starting recording for mint_id: {mint_id}, format: {output_format}, quality: {video_quality}")
            
            if mint_id in self.active_recordings:
                logger.warning(f"⚠️  Recording already active for {mint_id}")
                return {"success": False, "error": f"Recording already active for {mint_id}"}
            
            # Get stream info from StreamManager
            logger.info(f"🔍 Looking up stream info for {mint_id}")
            stream_info = await self.stream_manager.get_stream_info(mint_id)
            if not stream_info:
                logger.error(f"❌ No active stream found for {mint_id}")
                return {"success": False, "error": f"No active stream found for {mint_id}"}
            
            logger.info(f"✅ Stream info found: room={stream_info.room_name}, participant={stream_info.participant_sid}")
            
            # Get the LiveKit room from StreamManager
            room = self.stream_manager.room
            if not room:
                logger.error(f"❌ No active LiveKit room found")
                return {"success": False, "error": "No active LiveKit room found"}
            
            logger.info(f"✅ LiveKit room available: {room.name}")
            
            # Create recording configuration
            config = self._get_recording_config(output_format, video_quality)
            logger.info(f"⚙️  Recording config: codec={config.get('video_codec')}, bitrate={config.get('video_bitrate')}")
            
            # Create stream recorder
            logger.info(f"🎬 Creating StreamRecorder instance")
            recorder = StreamRecorder(
                mint_id=mint_id,
                stream_info=stream_info,
                output_dir=self.output_dir,
                config=config,
                room=room
            )
            
            # Start recording
            logger.info(f"▶️  Starting recorder...")
            result = await recorder.start()
            
            if result["success"]:
                self.active_recordings[mint_id] = recorder
                logger.info(f"✅ Recording started successfully: {recorder.output_path}")
                
                return {
                    "success": True,
                    "mint_id": mint_id,
                    "output_path": str(recorder.output_path),
                    "config": config
                }
            else:
                logger.error(f"❌ Recorder failed to start: {result.get('error')}")
                return result
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"❌ Exception during recording start for {mint_id}: {e}")
            logger.error(f"Full traceback:\n{error_details}")
            return {"success": False, "error": str(e)}

    async def stop_recording(self, mint_id: str) -> Dict[str, Any]:
        """Stop recording a stream."""
        try:
            logger.info(f"🛑 Stop recording called for mint_id: {mint_id}")
            
            if mint_id not in self.active_recordings:
                logger.warning(f"No active recording found for {mint_id}. Active recordings: {list(self.active_recordings.keys())}")
                return {"success": False, "error": f"No active recording for {mint_id}"}
            
            recorder = self.active_recordings[mint_id]
            logger.info(f"Found active recorder for {mint_id}, calling stop...")
            result = await recorder.stop()
            
            # Remove from active recordings
            del self.active_recordings[mint_id]
            logger.info(f"Removed {mint_id} from active recordings")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to stop recording for {mint_id}: {e}")
            import traceback
            logger.error(f"Traceback:\n{traceback.format_exc()}")
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
        
        # Apply codec-specific configuration if format matches a codec
        if output_format in self.codec_configs:
            codec_config = self.codec_configs[output_format]
            config.update(codec_config)
        else:
            # Default: treat as container format
            config["format"] = output_format
        
        # Apply quality preset
        if video_quality in self.quality_presets:
            config.update(self.quality_presets[video_quality])
        
        return config


class StreamRecorder:
    """
    Individual stream recorder for LiveKit native recording.
    Captures video/audio frames directly from LiveKit tracks and encodes them.
    """
    
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
        
        # Recording state
        self.is_recording = False
        self.start_time: Optional[datetime] = None
        self.output_path: Optional[Path] = None
        
        # PyAV components
        self.output_container: Optional[av.container.OutputContainer] = None
        self.video_stream: Optional[av.video.stream.VideoStream] = None
        self.audio_stream: Optional[av.audio.stream.AudioStream] = None
        
        # Frame processing - REDUCED queue sizes to prevent memory buildup
        self.video_frame_queue: Queue[rtc.VideoFrame] = Queue(maxsize=30)  # Reduced from 100
        self.audio_frame_queue: Queue[rtc.AudioFrame] = Queue(maxsize=60)  # Reduced from 200
        self.encoding_task: Optional[asyncio.Task[None]] = None
        self.stop_event = asyncio.Event()
        
        # Frame tracking
        self.video_frame_count = 0
        self.audio_frame_count = 0
        # PTS is calculated directly from frame counts - no separate tracking needed
        
        # Timebase tracking for proper A/V sync
        # Video uses stream time_base, audio uses sample-based PTS
        self.video_time_base = None  # Will be set in _setup_output_container
        self.audio_time_base = None  # Will be set in _setup_output_container
        
        # Track recording start time for timestamp calculation
        self.recording_start_time = None
        
        # Flush tracking - AGGRESSIVE flushing to prevent RAM buildup
        self.frames_since_flush = 0
        self.flush_interval = 15  # Flush every 15 video frames (~0.5 seconds at 30fps) - very aggressive for Windows
        
        # Get output filename
        self.output_path = self._get_output_filename()
    
    def __del__(self):
        """Destructor to ensure cleanup happens even if stop() is not called."""
        try:
            if self.output_container:
                logger.warning(f"[{self.mint_id}] StreamRecorder being destroyed without proper cleanup - forcing cleanup")
                self._cleanup_output_container()
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error in destructor cleanup: {e}")

    def _get_output_filename(self) -> Path:
        """Generate output filename based on mint_id and timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.mint_id}_{timestamp}.{self.config['format']}"
        output_path = self.output_dir / filename
        # Ensure we use the native path format
        logger.info(f"[{self.mint_id}] Output path: {output_path} (native: {output_path.as_posix()})")
        return output_path

    async def start(self) -> Dict[str, Any]:
        """Start recording by subscribing to LiveKit track frames."""
        try:
            logger.info(f"[{self.mint_id}] StreamRecorder.start() called")
            
            if self.is_recording:
                logger.warning(f"[{self.mint_id}] Already recording")
                return {"success": False, "error": "Recording already started"}
            
            # Find the participant's tracks
            logger.info(f"[{self.mint_id}] Looking for participant: {self.stream_info.participant_sid}")
            logger.info(f"[{self.mint_id}] Available participants: {list(self.room.remote_participants.keys())}")
            
            participant = None
            for p in self.room.remote_participants.values():
                logger.info(f"[{self.mint_id}] Checking participant: {p.sid} ({p.identity})")
                if p.sid == self.stream_info.participant_sid:
                    participant = p
                    logger.info(f"[{self.mint_id}] ✅ Found matching participant!")
                    break
            
            if not participant:
                logger.error(f"[{self.mint_id}] ❌ Participant {self.stream_info.participant_sid} not found in room")
                return {"success": False, "error": "Participant not found in room"}
            
            # Log available tracks
            logger.info(f"[{self.mint_id}] Participant has {len(participant.track_publications)} track publications")
            for track_pub in participant.track_publications.values():
                logger.info(f"[{self.mint_id}]   - Track: {track_pub.kind}, subscribed: {track_pub.subscribed}, track exists: {track_pub.track is not None}")
            
            # Setup PyAV output container with error handling for CUDA issues
            # Run in executor to avoid blocking the async event loop
            logger.info(f"[{self.mint_id}] Setting up PyAV output container...")
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._setup_output_container)
                logger.info(f"[{self.mint_id}] ✅ Output container setup complete")
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                error_msg = str(e)
                logger.error(f"[{self.mint_id}] ❌ Failed to setup output container: {e}")
                logger.error(f"[{self.mint_id}] Traceback:\n{error_details}")
                
                if "CUDA" in error_msg or "NVDEC" in error_msg or "nvidia" in error_msg.lower():
                    logger.error(f"[{self.mint_id}] CUDA/NVIDIA hardware decoder error detected")
                    return {
                        "success": False, 
                        "error": "Recording failed: NVIDIA hardware decoder initialization error. Please restart server with CUDA disabled."
                    }
                raise
            
            # Subscribe to video frames with retry logic
            logger.info(f"[{self.mint_id}] Extracting video/audio tracks...")
            video_track = None
            audio_track = None
            
            # Try multiple times to get tracks (they might not be immediately available)
            max_retries = 10
            for attempt in range(max_retries):
                # Check all participants for tracks
                for check_participant in self.room.remote_participants.values():
                    logger.info(f"[{self.mint_id}] Checking participant {check_participant.sid}, has {len(check_participant.track_publications)} track publications")
                    for track_pub in check_participant.track_publications.values():
                        logger.info(f"[{self.mint_id}]   Track pub: kind={track_pub.kind}, subscribed={track_pub.subscribed}, track={track_pub.track}")
                        if track_pub.track:
                            if track_pub.kind == rtc.TrackKind.KIND_VIDEO and not video_track:
                                video_track = track_pub.track
                                logger.info(f"[{self.mint_id}] ✅ Found video track in participant {check_participant.sid} (attempt {attempt + 1})")
                            elif track_pub.kind == rtc.TrackKind.KIND_AUDIO and not audio_track:
                                audio_track = track_pub.track
                                logger.info(f"[{self.mint_id}] ✅ Found audio track in participant {check_participant.sid} (attempt {attempt + 1})")
                
                if video_track:
                    break
                
                if attempt < max_retries - 1:
                    logger.info(f"[{self.mint_id}] ⏳ Waiting for tracks... (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(2)  # Wait 2s before retry
            
            if not video_track:
                logger.error(f"[{self.mint_id}] ❌ No video track found after {max_retries} attempts")
                
                # Log all participants and their tracks
                logger.error(f"[{self.mint_id}] All participants in room:")
                for p_sid, p in self.room.remote_participants.items():
                    logger.error(f"[{self.mint_id}]   Participant {p_sid}: {len(p.track_publications)} tracks")
                    for i, track_pub in enumerate(p.track_publications.values()):
                        logger.error(f"[{self.mint_id}]     Track {i}: kind={track_pub.kind}, subscribed={track_pub.subscribed}, track_exists={track_pub.track is not None}")
                
                # Cleanup in executor to avoid blocking
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._cleanup_output_container)
                return {"success": False, "error": "No video track found after waiting"}
            
            # Start encoding task
            self.is_recording = True
            self.start_time = datetime.now(timezone.utc)
            self.recording_start_time = self.start_time  # For timestamp calculation
            self.encoding_task = asyncio.create_task(self._encoding_loop(video_track, audio_track))
            
            logger.info(f"Started recording for {self.mint_id} to {self.output_path}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Recording start failed for {self.mint_id}: {e}")
            # Cleanup in executor to avoid blocking
            try:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._cleanup_output_container)
            except Exception as cleanup_error:
                logger.error(f"Error during cleanup: {cleanup_error}")
            return {"success": False, "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop recording."""
        try:
            logger.info(f"🛑 [{self.mint_id}] Stop recording requested")
            
            if not self.is_recording:
                logger.warning(f"[{self.mint_id}] No active recording to stop")
                return {"success": False, "error": "No active recording"}
            
            # Signal stop
            logger.info(f"[{self.mint_id}] Setting stop event...")
            self.stop_event.set()
            
            # Wait for encoding task to finish with longer timeout for AV1
            if self.encoding_task:
                logger.info(f"[{self.mint_id}] Waiting for encoding tasks to complete...")
                try:
                    await asyncio.wait_for(self.encoding_task, timeout=15.0)
                    logger.info(f"[{self.mint_id}] Encoding tasks completed successfully")
                except asyncio.TimeoutError:
                    logger.warning(f"[{self.mint_id}] Encoding task timeout after 15s - forcing cancellation")
                    self.encoding_task.cancel()
                    try:
                        await self.encoding_task
                    except asyncio.CancelledError:
                        logger.info(f"[{self.mint_id}] Encoding task cancelled")
            
            # CRITICAL: Force aggressive memory cleanup BEFORE attempting container cleanup
            # This helps prevent memory allocation failures during encoder flush on Windows
            logger.info(f"[{self.mint_id}] Pre-cleanup: Forcing aggressive garbage collection...")
            gc.collect()
            await asyncio.sleep(0.1)  # Give GC a moment to complete
            gc.collect()  # Second pass to catch circular references
            logger.info(f"[{self.mint_id}] Pre-cleanup complete")
            
            # Cleanup - run in executor with GENEROUS TIMEOUT to avoid blocking
            # AV1 encoder flush can take 30-60 seconds, H.264 is much faster (1-2 seconds)
            logger.info(f"[{self.mint_id}] Cleaning up output container...")
            codec = self.config.get('video_codec', 'unknown')
            timeout_seconds = 60.0 if 'av1' in codec.lower() else 30.0
            logger.info(f"[{self.mint_id}] Using {timeout_seconds}s timeout for {codec} encoder flush")
            
            loop = asyncio.get_event_loop()
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(None, self._cleanup_output_container),
                    timeout=timeout_seconds
                )
                logger.info(f"[{self.mint_id}] Cleanup completed successfully")
            except asyncio.TimeoutError:
                logger.error(f"[{self.mint_id}] ⚠️  Cleanup timeout after {timeout_seconds}s")
                logger.error(f"[{self.mint_id}] This is unusual - encoder may be hung")
                logger.error(f"[{self.mint_id}] Recommendation: Use H.264 codec instead of AV1 for faster/more reliable recording")
                # Don't force close - let the user restart the server to recover
                # The file should still be partially playable
                raise RuntimeError(f"Recording cleanup hung for {timeout_seconds}s - server restart recommended")
            
            self.is_recording = False
            end_time = datetime.now(timezone.utc)
            
            logger.info(f"✅ [{self.mint_id}] Recording stopped successfully. Video frames: {self.video_frame_count}, Audio frames: {self.audio_frame_count}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": end_time.isoformat(),
                "video_frames": self.video_frame_count,
                "audio_frames": self.audio_frame_count
            }
            
        except Exception as e:
            logger.error(f"❌ [{self.mint_id}] Recording stop failed: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        # Get file size if it exists
        file_size_mb = 0
        if self.output_path and self.output_path.exists():
            file_size_mb = self.output_path.stat().st_size / (1024 * 1024)  # Convert to MB
        
        return {
            "mint_id": self.mint_id,
            "is_recording": self.is_recording,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "video_frames": self.video_frame_count,
            "audio_frames": self.audio_frame_count,
            "file_size_mb": round(file_size_mb, 2),
            "config": self.config
        }

    def _setup_output_container(self) -> None:
        """Setup PyAV output container and streams with memory-efficient settings."""
        try:
            logger.info(f"[{self.mint_id}] Opening output file: {self.output_path}")
            
            # Force software-only mode with MEMORY-EFFICIENT settings for PyAV
            # This prevents PyAV from trying to use hardware decoders
            # and reduces memory buffer sizes
            options = {
                'threads': 'auto',
            }
            
            # Create output container with software-only and memory-efficient options
            logger.info(f"[{self.mint_id}] Creating PyAV container with format: {self.config['format']}")
            # Use absolute path to avoid path separator issues
            output_path_str = str(self.output_path.absolute())
            logger.info(f"[{self.mint_id}] Absolute output path: {output_path_str}")
            self.output_container = av.open(output_path_str, mode='w', options=options)
            logger.info(f"[{self.mint_id}] ✅ Container opened successfully")
            
            # Add video stream
            self.video_stream = self.output_container.add_stream(
                self.config['video_codec'],
                rate=self.config['fps']
            )
            self.video_stream.width = self.config['width']
            self.video_stream.height = self.config['height']
            self.video_stream.pix_fmt = 'yuv420p'
            self.video_stream.bit_rate = self.config['video_bitrate']
            
            # Use a fixed timebase that gives plenty of headroom for timestamp calculations
            # 1/90000 is the MPEG transport stream standard and is proven to work
            # This prevents overflow even in very long recordings
            from fractions import Fraction
            self.video_stream.time_base = Fraction(1, 90000)
            self.video_time_base = self.video_stream.time_base
            logger.info(f"[{self.mint_id}] Video timebase set to 1/90000 (MPEG-TS standard)")
            
            # Apply codec-specific options
            if 'crf' in self.config:
                self.video_stream.options = {'crf': str(self.config['crf'])}
            
            if 'preset' in self.config:
                if 'options' not in dir(self.video_stream) or not self.video_stream.options:
                    self.video_stream.options = {}
                self.video_stream.options['preset'] = str(self.config['preset'])
            
            # H.264-specific options to prevent negative DTS and timestamp issues
            if self.config['video_codec'] == 'libx264':
                if not self.video_stream.options:
                    self.video_stream.options = {}
                # Disable B-frames to prevent negative DTS
                self.video_stream.options['x264opts'] = 'bframes=0'
                # Set GOP size (keyframe interval) - 2 seconds worth of frames
                self.video_stream.options['g'] = str(self.config.get('fps', 30) * 2)
                # Use zero-latency tuning for real-time encoding
                self.video_stream.options['tune'] = 'zerolatency'
                logger.info(f"[{self.mint_id}] H.264 options: no B-frames, GOP={self.video_stream.options['g']}, zero-latency tuning")
            
            # AV1-specific options
            if self.config['video_codec'] in ['libaom-av1', 'libsvtav1']:
                if not self.video_stream.options:
                    self.video_stream.options = {}
                    
                if 'cpu_used' in self.config:
                    self.video_stream.options['cpu-used'] = str(self.config['cpu_used'])
                    
                # Enable row-based multi-threading for better performance
                self.video_stream.options['row-mt'] = '1'
                
                # Tile columns for parallel encoding (helps with performance)
                self.video_stream.options['tile-columns'] = '2'
            
            # Add audio stream
            self.audio_stream = self.output_container.add_stream(
                self.config['audio_codec'],
                rate=48000  # LiveKit typically uses 48kHz
            )
            self.audio_stream.bit_rate = self.config['audio_bitrate']
            
            # Set audio timebase to sample rate (standard for audio)
            # 1/48000 gives one unit per audio sample, which is the standard approach
            self.audio_stream.time_base = Fraction(1, 48000)
            self.audio_time_base = self.audio_stream.time_base
            logger.info(f"[{self.mint_id}] Audio timebase set to 1/48000 (sample-based)")
            
            logger.info(f"Setup output container for {self.mint_id}")
            
        except Exception as e:
            logger.error(f"Failed to setup output container: {e}")
            raise

    def _cleanup_output_container(self) -> None:
        """Cleanup PyAV output container with memory-safe handling."""
        import time
        cleanup_start = time.time()
        logger.info(f"[{self.mint_id}] ⏱️  _cleanup_output_container() called")
        
        try:
            if self.output_container:
                # Force garbage collection BEFORE flushing to free up memory
                logger.info(f"[{self.mint_id}] Forcing garbage collection before flush...")
                gc.collect()
                gc_duration = time.time() - cleanup_start
                logger.info(f"[{self.mint_id}] GC completed in {gc_duration:.2f}s")
                
                # Flush any remaining frames from encoders with memory-safe error handling
                if self.video_stream:
                    try:
                        import time
                        flush_start = time.time()
                        logger.info(f"[{self.mint_id}] Flushing video encoder (this may take 5-10 seconds for AV1)...")
                        packet_count = 0
                        for packet in self.video_stream.encode(None):  # Flush encoder
                            self.output_container.mux(packet)
                            packet_count += 1
                        flush_duration = time.time() - flush_start
                        logger.info(f"[{self.mint_id}] Video encoder flushed {packet_count} packets in {flush_duration:.1f}s")
                    except MemoryError as e:
                        logger.error(f"[{self.mint_id}] MemoryError flushing video encoder: {e}")
                        logger.warning(f"[{self.mint_id}] Forcing memory cleanup and retrying...")
                        gc.collect()
                        # Try one more time after cleanup
                        try:
                            for packet in self.video_stream.encode(None):
                                self.output_container.mux(packet)
                        except Exception as retry_error:
                            logger.error(f"[{self.mint_id}] Retry failed: {retry_error}")
                            logger.warning(f"[{self.mint_id}] Video may be incomplete but will attempt to save")
                    except OSError as e:
                        # Handle "End of file" errors from avcodec_send_frame
                        error_str = str(e)
                        if "End of file" in error_str or "541478725" in error_str:
                            logger.info(f"[{self.mint_id}] Video encoder already flushed (End of file received)")
                        else:
                            logger.warning(f"[{self.mint_id}] OSError flushing video encoder: {e}")
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing video encoder: {e}")
                
                if self.audio_stream:
                    try:
                        import time
                        flush_start = time.time()
                        logger.info(f"[{self.mint_id}] Flushing audio encoder...")
                        packet_count = 0
                        for packet in self.audio_stream.encode(None):  # Flush encoder
                            self.output_container.mux(packet)
                            packet_count += 1
                        flush_duration = time.time() - flush_start
                        logger.info(f"[{self.mint_id}] Audio encoder flushed {packet_count} packets in {flush_duration:.1f}s")
                    except MemoryError as e:
                        logger.error(f"[{self.mint_id}] MemoryError flushing audio encoder: {e}")
                        logger.warning(f"[{self.mint_id}] Forcing memory cleanup and retrying...")
                        gc.collect()
                        # Try one more time after cleanup
                        try:
                            for packet in self.audio_stream.encode(None):
                                self.output_container.mux(packet)
                        except Exception as retry_error:
                            logger.error(f"[{self.mint_id}] Retry failed: {retry_error}")
                            logger.warning(f"[{self.mint_id}] Audio may be incomplete but will attempt to save")
                    except OSError as e:
                        # Handle "End of file" errors from avcodec_send_frame
                        error_str = str(e)
                        if "End of file" in error_str or "541478725" in error_str:
                            logger.info(f"[{self.mint_id}] Audio encoder already flushed (End of file received)")
                        else:
                            logger.warning(f"[{self.mint_id}] OSError flushing audio encoder: {e}")
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing audio encoder: {e}")
                
                # Close container (this handles final flushing automatically)
                try:
                    import time
                    close_start = time.time()
                    logger.info(f"[{self.mint_id}] Closing output container (writing MOOV atom)...")
                    logger.info(f"[{self.mint_id}] This may take a few seconds for large files...")
                    
                    # The close() call writes the MOOV atom - this is where it can hang
                    self.output_container.close()
                    
                    close_duration = time.time() - close_start
                    logger.info(f"[{self.mint_id}] Output container closed and MOOV atom written in {close_duration:.1f}s")
                except AssertionError as assert_error:
                    # Handle FFmpeg assertion failures (e.g., DTS overflow in movenc.c)
                    error_str = str(assert_error)
                    logger.error(f"[{self.mint_id}] Assertion error closing container: {error_str}")
                    logger.warning(f"[{self.mint_id}] This may be due to timestamp overflow in long recordings")
                    logger.info(f"[{self.mint_id}] File may still be playable despite the error")
                    # Container is likely already closed/corrupted, just clear the reference
                    self.output_container = None
                except Exception as close_error:
                    logger.error(f"[{self.mint_id}] Error closing container: {close_error}")
                    # Try to force close even if it fails
                    try:
                        self.output_container = None
                    except:
                        pass
                
                self.output_container = None
                
            self.video_stream = None
            self.audio_stream = None
            
            # Final garbage collection after cleanup
            gc.collect()
            logger.info(f"[{self.mint_id}] Cleanup complete, memory freed")
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error cleaning up output container: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback:\n{traceback.format_exc()}")

    async def _encoding_loop(
        self, 
        video_track: rtc.RemoteVideoTrack,
        audio_track: Optional[rtc.RemoteAudioTrack]
    ) -> None:
        """
        Main encoding loop that receives frames from LiveKit tracks and writes them.
        """
        try:
            # Create tasks for video and audio processing
            tasks: List[asyncio.Task[None]] = [
                asyncio.create_task(self._process_video_frames(video_track))
            ]
            
            if audio_track:
                tasks.append(asyncio.create_task(self._process_audio_frames(audio_track)))
            
            # Wait for stop signal or error
            await self.stop_event.wait()
            
            # Cancel tasks
            for task in tasks:
                task.cancel()
            
            # Wait for tasks to complete
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            logger.error(f"Encoding loop error for {self.mint_id}: {e}")
        finally:
            logger.info(f"Encoding loop finished for {self.mint_id}")

    async def _process_video_frames(self, video_track: rtc.RemoteVideoTrack) -> None:
        """Process video frames from LiveKit track."""
        try:
            logger.info(f"[{self.mint_id}] Starting video frame processing")
            frame_count = 0
            consecutive_errors = 0
            last_successful_frame = 0
            
            async for event in rtc.VideoStream(video_track):
                # Check stop event before processing each frame
                if self.stop_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop event detected in video processing, breaking loop")
                    break
                
                frame = event.frame
                try:
                    # Run blocking encoding in executor to keep async loop responsive
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, self._write_video_frame, frame)
                    self.video_frame_count += 1
                    frame_count += 1
                    last_successful_frame = frame_count
                    consecutive_errors = 0  # Reset error counter on success
                    
                    # Log progress every 300 frames (every ~10 seconds at 30fps)
                    if frame_count % 300 == 0:
                        file_size_mb = 0
                        if self.output_path and self.output_path.exists():
                            file_size_mb = self.output_path.stat().st_size / (1024 * 1024)
                        logger.info(f"[{self.mint_id}] Processed {frame_count} video frames, file: {file_size_mb:.2f} MB")
                        
                except Exception as frame_error:
                    consecutive_errors += 1
                    logger.error(f"[{self.mint_id}] Error processing video frame {frame_count}: {frame_error}")
                    
                    # If we get too many consecutive errors, something is seriously wrong
                    if consecutive_errors >= 10:
                        logger.error(f"[{self.mint_id}] ❌ CRITICAL: 10 consecutive video encoding failures!")
                        logger.error(f"[{self.mint_id}] Last successful frame: {last_successful_frame}")
                        logger.error(f"[{self.mint_id}] Codec: {self.config.get('video_codec')}")
                        logger.error(f"[{self.mint_id}] This usually indicates encoder crash or timestamp overflow")
                        logger.error(f"[{self.mint_id}] STOPPING video recording to prevent further issues")
                        break
                    
                    # Continue processing other frames
                    continue
                
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Video frame processing cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error processing video frames: {e}")
            raise
        finally:
            logger.info(f"[{self.mint_id}] Video frame processing ended. Total frames: {self.video_frame_count}")

    async def _process_audio_frames(self, audio_track: rtc.RemoteAudioTrack) -> None:
        """Process audio frames from LiveKit track."""
        try:
            logger.info(f"[{self.mint_id}] Starting audio frame processing")
            frame_count = 0
            
            async for event in rtc.AudioStream(audio_track):
                # Check stop event before processing each frame
                if self.stop_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop event detected in audio processing, breaking loop")
                    break
                
                frame = event.frame
                try:
                    # Run blocking encoding in executor to keep async loop responsive
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, self._write_audio_frame, frame)
                    self.audio_frame_count += 1
                    frame_count += 1
                    
                    # Log progress every 1000 frames (audio frames are more frequent)
                    if frame_count % 1000 == 0:
                        logger.info(f"[{self.mint_id}] Processed {frame_count} audio frames")
                        
                except Exception as frame_error:
                    logger.error(f"[{self.mint_id}] Error processing audio frame {frame_count}: {frame_error}")
                    # Continue processing other frames
                    continue
                
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Audio frame processing cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error processing audio frames: {e}")
            raise
        finally:
            logger.info(f"[{self.mint_id}] Audio frame processing ended. Total frames: {self.audio_frame_count}")

    def _write_video_frame(self, frame: rtc.VideoFrame) -> None:
        """Write a video frame to the output file."""
        try:
            if not self.video_stream or not self.output_container:
                return
            
            # Convert LiveKit VideoFrame to numpy array
            # LiveKit frames are in ARGB or I420 format
            width = frame.width
            height = frame.height
            
            # Get the frame data as numpy array
            # This assumes the frame has a buffer attribute
            buffer = frame.data
            
            # Log frame dimensions on first frame or if dimensions change
            if self.video_frame_count == 0:
                buffer_size = len(buffer) if hasattr(buffer, '__len__') else 0
                logger.info(f"[{self.mint_id}] First video frame: reported {width}x{height}, buffer {buffer_size} bytes, target {self.config['width']}x{self.config['height']}")
            
            # Create PyAV VideoFrame with proper format handling
            av_frame = None
            
            # Convert buffer to the right format
            # Note: This is a simplified version - actual conversion depends on LiveKit frame format
            if hasattr(frame, 'to_ndarray'):
                # If LiveKit provides numpy conversion - use ARGB format (most common)
                try:
                    img = frame.to_ndarray(format='argb')
                    av_frame = av.VideoFrame.from_ndarray(img, format='argb')
                    # Reformat to yuv420p and resize if needed
                    av_frame = av_frame.reformat(
                        format='yuv420p',
                        width=self.config['width'],
                        height=self.config['height']
                    )
                    # Delete intermediate array immediately
                    del img
                except Exception as e:
                    # Try RGB24 as fallback
                    try:
                        img = frame.to_ndarray(format='rgb24')
                        av_frame = av.VideoFrame.from_ndarray(img, format='rgb24')
                        # Reformat to yuv420p and resize if needed
                        av_frame = av_frame.reformat(
                            format='yuv420p',
                            width=self.config['width'],
                            height=self.config['height']
                        )
                        del img
                    except Exception as e2:
                        logger.warning(f"[{self.mint_id}] Failed to convert frame: {e}, {e2}")
                        av_frame = None
            
            if av_frame is None:
                # Manual conversion from buffer
                # Handle different frame formats and sizes
                try:
                    # Convert buffer to numpy array
                    if hasattr(buffer, 'dtype'):
                        # Already a numpy array
                        frame_data = buffer
                    else:
                        # Convert memoryview/buffer to numpy array
                        # Try different data types based on actual frame size
                        actual_size = len(buffer)
                        expected_rgb = width * height * 3  # RGB format
                        expected_rgba = width * height * 4  # RGBA format
                        expected_yuv420 = width * height * 3 // 2  # YUV420 format
                        
                        logger.debug(f"[{self.mint_id}] Frame buffer: {actual_size} bytes, dimensions: {width}x{height}, expected RGB: {expected_rgb}, RGBA: {expected_rgba}, YUV420: {expected_yuv420}")
                        
                        if actual_size == expected_rgb:
                            # RGB format
                            frame_data = np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 3)
                        elif actual_size == expected_rgba:
                            # RGBA format
                            frame_data = np.frombuffer(buffer, dtype=np.uint8).reshape(height, width, 4)
                        elif actual_size == expected_yuv420:
                            # YUV420 format
                            frame_data = np.frombuffer(buffer, dtype=np.uint8)
                        else:
                            # Unknown format - try to detect based on size
                            # Calculate possible dimensions based on actual size
                            logger.warning(f"[{self.mint_id}] Unexpected frame size: got {actual_size} bytes for {width}x{height} frame")
                            logger.warning(f"[{self.mint_id}] Expected: RGB={expected_rgb}, RGBA={expected_rgba}, YUV420={expected_yuv420}")
                            
                            # Try to infer format from size
                            pixels = actual_size // 3
                            if pixels > 0:
                                possible_height = int(np.sqrt(pixels * height / width))
                                possible_width = pixels // possible_height
                                logger.info(f"[{self.mint_id}] Attempting to reshape as {possible_width}x{possible_height} RGB")
                                
                                if possible_width * possible_height * 3 == actual_size:
                                    frame_data = np.frombuffer(buffer, dtype=np.uint8).reshape(possible_height, possible_width, 3)
                                    # Update width/height to actual values
                                    width = possible_width
                                    height = possible_height
                                else:
                                    logger.error(f"[{self.mint_id}] Cannot determine frame format, skipping frame")
                                    return
                            else:
                                logger.error(f"[{self.mint_id}] Frame too small, skipping")
                                return
                    
                    # Create PyAV frame from numpy array
                    if len(frame_data.shape) == 3 and frame_data.shape[2] == 3:
                        # RGB format
                        av_frame = av.VideoFrame.from_ndarray(frame_data, format='rgb24')
                        # Resize and reformat to match configured output
                        av_frame = av_frame.reformat(
                            format='yuv420p',
                            width=self.config['width'],
                            height=self.config['height']
                        )
                        del frame_data  # Free memory immediately
                    elif len(frame_data.shape) == 3 and frame_data.shape[2] == 4:
                        # RGBA format
                        av_frame = av.VideoFrame.from_ndarray(frame_data, format='rgba')
                        # Resize and reformat to match configured output
                        av_frame = av_frame.reformat(
                            format='yuv420p',
                            width=self.config['width'],
                            height=self.config['height']
                        )
                        del frame_data  # Free memory immediately
                    else:
                        # YUV format or other - calculate actual dimensions from buffer size
                        actual_size = len(frame_data)
                        expected_yuv420_size = width * height * 3 // 2
                        
                        if actual_size >= expected_yuv420_size:
                            # YUV420 format
                            av_frame = av.VideoFrame(width, height, 'yuv420p')
                            # Copy data to the frame planes
                            try:
                                av_frame.planes[0].update(frame_data[:width * height])
                                if len(frame_data) > width * height:
                                    av_frame.planes[1].update(frame_data[width * height:width * height + width * height // 4])
                                if len(frame_data) > width * height + width * height // 4:
                                    av_frame.planes[2].update(frame_data[width * height + width * height // 4:])
                                del frame_data  # Free memory immediately
                                # Resize if needed
                                if width != self.config['width'] or height != self.config['height']:
                                    av_frame = av_frame.reformat(
                                        format='yuv420p',
                                        width=self.config['width'],
                                        height=self.config['height']
                                    )
                            except ValueError as ve:
                                logger.error(f"[{self.mint_id}] YUV plane update failed: {ve}")
                                logger.error(f"[{self.mint_id}] Frame: {width}x{height}, buffer: {actual_size} bytes, expected: {expected_yuv420_size}")
                                del frame_data
                                return
                        else:
                            # Buffer size doesn't match - might be a different resolution
                            # Try to detect actual resolution
                            logger.warning(f"[{self.mint_id}] Frame size mismatch: got {actual_size} bytes for {width}x{height}")
                            logger.warning(f"[{self.mint_id}] Skipping frame - resolution may have changed")
                            del frame_data
                            return
                            
                except Exception as e:
                    logger.error(f"[{self.mint_id}] Failed to convert frame manually: {e}")
                    import traceback
                    logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")
                    return
            
            # Set PTS in 90000 timebase units
            # PTS = initial_offset + frame_number * (90000 / fps)
            fps = self.config.get('fps', 30)
            pts_per_frame = 90000 // fps  # 3000 at 30fps, 1500 at 60fps
            initial_offset = 3600  # 40ms offset to allow for B-frame DTS calculations
            av_frame.pts = initial_offset + (self.video_frame_count * pts_per_frame)
            
            # Log PTS periodically to monitor for issues
            if self.video_frame_count % 300 == 0 and self.video_frame_count > 0:
                # Max safe PTS: 2^31 = 2,147,483,647 = ~23850 seconds = 6.6 hours at 30fps
                max_safe_pts = 2147483647
                pts_percentage = (av_frame.pts / max_safe_pts) * 100
                logger.info(f"[{self.mint_id}] Video frame {self.video_frame_count}, PTS: {av_frame.pts} ({pts_percentage:.2f}% of limit)")
            
            # Encode and write
            try:
                packet_count = 0
                for packet in self.video_stream.encode(av_frame):
                    self.output_container.mux(packet)
                    packet_count += 1
                
                # Log first few successful muxes to confirm writing is working
                if self.video_frame_count < 5:
                    logger.info(f"[{self.mint_id}] Frame {self.video_frame_count} encoded and muxed ({packet_count} packets)")
            except AssertionError as assert_error:
                # Handle FFmpeg assertion failures during muxing (e.g., DTS overflow)
                error_str = str(assert_error)
                logger.error(f"[{self.mint_id}] ❌ ASSERTION ERROR muxing video packet at frame {self.video_frame_count}: {error_str}")
                if "next_dts" in error_str.lower() or "0x7fffffff" in error_str or "movenc.c" in error_str:
                    logger.error(f"[{self.mint_id}] 🔴 DTS OVERFLOW - timestamps exceeded MP4 32-bit limit!")
                    logger.error(f"[{self.mint_id}] Current PTS: {self.last_video_pts}, Frame count: {self.video_frame_count}")
                    logger.error(f"[{self.mint_id}] Codec: {self.config.get('video_codec')} - AV1 is particularly prone to this")
                    logger.error(f"[{self.mint_id}] RECOMMENDATION: Use H.264 codec or record shorter segments")
                    # Raise exception to stop video encoding
                    raise RuntimeError(f"MP4 timestamp overflow at frame {self.video_frame_count} - recording stopped")
                raise
            except Exception as mux_error:
                logger.error(f"[{self.mint_id}] Error muxing video packet at frame {self.video_frame_count}: {mux_error}")
                raise
            
            # Delete av_frame immediately to free memory
            del av_frame
            
            # Periodically force garbage collection to prevent RAM buildup
            self.frames_since_flush += 1
            if self.frames_since_flush >= self.flush_interval:
                self.frames_since_flush = 0
                # Force garbage collection to free memory
                gc.collect()
                logger.debug(f"[{self.mint_id}] Processed {self.flush_interval} frames, freed memory")
                
        except Exception as e:
            logger.error(f"Error writing video frame: {e}")

    def _write_audio_frame(self, frame: rtc.AudioFrame) -> None:
        """Write an audio frame to the output file."""
        try:
            if not self.audio_stream or not self.output_container:
                return
            
            # Convert LiveKit AudioFrame to PyAV AudioFrame
            # LiveKit audio is typically 16-bit PCM at 48kHz
            sample_rate = frame.sample_rate
            num_channels = frame.num_channels
            samples = frame.data
            
            # Debug logging for audio frame properties
            logger.debug(f"[{self.mint_id}] Audio frame: rate={sample_rate}, channels={num_channels}, data_type={type(samples)}, data_len={len(samples) if hasattr(samples, '__len__') else 'unknown'}")
            
            # Convert memoryview to proper numpy array with correct dtype
            if hasattr(samples, 'dtype'):
                # Already a numpy array
                audio_data = samples
            else:
                # Convert memoryview/buffer to numpy array
                # LiveKit typically provides 16-bit signed integer samples
                try:
                    audio_data = np.frombuffer(samples, dtype=np.int16)
                except Exception as e:
                    logger.error(f"[{self.mint_id}] Failed to convert audio buffer: {e}")
                    return
            
            # PyAV expects 2D array format: (channels, samples) for packed format
            try:
                # Reshape to 2D array for PyAV: (channels, samples)
                # For mono: (1, 480), for stereo: (2, 240)
                total_samples = len(audio_data)
                samples_per_channel = total_samples // num_channels
                audio_data = audio_data.reshape(num_channels, samples_per_channel)
                
                if num_channels == 1:
                    layout = 'mono'
                elif num_channels == 2:
                    layout = 'stereo'
                else:
                    layout = f'{num_channels}ch'
            except Exception as e:
                logger.error(f"[{self.mint_id}] Failed to reshape audio data for {num_channels} channels: {e}")
                return
            
            # Create PyAV AudioFrame with correct format
            try:
                av_frame = av.AudioFrame.from_ndarray(
                    audio_data,
                    format='s16',
                    layout=layout
                )
                av_frame.sample_rate = sample_rate
                
                # Set PTS - use simple frame-based counting
                # Audio frame number * samples per frame = total samples = PTS
                av_frame.pts = self.audio_frame_count * samples_per_channel
                
                # Validate PTS is reasonable
                if av_frame.pts is None or (self.audio_frame_count > 0 and av_frame.pts < 0):
                    logger.error(f"[{self.mint_id}] Invalid audio PTS: {av_frame.pts} at frame {self.audio_frame_count}")
                    return
                
                # Encode and write
                try:
                    for packet in self.audio_stream.encode(av_frame):
                        # Log first few packets to verify PTS/DTS are increasing
                        if self.audio_frame_count < 5:
                            logger.info(f"[{self.mint_id}] Audio packet {self.audio_frame_count}: PTS={packet.pts}, DTS={packet.dts}")
                        
                        # Periodically log audio PTS to detect overflow
                        if self.audio_frame_count % 1000 == 0 and self.audio_frame_count > 0:
                            # Max safe PTS in samples at 48kHz: ~44,739 seconds = 12.4 hours
                            max_safe_samples = 2000000000
                            pts_percentage = (packet.pts / max_safe_samples) * 100 if packet.pts else 0
                            logger.info(f"[{self.mint_id}] Audio PTS: {packet.pts} samples ({pts_percentage:.1f}% of safe limit)")
                        
                        self.output_container.mux(packet)
                except OSError as os_error:
                    # Handle "Invalid argument" errors from non-monotonic timestamps
                    error_str = str(os_error)
                    if "non monotonically increasing" in error_str.lower() or "NOPTS" in error_str:
                        logger.error(f"[{self.mint_id}] ❌ AUDIO TIMESTAMP ERROR at frame {self.audio_frame_count}")
                        logger.error(f"[{self.mint_id}] Frame PTS: {av_frame.pts}, calculated from frame {self.audio_frame_count} * {samples_per_channel}")
                        logger.error(f"[{self.mint_id}] Samples per channel: {samples_per_channel}, channels: {num_channels}")
                        logger.error(f"[{self.mint_id}] Container is now in bad state - audio encoding will stop")
                        # Raise exception to stop audio processing entirely
                        raise RuntimeError(f"Audio timestamp error - stopping audio encoding")
                    raise
                except Exception as mux_error:
                    logger.error(f"[{self.mint_id}] Error muxing audio packet at frame {self.audio_frame_count}: {mux_error}")
                    raise
                
                # Delete frames immediately to free memory
                del av_frame
                del audio_data
                    
            except Exception as av_error:
                logger.error(f"[{self.mint_id}] PyAV AudioFrame creation failed: {av_error}")
                logger.error(f"[{self.mint_id}] Audio data shape: {audio_data.shape}, dtype: {audio_data.dtype}, ndim: {audio_data.ndim}")
                logger.error(f"[{self.mint_id}] Channels: {num_channels}, Layout: {layout}, samples_per_channel: {samples_per_channel}")
                return
                
        except Exception as e:
            logger.error(f"Error writing audio frame: {e}")

