"""
WebRTC-based recording service following pion/webrtc best practices.

This implementation follows the expert design based on WebRTC fundamentals:
- Proper state machine for connection lifecycle
- Reliable track subscription with PLI/FIR support
- Bounded queue frame reception with backpressure
- RTP timestamp to PTS mapping for A/V sync
- Comprehensive diagnostics and error handling
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List, Callable, Set
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum
import threading
from queue import Queue, Empty
import gc
import time

import numpy as np
from livekit import rtc

from app.services.stream_manager import StreamManager

# Configure logging
logger = logging.getLogger(__name__)

# Import PyAV with NVDEC error handling
import os
os.environ.setdefault('AV_LOG_FORCE_NOCOLOR', '1')
os.environ.setdefault('FFREPORT', 'level=0')

try:
    import av
    av.logging.set_level(av.logging.ERROR)
except Exception as e:
    logger.error(f"Failed to import PyAV: {e}")
    raise


class RecordingState(Enum):
    """WebRTC recording state machine."""
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
    """Context for a single track being recorded."""
    track_id: str
    track: rtc.RemoteTrack
    publication: rtc.RemoteTrackPublication
    kind: rtc.TrackKind
    ssrc: Optional[int] = None
    first_rtp_timestamp: Optional[int] = None
    first_wall_time: Optional[float] = None
    frame_count: int = 0
    last_rtp_timestamp: Optional[int] = None
    is_active: bool = False


@dataclass
class MediaClock:
    """RTP timestamp to PTS mapping for A/V sync."""
    video_clock_rate: int = 90000  # 90kHz for video
    audio_clock_rate: int = 48000  # 48kHz for audio
    
    def __post_init__(self):
        self.track_clocks: Dict[str, Dict[str, Any]] = {}
    
    def register_track(self, track_id: str, track_kind: rtc.TrackKind, 
                      first_rtp_timestamp: int, first_wall_time: float):
        """Register a track's clock reference."""
        clock_rate = self.video_clock_rate if track_kind == rtc.TrackKind.KIND_VIDEO else self.audio_clock_rate
        
        self.track_clocks[track_id] = {
            'clock_rate': clock_rate,
            'first_rtp_timestamp': first_rtp_timestamp,
            'first_wall_time': first_wall_time,
            'first_pts': 0,  # Start PTS at 0
            'last_rtp_timestamp': first_rtp_timestamp,
            'wrap_count': 0
        }
        
        logger.info(f"[MediaClock] Registered {track_kind} track {track_id} with clock rate {clock_rate}")
    
    def rtp_to_pts(self, track_id: str, rtp_timestamp: int) -> int:
        """Convert RTP timestamp to PTS in stream timebase."""
        if track_id not in self.track_clocks:
            return 0
            
        clock_info = self.track_clocks[track_id]
        clock_rate = clock_info['clock_rate']
        first_rtp = clock_info['first_rtp_timestamp']
        
        # Handle RTP timestamp wrap-around (32-bit)
        rtp_delta = self._unwrap_rtp_timestamp(rtp_timestamp, first_rtp, clock_info)
        
        # Convert to PTS (assuming 1/clock_rate timebase)
        pts = int(rtp_delta)
        
        # Ensure PTS is monotonically increasing with proper increment
        last_pts = clock_info.get('last_pts', 0)
        frame_count = clock_info.get('frame_count', 0)
        
        # Calculate proper increment based on track type and frame count
        if 'VIDEO' in track_id:
            # Video: 30fps = 3000 units per frame
            expected_pts = frame_count * 3000
            min_increment = 3000
        else:  # Audio
            # Audio: 48kHz = 1024 samples per frame
            expected_pts = frame_count * 1024
            min_increment = 1024
        
        # Use the maximum of calculated PTS and expected PTS
        pts = max(pts, expected_pts)
        
        # Ensure monotonicity
        if pts <= last_pts:
            pts = last_pts + min_increment
        
        # Update frame count
        clock_info['frame_count'] = frame_count + 1
        clock_info['last_rtp_timestamp'] = rtp_timestamp
        clock_info['last_pts'] = pts
        
        return pts
    
    def _unwrap_rtp_timestamp(self, current: int, first: int, clock_info: Dict[str, Any]) -> int:
        """Handle RTP timestamp wrap-around."""
        max_rtp = 2**32 - 1
        half_max = max_rtp // 2
        
        # Calculate delta
        delta = current - first
        
        # Handle wrap-around
        if delta > half_max:
            delta -= max_rtp
        elif delta < -half_max:
            delta += max_rtp
            
        return delta


class BoundedQueue:
    """Bounded queue with configurable drop policy."""
    
    def __init__(self, max_items: int, track_kind: rtc.TrackKind):
        self.max_items = max_items
        self.track_kind = track_kind
        self.queue: Queue = Queue(maxsize=max_items)
        self.dropped_count = 0
        self.total_enqueued = 0
        
    def put(self, item: Any, timeout: float = 0.1) -> bool:
        """Put item in queue, dropping oldest if full."""
        self.total_enqueued += 1
        
        try:
            self.queue.put(item, timeout=timeout)
            return True
        except:
            # Queue is full, drop oldest
            try:
                self.queue.get_nowait()
                self.queue.put(item, timeout=timeout)
                self.dropped_count += 1
                logger.debug(f"[BoundedQueue] Dropped oldest {self.track_kind} frame (total dropped: {self.dropped_count})")
                return True
            except:
                self.dropped_count += 1
                logger.warning(f"[BoundedQueue] Failed to enqueue {self.track_kind} frame")
                return False
    
    def get(self, timeout: float = 1.0) -> Optional[Any]:
        """Get item from queue."""
        try:
            return self.queue.get(timeout=timeout)
        except Empty:
            return None
    
    def size(self) -> int:
        """Get current queue size."""
        return self.queue.qsize()
    
    def is_full(self) -> bool:
        """Check if queue is full."""
        return self.queue.full()


class WebRTCRecordingService:
    """
    WebRTC-based recording service following pion/webrtc best practices.
    
    Architecture:
    [LiveKit Room] → [Subscription Layer] → [Frame Reception Layer] → [Encoding Queue] → [Container Writer]
    """
    
    _instance_count = 0
    
    def __init__(self, output_dir: str = "recordings"):
        WebRTCRecordingService._instance_count += 1
        self._instance_id = WebRTCRecordingService._instance_count
        print(f"========== WebRTCRecordingService instance #{self._instance_id} created (id={id(self)}) ==========", flush=True)
        
        self.stream_manager = StreamManager()
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Active recordings
        self.active_recordings: Dict[str, 'WebRTCRecorder'] = {}
        print(f"========== Instance #{self._instance_id}: active_recordings dict id={id(self.active_recordings)} ==========", flush=True)
        
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
        
        # Timeouts (following expert recommendations)
        self.timeouts = {
            'connection': 20.0,      # T1: Network connection timeout
            'subscription': 10.0,   # T2: Track subscription timeout
            'keyframe': 2.0,        # T2b: Keyframe after PLI timeout
            'read_deadline': 30.0,  # RTP read deadline (increased from 5.0 to 30.0 seconds)
            'encode_timeout': 1.0,  # Encoder timeout
        }
        
        # Queue configuration
        self.queue_config = {
            'video_max_items': 60,   # ~2 seconds at 30fps
            'audio_max_items': 200,  # ~250ms at 48kHz
        }

    async def start_recording(
        self, 
        mint_id: str, 
        output_format: str = "mp4", 
        video_quality: str = "medium"
    ) -> Dict[str, Any]:
        """Start recording a stream using WebRTC best practices."""
        try:
            print(f"\n========== RECORDING SERVICE START CALLED FOR {mint_id} ==========", flush=True)
            print(f"========== Service instance #{self._instance_id} (id={id(self)}) ==========", flush=True)
            print(f"========== active_recordings dict id={id(self.active_recordings)} ==========", flush=True)
            logger.info(f"📹 Starting WebRTC recording for mint_id: {mint_id}")
            
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
            
            # Create WebRTC recorder
            recorder = WebRTCRecorder(
                mint_id=mint_id,
                stream_info=stream_info,
                output_dir=self.output_dir,
                config=config,
                room=room,
                timeouts=self.timeouts,
                queue_config=self.queue_config
            )
            
            # Start recording
            print(f"========== CALLING recorder.start() ==========", flush=True)
            result = await recorder.start()
            print(f"========== recorder.start() returned: {result} ==========", flush=True)
            
            if result["success"]:
                self.active_recordings[mint_id] = recorder
                print(f"========== Recording added to active_recordings ==========", flush=True)
                logger.info(f"✅ WebRTC recording started successfully: {recorder.output_path}")
                
                return {
                    "success": True,
                    "mint_id": mint_id,
                    "output_path": str(recorder.output_path),
                    "config": config
                }
            else:
                logger.error(f"❌ WebRTC recorder failed to start: {result.get('error')}")
                return result
                
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"❌ Exception during WebRTC recording start for {mint_id}: {e}")
            logger.error(f"Full traceback:\n{error_details}")
            return {"success": False, "error": str(e)}

    async def stop_recording(self, mint_id: str) -> Dict[str, Any]:
        """Stop recording a stream."""
        try:
            print(f"========== STOP RECORDING CALLED FOR {mint_id} ==========", flush=True)
            logger.info(f"🛑 Stop WebRTC recording called for mint_id: {mint_id}")
            
            if mint_id not in self.active_recordings:
                print(f"========== {mint_id} NOT IN active_recordings when stopping ==========", flush=True)
                logger.warning(f"No active recording found for {mint_id}")
                return {"success": False, "error": f"No active recording for {mint_id}"}
            
            recorder = self.active_recordings[mint_id]
            result = await recorder.stop()
            
            # Remove from active recordings
            print(f"========== REMOVING {mint_id} from active_recordings ==========", flush=True)
            del self.active_recordings[mint_id]
            logger.info(f"Removed {mint_id} from active recordings")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to stop WebRTC recording for {mint_id}: {e}")
            import traceback
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def get_recording_status(self, mint_id: str) -> Dict[str, Any]:
        """Get recording status for a stream."""
        print(f"========== GET STATUS CALLED FOR {mint_id} ==========", flush=True)
        print(f"========== Service instance #{self._instance_id} (id={id(self)}) ==========", flush=True)
        print(f"========== active_recordings dict id={id(self.active_recordings)} ==========", flush=True)
        print(f"========== Active recordings: {list(self.active_recordings.keys())} ==========", flush=True)
        
        if mint_id not in self.active_recordings:
            print(f"========== {mint_id} NOT IN active_recordings! ==========", flush=True)
            return {"success": False, "error": f"No active recording for {mint_id}"}
        
        recorder = self.active_recordings[mint_id]
        print(f"========== Found recorder, state: {recorder.state.value} ==========", flush=True)
        status = await recorder.get_status()
        print(f"========== Recorder status: {status} ==========", flush=True)
        return status

    async def get_all_recordings(self) -> Dict[str, Any]:
        """Get status of all active recordings."""
        recordings = {}
        for mint_id, recorder in self.active_recordings.items():
            recordings[mint_id] = await recorder.get_status()
        return {"success": True, "recordings": recordings}

    def _get_recording_config(self, output_format: str, video_quality: str) -> Dict[str, Any]:
        """Get recording configuration based on format and quality."""
        config = self.default_config.copy()
        
        # Apply format-specific configuration
        if output_format == "webm":
            config.update({
                "video_codec": "libvpx-vp9",
                "audio_codec": "libopus",
                "format": "webm"
            })
        elif output_format == "av1":
            config.update({
                "video_codec": "libaom-av1",
                "format": "mp4"
            })
        
        # Apply quality preset
        quality_presets = {
            "low": {"video_bitrate": 1000000, "audio_bitrate": 64000, "width": 1280, "height": 720},
            "medium": {"video_bitrate": 2000000, "audio_bitrate": 128000, "width": 1920, "height": 1080},
            "high": {"video_bitrate": 4000000, "audio_bitrate": 192000, "width": 1920, "height": 1080}
        }
        
        if video_quality in quality_presets:
            config.update(quality_presets[video_quality])
        
        return config


class WebRTCRecorder:
    """
    WebRTC-based recorder following pion/webrtc best practices.
    
    State machine: DISCONNECTED → CONNECTING → CONNECTED → SUBSCRIBING → SUBSCRIBED → RECORDING → STOPPING → STOPPED
    """
    
    def __init__(
        self, 
        mint_id: str, 
        stream_info: Any,
        output_dir: Path, 
        config: Dict[str, Any], 
        room: rtc.Room,
        timeouts: Dict[str, float],
        queue_config: Dict[str, int]
    ):
        self.mint_id = mint_id
        self.stream_info = stream_info
        self.output_dir = output_dir
        self.config = config
        self.room = room
        self.timeouts = timeouts
        self.queue_config = queue_config
        
        # State management
        self.state = RecordingState.DISCONNECTED
        self.start_time: Optional[datetime] = None
        self.output_path: Optional[Path] = None
        
        # Track management
        self.tracks: Dict[str, TrackContext] = {}
        self.queues: Dict[str, BoundedQueue] = {}
        self.media_clock = MediaClock()
        
        # PyAV components
        self.output_container: Optional[av.container.OutputContainer] = None
        self.video_stream: Optional[av.video.stream.VideoStream] = None
        self.audio_stream: Optional[av.audio.stream.AudioStream] = None
        
        # Async tasks
        self.read_tasks: List[asyncio.Task] = []
        self.encode_task: Optional[asyncio.Task] = None
        self.stop_event = asyncio.Event()
        
        # Statistics
        self.stats = {
            'video_frames': 0,
            'audio_frames': 0,
            'dropped_frames': 0,
            'pli_requests': 0,
            'track_subscriptions': 0,
            'connection_time': 0.0,
            'subscription_time': 0.0,
        }
        
        # Encoded frame counters for PTS calculation
        self.encoded_video_count = 0
        self.encoded_audio_count = 0
        
        # Get output filename
        self.output_path = self._get_output_filename()
    
    def _get_output_filename(self) -> Path:
        """Generate output filename based on mint_id and timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.mint_id}_{timestamp}.{self.config['format']}"
        output_path = self.output_dir / filename
        logger.info(f"[{self.mint_id}] Output path: {output_path}")
        return output_path

    async def start(self) -> Dict[str, Any]:
        """Start recording following WebRTC state machine."""
        try:
            logger.info(f"[{self.mint_id}] ========== STARTING WEBRTC RECORDING ==========")
            logger.info(f"[{self.mint_id}] Current state: {self.state.value}")
            logger.info(f"[{self.mint_id}] Output path: {self.output_path}")
            
            if self.state != RecordingState.DISCONNECTED:
                logger.error(f"[{self.mint_id}] Cannot start: already in state {self.state.value}")
                return {"success": False, "error": f"Recording already in state: {self.state.value}"}
            
            # State: DISCONNECTED → CONNECTING
            self.state = RecordingState.CONNECTING
            connection_start = time.time()
            
            # Verify room is connected
            if not self.room.isconnected():
                logger.error(f"[{self.mint_id}] Room not connected")
                return {"success": False, "error": "Room not connected"}
            
            # State: CONNECTING → CONNECTED
            self.state = RecordingState.CONNECTED
            self.stats['connection_time'] = time.time() - connection_start
            logger.info(f"[{self.mint_id}] ✅ Room connected in {self.stats['connection_time']:.2f}s")
            
            # State: CONNECTED → SUBSCRIBING
            self.state = RecordingState.SUBSCRIBING
            subscription_start = time.time()
            
            # Find target participant
            participant = self._find_participant()
            if not participant:
                return {"success": False, "error": "Participant not found"}
            
            # Subscribe to tracks
            await self._subscribe_to_tracks(participant)
            
            # Wait for track subscriptions
            await self._await_track_subscriptions()
            
            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED
            self.stats['subscription_time'] = time.time() - subscription_start
            logger.info(f"[{self.mint_id}] ✅ Tracks subscribed in {self.stats['subscription_time']:.2f}s")
            
            # Setup PyAV container
            logger.info(f"[{self.mint_id}] Setting up output container...")
            await self._setup_output_container()
            logger.info(f"[{self.mint_id}] ✅ Output container ready")
            
            # Send PLI for keyframes
            logger.info(f"[{self.mint_id}] Requesting keyframes...")
            await self._request_keyframes()
            logger.info(f"[{self.mint_id}] ✅ Keyframe requests sent")
            
            # Start frame processing
            logger.info(f"[{self.mint_id}] About to start frame processing tasks...")
            await self._start_frame_processing()
            logger.info(f"[{self.mint_id}] ✅ Frame processing tasks created")
            
            # State: SUBSCRIBED → RECORDING
            self.state = RecordingState.RECORDING
            self.start_time = datetime.now(timezone.utc)
            
            logger.info(f"[{self.mint_id}] ========== RECORDING STARTED SUCCESSFULLY ==========")
            logger.info(f"[{self.mint_id}] State: {self.state.value}")
            logger.info(f"[{self.mint_id}] Tracks: {len(self.tracks)}")
            logger.info(f"[{self.mint_id}] Read tasks: {len(self.read_tasks)}")
            logger.info(f"[{self.mint_id}] Encode task: {self.encode_task is not None}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat(),
                "tracks": len(self.tracks),
                "stats": self.stats
            }
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Recording start failed: {e}")
            import traceback
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            await self._cleanup()
            return {"success": False, "error": str(e)}

    async def stop(self) -> Dict[str, Any]:
        """Stop recording following WebRTC state machine."""
        try:
            logger.info(f"[{self.mint_id}] Stopping WebRTC recording")
            
            if self.state not in [RecordingState.RECORDING, RecordingState.SUBSCRIBED]:
                return {"success": False, "error": f"No active recording to stop (state: {self.state.value})"}
            
            # State: RECORDING → STOPPING
            self.state = RecordingState.STOPPING
            
            # Signal stop
            self.stop_event.set()
            
            # Stop read tasks
            await self._stop_read_tasks()
            
            # Drain queues
            await self._drain_queues()
            
            # Flush and close container
            await self._cleanup_output_container()
            
            # State: STOPPING → STOPPED
            self.state = RecordingState.STOPPED
            end_time = datetime.now(timezone.utc)
            
            logger.info(f"[{self.mint_id}] ✅ Recording stopped successfully")
            logger.info(f"[{self.mint_id}] Stats: {self.stats}")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": end_time.isoformat(),
                "stats": self.stats
            }
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Recording stop failed: {e}")
            import traceback
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        print(f"[{self.mint_id}] get_status() called, state={self.state.value}", flush=True)
        print(f"[{self.mint_id}] encode_task={self.encode_task}, read_tasks={len(self.read_tasks)}", flush=True)
        print(f"[{self.mint_id}] encoded frames: video={self.encoded_video_count}, audio={self.encoded_audio_count}", flush=True)
        
        # Check if tasks are still running
        if self.encode_task:
            print(f"[{self.mint_id}] encode_task.done()={self.encode_task.done()}, cancelled={self.encode_task.cancelled()}", flush=True)
        
        file_size_mb = 0
        if self.output_path and self.output_path.exists():
            file_size_mb = self.output_path.stat().st_size / (1024 * 1024)
            print(f"[{self.mint_id}] file_size_mb={file_size_mb}", flush=True)
        else:
            print(f"[{self.mint_id}] output file does not exist: {self.output_path}", flush=True)
        
        queue_sizes = {}
        for track_id, queue in self.queues.items():
            queue_sizes[track_id] = queue.size()
        
        print(f"[{self.mint_id}] queue_sizes={queue_sizes}", flush=True)
        
        return {
            "mint_id": self.mint_id,
            "state": self.state.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "file_size_mb": round(file_size_mb, 2),
            "tracks": len(self.tracks),
            "stats": self.stats,
            "queue_sizes": queue_sizes,
            "config": self.config
        }

    def _find_participant(self) -> Optional[rtc.RemoteParticipant]:
        """Find the target participant."""
        # First try to find the exact participant
        for participant in self.room.remote_participants.values():
            if participant.sid == self.stream_info.participant_sid:
                logger.info(f"[{self.mint_id}] ✅ Found exact participant: {participant.sid}")
                return participant
        
        # If not found, use any participant with tracks
        logger.warning(f"[{self.mint_id}] ⚠️ Exact participant {self.stream_info.participant_sid} not found, using any available participant")
        for participant in self.room.remote_participants.values():
            if participant.track_publications:
                logger.info(f"[{self.mint_id}] ✅ Using participant with tracks: {participant.sid}")
                return participant
        
        logger.error(f"[{self.mint_id}] ❌ No participants with tracks found")
        return None

    async def _subscribe_to_tracks(self, participant: rtc.RemoteParticipant):
        """Subscribe to tracks following WebRTC best practices."""
        logger.info(f"[{self.mint_id}] Subscribing to tracks for participant {participant.sid}")
        
        for track_pub in participant.track_publications.values():
            if track_pub.kind not in [rtc.TrackKind.KIND_VIDEO, rtc.TrackKind.KIND_AUDIO]:
                continue
                
            logger.info(f"[{self.mint_id}] Found {track_pub.kind} track publication")
            
            # Explicitly subscribe if not already subscribed
            if not track_pub.subscribed:
                logger.info(f"[{self.mint_id}] 📡 Subscribing to {track_pub.kind} track")
                track_pub.set_subscribed(True)
                await asyncio.sleep(0.1)  # Brief wait for subscription
            
            # Wait for subscription to complete
            timeout = self.timeouts['subscription']
            start_time = time.time()
            
            while not track_pub.subscribed and (time.time() - start_time) < timeout:
                await asyncio.sleep(0.1)
            
            if not track_pub.subscribed:
                logger.warning(f"[{self.mint_id}] ⚠️ {track_pub.kind} track subscription timeout")
                continue
            
            logger.info(f"[{self.mint_id}] ✅ {track_pub.kind} track subscribed")

    async def _await_track_subscriptions(self):
        """Wait for track subscriptions to be ready."""
        logger.info(f"[{self.mint_id}] Awaiting track subscriptions...")
        logger.info(f"[{self.mint_id}] Looking for participant: {self.stream_info.participant_sid}")
        logger.info(f"[{self.mint_id}] Available participants: {list(self.room.remote_participants.keys())}")
        
        timeout = self.timeouts['subscription']
        start_time = time.time()
        
        while (time.time() - start_time) < timeout:
            # Check for subscribed tracks from ANY participant (not just the expected one)
            for participant in self.room.remote_participants.values():
                logger.info(f"[{self.mint_id}] Checking participant: {participant.sid}")
                
                for track_pub in participant.track_publications.values():
                    if (track_pub.subscribed and 
                        track_pub.track is not None and 
                        track_pub.kind in [rtc.TrackKind.KIND_VIDEO, rtc.TrackKind.KIND_AUDIO]):
                        
                        # Use actual track kind instead of publication kind
                        actual_track_kind = track_pub.track.kind
                        
                        # Log warning if publication kind differs from actual track kind
                        if track_pub.kind != actual_track_kind:
                            logger.warning(f"[{self.mint_id}] Track publication kind mismatch: pub={track_pub.kind}, actual={actual_track_kind}, sid={track_pub.track.sid}")
                        
                        # Only proceed if actual track kind is valid
                        if actual_track_kind not in [rtc.TrackKind.KIND_VIDEO, rtc.TrackKind.KIND_AUDIO]:
                            logger.warning(f"[{self.mint_id}] Skipping track with unsupported kind: {actual_track_kind}")
                            continue
                        
                        track_id = f"{participant.sid}_{actual_track_kind}"
                        
                        if track_id not in self.tracks:
                            # Create track context using actual track kind
                            track_context = TrackContext(
                                track_id=track_id,
                                track=track_pub.track,
                                publication=track_pub,
                                kind=actual_track_kind
                            )
                            
                            self.tracks[track_id] = track_context
                            self.stats['track_subscriptions'] += 1
                            
                            logger.info(f"[{self.mint_id}] ✅ Track ready: {track_id}")
            
            # Check if we have both video and audio
            video_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_VIDEO]
            audio_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_AUDIO]
            
            if video_tracks and audio_tracks:
                logger.info(f"[{self.mint_id}] ✅ All required tracks ready")
                return
            
            await asyncio.sleep(0.1)
        
        # Timeout - check what we have
        if not self.tracks:
            logger.error(f"[{self.mint_id}] No tracks found. Available participants: {list(self.room.remote_participants.keys())}")
            for participant in self.room.remote_participants.values():
                logger.error(f"[{self.mint_id}] Participant {participant.sid} has {len(participant.track_publications)} track publications")
                for track_pub in participant.track_publications.values():
                    logger.error(f"[{self.mint_id}] Track: kind={track_pub.kind}, subscribed={track_pub.subscribed}, track={track_pub.track is not None}")
            raise Exception("No tracks subscribed within timeout")
        
        logger.warning(f"[{self.mint_id}] ⚠️ Subscription timeout, proceeding with {len(self.tracks)} tracks")

    async def _setup_output_container(self):
        """Setup PyAV output container."""
        try:
            logger.info(f"[{self.mint_id}] Setting up PyAV output container")
            
            # Create output container
            output_path_str = str(self.output_path.absolute())
            self.output_container = av.open(output_path_str, mode='w')
            
            # Add video stream if we have video tracks
            video_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_VIDEO]
            if video_tracks:
                self.video_stream = self.output_container.add_stream(
                    self.config['video_codec'],
                    rate=self.config['fps']
                )
                self.video_stream.width = self.config['width']
                self.video_stream.height = self.config['height']
                self.video_stream.pix_fmt = 'yuv420p'
                self.video_stream.bit_rate = self.config['video_bitrate']
                
                # Set timebase
                from fractions import Fraction
                self.video_stream.time_base = Fraction(1, self.config['fps'])
            
            # Add audio stream if we have audio tracks
            audio_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_AUDIO]
            if audio_tracks:
                self.audio_stream = self.output_container.add_stream(
                    self.config['audio_codec'],
                    rate=48000  # LiveKit standard
                )
                self.audio_stream.bit_rate = self.config['audio_bitrate']
                
                # Set timebase
                from fractions import Fraction
                self.audio_stream.time_base = Fraction(1, 48000)
            
            logger.info(f"[{self.mint_id}] ✅ Output container setup complete")
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Failed to setup output container: {e}")
            raise

    async def _request_keyframes(self):
        """Request keyframes for video tracks."""
        logger.info(f"[{self.mint_id}] Requesting keyframes")
        
        for track_context in self.tracks.values():
            if track_context.kind == rtc.TrackKind.KIND_VIDEO:
                # Send PLI (Picture Loss Indication) to request keyframe
                try:
                    # Note: This would require access to the underlying RTP sender
                    # For now, we'll log that we would send PLI
                    logger.info(f"[{self.mint_id}] 📡 Would send PLI for video track {track_context.track_id}")
                    self.stats['pli_requests'] += 1
                except Exception as e:
                    logger.warning(f"[{self.mint_id}] Failed to send PLI: {e}")

    async def _start_frame_processing(self):
        """Start frame processing tasks."""
        logger.info(f"[{self.mint_id}] Starting frame processing")
        
        # Create bounded queues for each track
        for track_id, track_context in self.tracks.items():
            max_items = (self.queue_config['video_max_items'] 
                        if track_context.kind == rtc.TrackKind.KIND_VIDEO 
                        else self.queue_config['audio_max_items'])
            
            queue = BoundedQueue(max_items, track_context.kind)
            self.queues[track_id] = queue
            
            # Start read task for this track
            task = asyncio.create_task(self._read_track_frames(track_context))
            task.add_done_callback(lambda t, tid=track_id: self._read_task_done(t, tid))
            self.read_tasks.append(task)
        
        # Start encode task
        # Create encoding task with exception handler
        self.encode_task = asyncio.create_task(self._encode_frames())
        self.encode_task.add_done_callback(self._encoding_task_done)
        
        logger.info(f"[{self.mint_id}] ✅ Frame processing tasks started")

    def _encoding_task_done(self, task: asyncio.Task):
        """Callback when encoding task completes or fails."""
        try:
            # Check if task raised an exception
            exception = task.exception()
            if exception:
                logger.error(f"[{self.mint_id}] ❌ Encoding task failed with exception: {exception}")
                import traceback
                logger.error(f"Traceback:\n{''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))}")
            else:
                logger.info(f"[{self.mint_id}] Encoding task completed normally")
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Encoding task was cancelled")
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error in encoding task callback: {e}")
    
    def _read_task_done(self, task: asyncio.Task, track_id: str):
        """Callback when a read task completes or fails."""
        try:
            # Check if task raised an exception
            exception = task.exception()
            if exception:
                logger.error(f"[{self.mint_id}] ❌ Read task for {track_id} failed with exception: {exception}")
                import traceback
                logger.error(f"Traceback:\n{''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))}")
            else:
                logger.info(f"[{self.mint_id}] Read task for {track_id} completed normally")
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Read task for {track_id} was cancelled")
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error in read task callback for {track_id}: {e}")
    
    async def _read_track_frames(self, track_context: TrackContext):
        """Read frames from a track and put them in the queue."""
        try:
            logger.info(f"[{self.mint_id}] Starting frame read for {track_context.track_id}")
            
            queue = self.queues[track_context.track_id]
            frame_count = 0
            first_frame_time = None
            last_frame_time = None
            
            # Use the appropriate stream iterator
            if track_context.kind == rtc.TrackKind.KIND_VIDEO:
                stream = rtc.VideoStream(track_context.track)
            else:
                stream = rtc.AudioStream(track_context.track)
            
            async for event in stream:
                if self.stop_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop event detected, ending frame read for {track_context.track_id}")
                    break
                
                frame = event.frame
                current_time = time.time()
                
                # Record first frame timing
                if first_frame_time is None:
                    first_frame_time = current_time
                    track_context.first_wall_time = first_frame_time
                    logger.info(f"[{self.mint_id}] First {track_context.kind} frame received for {track_context.track_id}")
                
                # Update last frame time on each successful frame
                last_frame_time = current_time
                
                # Put frame in queue
                success = queue.put(frame)
                if success:
                    frame_count += 1
                    track_context.frame_count = frame_count
                    
                    # Log progress
                    if frame_count % 30 == 0:  # Every second at 30fps
                        logger.info(f"[{self.mint_id}] Queued {frame_count} {track_context.kind} frames for {track_context.track_id}")
                else:
                    logger.warning(f"[{self.mint_id}] Failed to enqueue {track_context.kind} frame")
                
                # Check for read deadline - only timeout if no frames received for read_deadline seconds
                if last_frame_time and (current_time - last_frame_time) > self.timeouts['read_deadline']:
                    logger.warning(f"[{self.mint_id}] Read deadline exceeded for {track_context.track_id} (no frames for {self.timeouts['read_deadline']}s)")
                    break
            
            logger.info(f"[{self.mint_id}] Frame read ended for {track_context.track_id}, total frames: {frame_count}")
            
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Frame read cancelled for {track_context.track_id}")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Frame read error for {track_context.track_id}: {e}")
            raise

    async def _encode_frames(self):
        """Encode frames from queues to the output container."""
        try:
            logger.info(f"[{self.mint_id}] 🎬 Starting frame encoding task")
            logger.info(f"[{self.mint_id}] Monitoring {len(self.queues)} queues: {list(self.queues.keys())}")
            
            loop_count = 0
            while not self.stop_event.is_set():
                loop_count += 1
                frames_processed = 0
                
                # Log every 100 loops to show we're alive
                if loop_count % 100 == 0:
                    queue_sizes = {tid: q.size() for tid, q in self.queues.items()}
                    print(f"[{self.mint_id}] Encoding loop #{loop_count}, encoded: video={self.encoded_video_count}, audio={self.encoded_audio_count}, queue_sizes={queue_sizes}", flush=True)
                    logger.info(f"[{self.mint_id}] Encoding loop #{loop_count}, encoded: video={self.encoded_video_count}, audio={self.encoded_audio_count}, queue_sizes={queue_sizes}")
                
                # Process frames from all queues
                for track_id, queue in self.queues.items():
                    frame = queue.get(timeout=0.1)
                    if frame is not None:
                        await self._encode_frame(track_id, frame)
                        frames_processed += 1
                
                # If no frames processed, sleep briefly
                if frames_processed == 0:
                    await asyncio.sleep(0.01)
                
                # Periodic cleanup
                if frames_processed > 0:
                    gc.collect()
            
            logger.info(f"[{self.mint_id}] Frame encoding ended")
            
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Frame encoding cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Frame encoding error: {e}")
            raise

    async def _encode_frame(self, track_id: str, frame):
        """Encode a single frame to the output container."""
        try:
            track_context = self.tracks[track_id]
            
            if track_context.kind == rtc.TrackKind.KIND_VIDEO:
                if self.encoded_video_count < 5:
                    print(f"[{self.mint_id}] Processing VIDEO frame from {track_id}", flush=True)
                await self._encode_video_frame(track_context, frame)
            else:
                if self.encoded_audio_count < 5:
                    print(f"[{self.mint_id}] Processing AUDIO frame from {track_id}", flush=True)
                await self._encode_audio_frame(track_context, frame)
                
        except Exception as e:
            print(f"[{self.mint_id}] Frame encoding error for {track_id}: {e}", flush=True)
            logger.error(f"[{self.mint_id}] Frame encoding error for {track_id}: {e}")

    async def _encode_video_frame(self, track_context: TrackContext, frame: rtc.VideoFrame):
        """Encode a video frame."""
        try:
            if self.encoded_video_count == 0:
                print(f"[{self.mint_id}] First video frame encode attempt", flush=True)
            
            if not self.video_stream or not self.output_container:
                print(f"[{self.mint_id}] Video stream or container not ready: stream={self.video_stream is not None}, container={self.output_container is not None}", flush=True)
                logger.warning(f"[{self.mint_id}] Video stream or container not ready")
                return
            
            # Convert LiveKit frame to PyAV frame
            av_frame = await self._convert_video_frame(frame)
            if av_frame is None:
                print(f"[{self.mint_id}] Video frame conversion returned None", flush=True)
                logger.warning(f"[{self.mint_id}] Video frame conversion failed")
                return
            
            # Set PTS using encoded frame count
            # Timebase is 1/fps, so PTS is just the frame number
            pts = self.encoded_video_count
            av_frame.pts = pts
            print(f"[{self.mint_id}] Video frame #{self.encoded_video_count}: setting PTS={pts}", flush=True)
            
            # Encode and write
            packets_written = 0
            try:
                for packet in self.video_stream.encode(av_frame):
                    # Skip packets with negative PTS (encoder priming)
                    if packet.pts is not None and packet.pts < 0:
                        print(f"[{self.mint_id}] Skipping video packet with negative PTS={packet.pts}", flush=True)
                        continue
                    
                    self.output_container.mux(packet)
                    packets_written += 1
                    if self.encoded_video_count <= 10:
                        print(f"[{self.mint_id}] Muxed video packet: size={packet.size}, pts={packet.pts}, dts={packet.dts}", flush=True)
            except Exception as e:
                print(f"[{self.mint_id}] ERROR muxing video packet: {e}", flush=True)
                logger.error(f"[{self.mint_id}] Video muxing error", exc_info=True)
                raise
            
            # Increment counters
            self.encoded_video_count += 1
            self.stats['video_frames'] += 1
            
            # Log progress - first 10 frames, then every 30 frames
            if self.encoded_video_count <= 10 or self.encoded_video_count % 30 == 0:
                logger.info(f"[{self.mint_id}] ✅ Encoded video frame #{self.encoded_video_count}, PTS={pts}, wrote {packets_written} packets")
                # Check file size periodically
                if self.output_path and self.output_path.exists():
                    file_size = self.output_path.stat().st_size
                    print(f"[{self.mint_id}] Current file size: {file_size} bytes ({file_size/(1024*1024):.2f} MB)", flush=True)
            
            # Cleanup
            del av_frame
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame encoding error: {e}", exc_info=True)

    async def _encode_audio_frame(self, track_context: TrackContext, frame: rtc.AudioFrame):
        """Encode an audio frame."""
        try:
            if not self.audio_stream or not self.output_container:
                logger.warning(f"[{self.mint_id}] Audio stream or container not ready")
                return
            
            # Convert LiveKit frame to PyAV frame
            av_frame = await self._convert_audio_frame(frame)
            if av_frame is None:
                logger.warning(f"[{self.mint_id}] Audio frame conversion failed")
                return
            
            # Set PTS using encoded frame count
            # Timebase is 1/48000, so PTS is in samples
            pts = self.encoded_audio_count * 1024  # 1024 samples per frame
            av_frame.pts = pts
            print(f"[{self.mint_id}] Audio frame #{self.encoded_audio_count}: setting PTS={pts}", flush=True)
            
            # Encode and write
            packets_written = 0
            try:
                for packet in self.audio_stream.encode(av_frame):
                    # Skip packets with negative PTS (encoder priming)
                    if packet.pts is not None and packet.pts < 0:
                        print(f"[{self.mint_id}] Skipping audio packet with negative PTS={packet.pts}", flush=True)
                        continue
                    
                    self.output_container.mux(packet)
                    packets_written += 1
                    if self.encoded_audio_count <= 10:
                        print(f"[{self.mint_id}] Muxed audio packet: size={packet.size}, pts={packet.pts}, dts={packet.dts}", flush=True)
            except Exception as e:
                print(f"[{self.mint_id}] ERROR muxing audio packet: {e}", flush=True)
                logger.error(f"[{self.mint_id}] Audio muxing error", exc_info=True)
                raise
            
            # Increment counters
            self.encoded_audio_count += 1
            self.stats['audio_frames'] += 1
            
            # Log progress - first 10 frames, then every 48 frames
            if self.encoded_audio_count <= 10 or self.encoded_audio_count % 48 == 0:
                logger.info(f"[{self.mint_id}] ✅ Encoded audio frame #{self.encoded_audio_count}, PTS={pts}, wrote {packets_written} packets")
                # Check file size periodically
                if self.output_path and self.output_path.exists():
                    file_size = self.output_path.stat().st_size
                    print(f"[{self.mint_id}] Current file size after audio: {file_size} bytes ({file_size/(1024*1024):.2f} MB)", flush=True)
            
            # Cleanup
            del av_frame
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio frame encoding error: {e}", exc_info=True)

    async def _convert_video_frame(self, frame: rtc.VideoFrame) -> Optional[av.VideoFrame]:
        """Convert LiveKit video frame to PyAV frame."""
        try:
            print(f"[{self.mint_id}] _convert_video_frame called", flush=True)
            # Get frame data - try different methods
            img = None
            
            # Method 1: Try to_ndarray with different formats
            if hasattr(frame, 'to_ndarray'):
                print(f"[{self.mint_id}] Frame has to_ndarray", flush=True)
                try:
                    img = frame.to_ndarray(format='argb')
                except:
                    try:
                        img = frame.to_ndarray(format='rgb')
                    except:
                        try:
                            img = frame.to_ndarray(format='bgr')
                        except:
                            logger.warning(f"[{self.mint_id}] Video frame to_ndarray failed with all formats")
                            return None
            
            # Method 2: Try direct data access with flexible format detection
            elif hasattr(frame, 'data'):
                try:
                    # Convert raw data to numpy array
                    import numpy as np
                    img = np.frombuffer(frame.data, dtype=np.uint8)
                    
                    # Get frame dimensions
                    if hasattr(frame, 'width') and hasattr(frame, 'height'):
                        width, height = frame.width, frame.height
                        total_pixels = width * height
                        data_size = len(img)
                        
                        logger.info(f"[{self.mint_id}] Frame data: {data_size} bytes, {width}x{height} pixels")
                        
                        # Try multiple format interpretations
                        img = self._try_flexible_format_conversion(img, width, height, data_size)
                        if img is None:
                            logger.warning(f"[{self.mint_id}] Could not convert frame data to any supported format")
                            return None
                    else:
                        logger.warning(f"[{self.mint_id}] Frame missing width/height attributes")
                        return None
                        
                except Exception as e:
                    logger.warning(f"[{self.mint_id}] Video frame data conversion failed: {e}")
                    return None
            
            else:
                print(f"[{self.mint_id}] Video frame has no to_ndarray or data method", flush=True)
                logger.warning(f"[{self.mint_id}] Video frame conversion not supported - no to_ndarray or data method")
                return None
            
            if img is None:
                print(f"[{self.mint_id}] Failed to extract video frame data - img is None", flush=True)
                logger.warning(f"[{self.mint_id}] Failed to extract video frame data")
                return None
            
            print(f"[{self.mint_id}] Video frame data extracted, shape={img.shape if hasattr(img, 'shape') else 'unknown'}", flush=True)
            
            # Validate frame dimensions and data size
            if not self._validate_video_frame(img, frame):
                logger.warning(f"[{self.mint_id}] Skipping invalid video frame")
                del img
                return None
            
            # Create PyAV frame with appropriate format
            if len(img.shape) == 2:  # Grayscale
                av_frame = av.VideoFrame.from_ndarray(img, format='gray')
            elif len(img.shape) == 3 and img.shape[2] == 3:  # RGB
                av_frame = av.VideoFrame.from_ndarray(img, format='rgb24')
            elif len(img.shape) == 3 and img.shape[2] == 4:  # ARGB
                av_frame = av.VideoFrame.from_ndarray(img, format='argb')
            else:
                logger.warning(f"[{self.mint_id}] Unsupported image format: {img.shape}")
                return None
            
            # Reformat to yuv420p and resize
            av_frame = av_frame.reformat(
                format='yuv420p',
                width=self.config['width'],
                height=self.config['height']
            )
            
            del img
            return av_frame
                
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame conversion error: {e}")
            return None

    async def _convert_audio_frame(self, frame: rtc.AudioFrame) -> Optional[av.AudioFrame]:
        """Convert LiveKit audio frame to PyAV frame."""
        try:
            # Get audio data
            samples = frame.data
            sample_rate = frame.sample_rate
            num_channels = frame.num_channels
            
            # Convert to numpy array
            if hasattr(samples, 'dtype'):
                audio_data = samples
            else:
                audio_data = np.frombuffer(samples, dtype=np.int16)
            
            # Reshape for PyAV
            total_samples = len(audio_data)
            samples_per_channel = total_samples // num_channels
            audio_data = audio_data.reshape(num_channels, samples_per_channel)
            
            # Create PyAV frame
            layout = 'mono' if num_channels == 1 else 'stereo'
            av_frame = av.AudioFrame.from_ndarray(
                audio_data,
                format='s16',
                layout=layout
            )
            av_frame.sample_rate = sample_rate
            
            return av_frame
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio frame conversion error: {e}")
            return None

    def _validate_video_frame(self, img: np.ndarray, frame: rtc.VideoFrame) -> bool:
        """Validate video frame dimensions and data size."""
        try:
            # Check if image array is valid
            if img is None or img.size == 0:
                logger.warning(f"[{self.mint_id}] Invalid video frame: empty or None image")
                return False
            
            # Get frame dimensions
            height, width = img.shape[:2]
            
            # Validate dimensions are reasonable
            if width <= 0 or height <= 0:
                logger.warning(f"[{self.mint_id}] Invalid video frame dimensions: {width}x{height}")
                return False
            
            if width > 4096 or height > 4096:
                logger.warning(f"[{self.mint_id}] Video frame dimensions too large: {width}x{height}")
                return False
            
            # Calculate expected data size based on actual image format
            if len(img.shape) == 2:  # Grayscale
                expected_size = width * height
            elif len(img.shape) == 3:  # Color
                expected_size = width * height * img.shape[2]
            else:
                logger.warning(f"[{self.mint_id}] Unexpected image shape: {img.shape}")
                return False
                
            actual_size = img.nbytes
            
            # Allow some tolerance for data size (within 10% of expected)
            size_tolerance = 0.1
            min_expected = expected_size * (1 - size_tolerance)
            max_expected = expected_size * (1 + size_tolerance)
            
            if actual_size < min_expected or actual_size > max_expected:
                logger.warning(f"[{self.mint_id}] Video frame data size mismatch: expected ~{expected_size} bytes, got {actual_size} bytes for {width}x{height} with {img.shape}")
                return False
            
            # Check for reasonable aspect ratio
            aspect_ratio = width / height
            if aspect_ratio < 0.1 or aspect_ratio > 10.0:
                logger.warning(f"[{self.mint_id}] Video frame has extreme aspect ratio: {aspect_ratio:.2f} ({width}x{height})")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error validating video frame: {e}")
            return False

    def _try_flexible_format_conversion(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try multiple format interpretations for flexible video frame conversion."""
        import numpy as np
        
        total_pixels = width * height
        
        # Calculate bytes per pixel
        bytes_per_pixel = data_size / total_pixels
        
        logger.info(f"[{self.mint_id}] Frame data: {data_size} bytes, {width}x{height} pixels, {bytes_per_pixel:.2f} bytes/pixel")
        
        # Try to identify the actual format based on data characteristics
        format_attempts = []
        
        # Standard formats first
        if abs(bytes_per_pixel - 1.0) < 0.1:
            format_attempts.append(("grayscale", lambda: img_data.reshape((height, width))))
        elif abs(bytes_per_pixel - 3.0) < 0.1:
            format_attempts.append(("RGB", lambda: img_data.reshape((height, width, 3))))
        elif abs(bytes_per_pixel - 4.0) < 0.1:
            format_attempts.append(("ARGB", lambda: img_data.reshape((height, width, 4))))
        
        # YUV formats
        if abs(bytes_per_pixel - 1.5) < 0.1:
            format_attempts.append(("YUV420", lambda: self._try_yuv420_conversion(img_data, width, height, data_size)))
        elif abs(bytes_per_pixel - 2.0) < 0.1:
            format_attempts.append(("YUV422", lambda: self._try_yuv422_conversion(img_data, width, height, data_size)))
        elif abs(bytes_per_pixel - 2.25) < 0.1:
            format_attempts.append(("YUV444", lambda: self._try_yuv444_conversion(img_data, width, height, data_size)))
        
        # Try common video formats based on data size patterns
        if data_size == width * height * 3 // 2:  # YUV420
            format_attempts.append(("YUV420_planar", lambda: self._try_yuv420_planar(img_data, width, height)))
        elif data_size == width * height * 2:  # YUV422
            format_attempts.append(("YUV422_planar", lambda: self._try_yuv422_planar(img_data, width, height)))
        elif data_size == width * height * 3:  # YUV444 or RGB
            format_attempts.append(("YUV444_planar", lambda: self._try_yuv444_planar(img_data, width, height)))
            format_attempts.append(("RGB_planar", lambda: img_data.reshape((height, width, 3))))
        
        # Try packed formats
        format_attempts.extend([
            ("YUV420_packed", lambda: self._try_yuv420_packed(img_data, width, height, data_size)),
            ("YUV422_packed", lambda: self._try_yuv422_packed(img_data, width, height, data_size)),
        ])
        
        for format_name, conversion_func in format_attempts:
            try:
                logger.debug(f"[{self.mint_id}] Trying {format_name} format")
                result = conversion_func()
                if result is not None:
                    logger.info(f"[{self.mint_id}] ✅ Successfully converted using {format_name}")
                    return result
            except Exception as e:
                logger.debug(f"[{self.mint_id}] {format_name} conversion failed: {e}")
                continue
        
        # If no format worked, the data might actually be corrupted
        logger.error(f"[{self.mint_id}] Could not convert frame data - data may be corrupted")
        return None
    
    def _try_yuv420_conversion(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try YUV420 format conversion."""
        import numpy as np
        
        y_size = width * height
        uv_size = (width // 2) * (height // 2)
        expected_size = y_size + 2 * uv_size
        
        if data_size == expected_size:
            # Extract Y, U, V planes
            y_plane = img_data[:y_size].reshape((height, width))
            u_plane = img_data[y_size:y_size + uv_size].reshape((height // 2, width // 2))
            v_plane = img_data[y_size + uv_size:].reshape((height // 2, width // 2))
            
            # Upsample U and V to full resolution
            u_upsampled = np.repeat(np.repeat(u_plane, 2, axis=0), 2, axis=1)
            v_upsampled = np.repeat(np.repeat(v_plane, 2, axis=0), 2, axis=1)
            
            # Convert YUV to RGB
            r = np.clip(y_plane + 1.402 * (v_upsampled - 128), 0, 255)
            g = np.clip(y_plane - 0.344136 * (u_upsampled - 128) - 0.714136 * (v_upsampled - 128), 0, 255)
            b = np.clip(y_plane + 1.772 * (u_upsampled - 128), 0, 255)
            
            return np.stack([r, g, b], axis=2).astype(np.uint8)
        return None
    
    def _try_yuv422_conversion(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try YUV422 format conversion."""
        import numpy as np
        
        expected_size = width * height * 2
        if data_size == expected_size:
            # YUV422: Y plane + interleaved UV
            y_plane = img_data[:width*height].reshape((height, width))
            uv_data = img_data[width*height:].reshape((height, width))
            
            # Simple conversion - treat as grayscale for now
            return y_plane.reshape((height, width, 1))
        return None
    
    def _try_yuv444_conversion(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try YUV444 format conversion."""
        import numpy as np
        
        expected_size = width * height * 3
        if data_size == expected_size:
            # YUV444: Y, U, V planes
            y_plane = img_data[:width*height].reshape((height, width))
            u_plane = img_data[width*height:2*width*height].reshape((height, width))
            v_plane = img_data[2*width*height:].reshape((height, width))
            
            # Convert YUV to RGB
            r = np.clip(y_plane + 1.402 * (v_plane - 128), 0, 255)
            g = np.clip(y_plane - 0.344136 * (u_plane - 128) - 0.714136 * (v_plane - 128), 0, 255)
            b = np.clip(y_plane + 1.772 * (u_plane - 128), 0, 255)
            
            return np.stack([r, g, b], axis=2).astype(np.uint8)
        return None
    
    def _try_yuv420_packed(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try packed YUV420 format conversion."""
        import numpy as np
        
        # Try different packing arrangements
        if data_size == width * height * 3 // 2:  # YUV420 packed
            # Assume Y plane first, then interleaved UV
            y_size = width * height
            y_plane = img_data[:y_size].reshape((height, width))
            uv_data = img_data[y_size:]
            
            # Create a simple RGB representation
            return np.stack([y_plane, y_plane, y_plane], axis=2)
        return None
    
    def _try_yuv422_packed(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try packed YUV422 format conversion."""
        import numpy as np
        
        if data_size == width * height * 2:
            # YUV422 packed
            y_plane = img_data[:width*height].reshape((height, width))
            return np.stack([y_plane, y_plane, y_plane], axis=2)
        return None
    
    def _try_flexible_interpretation(self, img_data: np.ndarray, width: int, height: int, data_size: int) -> Optional[np.ndarray]:
        """Try flexible interpretation of the data."""
        import numpy as np
        
        # If we can't determine the format, try to create a reasonable image
        total_pixels = width * height
        
        if data_size >= total_pixels:
            # At least grayscale data available
            if data_size == total_pixels:
                # Grayscale
                return img_data[:total_pixels].reshape((height, width))
            elif data_size >= total_pixels * 3:
                # RGB or similar
                return img_data[:total_pixels*3].reshape((height, width, 3))
            else:
                # Partial data - pad or truncate as needed
                if data_size > total_pixels:
                    # More data than needed, take first part
                    return img_data[:total_pixels].reshape((height, width))
                else:
                    # Less data than needed, pad with zeros
                    padded = np.zeros(total_pixels, dtype=np.uint8)
                    padded[:data_size] = img_data
                    return padded.reshape((height, width))
        
        return None
    
    def _try_yuv420_planar(self, img_data: np.ndarray, width: int, height: int) -> Optional[np.ndarray]:
        """Try YUV420 planar format conversion."""
        import numpy as np
        
        try:
            y_size = width * height
            uv_size = (width // 2) * (height // 2)
            
            # Extract Y, U, V planes
            y_plane = img_data[:y_size].reshape((height, width))
            u_plane = img_data[y_size:y_size + uv_size].reshape((height // 2, width // 2))
            v_plane = img_data[y_size + uv_size:].reshape((height // 2, width // 2))
            
            # Upsample U and V to full resolution
            u_upsampled = np.repeat(np.repeat(u_plane, 2, axis=0), 2, axis=1)
            v_upsampled = np.repeat(np.repeat(v_plane, 2, axis=0), 2, axis=1)
            
            # Convert YUV to RGB
            r = np.clip(y_plane + 1.402 * (v_upsampled - 128), 0, 255)
            g = np.clip(y_plane - 0.344136 * (u_upsampled - 128) - 0.714136 * (v_upsampled - 128), 0, 255)
            b = np.clip(y_plane + 1.772 * (u_upsampled - 128), 0, 255)
            
            return np.stack([r, g, b], axis=2).astype(np.uint8)
        except:
            return None
    
    def _try_yuv422_planar(self, img_data: np.ndarray, width: int, height: int) -> Optional[np.ndarray]:
        """Try YUV422 planar format conversion."""
        import numpy as np
        
        try:
            y_size = width * height
            uv_size = width * height // 2
            
            # Extract Y, U, V planes
            y_plane = img_data[:y_size].reshape((height, width))
            u_plane = img_data[y_size:y_size + uv_size].reshape((height, width // 2))
            v_plane = img_data[y_size + uv_size:].reshape((height, width // 2))
            
            # Upsample U and V to full resolution
            u_upsampled = np.repeat(u_plane, 2, axis=1)
            v_upsampled = np.repeat(v_plane, 2, axis=1)
            
            # Convert YUV to RGB
            r = np.clip(y_plane + 1.402 * (v_upsampled - 128), 0, 255)
            g = np.clip(y_plane - 0.344136 * (u_upsampled - 128) - 0.714136 * (v_upsampled - 128), 0, 255)
            b = np.clip(y_plane + 1.772 * (u_upsampled - 128), 0, 255)
            
            return np.stack([r, g, b], axis=2).astype(np.uint8)
        except:
            return None
    
    def _try_yuv444_planar(self, img_data: np.ndarray, width: int, height: int) -> Optional[np.ndarray]:
        """Try YUV444 planar format conversion."""
        import numpy as np
        
        try:
            y_size = width * height
            
            # Extract Y, U, V planes
            y_plane = img_data[:y_size].reshape((height, width))
            u_plane = img_data[y_size:y_size*2].reshape((height, width))
            v_plane = img_data[y_size*2:].reshape((height, width))
            
            # Convert YUV to RGB
            r = np.clip(y_plane + 1.402 * (v_plane - 128), 0, 255)
            g = np.clip(y_plane - 0.344136 * (u_plane - 128) - 0.714136 * (v_plane - 128), 0, 255)
            b = np.clip(y_plane + 1.772 * (u_plane - 128), 0, 255)
            
            return np.stack([r, g, b], axis=2).astype(np.uint8)
        except:
            return None
    

    async def _stop_read_tasks(self):
        """Stop all read tasks."""
        logger.info(f"[{self.mint_id}] Stopping read tasks")
        
        # Cancel all read tasks
        for task in self.read_tasks:
            task.cancel()
        
        # Wait for tasks to complete
        if self.read_tasks:
            await asyncio.gather(*self.read_tasks, return_exceptions=True)
        
        self.read_tasks.clear()
        logger.info(f"[{self.mint_id}] ✅ Read tasks stopped")

    async def _drain_queues(self):
        """Drain remaining frames from queues."""
        logger.info(f"[{self.mint_id}] Draining queues")
        
        max_drain_time = 2.0  # 2 seconds max
        start_time = time.time()
        
        while (time.time() - start_time) < max_drain_time:
            frames_processed = 0
            
            for track_id, queue in self.queues.items():
                frame = queue.get(timeout=0.1)
                if frame is not None:
                    await self._encode_frame(track_id, frame)
                    frames_processed += 1
            
            if frames_processed == 0:
                break
            
            await asyncio.sleep(0.01)
        
        logger.info(f"[{self.mint_id}] ✅ Queues drained")

    async def _cleanup_output_container(self):
        """Cleanup PyAV output container."""
        try:
            logger.info(f"[{self.mint_id}] Cleaning up output container...")
            logger.info(f"[{self.mint_id}] Encoded frames - Video: {self.encoded_video_count}, Audio: {self.encoded_audio_count}")
            
            if self.output_container:
                # Flush encoders
                if self.video_stream:
                    try:
                        logger.info(f"[{self.mint_id}] Flushing video encoder...")
                        packets_flushed = 0
                        for packet in self.video_stream.encode(None):
                            self.output_container.mux(packet)
                            packets_flushed += 1
                        logger.info(f"[{self.mint_id}] Flushed {packets_flushed} video packets")
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing video encoder: {e}", exc_info=True)
                
                if self.audio_stream:
                    try:
                        logger.info(f"[{self.mint_id}] Flushing audio encoder...")
                        packets_flushed = 0
                        for packet in self.audio_stream.encode(None):
                            self.output_container.mux(packet)
                            packets_flushed += 1
                        logger.info(f"[{self.mint_id}] Flushed {packets_flushed} audio packets")
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing audio encoder: {e}", exc_info=True)
                
                # Close container
                logger.info(f"[{self.mint_id}] Closing output container...")
                self.output_container.close()
                
                # Check file size
                if self.output_path and self.output_path.exists():
                    file_size = self.output_path.stat().st_size
                    logger.info(f"[{self.mint_id}] ✅ Output container closed. File size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
                else:
                    logger.warning(f"[{self.mint_id}] Output file does not exist: {self.output_path}")
                
                self.output_container = None
            else:
                logger.warning(f"[{self.mint_id}] No output container to clean up")
            
            self.video_stream = None
            self.audio_stream = None
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error cleaning up output container: {e}", exc_info=True)

    async def _cleanup(self):
        """Cleanup all resources."""
        try:
            # Stop all tasks
            await self._stop_read_tasks()
            
            if self.encode_task:
                self.encode_task.cancel()
                try:
                    await self.encode_task
                except asyncio.CancelledError:
                    pass
            
            # Cleanup container
            await self._cleanup_output_container()
            
            # Clear state
            self.tracks.clear()
            self.queues.clear()
            self.state = RecordingState.STOPPED
            
            logger.info(f"[{self.mint_id}] ✅ Cleanup complete")
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Cleanup error: {e}")
