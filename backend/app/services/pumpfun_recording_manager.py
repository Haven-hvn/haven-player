"""
PumpFun recording manager for automated segmented recording.

Manages multiple concurrent recordings with automatic start/stop based on stream availability.
Uses PumpFunChunkRecorder for keyframe-based segmentation and automatic upload queueing.
"""

import logging
from typing import Dict, Any, List, Optional
import asyncio
import time
import os

from app.services.pumpfun_chunk_recorder import PumpFunChunkRecorder
from app.services.stream_manager import StreamManager, StreamInfo
from app.services.upload_coordinator import UploadCoordinator
from app.models.config import AppConfig
from app.models.database import get_db as get_db_session

logger = logging.getLogger(__name__)


class PumpFunRecordingManager:
    """
    Manages automated segmented recording for PumpFun streams.
    
    - Manages multiple concurrent recordings
    - Automatically starts/stops based on stream availability
    - Integrates with UploadCoordinator via PumpFunChunkRecorder
    """
    
    _instance: Optional['PumpFunRecordingManager'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self.active_recordings: Dict[str, PumpFunChunkRecorder] = {}
            self.stream_manager: Optional[StreamManager] = None
            self.upload_coordinator = UploadCoordinator()
            self._manage_lock = asyncio.Lock()
            self._stream_wait_timeout_seconds = 180.0
            self._stream_retry_interval_seconds = 15.0
            self._livekit_url: Optional[str] = None
            self._initialized = True
    
    def set_stream_manager(self, stream_manager: StreamManager):
        """Set stream manager instance (dependency injection)."""
        self.stream_manager = stream_manager

    def set_livekit_url(self, livekit_url: Optional[str]) -> None:
        """Set LiveKit URL for stream startup."""
        self._livekit_url = livekit_url
    
    async def manage_subscriptions(
        self, 
        subscriptions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Main entry point for automated recording.
        
        Args:
            subscriptions: List of subscribed streams
            
        Returns:
            Statistics about recording operations
        """
        if not self.stream_manager:
            logger.error("StreamManager not set")
            return {"status": "error", "error": "StreamManager not initialized"}

        if self._manage_lock.locked():
            logger.info(
                "Recording manager busy; skipping overlapping schedule tick"
            )
            return {
                "status": "busy",
                "message": "Recording manager already running",
                "subscribed": len(subscriptions),
                "active": len(self.active_recordings),
                "started": 0,
                "stopped": 0,
                "rotations": 0,
                "errors": 0,
            }
        
        async with self._manage_lock:
            logger.info("Recording manager lock acquired")
            stats = {
                "status": "ok",
                "subscribed": len(subscriptions),
                "active": 0,
                "started": 0,
                "stopped": 0,
                "rotations": 0,
                "errors": 0,
            }

            for subscription in subscriptions:
                if not subscription.get("enabled", False):
                    continue

                mint_id = subscription.get("stream_id")
                if not mint_id:
                    continue

                try:
                    # Check if stream is live
                    is_live = await self._check_stream_live(mint_id)

                    if is_live and mint_id not in self.active_recordings:
                        # Start new recording
                        success = await self._start_recording(mint_id)
                        if success:
                            stats["started"] += 1
                            logger.info(f"Started recording for {mint_id}")

                    elif not is_live and mint_id in self.active_recordings:
                        # Stop recording
                        success = await self._stop_recording(mint_id)
                        if success:
                            stats["stopped"] += 1
                            logger.info(f"Stopped recording for {mint_id}")

                except Exception as e:
                    logger.error(f"Error managing subscription {mint_id}: {e}")
                    stats["errors"] += 1

            stats["active"] = len(self.active_recordings)
            return stats

    async def _wait_for_stream_info(self, mint_id: str) -> Optional[StreamInfo]:
        if not self.stream_manager:
            logger.error("StreamManager not set")
            return None

        deadline = time.time() + self._stream_wait_timeout_seconds
        attempt = 0

        while True:
            stream_info = await self.stream_manager.get_stream_info(mint_id)
            if stream_info:
                return stream_info

            if time.time() >= deadline:
                logger.error(
                    f"Timed out waiting for stream info for {mint_id} "
                    f"after {self._stream_wait_timeout_seconds}s"
                )
                return None

            attempt += 1
            try:
                if self._livekit_url:
                    start_result: Dict[str, object] = await self.stream_manager.start_stream(
                        mint_id,
                        livekit_url=self._livekit_url,
                    )
                else:
                    start_result = await self.stream_manager.start_stream(mint_id)
                logger.info(
                    f"Start stream attempt {attempt} for {mint_id}: {start_result}"
                )
            except Exception as e:
                logger.error(
                    f"Start stream attempt {attempt} failed for {mint_id}: {e}"
                )

            stream_info = await self.stream_manager.get_stream_info(mint_id)
            if stream_info:
                return stream_info

            remaining_seconds = max(
                0, int(deadline - time.time())
            )
            logger.info(
                f"Stream info not available for {mint_id}; "
                f"retrying in {self._stream_retry_interval_seconds}s "
                f"(remaining {remaining_seconds}s)"
            )
            await asyncio.sleep(self._stream_retry_interval_seconds)
    
    async def _check_stream_live(self, mint_id: str) -> bool:
        """
        Check if a stream is currently live.
        
        Args:
            mint_id: Stream identifier
            
        Returns:
            True if stream is live, False otherwise
        """
        try:
            # Get stream info from stream manager
            stream_info = await self._wait_for_stream_info(mint_id)
            return stream_info is not None
        except Exception as e:
            logger.error(f"Error checking if stream {mint_id} is live: {e}")
            return False
    
    async def _start_recording(self, mint_id: str) -> bool:
        """
        Start automated segmented recording.
        
        Args:
            mint_id: Stream identifier
            
        Returns:
            True if recording started successfully, False otherwise
        """
        logger.info(f"Starting automated segmented recording for {mint_id}")
        
        try:
            # Get LiveKit room
            stream_info = await self._wait_for_stream_info(mint_id)
            if not stream_info:
                logger.error(f"No stream info found for {mint_id}")
                return False
            
            room = self.stream_manager.get_room(mint_id)
            if not room:
                logger.error(f"No LiveKit room found for {mint_id}")
                return False
            
            # Get global download directory from AppConfig
            db = next(get_db_session())
            try:
                app_config = db.query(AppConfig).first()
                if not app_config or not app_config.download_directory:
                    logger.error("Global download_directory not configured in AppConfig")
                    return False
                download_dir = app_config.download_directory
            finally:
                db.close()
            
            # Create output directory path using global download_directory
            output_dir = os.path.join(download_dir, "pumpfun")
            os.makedirs(output_dir, exist_ok=True)
            
            # Create custom chunk recorder
            recorder = PumpFunChunkRecorder(
                mint_id=mint_id,
                room=room,
                output_dir=output_dir,
                segment_duration=30,
                video_codec="vp9",
                video_bitrate="8M",
                video_fps=30,
                video_quality="high",
                audio_codec="opus",
                audio_bitrate="256k"
            )
            
            # Start recording
            participant_identity = stream_info.participant_sid  # Using participant_sid as identity
            await recorder.start_recording(participant_identity)
            
            self.active_recordings[mint_id] = recorder
            logger.info(f"Started segmented recording for {mint_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start recording for {mint_id}: {e}")
            return False
    
    async def _stop_recording(self, mint_id: str) -> bool:
        """
        Stop recording.
        
        Args:
            mint_id: Stream identifier
            
        Returns:
            True if recording stopped successfully, False otherwise
        """
        if mint_id in self.active_recordings:
            recorder = self.active_recordings[mint_id]
            try:
                await recorder.stop_recording()
                del self.active_recordings[mint_id]
                logger.info(f"Stopped recording for {mint_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to stop recording for {mint_id}: {e}")
                return False
        return True
    
    async def stop_all_recordings(self) -> Dict[str, Any]:
        """
        Stop all active recordings.
        
        Returns:
            Statistics about stopped recordings
        """
        stats = {
            "stopped": 0,
            "failed": 0,
            "errors": []
        }
        
        mint_ids = list(self.active_recordings.keys())
        
        for mint_id in mint_ids:
            try:
                success = await self._stop_recording(mint_id)
                if success:
                    stats["stopped"] += 1
                else:
                    stats["failed"] += 1
            except Exception as e:
                stats["failed"] += 1
                stats["errors"].append(str(e))
        
        logger.info(f"Stopped all recordings: {stats}")
        return stats
    
    def get_active_recordings(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status of all active recordings.
        
        Returns:
            Dictionary with recording status for each mint_id
        """
        result = {}
        for mint_id, recorder in self.active_recordings.items():
            result[mint_id] = {
                "is_recording": recorder._is_recording,
                "segment_index": recorder._current_segment_index,
                "frames_captured": recorder._stats.get("frames_captured", 0),
                "segments_created": recorder._stats.get("segments_created", 0),
                "bytes_written": recorder._stats.get("bytes_written", 0)
            }
        return result
    
    async def get_recording_stats(self, mint_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed stats for a specific recording using SegmentMetadata.
        
        Args:
            mint_id: Stream identifier
            
        Returns:
            Recording statistics from database or None if not recording
        """
        from app.models.database import SessionLocal
        from app.models.segment_metadata import SegmentMetadata
        
        db = SessionLocal()
        try:
            # Get current segment for this recording (most recent)
            current_segment = db.query(SegmentMetadata).filter(
                SegmentMetadata.mint_id == mint_id,
                SegmentMetadata.recording_status.in_(["recording", "finalizing", "completed"])
            ).order_by(SegmentMetadata.created_at.desc()).first()
            
            if not current_segment:
                return None
            
            # Get recent segments (last 3 for context)
            recent_segments = db.query(SegmentMetadata).filter(
                SegmentMetadata.mint_id == mint_id,
                SegmentMetadata.created_at >= SegmentMetadata.created_at.desc(),
            ).order_by(SegmentMetadata.created_at.desc()).limit(3).all()
            
            # Get real-time segment data if active
            active_segment = None
            if mint_id in self.active_recordings:
                recorder = self.active_recordings[mint_id]
                active_segment = {
                    "segment_index": recorder._current_segment_index,
                    "active_segment_elapsed": time.time() - recorder._current_segment_start if recorder._current_segment_start > 0 else 0,
                    "frames_captured": recorder._stats.get("frames_captured", 0),
                    "bytes_written": recorder._stats.get("bytes_written", 0)
                }
            
            # Build comprehensive stats from SegmentMetadata + real-time data
            stats = {
                "mint_id": mint_id,
                "is_recording": active_segment is not None,
                "current_segment": current_segment.to_dict() if current_segment else None,
                "active_segment": active_segment,
                "recent_segments": [seg.to_dict() for seg in recent_segments],
                "segments_created": len(recent_segments),
                "recording_session_active": mint_id in self.active_recordings
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting recording stats for {mint_id}: {e}")
            return None
        finally:
            db.close()
    
    async def get_all_recording_summaries(self) -> Dict[str, Any]:
        """
        Get summary stats for all active recordings using SegmentMetadata.
        
        Returns:
            Dictionary with summary statistics
        """
        from app.models.database import SessionLocal
        from app.models.segment_metadata import SegmentMetadata
        import time
        
        db = SessionLocal()
        try:
            # Get all active recording sessions
            mint_ids = list(self.active_recordings.keys())
            summaries = {}
            
            for mint_id in mint_ids:
                # Get latest segment
                latest_segment = db.query(SegmentMetadata).filter(
                    SegmentMetadata.mint_id == mint_id
                ).order_by(SegmentMetadata.created_at.desc()).first()
                
                if latest_segment:
                    # Get real-time data from recorder 
                    recorder = self.active_recordings[mint_id]
                    real_time_stats = recorder._stats if recorder else {}
                    
                    summaries[mint_id] = {
                        "is_recording": recorder._is_recording if recorder else False,
                        "segment_index": recorder._current_segment_index if recorder else 0,
                        "active_segment_elapsed": time.time() - recorder._current_segment_start if recorder and recorder._current_segment_start > 0 else 0,
                        "total_segments": db.query(SegmentMetadata).filter(
                            SegmentMetadata.mint_id == mint_id,
                            SegmentMetadata.recording_status == "completed"
                        ).count(),
                        "current_segment_status": latest_segment.recording_status,
                        "frames_captured": real_time_stats.get("frames_captured", 0),
                        "bytes_written": real_time_stats.get("bytes_written", 0),
                        "error_message": latest_segment.error_message,
                        "last_updated": latest_segment.updated_at.isoformat() if latest_segment.updated_at else None
                    }
                    
            return summaries
            
        except Exception as e:
            logger.error(f"Error getting all recording summaries: {e}")
            return {}
        finally:
            db.close()