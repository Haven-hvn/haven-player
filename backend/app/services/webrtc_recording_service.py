"""
WebRTC recording service using LiveKit's ParticipantRecorder.

Migrated from custom PyAV implementation to use built-in ParticipantRecorder
for better memory efficiency and simplified maintenance.
"""

import asyncio
import logging
import psutil
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime, timezone
from enum import Enum

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

# Try importing ParticipantRecorder from LiveKit SDK
try:
    from livekit.rtc import ParticipantRecorder
    PARTICIPANT_RECORDER_AVAILABLE = True
    
    # Try importing exception types (may not exist in all SDK versions)
    try:
        from livekit.rtc import ParticipantNotFoundError, RecordingError
        PARTICIPANT_NOT_FOUND_ERROR_AVAILABLE = True
        RECORDING_ERROR_AVAILABLE = True
    except ImportError:
        # Create fallback exception classes if not available
        class ParticipantNotFoundError(Exception):
            """Raised when participant not found in room."""
            pass
        
        class RecordingError(Exception):
            """Raised for general recording errors."""
            pass
        
        PARTICIPANT_NOT_FOUND_ERROR_AVAILABLE = False
        RECORDING_ERROR_AVAILABLE = False
    
    # Try importing WebMEncoderNotAvailableError (may not exist)
    try:
        from livekit.rtc import WebMEncoderNotAvailableError
        WEBM_ENCODER_ERROR_AVAILABLE = True
    except ImportError:
        class WebMEncoderNotAvailableError(Exception):
            """Raised when WebM encoder (PyAV) not available."""
            pass
        WEBM_ENCODER_ERROR_AVAILABLE = False
        
except ImportError:
    PARTICIPANT_RECORDER_AVAILABLE = False
    ParticipantRecorder = None
    PARTICIPANT_NOT_FOUND_ERROR_AVAILABLE = False
    RECORDING_ERROR_AVAILABLE = False
    WEBM_ENCODER_ERROR_AVAILABLE = False
    
    class ParticipantNotFoundError(Exception):
        """Raised when participant not found in room."""
        pass
    
    class RecordingError(Exception):
        """Raised for general recording errors."""
        pass
    
    class WebMEncoderNotAvailableError(Exception):
        """Raised when WebM encoder (PyAV) not available."""
        pass

class RecordingState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting" 
    CONNECTED = "connected"
    SUBSCRIBING = "subscribing"
    SUBSCRIBED = "subscribed"
    RECORDING = "recording"
    STOPPING = "stopping"
    STOPPED = "stopped"


class ParticipantRecorderWrapper:
    """
    Wrapper for LiveKit's ParticipantRecorder that maps participant_sid to participant_identity.
    
    Maintains compatibility with existing AiortcFileRecorder interface while using
    the built-in ParticipantRecorder for memory-efficient recording.
    """
    
    def __init__(
        self,
        mint_id: str,
        stream_info: Any,
        output_dir: Path,
        config: Dict[str, Any],
        room: rtc.Room
    ):
        if not PARTICIPANT_RECORDER_AVAILABLE:
            raise ImportError(
                "ParticipantRecorder not available in LiveKit SDK. "
                "Ensure you have the latest version: pip install livekit"
            )
        
        if not AV_AVAILABLE:
            raise WebMEncoderNotAvailableError(
                "PyAV (av) is required for ParticipantRecorder. Install with: pip install av>=11.0.0"
            )
        
        self.mint_id = mint_id
        self.stream_info = stream_info
        self.output_dir = output_dir
        self.config = config
        self.room = room
        
        self.state = RecordingState.DISCONNECTED
        self.start_time: Optional[datetime] = None
        self.output_path: Optional[Path] = None
        
        # ParticipantRecorder instance (created when starting recording)
        self.recorder: Optional[ParticipantRecorder] = None
        self.participant_identity: Optional[str] = None
        
        logger.info(f"[{self.mint_id}] ParticipantRecorderWrapper initialized")
    
    def _find_participant_identity(self) -> Optional[str]:
        """
        Find participant_identity by looking up participant by participant_sid.
        
        Returns:
            participant_identity if found, None otherwise
        """
        participant_sid = self.stream_info.participant_sid
        
        for participant in self.room.remote_participants.values():
            if participant.sid == participant_sid:
                participant_identity = participant.identity
                logger.info(
                    f"[{self.mint_id}] ✅ Found participant: sid={participant_sid}, "
                    f"identity={participant_identity}"
                )
                return participant_identity
        
        logger.error(
            f"[{self.mint_id}] ❌ Participant with sid={participant_sid} not found in room"
        )
        return None
    
    async def start(self) -> Dict[str, Any]:
        """Start recording using ParticipantRecorder."""
        try:
            logger.info(f"[{self.mint_id}] Starting ParticipantRecorder-based recording")
            
            # State: DISCONNECTED → CONNECTING
            self.state = RecordingState.CONNECTING
            
            # Find participant_identity from participant_sid
            participant_identity = self._find_participant_identity()
            if not participant_identity:
                return {
                    "success": False,
                    "error": f"Participant with sid {self.stream_info.participant_sid} not found in room"
                }
            
            self.participant_identity = participant_identity
            
            # Map quality presets to ParticipantRecorder options - Maximum quality
            video_codec = self.config.get("video_codec", "vp9")
            # Always use VP9 for maximum quality (better compression than VP8)
            if video_codec in ["vp9", "libvpx-vp9"]:
                video_codec = "vp9"
            else:
                video_codec = "vp9"  # Default to VP9 for maximum quality
            
            video_quality_str = self.config.get("video_quality", "best")
            # Map to ParticipantRecorder quality levels - favor highest quality
            quality_map = {
                "low": "high",      # Even low maps to high quality
                "medium": "high",   # Medium maps to high quality
                "high": "best",     # High maps to best quality
                "best": "best"      # Best is maximum
            }
            video_quality = quality_map.get(video_quality_str, "best")
            
            # Parse bitrates - use high defaults for maximum quality
            video_bitrate = self._parse_bitrate(self.config.get("video_bitrate", "8M"))
            audio_bitrate = self._parse_bitrate(self.config.get("audio_bitrate", "256k"))
            video_fps = self.config.get("fps", 30)
            
            # Create ParticipantRecorder with configuration
            self.recorder = ParticipantRecorder(
                self.room,
                video_codec=video_codec,
                video_quality=video_quality,
                auto_bitrate=self.config.get("auto_bitrate", True),
                video_bitrate=video_bitrate,
                audio_bitrate=audio_bitrate,
                video_fps=video_fps
            )
            
            logger.info(
                f"[{self.mint_id}] ParticipantRecorder created: "
                f"codec={video_codec}, quality={video_quality}, "
                f"video_bitrate={video_bitrate}, audio_bitrate={audio_bitrate}, fps={video_fps}"
            )
            
            # State: CONNECTING → RECORDING
            self.state = RecordingState.RECORDING
            self.start_time = datetime.now(timezone.utc)
            
            # Start recording
            await self.recorder.start_recording(participant_identity)
            
            logger.info(f"[{self.mint_id}] ✅ Recording started with ParticipantRecorder")
            
            # Generate output path (will be finalized on stop)
            timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            self.output_path = self.output_dir / f"{self.mint_id}_{timestamp}.webm"
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "start_time": self.start_time.isoformat(),
                "tracks": 2,  # ParticipantRecorder handles video + audio automatically
                "stats": {
                    "video_frames": 0,
                    "audio_frames": 0,
                    "dropped_frames": 0,
                    "pli_requests": 0,
                    "track_subscriptions": 2,
                    "connection_time": 0.0,
                    "subscription_time": 0.0
                }
            }
            
        except ParticipantNotFoundError as e:
            logger.error(f"[{self.mint_id}] Participant not found: {e}")
            self.state = RecordingState.STOPPED
            return {"success": False, "error": f"Participant not found: {str(e)}"}
            
        except WebMEncoderNotAvailableError as e:
            logger.error(f"[{self.mint_id}] WebM encoder not available: {e}")
            self.state = RecordingState.STOPPED
            return {"success": False, "error": f"WebM encoder not available: {str(e)}"}
            
        except RecordingError as e:
            logger.error(f"[{self.mint_id}] Recording error: {e}")
            self.state = RecordingState.STOPPED
            return {"success": False, "error": f"Recording error: {str(e)}"}
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Unexpected error starting recording: {e}")
            import traceback
            logger.error(f"[{self.mint_id}] Traceback: {traceback.format_exc()}")
            self.state = RecordingState.STOPPED
            return {"success": False, "error": str(e)}
    
    async def stop(self) -> Dict[str, Any]:
        """Stop recording and save to file."""
        try:
            logger.info(f"[{self.mint_id}] Stopping ParticipantRecorder recording")
            
            if self.state != RecordingState.RECORDING:
                return {
                    "success": False,
                    "error": f"No active recording to stop (state: {self.state.value})"
                }
            
            # State: RECORDING → STOPPING
            self.state = RecordingState.STOPPING
            
            if not self.recorder:
                return {"success": False, "error": "No recorder instance available"}
            
            # Stop recording and save to file
            if self.output_path:
                final_path = await self.recorder.stop_recording(str(self.output_path))
                self.output_path = Path(final_path) if final_path else self.output_path
            else:
                # Generate path if not set
                timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
                self.output_path = self.output_dir / f"{self.mint_id}_{timestamp}.webm"
                final_path = await self.recorder.stop_recording(str(self.output_path))
                self.output_path = Path(final_path) if final_path else self.output_path
            
            # Get final stats
            stats = self.recorder.get_stats()
            
            # State: STOPPING → STOPPED
            self.state = RecordingState.STOPPED
            
            # Calculate file size
            file_size = 0
            if self.output_path and self.output_path.exists():
                file_size = self.output_path.stat().st_size
            
            duration_seconds = 0
            if self.start_time:
                duration_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            
            logger.info(f"[{self.mint_id}] ✅ Recording stopped")
            
            return {
                "success": True,
                "output_path": str(self.output_path),
                "file_size_bytes": file_size,
                "duration_seconds": duration_seconds,
                "stats": {
                    "video_frames": stats.video_frames_recorded,
                    "audio_frames": stats.audio_frames_recorded,
                    "dropped_frames": 0,
                    "pli_requests": 0,
                    "track_subscriptions": 2,
                    "connection_time": 0.0,
                    "subscription_time": 0.0
                }
            }
            
        except Exception as e:
            logger.error(f"[{self.mint_id}] Error stopping recording: {e}")
            self.state = RecordingState.STOPPED
            return {"success": False, "error": str(e)}
    
    async def get_status(self) -> Dict[str, Any]:
        """Get current recording status."""
        file_size = 0
        is_recording = self.state == RecordingState.RECORDING and self.recorder is not None
        
        # Get stats if recording is active
        stats = None
        if self.recorder:
            try:
                stats = self.recorder.get_stats()
            except Exception as e:
                logger.warning(f"[{self.mint_id}] Could not get recorder stats: {e}")
        
        if self.output_path and self.output_path.exists():
            file_size = self.output_path.stat().st_size
        
        # Calculate memory usage
        memory_mb = 0.0
        try:
            process = psutil.Process()
            memory_mb = process.memory_info().rss / (1024 * 1024)
        except Exception:
            pass
        
        return {
            "mint_id": self.mint_id,
            "state": self.state.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "output_path": str(self.output_path) if self.output_path else None,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
            "recording_mode": "participantrecorder",
            "is_recording": is_recording,
            "tracks": 2,  # ParticipantRecorder handles video + audio
            "timestamp_info": {
                "first_video_timestamp": None,
                "first_audio_timestamp": None,
                "audio_samples_written": 0,
                "recording_start_time": self.start_time.timestamp() if self.start_time else None
            },
            "flexibility": {
                "rgb_order": None,
                "resolution_strategy": None,
                "colorspace": None,
                "range": None,
                "coerce_unknown_to_rgb": False,
                "current_resolution": None
            },
            "stats": {
                "video_frames_received": stats.video_frames_recorded if stats else 0,
                "audio_frames_received": stats.audio_frames_recorded if stats else 0,
                "video_frames_written": stats.video_frames_recorded if stats else 0,
                "audio_frames_written": stats.audio_frames_recorded if stats else 0,
                "dropped_frames": 0,
                "pli_requests": 0,
                "track_subscriptions": 2,
                "connection_time": 0.0,
                "subscription_time": 0.0,
                "zero_packet_streak": 0,
                "memory_usage_mb": memory_mb,
            },
            "metrics": {
                "frames_received": stats.video_frames_recorded + stats.audio_frames_recorded if stats else 0,
                "packets_written": 0,
                "bytes_written": file_size,
                "encoder_resets": 0,
                "pts_corrections": 0,
                "dropped_frames": 0,
            },
            "config": self.config
        }
    
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


class WebRTCRecordingService:
    """WebRTC recording service using ParticipantRecorder."""

    _instance_count = 0

    def __init__(self, output_dir: str = "recordings"):
        WebRTCRecordingService._instance_count += 1
        self._instance_id = WebRTCRecordingService._instance_count

        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Active recordings - use ParticipantRecorderWrapper
        self.active_recordings: Dict[str, ParticipantRecorderWrapper] = {}

        # Default recording configuration for ParticipantRecorder - Maximum quality
        self.default_config = {
            "video_codec": "vp9",  # VP9 for best quality (better compression than VP8)
            "audio_codec": "opus",  # Always Opus for WebM
            "video_bitrate": "8M",  # High bitrate for maximum quality
            "audio_bitrate": "256k",  # High audio bitrate for maximum quality
            "format": "webm",  # ParticipantRecorder only supports WebM
            "fps": 30,
            "video_quality": "best",  # Maximum quality setting for ParticipantRecorder
            "auto_bitrate": True,  # Auto-adjust bitrate based on resolution
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
        output_format: str = "webm", 
        video_quality: str = "high"
    ) -> Dict[str, Any]:
        """Start recording using ParticipantRecorder."""
        try:
            logger.info(f"📹 Starting ParticipantRecorder recording for mint_id: {mint_id}")
            
            # Warn if non-WebM format requested (but continue with WebM)
            if output_format != "webm":
                logger.warning(
                    f"⚠️  Format '{output_format}' requested but ParticipantRecorder only supports WebM. "
                    f"Using WebM instead."
                )
            
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
            
            # Create recording configuration (always WebM, map quality presets)
            config = self._get_recording_config("webm", video_quality)
            
            # Create ParticipantRecorder wrapper
            try:
                recorder = ParticipantRecorderWrapper(
                    mint_id=mint_id,
                    stream_info=stream_info,
                    output_dir=self.output_dir,
                    config=config,
                    room=room
                )
            except ImportError as e:
                logger.error(f"❌ ParticipantRecorder not available: {e}")
                return {"success": False, "error": f"ParticipantRecorder not available: {str(e)}"}
            except WebMEncoderNotAvailableError as e:
                logger.error(f"❌ WebM encoder not available: {e}")
                return {"success": False, "error": f"WebM encoder not available: {str(e)}"}
            
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
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
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
        """Get recording configuration for ParticipantRecorder (WebM only) - Maximum quality."""
        config = self.default_config.copy()
        
        # ParticipantRecorder only supports WebM, so always use webm
        config["format"] = "webm"
        
        # Map video quality presets to bitrates and codec selection - Maximum quality settings
        if video_quality == "low":
            # Even low quality uses VP9 for best compression
            config["video_bitrate"] = "4M"  # Higher than before
            config["audio_bitrate"] = "192k"  # Higher than before
            config["video_codec"] = "vp9"  # VP9 for better quality
            config["video_quality"] = "high"  # Map low to high for better quality
        elif video_quality == "high":
            # Maximum quality settings
            config["video_bitrate"] = "8M"  # High bitrate for maximum quality
            config["audio_bitrate"] = "256k"  # High audio bitrate
            config["video_codec"] = "vp9"  # VP9 for best quality
            config["video_quality"] = "best"  # Use best quality setting
        else:  # medium or default
            # Medium now uses high quality settings
            config["video_bitrate"] = "6M"  # Increased from 2M
            config["audio_bitrate"] = "192k"  # Increased from 128k
            config["video_codec"] = "vp9"  # Use VP9 instead of VP8
            config["video_quality"] = "high"  # Use high quality setting
        
        # ParticipantRecorder uses Opus for audio (always)
        config["audio_codec"] = "opus"
        
        return config

