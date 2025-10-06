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
            if mint_id not in self.active_recordings:
                return {"success": False, "error": f"No active recording for {mint_id}"}
            
            recorder = self.active_recordings[mint_id]
            result = await recorder.stop()
            
            # Remove from active recordings
            del self.active_recordings[mint_id]
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to stop recording for {mint_id}: {e}")
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
        
        # Frame processing
        self.video_frame_queue: Queue[rtc.VideoFrame] = Queue(maxsize=100)
        self.audio_frame_queue: Queue[rtc.AudioFrame] = Queue(maxsize=200)
        self.encoding_task: Optional[asyncio.Task[None]] = None
        self.stop_event = asyncio.Event()
        
        # Frame tracking
        self.video_frame_count = 0
        self.audio_frame_count = 0
        self.last_video_pts = 0
        self.last_audio_pts = 0
        
        # Get output filename
        self.output_path = self._get_output_filename()

    def _get_output_filename(self) -> Path:
        """Generate output filename based on mint_id and timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.mint_id}_{timestamp}.{self.config['format']}"
        return self.output_dir / filename

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
            logger.info(f"[{self.mint_id}] Setting up PyAV output container...")
            try:
                self._setup_output_container()
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
                for track_pub in participant.track_publications.values():
                    if track_pub.track:
                        if track_pub.kind == rtc.TrackKind.KIND_VIDEO:
                            video_track = track_pub.track
                            logger.info(f"[{self.mint_id}] ✅ Found video track (attempt {attempt + 1})")
                        elif track_pub.kind == rtc.TrackKind.KIND_AUDIO:
                            audio_track = track_pub.track
                            logger.info(f"[{self.mint_id}] ✅ Found audio track (attempt {attempt + 1})")
                
                if video_track:
                    break
                
                if attempt < max_retries - 1:
                    logger.info(f"[{self.mint_id}] ⏳ Waiting for tracks... (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(0.5)  # Wait 500ms before retry
            
            if not video_track:
                logger.error(f"[{self.mint_id}] ❌ No video track found after {max_retries} attempts")
                logger.error(f"[{self.mint_id}] Track publications: {len(participant.track_publications)}")
                for i, track_pub in enumerate(participant.track_publications.values()):
                    logger.error(f"[{self.mint_id}]   Track {i}: kind={track_pub.kind}, subscribed={track_pub.subscribed}, track_exists={track_pub.track is not None}")
                self._cleanup_output_container()
                return {"success": False, "error": "No video track found after waiting"}
            
            # Start encoding task
            self.is_recording = True
            self.start_time = datetime.now(timezone.utc)
            self.encoding_task = asyncio.create_task(self._encoding_loop(video_track, audio_track))
            
            logger.info(f"Started recording for {self.mint_id} to {self.output_path}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Recording start failed for {self.mint_id}: {e}")
            self._cleanup_output_container()
            return {"success": False, "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop recording."""
        try:
            if not self.is_recording:
                return {"success": False, "error": "No active recording"}
            
            # Signal stop
            self.stop_event.set()
            
            # Wait for encoding task to finish
            if self.encoding_task:
                try:
                    await asyncio.wait_for(self.encoding_task, timeout=10.0)
                except asyncio.TimeoutError:
                    logger.warning(f"Encoding task timeout for {self.mint_id}")
                    self.encoding_task.cancel()
            
            # Cleanup
            self._cleanup_output_container()
            
            self.is_recording = False
            end_time = datetime.now(timezone.utc)
            
            logger.info(f"Stopped recording for {self.mint_id}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": end_time.isoformat(),
                "video_frames": self.video_frame_count,
                "audio_frames": self.audio_frame_count
            }
            
        except Exception as e:
            logger.error(f"Recording stop failed for {self.mint_id}: {e}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        return {
            "mint_id": self.mint_id,
            "is_recording": self.is_recording,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "video_frames": self.video_frame_count,
            "audio_frames": self.audio_frame_count,
            "config": self.config
        }

    def _setup_output_container(self) -> None:
        """Setup PyAV output container and streams."""
        try:
            logger.info(f"[{self.mint_id}] Opening output file: {self.output_path}")
            
            # Force software-only mode for PyAV
            # This prevents PyAV from trying to use hardware decoders
            options = {
                'hwaccel': 'none',
                'threads': 'auto'
            }
            
            # Create output container with software-only options
            logger.info(f"[{self.mint_id}] Creating PyAV container with format: {self.config['format']}")
            self.output_container = av.open(str(self.output_path), mode='w', options=options)
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
            
            # Apply codec-specific options
            if 'crf' in self.config:
                self.video_stream.options = {'crf': str(self.config['crf'])}
            
            if 'preset' in self.config:
                if 'options' not in dir(self.video_stream) or not self.video_stream.options:
                    self.video_stream.options = {}
                self.video_stream.options['preset'] = str(self.config['preset'])
            
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
            
            logger.info(f"Setup output container for {self.mint_id}")
            
        except Exception as e:
            logger.error(f"Failed to setup output container: {e}")
            raise

    def _cleanup_output_container(self) -> None:
        """Cleanup PyAV output container."""
        try:
            if self.output_container:
                self.output_container.close()
                self.output_container = None
            self.video_stream = None
            self.audio_stream = None
        except Exception as e:
            logger.error(f"Error cleaning up output container: {e}")

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
            async for event in rtc.VideoStream(video_track):
                if self.stop_event.is_set():
                    break
                
                frame = event.frame
                self._write_video_frame(frame)
                self.video_frame_count += 1
                
        except asyncio.CancelledError:
            logger.info(f"Video frame processing cancelled for {self.mint_id}")
        except Exception as e:
            logger.error(f"Error processing video frames for {self.mint_id}: {e}")

    async def _process_audio_frames(self, audio_track: rtc.RemoteAudioTrack) -> None:
        """Process audio frames from LiveKit track."""
        try:
            async for event in rtc.AudioStream(audio_track):
                if self.stop_event.is_set():
                    break
                
                frame = event.frame
                self._write_audio_frame(frame)
                self.audio_frame_count += 1
                
        except asyncio.CancelledError:
            logger.info(f"Audio frame processing cancelled for {self.mint_id}")
        except Exception as e:
            logger.error(f"Error processing audio frames for {self.mint_id}: {e}")

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
            
            # Create PyAV VideoFrame
            av_frame = av.VideoFrame(width, height, 'yuv420p')
            
            # Convert buffer to the right format
            # Note: This is a simplified version - actual conversion depends on LiveKit frame format
            if hasattr(frame, 'to_ndarray'):
                # If LiveKit provides numpy conversion
                img = frame.to_ndarray(format='rgb24')
                av_frame = av.VideoFrame.from_ndarray(img, format='rgb24')
                av_frame = av_frame.reformat(format='yuv420p')
            else:
                # Manual conversion from buffer
                # This needs to be adjusted based on actual LiveKit frame format
                av_frame.planes[0].update(buffer)
            
            # Set PTS
            av_frame.pts = self.last_video_pts
            self.last_video_pts += int(90000 / self.config['fps'])  # 90kHz timebase
            
            # Encode and write
            for packet in self.video_stream.encode(av_frame):
                self.output_container.mux(packet)
                
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
            
            # Create PyAV AudioFrame
            av_frame = av.AudioFrame.from_ndarray(
                samples,
                format='s16',
                layout='stereo' if num_channels == 2 else 'mono'
            )
            av_frame.sample_rate = sample_rate
            
            # Set PTS
            av_frame.pts = self.last_audio_pts
            self.last_audio_pts += len(samples)
            
            # Encode and write
            for packet in self.audio_stream.encode(av_frame):
                self.output_container.mux(packet)
                
        except Exception as e:
            logger.error(f"Error writing audio frame: {e}")

