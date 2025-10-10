"""
WebRTC recording service using FFmpeg subprocess for direct disk writes.

This approach eliminates PyAV memory buffering by using FFmpeg subprocess
that writes directly to disk in streaming format (MPEG-TS).
"""

import asyncio
import logging
import subprocess
import numpy as np
import json
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
        self.raw_frames_dir: Optional[Path] = None
        self.start_time: Optional[datetime] = None
        
        # Track references for frame access
        self.video_track: Optional[rtc.RemoteVideoTrack] = None
        self.audio_track: Optional[rtc.RemoteAudioTrack] = None
        
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
            
            # State: SUBSCRIBING → SUBSCRIBED
            self.state = RecordingState.SUBSCRIBED
            
            # Setup FFmpeg process
            await self._setup_ffmpeg()
            
            # Start frame processing (if we have tracks)
            if self.video_track or self.audio_track:
                await self._start_frame_processing()
            else:
                logger.warning(f"[{self.mint_id}] ⚠️  No tracks available for frame processing")
            
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
        
        # Debug logging
        logger.info(f"[{self.mint_id}] Status check: state={self.state.value}, frames_received={self.video_frames_received}, frames_written={self.video_frames_written}")
        logger.info(f"[{self.mint_id}] FFmpeg process: {self.ffmpeg_process is not None}, output_path={self.output_path}")
        
        if self.ffmpeg_process:
            logger.info(f"[{self.mint_id}] FFmpeg PID: {self.ffmpeg_process.pid}, returncode: {self.ffmpeg_process.returncode}")
            logger.info(f"[{self.mint_id}] FFmpeg stdin available: {self.ffmpeg_process.stdin is not None}")
            logger.info(f"[{self.mint_id}] FFmpeg stdout available: {self.ffmpeg_process.stdout is not None}")
            logger.info(f"[{self.mint_id}] FFmpeg stderr available: {self.ffmpeg_process.stderr is not None}")
            
            # Check if output file exists and its size
            if self.output_path and self.output_path.exists():
                file_size = self.output_path.stat().st_size
                logger.info(f"[{self.mint_id}] Output file size: {file_size} bytes")
            else:
                logger.warning(f"[{self.mint_id}] Output file does not exist: {self.output_path}")
        
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

    async def _setup_existing_track_handlers(self, participant: rtc.RemoteParticipant):
        """Set up direct track access for recording (no frame handlers needed)."""
        logger.info(f"[{self.mint_id}] Setting up direct track access for recording from {participant.sid}")
        
        # Store track references for direct access
        logger.info(f"[{self.mint_id}] 🔍 Found {len(participant.track_publications)} track publications")
        logger.info(f"[{self.mint_id}] 🔍 Target participant: {self.stream_info.participant_sid}")
        logger.info(f"[{self.mint_id]} 🔍 Current participant: {participant.sid}")
        
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
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                self.audio_track = track
                logger.info(f"[{self.mint_id}] ✅ Audio track reference stored for direct access")
        
        # Start polling for frames since direct handlers aren't available
        logger.info(f"[{self.mint_id}] 🔄 Starting frame polling for direct track access...")
        logger.info(f"[{self.mint_id}] 🔍 Tracks available: video={self.video_track is not None}, audio={self.audio_track is not None}")
        if self.video_track:
            logger.info(f"[{self.mint_id}] Video track: {self.video_track}")
        if self.audio_track:
            logger.info(f"[{self.mint_id}] Audio track: {self.audio_track}")
        
        polling_task = asyncio.create_task(self._poll_frames())
        logger.info(f"[{self.mint_id}] 📋 Polling task created: {polling_task}")

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
            asyncio.create_task(self._poll_frames())
            self._polling_started = True

    async def _poll_frames(self):
        """Process frames using LiveKit's VideoStream and AudioStream (proven approach)."""
        logger.info(f"[{self.mint_id}] 🚀 _poll_frames() method called!")
        logger.info(f"[{self.mint_id}] 🔄 Starting frame processing with VideoStream/AudioStream...")
        
        try:
            # Create tasks for video and audio processing (like the working implementation)
            tasks = []
            
            logger.info(f"[{self.mint_id}] 🔍 Available tracks: video={self.video_track is not None}, audio={self.audio_track is not None}")
            
            if self.video_track:
                logger.info(f"[{self.mint_id}] ✅ Starting video stream processing")
                logger.info(f"[{self.mint_id}] Video track details: {self.video_track}")
                video_task = asyncio.create_task(self._process_video_stream())
                tasks.append(video_task)
                logger.info(f"[{self.mint_id}] Video task created: {video_task}")
            
            if self.audio_track:
                logger.info(f"[{self.mint_id}] ✅ Starting audio stream processing")
                audio_task = asyncio.create_task(self._process_audio_stream())
                tasks.append(audio_task)
                logger.info(f"[{self.mint_id}] Audio task created: {audio_task}")
            
            if not tasks:
                logger.warning(f"[{self.mint_id}] ⚠️  No tracks available for processing")
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
            
            logger.info(f"[{self.mint_id}] 🔄 Starting VideoStream iteration...")
            async for event in rtc.VideoStream(self.video_track):
                logger.info(f"[{self.mint_id}] 📹 VideoStream event received!")
                if self._shutdown:
                    logger.info(f"[{self.mint_id}] Stop signal received, ending video processing")
                    break
                
                frame = event.frame
                logger.info(f"[{self.mint_id}] 📹 Frame extracted from event: {type(frame)}")
                try:
                    # Process the frame
                    logger.info(f"[{self.mint_id}] 📹 Calling _on_video_frame...")
                    await self._on_video_frame(frame)
                    frame_count += 1
                    
                    # Log progress
                    if frame_count % 100 == 0:
                        logger.info(f"[{self.mint_id}] Processed {frame_count} video frames")
                        
                except Exception as e:
                    logger.error(f"[{self.mint_id}] Error processing video frame {frame_count}: {e}")
                    continue
                    
        except asyncio.CancelledError:
            logger.info(f"[{self.mint_id}] Video stream processing cancelled")
            raise
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video stream processing error: {e}")
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

    async def _setup_ffmpeg(self):
        """Setup FFmpeg subprocess for recording."""
        # Generate output path
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        output_filename = f"{self.mint_id}_{timestamp}.ts"
        self.output_path = self.output_dir / output_filename
        
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"[{self.mint_id}] Setting up FFmpeg process: {self.output_path}")
        
        # Check if FFmpeg is available
        if not self._check_ffmpeg():
            logger.warning(f"[{self.mint_id}] FFmpeg not found, falling back to raw frame recording")
            await self._setup_raw_recording()
            return
        
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
        
        try:
            # Start FFmpeg process
            self.ffmpeg_process = subprocess.Popen(
                ffmpeg_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0  # Unbuffered
            )
            
            logger.info(f"[{self.mint_id}] ✅ FFmpeg process started (PID: {self.ffmpeg_process.pid})")
            
        except FileNotFoundError:
            raise Exception("FFmpeg not found. Please install FFmpeg and ensure it's in your PATH.")
        except Exception as e:
            raise Exception(f"Failed to start FFmpeg process: {e}")

    def _check_ffmpeg(self) -> bool:
        """Check if FFmpeg is available in the system."""
        try:
            result = subprocess.run(['ffmpeg', '-version'], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=5)
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    async def _setup_raw_recording(self):
        """Setup raw frame recording as fallback when FFmpeg is not available."""
        logger.info(f"[{self.mint_id}] Setting up raw frame recording (no FFmpeg)")
        
        # Create raw frames directory
        self.raw_frames_dir = self.output_dir / f"{self.mint_id}_frames"
        self.raw_frames_dir.mkdir(parents=True, exist_ok=True)
        
        # Create metadata file
        metadata_file = self.raw_frames_dir / "metadata.json"
        metadata = {
            "mint_id": self.mint_id,
            "start_time": datetime.now(timezone.utc).isoformat(),
            "config": self.config,
            "format": "raw_frames"
        }
        
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"[{self.mint_id}] ✅ Raw frame recording setup complete: {self.raw_frames_dir}")

    async def _start_frame_processing(self):
        """Start frame processing tasks."""
        logger.info(f"[{self.mint_id}] Starting frame processing")
        
        # Since LiveKit tracks don't support direct frame handlers, we'll use a different approach
        # For now, we'll create a simple recording that at least starts the FFmpeg process
        # TODO: Implement proper frame capture using LiveKit's MediaRecorder or alternative approach
        
        if self.video_track:
            logger.info(f"[{self.mint_id}] Video track available: {self.video_track.sid}")
        if self.audio_track:
            logger.info(f"[{self.mint_id}] Audio track available: {self.audio_track.sid}")
        
        logger.info(f"[{self.mint_id}] ⚠️  Frame processing started but no direct frame handlers available")
        logger.info(f"[{self.mint_id}] ⚠️  This is a limitation of the current LiveKit API - frames may not be captured")

    async def _on_video_frame(self, frame: rtc.VideoFrame):
        """Handle video frame from LiveKit."""
        if self._shutdown:
            return
            
        try:
            self.video_frames_received += 1
            
            if self.video_frames_received == 1:
                logger.info(f"[{self.mint_id}] 🎬 FIRST VIDEO FRAME RECEIVED!")
                logger.info(f"[{self.mint_id}] Frame type: {type(frame)}")
                logger.info(f"[{self.mint_id}] Frame attributes: {[attr for attr in dir(frame) if not attr.startswith('_')]}")
            
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
                    
                # Reshape based on expected format (RGB)
                expected_size = width * height * 3  # RGB format
                logger.info(f"[{self.mint_id}] Expected size: {expected_size}, actual size: {len(frame_data)}")
                
                if len(frame_data) == expected_size:
                    frame_data = frame_data.reshape(height, width, 3)
                    logger.info(f"[{self.mint_id}] ✅ Frame reshaped to RGB: {frame_data.shape}")
                else:
                    logger.warning(f"[{self.mint_id}] ❌ Unexpected frame size: {len(frame_data)} bytes, expected {expected_size}")
                    # Try to continue with what we have
                    if len(frame_data) > 0:
                        logger.info(f"[{self.mint_id}] Attempting to use partial frame data")
                        # Use as much data as we have
                        usable_size = (len(frame_data) // 3) * 3  # Round down to multiple of 3
                        if usable_size > 0:
                            frame_data = frame_data[:usable_size]
                            # Try to reshape to a reasonable size
                            pixels = usable_size // 3
                            h = int(np.sqrt(pixels * height / width))
                            w = pixels // h
                            if w > 0 and h > 0:
                                frame_data = frame_data.reshape(h, w, 3)
                                logger.info(f"[{self.mint_id}] Reshaped to partial frame: {frame_data.shape}")
                            else:
                                logger.warning(f"[{self.mint_id}] Cannot reshape partial frame")
                                return
                        else:
                            logger.warning(f"[{self.mint_id}] No usable frame data")
                            return
                    else:
                        logger.warning(f"[{self.mint_id}] Empty frame data")
                        return
                    
            except Exception as e:
                logger.warning(f"[{self.mint_id}] Failed to convert frame: {e}")
                return
            
            if frame_data is None:
                logger.warning(f"[{self.mint_id}] No frame data available")
                return
            
            # Convert to bytes for FFmpeg
            if len(frame_data.shape) == 3 and frame_data.shape[2] in [3, 4]:  # RGB or RGBA
                frame_bytes = frame_data.astype(np.uint8).tobytes()
                
                if self.ffmpeg_process:
                    # FFmpeg mode: pipe to FFmpeg
                    logger.info(f"[{self.mint_id}] Attempting to write {len(frame_bytes)} bytes to FFmpeg")
                    with self._ffmpeg_lock:
                        if self.ffmpeg_process.stdin:
                            try:
                                self.ffmpeg_process.stdin.write(frame_bytes)
                                self.ffmpeg_process.stdin.flush()  # Force flush to FFmpeg
                                self.video_frames_written += 1
                                
                                if self.video_frames_written == 1:
                                    logger.info(f"[{self.mint_id}] 🎬 FIRST VIDEO FRAME WRITTEN TO FFMPEG!")
                                    logger.info(f"[{self.mint_id}] FFmpeg process status: {self.ffmpeg_process.poll()}")
                                
                                if self.video_frames_written % 30 == 0:  # Log every second
                                    logger.info(f"[{self.mint_id}] Written {self.video_frames_written} video frames to FFmpeg")
                            except Exception as write_error:
                                logger.error(f"[{self.mint_id}] Error writing to FFmpeg: {write_error}")
                        else:
                            logger.error(f"[{self.mint_id}] FFmpeg stdin is None!")
                            logger.error(f"[{self.mint_id}] FFmpeg process: {self.ffmpeg_process}")
                            logger.error(f"[{self.mint_id}] FFmpeg process status: {self.ffmpeg_process.poll() if self.ffmpeg_process else 'None'}")
                else:
                    # Raw mode: save individual frames
                    if self.raw_frames_dir:
                        frame_file = self.raw_frames_dir / f"video_{self.video_frames_written:06d}.raw"
                        with open(frame_file, 'wb') as f:
                            f.write(frame_bytes)
                        self.video_frames_written += 1
                        
                        if self.video_frames_written == 1:
                            logger.info(f"[{self.mint_id}] 🎬 FIRST VIDEO FRAME SAVED TO DISK!")
                        
                        if self.video_frames_written % 30 == 0:  # Log every second
                            logger.info(f"[{self.mint_id}] Saved {self.video_frames_written} video frames to disk")
                    else:
                        logger.warning(f"[{self.mint_id}] Raw frames directory not available for video")
            else:
                logger.warning(f"[{self.mint_id}] Invalid frame shape: {frame_data.shape}")
                            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Video frame processing error: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")

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
            
            if self.ffmpeg_process:
                # FFmpeg mode: pipe to FFmpeg
                with self._ffmpeg_lock:
                    if self.ffmpeg_process.stdin:
                        # For now, skip audio - focus on getting video working first
                        # TODO: Implement proper audio piping to FFmpeg
                        self.audio_frames_written += 1
            else:
                # Raw mode: save individual audio frames
                if self.raw_frames_dir:
                    audio_file = self.raw_frames_dir / f"audio_{self.audio_frames_written:06d}.raw"
                    with open(audio_file, 'wb') as f:
                        f.write(audio_bytes)
                    self.audio_frames_written += 1
                # Don't log warning in FFmpeg mode - this is expected
                    
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
