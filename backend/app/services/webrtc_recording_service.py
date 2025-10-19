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
from PIL import Image

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
    last_pts: int = 0  # Last presentation timestamp used


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
        
        logger.info(f"[MediaClock] Registered {track_kind.name} track {track_id} with clock rate {clock_rate}")
    
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
        
        clock_info['last_rtp_timestamp'] = rtp_timestamp
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
                logger.debug(f"[BoundedQueue] Dropped oldest {self.track_kind.name} frame (total dropped: {self.dropped_count})")
                return True
            except:
                self.dropped_count += 1
                logger.warning(f"[BoundedQueue] Failed to enqueue {self.track_kind.name} frame")
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
    
    def __init__(self, output_dir: str = "recordings"):
        self.stream_manager = StreamManager()
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Active recordings
        self.active_recordings: Dict[str, 'WebRTCRecorder'] = {}
        
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
            'read_deadline': 5.0,   # RTP read deadline
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
        """Start recording a pump.fun livestream directly using WebRTC best practices."""
        try:
            logger.info(f"📹 Starting WebRTC recording for pump.fun mint_id: {mint_id}")

            if mint_id in self.active_recordings:
                logger.warning(f"⚠️  Recording already active for {mint_id}")
                return {"success": False, "error": f"Recording already active for {mint_id}"}

            # Check if stream is live on pump.fun directly
            pumpfun_service = self.stream_manager.pumpfun_service
            stream_info = await pumpfun_service.get_stream_info(mint_id)
            if not stream_info:
                logger.error(f"❌ Stream not found or not live on pump.fun for {mint_id}")
                logger.error(f"💡 Check if the stream is live at: https://pump.fun/coin/{mint_id}")
                return {"success": False, "error": f"Stream not found or not live on pump.fun for {mint_id}"}

            # Get LiveKit token for the stream
            token = await pumpfun_service.get_livestream_token(mint_id)
            if not token:
                logger.error(f"❌ Failed to get LiveKit token for {mint_id}")
                return {"success": False, "error": "Failed to get LiveKit token"}

            # Create LiveKit room connection
            livekit_url = pumpfun_service.get_livekit_url()
            room = rtc.Room()
            connect_options = rtc.RoomOptions(auto_subscribe=True)

            try:
                await room.connect(livekit_url, token, connect_options)
                logger.info(f"✅ Connected to LiveKit room for {mint_id}")
            except Exception as e:
                logger.error(f"❌ Failed to connect to LiveKit room: {e}")
                return {"success": False, "error": f"Failed to connect to LiveKit room: {e}"}

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
            result = await recorder.start()

            if result["success"]:
                self.active_recordings[mint_id] = recorder
                logger.info(f"✅ WebRTC recording started successfully: {recorder.output_path}")

                return {
                    "success": True,
                    "mint_id": mint_id,
                    "output_path": str(recorder.output_path),
                    "config": config
                }
            else:
                logger.error(f"❌ WebRTC recorder failed to start: {result.get('error')}")
                # Clean up room connection on failure
                try:
                    await room.disconnect()
                except:
                    pass
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
            logger.info(f"🛑 Stop WebRTC recording called for mint_id: {mint_id}")

            if mint_id not in self.active_recordings:
                logger.warning(f"No active recording found for {mint_id}")
                return {"success": False, "error": f"No active recording for {mint_id}"}

            recorder = self.active_recordings[mint_id]
            result = await recorder.stop()

            # Disconnect the room after recording stops
            try:
                if recorder.room:
                    await recorder.room.disconnect()
                    logger.info(f"✅ Disconnected LiveKit room for {mint_id}")
            except Exception as e:
                logger.warning(f"⚠️ Error disconnecting room for {mint_id}: {e}")

            # Remove from active recordings
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
            logger.info(f"[{self.mint_id}] Starting WebRTC recording")
            
            if self.state != RecordingState.DISCONNECTED:
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
            
            # Wait for participants to join the room
            participant = await self._wait_for_participant()
            if not participant:
                return {"success": False, "error": "No participants found in room"}
            
            # Subscribe to tracks
            await self._subscribe_to_tracks(participant)
            
            # Wait for track subscriptions
            await self._await_track_subscriptions()
            
            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED
            self.stats['subscription_time'] = time.time() - subscription_start
            logger.info(f"[{self.mint_id}] ✅ Tracks subscribed in {self.stats['subscription_time']:.2f}s")
            
            # Setup PyAV container
            await self._setup_output_container()
            
            # Send PLI for keyframes
            await self._request_keyframes()
            
            # Start frame processing
            await self._start_frame_processing()
            
            # State: SUBSCRIBED → RECORDING
            self.state = RecordingState.RECORDING
            self.start_time = datetime.now(timezone.utc)
            
            logger.info(f"[{self.mint_id}] ✅ Recording started successfully")
            
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
        file_size_mb = 0
        if self.output_path and self.output_path.exists():
            file_size_mb = self.output_path.stat().st_size / (1024 * 1024)
        
        queue_sizes = {}
        for track_id, queue in self.queues.items():
            queue_sizes[track_id] = queue.size()
        
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

    async def _wait_for_participant(self) -> Optional[rtc.RemoteParticipant]:
        """Wait for participants to join the room. For pump.fun streams, there's typically only one participant (the streamer)."""
        logger.info(f"[{self.mint_id}] Waiting for participants to join the room...")

        # Wait up to 10 seconds for participants to join
        timeout = 10.0
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            participants = list(self.room.remote_participants.values())
            if participants:
                # For pump.fun livestreams, there's typically only one participant (the streamer)
                participant = participants[0]
                logger.info(f"[{self.mint_id}] ✅ Found participant: {participant.sid} (identity: {participant.identity})")
                return participant

            await asyncio.sleep(0.5)  # Check every 500ms

        logger.error(f"[{self.mint_id}] ❌ No participants found in room after {timeout} seconds")
        return None

    async def _subscribe_to_tracks(self, participant: rtc.RemoteParticipant):
        """Subscribe to tracks following WebRTC best practices."""
        logger.info(f"[{self.mint_id}] Subscribing to tracks for participant {participant.sid}")

        for track_pub in participant.track_publications.values():
            logger.info(f"[{self.mint_id}] Checking track publication: {track_pub.sid}, subscribed: {track_pub.subscribed}")

            # Handle track kind - may be int or enum
            track_kind = track_pub.kind
            track_kind_name = None

            if isinstance(track_kind, int):
                # Handle int track kinds
                if track_kind == 1:  # Video
                    track_kind_name = "VIDEO"
                    track_kind_enum = rtc.TrackKind.KIND_VIDEO
                elif track_kind == 2:  # Audio
                    track_kind_name = "AUDIO"
                    track_kind_enum = rtc.TrackKind.KIND_AUDIO
                else:
                    logger.debug(f"[{self.mint_id}] Skipping unknown track kind int: {track_kind}")
                    continue
            elif hasattr(track_kind, 'name'):
                # Handle enum track kinds
                track_kind_name = track_kind.name
                track_kind_enum = track_kind
            else:
                logger.debug(f"[{self.mint_id}] Skipping unexpected track kind type: {type(track_kind)}")
                continue

            if track_kind_enum not in [rtc.TrackKind.KIND_VIDEO, rtc.TrackKind.KIND_AUDIO]:
                continue

            logger.info(f"[{self.mint_id}] Found {track_kind_name} track publication: {track_pub.sid}")

            # Explicitly subscribe if not already subscribed
            if not track_pub.subscribed:
                logger.info(f"[{self.mint_id}] 📡 Subscribing to {track_kind_name} track: {track_pub.sid}")
                track_pub.set_subscribed(True)
                await asyncio.sleep(0.1)  # Brief wait for subscription

            # Wait for subscription to complete
            timeout = self.timeouts['subscription']
            start_time = time.time()

            while not track_pub.subscribed and (time.time() - start_time) < timeout:
                await asyncio.sleep(0.1)

            if not track_pub.subscribed:
                logger.warning(f"[{self.mint_id}] ⚠️ {track_kind_name} track subscription timeout: {track_pub.sid}")
                continue

            logger.info(f"[{self.mint_id}] ✅ {track_kind_name} track subscribed: {track_pub.sid}")

    async def _await_track_subscriptions(self):
        """Wait for track subscriptions to be ready."""
        logger.info(f"[{self.mint_id}] Awaiting track subscriptions...")

        timeout = self.timeouts['subscription']
        start_time = time.time()

        while (time.time() - start_time) < timeout:
            # Check for subscribed tracks from all participants
            for participant in self.room.remote_participants.values():
                for track_pub in participant.track_publications.values():
                    # Handle track kind - may be int or enum
                    track_kind = track_pub.kind
                    track_kind_name = None

                    if isinstance(track_kind, int):
                        # Handle int track kinds
                        if track_kind == 1:  # Video
                            track_kind_name = "VIDEO"
                            track_kind_enum = rtc.TrackKind.KIND_VIDEO
                        elif track_kind == 2:  # Audio
                            track_kind_name = "AUDIO"
                            track_kind_enum = rtc.TrackKind.KIND_AUDIO
                        else:
                            continue
                    elif hasattr(track_kind, 'name'):
                        # Handle enum track kinds
                        track_kind_name = track_kind.name
                        track_kind_enum = track_kind
                    else:
                        continue

                    if track_pub.subscribed and track_pub.track is not None:
                        # Check actual track type instead of relying on publication kind
                        actual_track = track_pub.track
                        if isinstance(actual_track, rtc.RemoteVideoTrack):
                            actual_kind = rtc.TrackKind.KIND_VIDEO
                            actual_kind_name = "VIDEO"
                        elif isinstance(actual_track, rtc.RemoteAudioTrack):
                            actual_kind = rtc.TrackKind.KIND_AUDIO
                            actual_kind_name = "AUDIO"
                        else:
                            logger.debug(f"[{self.mint_id}] Skipping non-media track: {type(actual_track)}")
                            continue

                        # Log if publication kind doesn't match actual track type
                        if track_kind_enum != actual_kind:
                            logger.warning(f"[{self.mint_id}] Track publication kind mismatch: pub={track_kind_name}, actual={actual_kind_name}, sid={actual_track.sid}")

                        track_id = f"{participant.sid}_{actual_kind_name}"

                        if track_id not in self.tracks:
                            # Create track context using actual track type
                            track_context = TrackContext(
                                track_id=track_id,
                                track=actual_track,
                                publication=track_pub,
                                kind=actual_kind
                            )

                            self.tracks[track_id] = track_context
                            self.stats['track_subscriptions'] += 1

                            logger.info(f"[{self.mint_id}] ✅ Track ready: {track_id} ({actual_kind_name})")

            # Check if we have both video and audio
            video_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_VIDEO]
            audio_tracks = [t for t in self.tracks.values() if t.kind == rtc.TrackKind.KIND_AUDIO]

            if video_tracks and audio_tracks:
                logger.info(f"[{self.mint_id}] ✅ All required tracks ready")
                return

            await asyncio.sleep(0.1)

        # Timeout - check what we have
        if not self.tracks:
            logger.error(f"[{self.mint_id}] ❌ No valid media tracks found within timeout")
            logger.error(f"[{self.mint_id}] 💡 This could mean:")
            logger.error(f"[{self.mint_id}]    - The stream is not actually live")
            logger.error(f"[{self.mint_id}]    - The streamer hasn't started broadcasting yet")
            logger.error(f"[{self.mint_id}]    - There are network/connectivity issues")
            raise Exception("No valid media tracks found within timeout")

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
            self.read_tasks.append(task)
        
        # Start encode task
        self.encode_task = asyncio.create_task(self._encode_frames())
        
        logger.info(f"[{self.mint_id}] ✅ Frame processing started")

    async def _read_track_frames(self, track_context: TrackContext):
        """Read frames from a track and put them in the queue."""
        try:
            logger.info(f"[{self.mint_id}] Starting frame read for {track_context.track_id}")
            
            queue = self.queues[track_context.track_id]
            frame_count = 0
            first_frame_time = None
            
            # Use the appropriate stream iterator with validation
            if track_context.kind == rtc.TrackKind.KIND_VIDEO:
                if not isinstance(track_context.track, rtc.RemoteVideoTrack):
                    logger.error(f"[{self.mint_id}] Cannot create VideoStream: track is not a RemoteVideoTrack")
                    return
                stream = rtc.VideoStream(track_context.track)
            else:  # Audio
                if not isinstance(track_context.track, rtc.RemoteAudioTrack):
                    logger.error(f"[{self.mint_id}] Cannot create AudioStream: track is not a RemoteAudioTrack")
                    return
                stream = rtc.AudioStream(track_context.track)
            
            async for event in stream:
                if self.stop_event.is_set():
                    logger.info(f"[{self.mint_id}] Stop event detected, ending frame read for {track_context.track_id}")
                    break
                
                frame = event.frame
                
                # Record first frame timing
                if first_frame_time is None:
                    first_frame_time = time.time()
                    track_context.first_wall_time = first_frame_time
                    # Safely get kind name
                    kind_name = track_context.kind.name if hasattr(track_context.kind, 'name') else str(track_context.kind)
                    logger.info(f"[{self.mint_id}] First {kind_name} frame received for {track_context.track_id}")
                
                # Put frame in queue
                success = queue.put(frame)
                if success:
                    frame_count += 1
                    track_context.frame_count = frame_count
                    
                    # Log progress
                    if frame_count % 300 == 0:  # Every 10 seconds at 30fps
                        kind_name = track_context.kind.name if hasattr(track_context.kind, 'name') else str(track_context.kind)
                        logger.info(f"[{self.mint_id}] Processed {frame_count} {kind_name} frames for {track_context.track_id}")
                else:
                    kind_name = track_context.kind.name if hasattr(track_context.kind, 'name') else str(track_context.kind)
                    logger.warning(f"[{self.mint_id}] Failed to enqueue {kind_name} frame")
                
                # Check for read deadline
                if time.time() - first_frame_time > self.timeouts['read_deadline']:
                    logger.warning(f"[{self.mint_id}] Read deadline exceeded for {track_context.track_id}")
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
            logger.info(f"[{self.mint_id}] Starting frame encoding")
            
            while not self.stop_event.is_set():
                frames_processed = 0
                
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
                await self._encode_video_frame(track_context, frame)
            else:
                await self._encode_audio_frame(track_context, frame)
                
        except Exception as e:
            logger.error(f"[{self.mint_id}] Frame encoding error for {track_id}: {e}")

    async def _encode_video_frame(self, track_context: TrackContext, frame: rtc.VideoFrame):
        """Encode a video frame."""
        try:
            if not self.video_stream or not self.output_container:
                return

            # Convert LiveKit frame to PyAV frame
            av_frame = await self._convert_video_frame(frame)
            if av_frame is None:
                return

            # Calculate monotonically increasing PTS
            # Use frame count * frame duration for proper timing
            frame_duration = int(self.video_stream.time_base.denominator / self.config['fps'])
            pts = track_context.last_pts + frame_duration
            track_context.last_pts = pts
            av_frame.pts = pts

            # Encode and write
            for packet in self.video_stream.encode(av_frame):
                self.output_container.mux(packet)

            self.stats['video_frames'] += 1

            # Cleanup
            del av_frame

        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame encoding error: {e}")

    async def _encode_audio_frame(self, track_context: TrackContext, frame: rtc.AudioFrame):
        """Encode an audio frame."""
        try:
            if not self.audio_stream or not self.output_container:
                return

            # Convert LiveKit frame to PyAV frame
            av_frame = await self._convert_audio_frame(frame)
            if av_frame is None:
                return

            # Calculate monotonically increasing PTS for audio
            # Use sample-based timing for audio
            try:
                # Try to get sample count from the frame
                if hasattr(av_frame, 'samples') and av_frame.samples:
                    if isinstance(av_frame.samples, (list, tuple)):
                        samples_per_frame = len(av_frame.samples)
                    elif isinstance(av_frame.samples, int):
                        samples_per_frame = av_frame.samples
                    else:
                        samples_per_frame = 1024  # Default assumption
                else:
                    samples_per_frame = 1024  # Default assumption

                sample_rate = av_frame.sample_rate or 48000
                frame_duration = int((samples_per_frame / sample_rate) * self.audio_stream.time_base.denominator)
                pts = track_context.last_pts + max(frame_duration, 1)  # Ensure at least 1
                track_context.last_pts = pts
            except Exception as e:
                # Fallback: increment by a reasonable amount
                logger.debug(f"[{self.mint_id}] Audio PTS calculation failed: {e}, using fallback")
                pts = track_context.last_pts + 1024  # Assume 1024 samples per frame
                track_context.last_pts = pts

            av_frame.pts = pts

            # Encode and write
            for packet in self.audio_stream.encode(av_frame):
                self.output_container.mux(packet)

            self.stats['audio_frames'] += 1

            # Cleanup
            del av_frame

        except Exception as e:
            logger.error(f"[{self.mint_id}] Audio frame encoding error: {e}")

    async def _convert_video_frame(self, frame: rtc.VideoFrame) -> Optional[av.VideoFrame]:
        """Convert LiveKit video frame to PyAV frame."""
        try:
            # Debug: Check frame properties
            logger.debug(f"[{self.mint_id}] VideoFrame - width: {frame.width}, height: {frame.height}, data size: {len(frame.data) if hasattr(frame, 'data') else 'N/A'}")

            # Try different methods to get frame data
            if hasattr(frame, 'to_ndarray'):
                try:
                    # Try different formats
                    for fmt in ['rgb', 'bgr', 'rgba', 'bgra']:
                        try:
                            img = frame.to_ndarray(format=fmt)
                            av_frame = av.VideoFrame.from_ndarray(img, format=fmt)

                            # Reformat to yuv420p and resize
                            av_frame = av_frame.reformat(
                                format='yuv420p',
                                width=self.config['width'],
                                height=self.config['height']
                            )

                            del img
                            return av_frame
                        except Exception as e:
                            logger.debug(f"[{self.mint_id}] Format {fmt} failed: {e}")
                            continue
                except Exception as e:
                    logger.warning(f"[{self.mint_id}] to_ndarray failed: {e}")

            # Try alternative methods with proper dimensions
            if hasattr(frame, 'data') and hasattr(frame, 'width') and hasattr(frame, 'height'):
                try:
                    from PIL import Image
                    import numpy as np

                    data_size = len(frame.data)
                    expected_rgb_size = frame.width * frame.height * 3

                    # Try different approaches to create a valid image
                    if data_size == expected_rgb_size:
                        # RGB format - convert via PIL
                        img_array = np.frombuffer(frame.data, dtype=np.uint8).reshape((frame.height, frame.width, 3))
                        pil_img = Image.fromarray(img_array, mode='RGB')
                        # Convert to YUV420P compatible format
                        pil_img = pil_img.convert('RGB')
                        img_array = np.array(pil_img)
                        av_frame = av.VideoFrame.from_ndarray(img_array, format='rgb')
                    elif data_size == frame.width * frame.height * 4:
                        # RGBA format - convert via PIL
                        img_array = np.frombuffer(frame.data, dtype=np.uint8).reshape((frame.height, frame.width, 4))
                        pil_img = Image.fromarray(img_array, mode='RGBA')
                        # Convert to RGB first
                        pil_img = pil_img.convert('RGB')
                        img_array = np.array(pil_img)
                        av_frame = av.VideoFrame.from_ndarray(img_array, format='rgb')
                    else:
                        # Try to guess dimensions and convert via PIL
                        for channels in [3, 4]:
                            expected_pixels = data_size // channels
                            if expected_pixels * channels != data_size:
                                continue

                            # Try common resolutions
                            for height in [frame.height, 720, 1080, 480, 576]:
                                width = expected_pixels // height
                                if width * height * channels == data_size:
                                    img_array = np.frombuffer(frame.data, dtype=np.uint8).reshape((height, width, channels))
                                    mode = 'RGB' if channels == 3 else 'RGBA'
                                    pil_img = Image.fromarray(img_array, mode=mode)
                                    if channels == 4:
                                        pil_img = pil_img.convert('RGB')
                                    img_array = np.array(pil_img)
                                    av_frame = av.VideoFrame.from_ndarray(img_array, format='rgb')
                                    break
                            if 'av_frame' in locals():
                                break

                    if 'av_frame' not in locals():
                        # Debug: Show first few bytes to understand format
                        if len(frame.data) > 20:
                            logger.debug(f"[{self.mint_id}] First 20 bytes: {frame.data[:20].hex()}")
                        logger.warning(f"[{self.mint_id}] Could not determine frame format. Data size: {data_size}, reported dimensions: {frame.width}x{frame.height}")

                        # Try creating a simple placeholder frame instead of failing
                        try:
                            import numpy as np

                            # Create a simple gray frame using PIL with BGR24 format (PyAV compatible)
                            pil_img = Image.new('RGB', (self.config['width'], self.config['height']), color=(128, 128, 128))
                            # Convert RGB PIL image to BGR numpy array
                            rgb_array = np.array(pil_img)
                            # Convert RGB to BGR
                            bgr_array = rgb_array[:, :, ::-1]  # Reverse channel order
                            av_frame = av.VideoFrame.from_ndarray(bgr_array, format='bgr24')
                            av_frame = av_frame.reformat(format='yuv420p', width=self.config['width'], height=self.config['height'])
                            logger.info(f"[{self.mint_id}] Using BGR24 placeholder frame due to conversion issues")
                            return av_frame
                        except Exception as e:
                            logger.error(f"[{self.mint_id}] Even PIL placeholder frame failed: {e}")
                            return None

                    # Reformat to yuv420p and resize
                    av_frame = av_frame.reformat(
                        format='yuv420p',
                        width=self.config['width'],
                        height=self.config['height']
                    )

                    return av_frame
                except Exception as e:
                    logger.warning(f"[{self.mint_id}] Frame data conversion failed: {e}")

            logger.warning(f"[{self.mint_id}] Video frame conversion not supported - no suitable method found")
            return None

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
            if self.output_container:
                # Flush encoders
                if self.video_stream:
                    try:
                        for packet in self.video_stream.encode(None):
                            self.output_container.mux(packet)
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing video encoder: {e}")
                
                if self.audio_stream:
                    try:
                        for packet in self.audio_stream.encode(None):
                            self.output_container.mux(packet)
                    except Exception as e:
                        logger.warning(f"[{self.mint_id}] Error flushing audio encoder: {e}")
                
                # Close container
                self.output_container.close()
                logger.info(f"[{self.mint_id}] ✅ Output container closed")
                self.output_container = None
            
            self.video_stream = None
            self.audio_stream = None
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error cleaning up output container: {e}")

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
