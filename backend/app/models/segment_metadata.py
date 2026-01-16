"""
SegmentMetadata model for real-time tracking during automated PumpFun chunk recordings.

This model tracks segment information DURING RECORDING for monitoring and real-time 
statistics. After upload, Permanent information is stored in the Video model.
"""

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.video import Video


class SegmentMetadata(Base):
    """
    Real-time tracking for recorded segments DURING recording.
    
    This table is used for real-time monitoring and statistics while recording
    is active. After video upload completes, permanent data is stored in Video table,
    and this entry may be cleaned up or kept for historical record.
    """
    
    __tablename__ = 'segment_metadata'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # Connection to original stream (for grouping)
    mint_id: Mapped[str] = mapped_column(String, index=True)
    
    # Recording controls
    recording_session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    segment_path: Mapped[str] = mapped_column(String, nullable=False)
    
    # Link to video (created when segment is enqueued to UploadCoordinator)
    video_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('videos.id'), nullable=True)
    video: Mapped[Optional['Video']] = relationship('Video', back_populates='segment_metadata')
    
    # Timing (real-time during recording)
    start_timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    end_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expected_duration: Mapped[float] = mapped_column(Float, default=30.0)  # Target segment duration
    
    # Real-time statistics (updated during recording)
    frames_captured: Mapped[int] = mapped_column(Integer, default=0)
    packets_written: Mapped[int] = mapped_column(Integer, default=0)
    bytes_written: Mapped[int] = mapped_column(Integer, default=0)  # Real-time file size
    
    # Recording quality (encoding details)
    video_codec: Mapped[str] = mapped_column(String, default="vp9")
    video_bitrate: Mapped[int] = mapped_column(Integer)  # in bits per second
    video_fps: Mapped[int] = mapped_column(Integer)
    audio_codec: Mapped[str] = mapped_column(String, default="opus")
    audio_bitrate: Mapped[int] = mapped_column(Integer)  # in bits per second
    
    # Keyframe tracking
    keyframe_frame_index: Mapped[int] = mapped_column(Integer, default=0)
    last_keyframe_frame_index: Mapped[int] = mapped_column(Integer, default=0)
    keyframe_boundary: Mapped[bool] = mapped_column(Boolean, default=False)  # Was this boundary a keyframe?
    frames_since_last_keyframe: Mapped[int] = mapped_column(Integer, default=0)
    
    # Recording status (for monitoring)
    recording_status: Mapped[str] = mapped_column(String, default="recording")  # recording, finalizing, completed, failed
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Flags
    auto_recorded: Mapped[bool] = mapped_column(Boolean, default=True)  # Distinguish from manual recording
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=lambda: datetime.now(timezone.utc), 
        onupdate=lambda: datetime.now(timezone.utc)
    )
    
    def to_dict(self) -> dict:
        """Convert SegmentMetadata to dictionary."""
        return {
            'id': self.id,
            'mint_id': self.mint_id,
            'recording_session_id': self.recording_session_id,
            'segment_index': self.segment_index,
            'segment_path': self.segment_path,
            'video_id': self.video_id,
            'segment_timestamp': self.start_timestamp.strftime('%Y%m%d_%H%M%S') if self.start_timestamp else None,
            'segment_duration': self.end_timestamp and (self.end_timestamp - self.start_timestamp).total_seconds() or None,
            'expected_duration': self.expected_duration,
            'frames_captured': self.frames_captured,
            'packets_written': self.packets_written,
            'bytes_written': self.bytes_written,
            'file_size': self.bytes_written,
            'video_codec': self.video_codec,
            'video_bitrate': self.video_bitrate,
            'video_fps': self.video_fps,
            'audio_codec': self.audio_codec,
            'audio_bitrate': self.audio_bitrate,
            'keyframe_boundary': self.keyframe_boundary,
            'recording_status': self.recording_status,
            'auto_recorded': self.auto_recorded,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }