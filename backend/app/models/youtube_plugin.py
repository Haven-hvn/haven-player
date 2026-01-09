"""
YouTube plugin data models for Haven Player.

This module defines the database models for storing YouTube channel subscriptions
and video download history.
"""

from sqlalchemy import Column, String, Boolean, JSON, Integer, DateTime, text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.models.base import Base


class YouTubeChannel(Base):
    """
    YouTube channel subscription model.
    
    This table stores channel subscriptions for the YouTube plugin.
    """
    
    __tablename__ = "youtube_channels"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    channel_id = Column(String(255), nullable=False, unique=True, index=True)
    channel_name = Column(String(500), nullable=True)
    channel_url = Column(String(500), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    download_videos = Column(Boolean, default=True, nullable=False)
    video_format = Column(String(50), default="best", nullable=False)
    download_subtitles = Column(Boolean, default=False, nullable=False)
    auto_archive = Column(Boolean, default=True, nullable=False)
    config = Column(JSON, nullable=True)
    last_polled_at = Column(DateTime, nullable=True)
    last_video_count = Column(Integer, default=0, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship to videos
    videos = relationship("YouTubeVideo", back_populates="channel", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<YouTubeChannel {self.channel_name} ({self.channel_id})>"
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "channel_id": self.channel_id,
            "channel_name": self.channel_name,
            "channel_url": self.channel_url,
            "enabled": self.enabled,
            "download_videos": self.download_videos,
            "video_format": self.video_format,
            "download_subtitles": self.download_subtitles,
            "auto_archive": self.auto_archive,
            "config": self.config,
            "last_polled_at": self.last_polled_at.isoformat() if self.last_polled_at else None,
            "last_video_count": self.last_video_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class YouTubeVideo(Base):
    """
    YouTube video download tracking model.
    
    This table tracks videos discovered from subscribed channels and their download status.
    """
    
    __tablename__ = "youtube_videos"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    video_id = Column(String(50), nullable=False, unique=True, index=True)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("youtube_channels.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(1000), nullable=True)
    video_url = Column(String(500), nullable=False)
    thumbnail_url = Column(String(500), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    upload_date = Column(DateTime, nullable=True)
    discovered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Download status
    download_status = Column(String(50), default="pending", nullable=False)  # pending, downloading, completed, failed
    download_started_at = Column(DateTime, nullable=True)
    download_completed_at = Column(DateTime, nullable=True)
    output_path = Column(String(1000), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    error_message = Column(String(1000), nullable=True)
    
    # Metadata
    video_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship to channel
    channel = relationship("YouTubeChannel", back_populates="videos")
    
    def __repr__(self):
        return f"<YouTubeVideo {self.video_id} ({self.title})>"
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "video_id": self.video_id,
            "channel_id": str(self.channel_id),
            "title": self.title,
            "video_url": self.video_url,
            "thumbnail_url": self.thumbnail_url,
            "duration_seconds": self.duration_seconds,
            "upload_date": self.upload_date.isoformat() if self.upload_date else None,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
            "download_status": self.download_status,
            "download_started_at": self.download_started_at.isoformat() if self.download_started_at else None,
            "download_completed_at": self.download_completed_at.isoformat() if self.download_completed_at else None,
            "output_path": self.output_path,
            "file_size_bytes": self.file_size_bytes,
            "error_message": self.error_message,
            "video_metadata": self.video_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }