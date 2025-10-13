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

        # Shutdown flag
        self._shutdown = False
        
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
            if self._shutdown:
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

            # Give frame polling time to start and receive frames
            logger.info(f"[{self.mint_id}] ⏳ Waiting for frame polling to start and receive frames...")
            await asyncio.sleep(2.0)  # Give frame polling 2 seconds to start and receive frames

            # Check if we received any frames after giving frame polling time
            if self.video_frames_received == 0:
                logger.warning(f"[{self.mint_id}] ⚠️  No video frames received after 2s - frame polling may still be starting")
            else:
                logger.info(f"[{self.mint_id}] ✅ Received {self.video_frames_received} video frames during initialization")

            # Check LiveKit room connection status
            if not self.room.isconnected():
                logger.error(f"[{self.mint_id}] LiveKit room disconnected - stopping recording")
                await self._cleanup()
                return {"success": False, "error": "LiveKit room disconnected"}

            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED

            # Setup PyAV container
            await self._setup_container()

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
            self._shutdown = True

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
        if self.container:
            recording_mode = "aiortc"
            logger.info(f"[{self.mint_id}] PyAV container active")

            # Check if output file exists and its size
            if self.output_path and self.output_path.exists():
                file_size = self.output_path.stat().st_size
                logger.info(f"[{self.mint_id}] PyAV output file size: {file_size} bytes")
            else:
                logger.warning(f"[{self.mint_id}] PyAV output file does not exist: {self.output_path}")
        else:
            recording_mode = "none"
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
        if not hasattr(self, '_polling_started'):
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
            
            logger.info(f"[{self.mint_id}] 🔄 Starting VideoStream iteration...")
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
                        self._shutdown = True
                        return
                
                last_frame_time = current_time
                
                if self._shutdown:
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
                self._shutdown = True
        finally:
            logger.info(f"[{self.mint_id}] Video stream processing ended. Total frames: {frame_count}")

    async def _process_audio_stream(self):
        """Process audio frames using rtc.AudioStream (proven approach)."""
        try:
            logger.info(f"[{self.mint_id}] 🎵 Starting audio stream processing")
            frame_count = 0
            
            async for event in rtc.AudioStream(self.audio_track):
                if self._shutdown:
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
        """Setup PyAV container for recording."""
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

            logger.info(f"[{self.mint_id}] ✅ PyAV container setup complete")

        except Exception as e:
            logger.error(f"[{self.mint_id}] ❌ Failed to setup PyAV container: {e}")
            if self.container:
                self.container.close()
                self.container = None
            raise Exception(f"Failed to setup PyAV container: {e}")

    async def _close_container(self):
        """Close PyAV container and finalize recording."""
        if self.container:
            try:
                logger.info(f"[{self.mint_id}] Closing PyAV container")
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
        if self._shutdown:
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
            
            # Convert LiveKit frame to RGB24 numpy array (using the working approach)
            # Get the frame data directly from the buffer like the working implementation
            frame_data = None
            try:
                # Get the frame buffer directly (like the working implementation)
                buffer = frame.data
                width = frame.width
                height = frame.height
                
                logger.info(f"[{self.mint_id}] Frame dimensions: {width}x{height}, buffer type: {type(buffer)}")
                logger.info(f"[{self.mint_id}] Buffer length: {len(buffer) if hasattr(buffer, '__len__') else 'unknown'}")
                
                # Convert buffer to numpy array
                if hasattr(buffer, 'dtype'):
                    # Already a numpy array
                    frame_data = buffer
                    logger.info(f"[{self.mint_id}] Buffer is already numpy array: {frame_data.shape}")
                else:
                    # Convert memoryview/buffer to numpy array
                    frame_data = np.frombuffer(buffer, dtype=np.uint8)
                logger.info(f"[{self.mint_id}] Converted buffer to numpy array: {frame_data.shape}")
                logger.info(f"[{self.mint_id}] Frame data size: {len(frame_data)} bytes")
                    
                # Determine frame format based on size
                rgb_size = width * height * 3
                yuv420_size = width * height * 3 // 2  # YUV420 is 1.5 bytes per pixel
                yuv422_size = width * height * 2
                logger.info(f"[{self.mint_id}] Expected sizes: RGB={rgb_size}, YUV420={yuv420_size}, YUV422={yuv422_size}")
                
                # Determine frame format based on actual size
                actual_size = len(frame_data)
                frame_format = None
                
                # Calculate bytes per pixel for analysis
                bytes_per_pixel = actual_size / (width * height)
                logger.info(f"[{self.mint_id}] 📊 Frame analysis: {actual_size} bytes, {bytes_per_pixel:.2f} bytes/pixel")
                
                # Check for exact matches first
                if actual_size == rgb_size:
                    frame_format = "RGB"
                    logger.info(f"[{self.mint_id}] 📹 Detected RGB format: {actual_size} bytes")
                elif actual_size == yuv420_size:
                    frame_format = "YUV420"
                    logger.info(f"[{self.mint_id}] 📹 Detected YUV420 format: {actual_size} bytes")
                elif actual_size == yuv422_size:
                    frame_format = "YUV422"
                    logger.info(f"[{self.mint_id}] 📹 Detected YUV422 format: {actual_size} bytes")
                # Check for approximate matches (within 5% tolerance)
                elif abs(actual_size - rgb_size) / rgb_size < 0.05:
                    frame_format = "RGB_APPROX"
                    logger.info(f"[{self.mint_id}] 📹 Detected RGB-like format: {actual_size} bytes (expected {rgb_size})")
                elif abs(actual_size - yuv420_size) / yuv420_size < 0.05:
                    frame_format = "YUV420_APPROX"
                    logger.info(f"[{self.mint_id}] 📹 Detected YUV420-like format: {actual_size} bytes (expected {yuv420_size})")
                elif abs(actual_size - yuv422_size) / yuv422_size < 0.05:
                    frame_format = "YUV422_APPROX"
                    logger.info(f"[{self.mint_id}] 📹 Detected YUV422-like format: {actual_size} bytes (expected {yuv422_size})")
                # Check for intermediate formats
                elif 2.0 <= bytes_per_pixel <= 2.5:
                    frame_format = "YUV422_INTERMEDIATE"
                    logger.info(f"[{self.mint_id}] 📹 Detected intermediate YUV422 format: {actual_size} bytes ({bytes_per_pixel:.2f} bytes/pixel)")
                elif 2.5 < bytes_per_pixel <= 3.0:
                    frame_format = "RGB_INTERMEDIATE"
                    logger.info(f"[{self.mint_id}] 📹 Detected intermediate RGB format: {actual_size} bytes ({bytes_per_pixel:.2f} bytes/pixel)")
                else:
                    logger.error(f"[{self.mint_id}] ❌ Unknown frame format: {actual_size} bytes ({bytes_per_pixel:.2f} bytes/pixel)")
                    logger.error(f"[{self.mint_id}] Expected: RGB={rgb_size}, YUV420={yuv420_size}, YUV422={yuv422_size}")
                    return
                
                logger.info(f"[{self.mint_id}] Frame size analysis:")
                logger.info(f"[{self.mint_id}] - RGB size: {rgb_size}")
                logger.info(f"[{self.mint_id}] - YUV420 size: {yuv420_size}")
                logger.info(f"[{self.mint_id}] - YUV422 size: {yuv422_size}")
                logger.info(f"[{self.mint_id}] - Actual size: {len(frame_data)}")
                
                # Convert frame based on detected format
                if frame_format in ["RGB", "RGB_APPROX", "RGB_INTERMEDIATE"]:
                    # RGB format (exact, approximate, or intermediate)
                    if frame_format == "RGB_INTERMEDIATE":
                        # For intermediate RGB, we might need to pad or truncate
                        expected_size = height * width * 3
                        if actual_size < expected_size:
                            # Pad with zeros
                            padding = np.zeros(expected_size - actual_size, dtype=np.uint8)
                            frame_data = np.concatenate([frame_data, padding])
                            logger.info(f"[{self.mint_id}] 📹 Padded intermediate RGB frame")
                        elif actual_size > expected_size:
                            # Truncate
                            frame_data = frame_data[:expected_size]
                            logger.info(f"[{self.mint_id}] 📹 Truncated intermediate RGB frame")
                    
                    frame_data = frame_data.reshape(height, width, 3)
                    logger.info(f"[{self.mint_id}] ✅ Frame interpreted as RGB: {frame_data.shape}")
                elif frame_format in ["YUV420", "YUV420_APPROX"]:
                    # YUV420 format - convert to RGB
                    logger.info(f"[{self.mint_id}] ✅ Frame interpreted as YUV420, converting to RGB")
                    # YUV420 has Y plane (width*height) + U plane (width*height/4) + V plane (width*height/4)
                    y_size = width * height
                    uv_size = width * height // 4
                    
                    y_plane = frame_data[:y_size].reshape(height, width)
                    u_plane = frame_data[y_size:y_size + uv_size].reshape(height // 2, width // 2)
                    v_plane = frame_data[y_size + uv_size:y_size + 2 * uv_size].reshape(height // 2, width // 2)
                    
                    # Memory-optimized YUV420 to RGB conversion
                    try:
                        # Upsample U and V planes to full resolution
                        u_upsampled = np.repeat(np.repeat(u_plane, 2, axis=0), 2, axis=1)
                        v_upsampled = np.repeat(np.repeat(v_plane, 2, axis=0), 2, axis=1)
                        
                        # Convert YUV to RGB (memory-optimized)
                        y = y_plane.astype(np.float32)
                        u = u_upsampled.astype(np.float32) - 128
                        v = v_upsampled.astype(np.float32) - 128
                        
                        r = np.clip(y + 1.402 * v, 0, 255).astype(np.uint8)
                        g = np.clip(y - 0.344136 * u - 0.714136 * v, 0, 255).astype(np.uint8)
                        b = np.clip(y + 1.772 * u, 0, 255).astype(np.uint8)
                        
                        frame_data = np.stack([r, g, b], axis=2)
                        
                        # Free intermediate arrays immediately
                        del u_upsampled, v_upsampled, y, u, v, r, g, b
                        
                        logger.info(f"[{self.mint_id}] ✅ YUV420 converted to RGB: {frame_data.shape}")
                        
                    except MemoryError as e:
                        logger.error(f"[{self.mint_id}] ❌ Memory error during YUV420 conversion: {e}")
                        logger.error(f"[{self.mint_id}] Skipping frame due to memory constraints")
                        return
                elif frame_format in ["YUV422", "YUV422_APPROX", "YUV422_INTERMEDIATE"]:
                    # YUV422 format (exact, approximate, or intermediate)
                    logger.info(f"[{self.mint_id}] ✅ Frame interpreted as YUV422")
                    
                    if frame_format == "YUV422_INTERMEDIATE":
                        # For intermediate YUV422, we might need to pad or truncate
                        expected_size = height * width * 2
                        if actual_size < expected_size:
                            # Pad with zeros
                            padding = np.zeros(expected_size - actual_size, dtype=np.uint8)
                            frame_data = np.concatenate([frame_data, padding])
                            logger.info(f"[{self.mint_id}] 📹 Padded intermediate YUV422 frame")
                        elif actual_size > expected_size:
                            # Truncate
                            frame_data = frame_data[:expected_size]
                            logger.info(f"[{self.mint_id}] 📹 Truncated intermediate YUV422 frame")
                    
                    # For now, treat as grayscale and convert to RGB
                    frame_data = frame_data.reshape(height, width, 2)
                    # Take only Y channel and replicate for RGB
                    y_channel = frame_data[:, :, 0]
                    frame_data = np.stack([y_channel, y_channel, y_channel], axis=2)
                    logger.info(f"[{self.mint_id}] ✅ YUV422 converted to RGB: {frame_data.shape}")
                else:
                    logger.error(f"[{self.mint_id}] ❌ Unknown frame format: {frame_format}")
                    return
                    
            except Exception as e:
                logger.warning(f"[{self.mint_id}] Failed to convert frame: {e}")
                return
            
            if frame_data is None:
                logger.warning(f"[{self.mint_id}] No frame data available")
                return
            
            # Convert to bytes for FFmpeg (streaming approach to reduce memory)
            if len(frame_data.shape) == 3 and frame_data.shape[2] in [3, 4]:  # RGB or RGBA
                # Handle dynamic resolution - update config with actual dimensions
                actual_height, actual_width = frame_data.shape[:2]
                expected_height, expected_width = self.config['height'], self.config['width']
                
                # If dimensions don't match, update the config for dynamic resolution
                if actual_height != expected_height or actual_width != expected_width:
                    logger.info(f"[{self.mint_id}] Dynamic resolution detected: {actual_width}x{actual_height} (was {expected_width}x{expected_height})")
                    self.config['width'] = actual_width
                    self.config['height'] = actual_height
                
                # Convert to uint8 and get bytes in one step to avoid intermediate copies
                frame_bytes = frame_data.astype(np.uint8).tobytes()
                
                # Validate frame size with strict corruption detection
                expected_size = actual_width * actual_height * 3  # RGB24
                size_ratio = len(frame_bytes) / expected_size
                
                # Check for exact size match first
                if len(frame_bytes) == expected_size:
                    logger.debug(f"[{self.mint_id}] Frame size correct: {len(frame_bytes)} bytes")
                # Check for frames that are close to expected size but corrupted (80-95% range)
                elif 0.8 <= size_ratio <= 0.95:
                    logger.error(f"[{self.mint_id}] Frame size suspicious: {len(frame_bytes)} bytes ({size_ratio:.1%} of expected {expected_size})")
                    logger.error(f"[{self.mint_id}] This indicates frame corruption - skipping to prevent FFmpeg failure")
                    del frame_data
                    return
                # Check for frames that are too small or too large
                elif size_ratio < 0.5 or size_ratio > 2.0:
                    logger.error(f"[{self.mint_id}] Frame size invalid: {len(frame_bytes)} bytes ({size_ratio:.1%} of expected {expected_size})")
                    logger.error(f"[{self.mint_id}] Skipping corrupt frame to prevent FFmpeg failure")
                    del frame_data
                    return
                else:
                    # Frame size is acceptable but not exact (95-200% range)
                    logger.warning(f"[{self.mint_id}] Frame size acceptable but not exact: {len(frame_bytes)} bytes ({size_ratio:.1%} of expected {expected_size})")
                    # Continue processing - this might be a valid frame with slight size variation
                
                # Additional validation: check for all-zero or all-same-value frames
                if np.all(frame_data == 0) or np.all(frame_data == frame_data.flat[0]):
                    logger.warning(f"[{self.mint_id}] Detected suspicious frame (all zeros or same value)")
                    # Still process it, but log the warning
                
                # Validate frame data integrity before sending to FFmpeg
                if len(frame_bytes) == 0:
                    logger.error(f"[{self.mint_id}] Empty frame data - skipping")
                    del frame_data
                    return
                
                # Check for frame data corruption patterns
                if len(frame_bytes) < expected_size * 0.5:  # Less than half expected size
                    logger.error(f"[{self.mint_id}] Frame data too small - likely corrupted")
                    del frame_data
                    return
                
                # Check for frame data that's too large (indicates corruption)
                if len(frame_bytes) > expected_size * 2:  # More than double expected size
                    logger.error(f"[{self.mint_id}] Frame data too large - likely corrupted")
                    del frame_data
                    return
                
                # Validate frame data has reasonable pixel values (not all 0 or 255)
                if len(frame_bytes) > 0:
                    unique_bytes = len(set(frame_bytes))
                    if unique_bytes < 10:  # Less than 10 unique byte values suggests corruption
                        logger.warning(f"[{self.mint_id}] Frame has only {unique_bytes} unique byte values - may be corrupted")
                        # Still process it, but log the warning
                
                # Immediately free the numpy array to reduce memory pressure
                del frame_data
                
                # PyAV mode: encode and mux frame to container
                if self.container and self.video_stream:
                    try:
                        # Convert RGB frame to YUV420P for encoding
                        rgb_frame = frame_data.astype(np.uint8)

                        # Create PyAV VideoFrame from RGB data
                        av_frame = VideoFrame.from_ndarray(rgb_frame, format='rgb24')
                        av_frame.pts = self.video_frames_written
                        av_frame.time_base = self.video_stream.time_base

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
            else:
                logger.warning(f"[{self.mint_id}] Invalid frame shape: {frame_data.shape}")
            
            # CRITICAL: Free memory immediately after processing
            del frame_bytes
            if 'frame_data' in locals():
                del frame_data
            
            # Force garbage collection to free memory
            gc.collect()
            
            # Check memory usage and stop if too high
            try:
                import psutil
                process = psutil.Process()
                memory_mb = process.memory_info().rss / 1024 / 1024
                if memory_mb > 1000:  # Stop if using more than 1GB
                    logger.error(f"[{self.mint_id}] ❌ Memory usage too high: {memory_mb:.1f}MB - stopping recording")
                    self._shutdown = True
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
        if self._shutdown:
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
                    # Create PyAV AudioFrame from audio data
                    # Assume 16-bit signed integer PCM for now (common format)
                    av_audio_frame = AudioFrame.from_ndarray(
                        np.frombuffer(audio_bytes, dtype=np.int16).reshape(-1, 2),  # Stereo
                        format='s16',
                        layout='stereo'
                    )
                    av_audio_frame.pts = self.audio_frames_written
                    av_audio_frame.time_base = self.audio_stream.time_base
                    av_audio_frame.sample_rate = 48000

                    # Encode frame
                    packets = self.audio_stream.encode(av_audio_frame)
                    for packet in packets:
                        self.container.mux(packet)

                    self.audio_frames_written += 1

                    if self.audio_frames_written % 1000 == 0:  # Log every 1000 frames
                        logger.info(f"[{self.mint_id}] Encoded {self.audio_frames_written} audio frames to PyAV")

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
            "format": "mpegts",
            "fps": 30,
            "width": 1920,
            "height": 1080,
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
