import asyncio
import time
import av
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, AsyncIterator
from fractions import Fraction

import livekit.rtc as rtc
from livekit.rtc import Room, RemoteParticipant

logger = logging.getLogger(__name__)


class PumpFunChunkRecorder:
    """
    Custom recorder for PumpFun with automatic keyframe-based segmentation.
    
    Completely new implementation (does not extend LiveKit's ParticipantRecorder).
    Uses LiveKit's VideoStream/AudioStream for frame capture and PyAV for encoding.
    
    Features:
    - Single continuous recording session (no LiveKit reconnection)
    - Packet-based keyframe detection for perfect cut points
    - Automatic container rotation every 30 seconds at keyframe boundaries
    - Zero gaps between segments
    - Immediate UploadCoordinator enqueue of completed segments
    - Memory-efficient bounded queues
    """
    
    def __init__(
        self,
        mint_id: str,
        room: Room,
        output_dir: str,
        segment_duration: int = 30,
        video_codec: str = "vp9",
        video_bitrate: str = "8M",
        video_fps: int = 30,
        video_quality: str = "high",
        audio_codec: str = "opus",
        audio_bitrate: str = "256k",
        first_frame_timeout: float = 30.0,
    ):
        """
        Initialize custom chunk recorder.
        
        Args:
            mint_id: PumpFun stream identifier
            room: LiveKit Room instance (must have participant connected)
            output_dir: Directory for segment files
            segment_duration: Target segment duration in seconds (default: 30)
            video_codec: VP8 or VP9 (default: vp9 for better quality)
            video_bitrate: Target video bitrate (e.g., "8M" for 8 Mbps)
            video_fps: Target frame rate (default: 30)
            video_quality: Quality preset (low, medium, high, best)
            audio_codec: Audio codec (default: opus)
            audio_bitrate: Audio bitrate (e.g., "256k")
        """
        self.mint_id = mint_id
        self.room = room
        self.output_dir = Path(output_dir)
        self.segment_duration = segment_duration
        
        # Video encoding parameters
        self.video_codec = video_codec.lower()
        self.video_bitrate = self._parse_bitrate(video_bitrate)
        self.video_fps = video_fps
        self.video_quality = video_quality
        self.audio_codec = audio_codec
        self.audio_bitrate = self._parse_bitrate(audio_bitrate)
        self._first_frame_timeout = first_frame_timeout
        
        # Recording state
        self._is_recording: bool = False
        self._participant_identity: Optional[str] = None
        self._participant: Optional[RemoteParticipant] = None
        self._first_video_frame_event = asyncio.Event()
        
        # Segment management
        self._segment_count: int = 0
        self._current_segment_index: int = 0
        self._current_segment_start: float = 0
        self._current_segment_path: Optional[Path] = None
        
        # Keyframe tracking
        self._frames_since_last_keyframe: int = 0
        self._last_keyframe_frame_index: int = 0
        self._total_frames_encoded: int = 0
        self._total_packets_written: int = 0
        
        # Stream components
        self._video_capture_stream: Optional[rtc.VideoStream] = None
        self._audio_capture_stream: Optional[rtc.AudioStream] = None
        self._video_capture_task: Optional[asyncio.Task] = None
        self._audio_capture_task: Optional[asyncio.Task] = None
        self._encoding_task: Optional[asyncio.Task] = None
        
        # Frame queues (bounded to prevent memory exhaustion)
        # 30 seconds of frames at target fps: 30fps * 30s = 900 frames
        max_video_queue = max(500, self.video_fps * 30)
        # Audio at ~100fps: 100fps * 30s = 3000 frames
        max_audio_queue = max(1000, self.video_fps * 100)
        
        self._video_queue: asyncio.Queue = asyncio.Queue(maxsize=max_video_queue)
        self._audio_queue: asyncio.Queue = asyncio.Queue(maxsize=max_audio_queue)
        
        # PyAV encoding components
        self._output_container: Optional[av.OutputContainer] = None
        self._video_stream: Optional[av.VideoStream] = None
        self._audio_stream: Optional[av.AudioStream] = None
        self._video_stream_initialized: bool = False
        self._audio_stream_initialized: bool = False
        
        # Audio synchronization
        self._cumulative_audio_samples: int = 0
        self._first_video_frame_time: Optional[float] = None
        
        # Statistics
        self._stats = {
            "segments_created": 0,
            "frames_captured": 0,
            "packets_written": 0,
            "bytes_written": 0,
            "recording_start_time": None,
            "last_rotation_time": None,
        }
        
        logger.info(
            f"PumpFunChunkRecorder initialized for {mint_id}: "
            f"{video_codec}/{audio_codec}, {self.video_bitrate/1_000_000:.2f}Mbps video, "
            f"{segment_duration}s segments"
        )
    
    def _parse_bitrate(self, bitrate_str: str) -> int:
        """Parse bitrate string (e.g., '8M', '256k') to integer bits."""
        bitrate_str = str(bitrate_str).upper().strip()
        if bitrate_str.endswith('K'):
            return int(bitrate_str[:-1]) * 1000
        elif bitrate_str.endswith('M'):
            return int(bitrate_str[:-1]) * 1_000_000
        else:
            return int(bitrate_str)
    
    async def start_recording(
        self, 
        participant_identity: str
    ) -> Dict[str, Any]:
        """
        Start continuous recording with automatic segmentation.
        
        Args:
            participant_identity: Identity of participant to record
            
        Returns:
            Success status and first segment path
            
        Raises:
            Exception: If recording fails to start
        """
        if self._is_recording:
            raise RuntimeError("Recording already in progress")
        
        logger.info(f"Starting chunk recording for {participant_identity}")
        
        # Find participant
        participant = self._find_participant(participant_identity)
        if not participant:
            raise ValueError(f"Participant {participant_identity} not found")
        
        self._participant_identity = participant_identity
        self._participant = participant
        self._is_recording = True
        self._first_video_frame_event.clear()
        
        try:
            # Subscribe to tracks
            await self._subscribe_to_tracks(participant)
            
            # Start frame capture
            await self._start_frame_capture()

            # Wait for first frame before starting the segment timer
            await self._wait_for_first_video_frame()
            self._stats["recording_start_time"] = time.time()
            
            # Start first segment
            first_segment_path = await self._start_new_segment()
            
            # Start encoding loop
            self._encoding_task = asyncio.create_task(self._encoding_loop())
            
            logger.info(f"Recording started: {first_segment_path}")
            
            return {
                "success": True,
                "first_segment": str(first_segment_path),
                "mint_id": self.mint_id
            }
            
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            self._is_recording = False
            raise
    
    async def stop_recording(self) -> Dict[str, Any]:
        """
        Stop recording and finalize current segment.
        
        Returns:
            Statistics about the recording session
        """
        if not self._is_recording:
            return {"success": False, "error": "Not recording"}
        
        logger.info(f"Stopping chunk recording for {self.mint_id}")
        
        self._is_recording = False
        
        # Signal capture tasks to stop
        # They'll detect _is_recording = False and exit
        
        # Wait for encoding to finish
        if self._encoding_task:
            self._encoding_task.cancel()
            try:
                await self._encoding_task
            except asyncio.CancelledError:
                pass
        
        # Stop frame capture
        await self._stop_frame_capture()
        
        # Finalize current segment
        await self._finalize_current_segment()
        
        # Unsubscribe from tracks
        if self._participant:
            await self._unsubscribe_from_tracks(self._participant)
        
        recording_duration = time.time() - self._stats["recording_start_time"]
        
        stats = {
            "success": True,
            "mint_id": self.mint_id,
            "segments_created": self._stats["segments_created"],
            "frames_captured": self._stats["frames_captured"],
            "packets_written": self._stats["packets_written"],
            "bytes_written": self._stats["bytes_written"],
            "duration_seconds": recording_duration,
        }
        
        logger.info(f"Recording stopped: {stats}")
        return stats
    
    def _find_participant(self, identity: str) -> Optional[RemoteParticipant]:
        """Find participant by identity or SID in current room."""
        for participant in self.room.remote_participants.values():
            if participant.identity == identity or participant.sid == identity:
                return participant
        return None
    
    async def _subscribe_to_tracks(self, participant: RemoteParticipant) -> None:
        """Subscribe to video and audio tracks of participant."""
        # Subscribe to video/audio tracks when auto_subscribe=False
        for publication in participant.track_publications.values():
            if publication.kind == rtc.TrackKind.KIND_VIDEO:
                try:
                    publication.set_subscribed(True)
                    logger.info("Subscribed to video track")
                except Exception as e:
                    logger.error(f"Failed to subscribe to video track: {e}")
            elif publication.kind == rtc.TrackKind.KIND_AUDIO:
                try:
                    publication.set_subscribed(True)
                    logger.info("Subscribed to audio track")
                except Exception as e:
                    logger.error(f"Failed to subscribe to audio track: {e}")
        
        # Wait a moment for subscription to take effect
        await asyncio.sleep(0.5)
    
    async def _unsubscribe_from_tracks(self, participant: RemoteParticipant) -> None:
        """Unsubscribe from all tracks."""
        for publication in participant.track_publications.values():
            if publication.subscribed:
                try:
                    publication.set_subscribed(False)
                    logger.info("Unsubscribed from track")
                except Exception as e:
                    logger.error(f"Failed to unsubscribe from track: {e}")
    
    async def _start_frame_capture(self) -> None:
        """Start VideoStream and AudioStream capture from LiveKit tracks."""
        participant = self._participant
        
        # Find and start video stream
        for publication in participant.track_publications.values():
            if publication.kind == rtc.TrackKind.KIND_VIDEO and publication.subscribed:
                track = publication.track
                stream_capacity = max(500, self.video_fps * 30)
                
                self._video_capture_stream = rtc.VideoStream(
                    track, 
                    capacity=stream_capacity
                )
                self._video_capture_task = asyncio.create_task(
                    self._capture_video_frames()
                )
                logger.info("Started video frame capture")
                break
        
        # Find and start audio stream
        for publication in participant.track_publications.values():
            if publication.kind == rtc.TrackKind.KIND_AUDIO and publication.subscribed:
                track = publication.track
                stream_capacity = max(1000, self.video_fps * 100)
                
                self._audio_capture_stream = rtc.AudioStream.from_track(
                    track=track,
                    sample_rate=48000,
                    num_channels=2,
                    capacity=stream_capacity
                )
                self._audio_capture_task = asyncio.create_task(
                    self._capture_audio_frames()
                )
                logger.info("Started audio frame capture")
                break
        
        # Wait a moment for streams to initialize
        await asyncio.sleep(0.5)

    async def _wait_for_first_video_frame(self) -> None:
        """Wait for the first video frame before starting segments."""
        if self._first_video_frame_event.is_set():
            return

        logger.info(
            f"Waiting for first video frame before starting segments "
            f"(timeout {self._first_frame_timeout}s)"
        )
        try:
            await asyncio.wait_for(
                self._first_video_frame_event.wait(),
                timeout=self._first_frame_timeout,
            )
        except asyncio.TimeoutError as exc:
            logger.error(
                f"Timed out waiting for first video frame after "
                f"{self._first_frame_timeout}s"
            )
            raise TimeoutError(
                f"Timed out waiting for first video frame after "
                f"{self._first_frame_timeout}s"
            ) from exc
    
    async def _capture_video_frames(self) -> None:
        """Capture video frames from VideoStream and queue them."""
        if not self._video_capture_stream:
            return
        
        try:
            async for frame_event in self._video_capture_stream:
                if not self._is_recording:
                    break
                if not self._first_video_frame_event.is_set():
                    self._first_video_frame_event.set()
                    logger.info(
                        f"First video frame received for {self.mint_id}; "
                        f"starting segment timer"
                    )

                await self._video_queue.put(frame_event)
                self._stats["frames_captured"] += 1
                
        except Exception as e:
            logger.error(f"Video capture error: {e}")
        finally:
            if self._video_capture_stream:
                await self._video_capture_stream.aclose()
                self._video_capture_stream = None
    
    async def _capture_audio_frames(self) -> None:
        """Capture audio frames from AudioStream and queue them."""
        if not self._audio_capture_stream:
            return
        
        try:
            async for frame_event in self._audio_capture_stream:
                if not self._is_recording:
                    break
                
                await self._audio_queue.put(frame_event)
                self._stats["frames_captured"] += 1
                
        except Exception as e:
            logger.error(f"Audio capture error: {e}")
        finally:
            if self._audio_capture_stream:
                await self._audio_capture_stream.aclose()
                self._audio_capture_stream = None
    
    async def _stop_frame_capture(self) -> None:
        """Stop background frame capture tasks."""
        if self._video_capture_task:
            self._video_capture_task.cancel()
            try:
                await self._video_capture_task
            except asyncio.CancelledError:
                pass
        
        if self._audio_capture_task:
            self._audio_capture_task.cancel()
            try:
                await self._audio_capture_task
            except asyncio.CancelledError:
                pass
    
    async def _start_new_segment(self) -> Path:
        """
        Create and initialize a new segment container.
        
        Returns:
            Path to new segment file
        """
        # Generate segment filename
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        segment_path = self.output_dir / f"{self.mint_id}_{timestamp}_chk{self._current_segment_index:03d}.webm"
        segment_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create container
        self._output_container = av.open(str(segment_path), mode='w', format='webm')
        self._current_segment_path = segment_path
        self._segment_count += 1
        self._current_segment_index += 1
        self._current_segment_start = time.time()
        
        # Reset stream initialization flags
        self._video_stream_initialized = False
        self._audio_stream_initialized = False
        
        # Create segment metadata for real-time tracking
        await self._create_segment_metadata()
        
        logger.info(
            f"Started segment {self._current_segment_index}: "
            f"{segment_path.name} (duration target: {self.segment_duration}s)"
        )
        
        return segment_path
    
    async def _initialize_streams(self) -> None:
        """
        Initialize video and audio streams from first frames.
        
        Called once per segment when first frames arrive.
        """
        # Initialize video stream from first video frame
        if not self._video_stream_initialized and not self._video_queue.empty():
            frame_event = await self._video_queue.get()
            frame = frame_event.frame
            
            self._video_stream = self._output_container.add_stream(
                self.video_codec,
                rate=self.video_fps
            )
            self._video_stream.width = frame.width
            self._video_stream.height = frame.height
            self._video_stream.pix_fmt = "yuv420p"
            self._video_stream.time_base = Fraction(1, 1000)  # Milliseconds
            
            # Apply encoding options
            self._video_stream.options = self._get_video_encoding_options()
            
            # Store first frame timestamp
            self._first_video_frame_time = frame_event.timestamp_us
            
            self._video_stream_initialized = True
            logger.info(
                f"Initialized video stream: {frame.width}x{frame.height} @ {self.video_fps}fps, "
                f"{self.video_codec}"
            )
            
            # Process this frame
            await self._encode_video_frame_sync(frame_event.frame, 0)
        
        # Initialize audio stream from first audio frame
        if not self._audio_stream_initialized and not self._audio_queue.empty():
            frame_event = await self._audio_queue.get()
            frame = frame_event.frame
            
            self._audio_stream = self._output_container.add_stream(self.audio_codec)
            self._audio_stream.rate = frame.sample_rate
            
            # Set channel layout
            if frame.num_channels == 1:
                layout = "mono"
            elif frame.num_channels == 2:
                layout = "stereo"
            else:
                layout = str(frame.num_channels)
            
            self._audio_stream.codec_context.layout = layout
            self._audio_stream.options = {"bitrate": str(self.audio_bitrate)}
            self._audio_stream.time_base = Fraction(1, frame.sample_rate)
            
            self._audio_stream_initialized = True
            logger.info(
                f"Initialized audio stream: {frame.sample_rate}Hz, "
                f"{frame.num_channels}ch, {self.audio_codec}"
            )
            
            # Process this frame
            await self._encode_audio_frame_sync(frame)
    
    def _get_video_encoding_options(self) -> Dict[str, str]:
        """
        Get video encoding options to force regular keyframes.
        
        For VP9, we force keyframes every 1 second (30 frames at 30fps).
        This gives us multiple rotation points per 30-second segment.
        """
        options = {
            "bitrate": str(self.video_bitrate),
        }
        
        if self.video_codec == "vp9":
            # CRITICAL: Force keyframes every 30 frames (1 second at 30fps)
            # This ensures we have multiple cut points per segment
            options["kf-min-dist"] = "30"   # Minimum distance between keyframes
            options["kf-max-dist"] = "30"   # Maximum distance between keyframes
            
            # Quality settings
            crf_map = {
                "low": "45",
                "medium": "35",
                "high": "28",
                "best": "20"
            }
            options["crf"] = crf_map.get(self.video_quality, "28")
            
            # Performance
            options["cpu-used"] = "3"     # Balanced speed/quality
            options["row-mt"] = "1"       # Row-based multithreading
            options["deadline"] = "realtime"
            
        elif self.video_codec == "vp8":
            # VP8 similar settings
            options["g"] = "30"   # GOP size 30 frames = 1 second
            options["cpu-used"] = "4"
            options["deadline"] = "realtime"
        
        return options
    
    async def _encoding_loop(self) -> None:
        """
        Main encoding loop - captures frames, encodes to packets,
        detects keyframes, and rotates containers.
        """
        video_frame_index = 0
        
        try:
            while self._is_recording:
                # Get next video frame with timeout
                try:
                    frame_event = await asyncio.wait_for(
                        self._video_queue.get(),
                        timeout=0.1
                    )
                except asyncio.TimeoutError:
                    # No frame available, check audio queue
                    await self._process_audio_frames()
                    continue
                
                # Check if streams need initialization
                if not self._video_stream_initialized:
                    await self._initialize_streams()
                    video_frame_index += 1
                    continue
                
                # Check for rotation condition
                await self._check_and_rotate_container(video_frame_index)
                
                # Encode video frame
                await self._encode_video_frame_sync(
                    frame_event.frame,
                    video_frame_index
                )
                
                video_frame_index += 1
                self._total_frames_encoded += 1
                
                # Release frame immediately
                frame_event.frame = None
                
                # Process pending audio frames
                await self._process_audio_frames()
            
            # Process any remaining frames after recording stops
            await self._process_remaining_audio()
            
        except Exception as e:
            logger.error(f"Encoding loop error: {e}")
    
    async def _check_and_rotate_container(self, video_frame_index: int) -> None:
        """
        Check if container rotation is needed.
        
        Rotation occurs when:
        1. At least 25 seconds have elapsed (to ensure keyframe soon)
        2. We have a keyframe available (recently created)
        """
        elapsed = time.time() - self._current_segment_start
        
        if elapsed >= 25:  # Check as soon as we're approaching 30s
            # Check if encoder should have created a keyframe by now
            # With kf-max-dist=30, keyframes appear every 1 second
            frames_in_current_segment = video_frame_index - self._last_keyframe_frame_index
            
            if frames_in_current_segment >= 25:
                # Should have a keyframe now - trigger rotation
                await self._rotate_container()
        
        # Alternative: Check actual time directly
        if elapsed >= 27 and self._frames_since_last_keyframe < 35:
            # We're approaching 30s milestone
            # Force keyframe check on next encode
            pass
    
    async def _rotate_container(self) -> None:
        """
        Rotate to next segment container.
        
        This ensures:
        - Perfect cut at keyframe (no video corruption)
        - Zero gap between segments
        - Immediate upload of completed segment
        """
        logger.info(
            f"Rotating container after {time.time() - self._current_segment_start:.2f}s "
            f"(segment {self._current_segment_index})"
        )
        
        # 1. Flush encoder to get remaining packets
        await self._flush_video_encoder()
        await self._flush_audio_encoder()
        
        # 2. Close current container
        previous_segment_path = self._current_segment_path
        await self._close_current_container()
        
        # 3. Enqueue completed segment
        if previous_segment_path and previous_segment_path.exists():
            await self._enqueue_completed_segment(previous_segment_path)
        
        # 4. Start new segment
        await self._start_new_segment()
        
        # Reset keyframe tracking
        self._frames_since_last_keyframe = 0
        self._last_keyframe_frame_index = self._total_frames_encoded
        
        logger.info(f"Container rotation completed, new segment: {self._current_segment_path.name}")
    
    async def _enqueue_completed_segment(self, segment_path: Path) -> None:
        """Enqueue completed segment to UploadCoordinator for processing."""
        try:
            # Update segment metadata to show completion
            await self._update_segment_metadata("finalizing")
            
            from app.services.upload_coordinator import UploadCoordinator
            upload_coordinator = UploadCoordinator()

            enqueued = await upload_coordinator.enqueue_video_after_download(
                str(segment_path),
                "PumpFunPlugin"
            )

            if enqueued:
                # Update segment metadata to show it's been queued for upload
                await self._update_segment_metadata("upload_queued")
                logger.info(f"Enqueued segment: {segment_path.name}")

        except Exception as e:
            logger.error(f"Failed to enqueue segment {segment_path}: {e}")
            await self._update_segment_metadata("failed", str(e))
    
    async def _update_segment_metadata(self, status: str, error_message: Optional[str] = None) -> None:
        """Update real-time segment metadata during recording."""
        try:
            from app.models.segment_metadata import SegmentMetadata
            from app.models.database import SessionLocal
            
            db = SessionLocal()
            try:
                # Find existing segment metadata by path
                segment = db.query(SegmentMetadata).filter(
                    SegmentMetadata.segment_path == str(self._current_segment_path)
                ).first()
                
                if segment:
                    # Update existing record
                    segment.recording_status = status
                    segment.recording_session_id = self.mint_id
                    segment.end_timestamp = datetime.now(timezone.utc)
                    segment.bytes_written = self._stats.get("bytes_written", 0)
                    segment.frames_captured = self._stats.get("frames_captured", 0)
                    segment.packets_written = self._stats.get("packets_written", 0)
                    
                    if error_message:
                        segment.error_message = error_message
                    
                    db.commit()
                    
            finally:
                db.close()
                
        except Exception as e:
            # Log but don't propagate - this is just for monitoring
            logger.error(f"Failed to update segment metadata: {e}")
    
    async def _create_segment_metadata(self) -> None:
        """Create segment metadata record for real-time tracking."""
        try:
            from app.models.segment_metadata import SegmentMetadata
            from app.models.database import SessionLocal
            from datetime import datetime
            
            db = SessionLocal()
            try:
                # Create new segment metadata entry
                segment = SegmentMetadata(
                    mint_id=self.mint_id,
                    recording_session_id=self.mint_id,
                    segment_index=self._current_segment_index,
                    segment_path=str(self._current_segment_path),
                    start_timestamp=datetime.now(timezone.utc),
                    expected_duration=self.segment_duration,
                    video_codec=self.video_codec,
                    video_bitrate=self.video_bitrate,
                    video_fps=self.video_fps,
                    audio_codec=self.audio_codec,
                    audio_bitrate=self.audio_bitrate,
                    frames_captured=0,
                    packets_written=0,
                    bytes_written=0,
                    keyframe_frame_index=self._last_keyframe_frame_index,
                    last_keyframe_frame_index=self._last_keyframe_frame_index,
                    keyframe_boundary=True,  # Will be updated when rotation happens
                    recording_status="recording",
                    auto_recorded=True
                )
                
                db.add(segment)
                db.commit()
                
                logger.info(f"Created segment metadata: {self._current_segment_path.name}")
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to create segment metadata: {e}")
    
    async def _encode_video_frame_sync(self, frame, frame_index: int) -> None:
        """
        Encode a video frame (synchronous).
        
        Detects keyframes in output packets and tracks them for segmentation.
        """
        if not self._video_stream or not self._output_container:
            return
        
        # Convert LiveKit VideoFrame to PyAV VideoFrame
        pyav_frame = await self._convert_video_frame_to_pyav(frame)
        
        # Encode frame to packets
        for packet in self._video_stream.encode(pyav_frame):
            # Detect keyframe in this packet
            is_keyframe = self._detect_keyframe_in_packet(packet)
            
            # Mux to current container
            self._output_container.mux(packet)
            self._stats["packets_written"] += 1
            
            # Track keyframes
            if is_keyframe:
                self._frames_since_last_keyframe = 0
                self._last_keyframe_frame_index = frame_index
                self._stats["last_keyframe_at"] = frame_index
            else:
                self._frames_since_last_keyframe += 1
        
        # Release frame memory immediately
        del pyav_frame
    
    def _detect_keyframe_in_packet(self, packet) -> bool:
        """
        Detect if packet contains a keyframe (I-frame).
        
        PyAV uses AV_PKT_FLAG_KEY = 0x0001 to indicate keyframes.
        
        Args:
            packet: PyAV packet
            
        Returns:
            True if packet contains a keyframe, False otherwise
        """
        # Prefer higher-level PyAV properties when available.
        if hasattr(packet, "is_keyframe"):
            return bool(packet.is_keyframe)
        if hasattr(packet, "keyframe"):
            return bool(packet.keyframe)
        if hasattr(packet, "flags"):
            return (packet.flags & 0x0001) != 0
        return False

    @staticmethod
    def _get_plane_size(plane) -> int:
        """Get plane size in bytes across LiveKit versions."""
        if hasattr(plane, "buffer_size"):
            return plane.buffer_size
        if hasattr(plane, "nbytes"):
            return plane.nbytes
        return len(plane)
    
    async def _convert_video_frame_to_pyav(self, livekit_frame) -> av.VideoFrame:
        """
        Convert LiveKit VideoFrame to PyAV VideoFrame.
        
        Args:
            livekit_frame: LiveKit VideoFrame object
            
        Returns:
            PyAV VideoFrame in yuv420p format
        """
        from livekit.rtc._proto.video_frame_pb2 import VideoBufferType
        
        # Convert to I420 format if needed
        if livekit_frame.type != VideoBufferType.I420:
            livekit_frame = livekit_frame.convert(VideoBufferType.I420)
        
        # Create PyAV frame
        pyav_frame = av.VideoFrame(livekit_frame.width, livekit_frame.height, "yuv420p")
        
        # Copy Y plane
        y_plane = livekit_frame.get_plane(0)
        pyav_y_data = bytearray(pyav_frame.planes[0].buffer_size)
        y_stride = self._get_plane_size(y_plane) // livekit_frame.height
        for row in range(livekit_frame.height):
            src_start = row * y_stride
            pyav_y_data[row * pyav_frame.planes[0].line_size : (row + 1) * pyav_frame.planes[0].line_size] = \
                y_plane[src_start : src_start + pyav_frame.planes[0].line_size]
        pyav_frame.planes[0].update(pyav_y_data)
        
        # Copy U plane
        chroma_height = livekit_frame.height // 2
        u_plane = livekit_frame.get_plane(1)
        pyav_u_data = bytearray(pyav_frame.planes[1].buffer_size)
        u_stride = self._get_plane_size(u_plane) // chroma_height
        chroma_width = livekit_frame.width // 2
        for row in range(chroma_height):
            src_start = row * u_stride
            pyav_u_data[row * pyav_frame.planes[1].line_size : (row + 1) * pyav_frame.planes[1].line_size] = \
                u_plane[src_start : src_start + pyav_frame.planes[1].line_size]
        pyav_frame.planes[1].update(pyav_u_data)
        
        # Copy V plane
        v_plane = livekit_frame.get_plane(2)
        pyav_v_data = bytearray(pyav_frame.planes[2].buffer_size)
        v_stride = self._get_plane_size(v_plane) // chroma_height
        for row in range(chroma_height):
            src_start = row * v_stride
            pyav_v_data[row * pyav_frame.planes[2].line_size : (row + 1) * pyav_frame.planes[2].line_size] = \
                v_plane[src_start : src_start + pyav_frame.planes[2].line_size]
        pyav_frame.planes[2].update(pyav_v_data)
        
        # Set PTS
        pyav_frame.pts = self._total_frames_encoded
        pyav_frame.time_base = self._video_stream.time_base
        
        return pyav_frame
    
    async def _process_audio_frames(self, max_frames: int = 10) -> None:
        """Process pending audio frames (up to max_frames at a time)."""
        if not self._audio_stream_initialized:
            return
        
        processed = 0
        while not self._audio_queue.empty() and processed < max_frames:
            frame_event = await self._audio_queue.get()
            try:
                await self._encode_audio_frame_sync(frame_event.frame)
                processed += 1
            finally:
                frame_event.frame = None
    
    async def _encode_audio_frame_sync(self, frame) -> None:
        """Encode an audio frame (synchronous)."""
        if not self._audio_stream or not self._output_container:
            return
        
        # Convert to PyAV AudioFrame
        import numpy as np
        audio_data = np.frombuffer(frame.data, dtype=np.int16)
        audio_packed = audio_data.reshape(1, -1)
        
        layout = "mono" if frame.num_channels == 1 else "stereo"
        pyav_frame = av.AudioFrame.from_ndarray(audio_packed, format="s16", layout=layout)
        pyav_frame.sample_rate = frame.sample_rate
        pyav_frame.pts = self._cumulative_audio_samples
        pyav_frame.time_base = self._audio_stream.time_base
        
        # Encode
        for packet in self._audio_stream.encode(pyav_frame):
            self._output_container.mux(packet)
            self._stats["packets_written"] += 1
        
        self._cumulative_audio_samples += frame.samples_per_channel
    
    async def _process_remaining_audio(self) -> None:
        """Process any remaining audio frames after recording stops."""
        while not self._audio_queue.empty():
            frame_event = await self._audio_queue.get()
            try:
                await self._encode_audio_frame_sync(frame_event.frame)
            finally:
                frame_event.frame = None
    
    async def _flush_video_encoder(self) -> None:
        """Flush video encoder to get remaining packets."""
        if self._video_stream and self._output_container:
            try:
                for packet in self._video_stream.encode():
                    if packet.dts is None:
                        continue
                    self._output_container.mux(packet)
                    self._stats["packets_written"] += 1
            except Exception as e:
                logger.error(f"Error flushing video encoder: {e}")
    
    async def _flush_audio_encoder(self) -> None:
        """Flush audio encoder to get remaining packets."""
        if self._audio_stream and self._output_container:
            try:
                for packet in self._audio_stream.encode():
                    if packet.dts is None:
                        continue
                    self._output_container.mux(packet)
                    self._stats["packets_written"] += 1
            except Exception as e:
                logger.error(f"Error flushing audio encoder: {e}")
    
    async def _close_current_container(self) -> None:
        """Close current segment container and flush all data."""
        if self._output_container:
            try:
                # Flush any remaining packets
                await self._flush_video_encoder()
                await self._flush_audio_encoder()
                
                # Close container
                self._output_container.close()
                
                # Update bytes written
                if self._current_segment_path and self._current_segment_path.exists():
                    file_size = self._current_segment_path.stat().st_size
                    self._stats["bytes_written"] += file_size
                
                logger.info(f"Closed segment: {self._current_segment_path.name} ({file_size / 1024 / 1024:.2f} MB)")
                
            except Exception as e:
                logger.error(f"Error closing container: {e}")
            finally:
                self._output_container = None
    
    async def _finalize_current_segment(self) -> None:
        """Finalize the last segment of a recording session."""
        if self._output_container:
            await self._close_current_container()
        
        logger.info(f"Recording finalized: {self._stats}")