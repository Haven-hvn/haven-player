"""
WebRTC plugin data models for Haven Player.

This module defines the database models for storing WebRTC stream subscriptions
and recording history from LiveKit sources.
"""

from sqlalchemy import Column, String, Boolean, JSON, Integer, DateTime, text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.models.base import Base


class WebRTCSubscription(Base):
    """
    WebRTC stream subscription model.
    
    This table stores stream subscriptions for the WebRTC plugin, similar to
    YouTube channels but for WebRTC/LiveKit streams.
    """
    
    __tablename__ = "webrtc_subscriptions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    # Unique identifier for the stream (could be mint_id for PumpFun streams or external reference)
    stream_id = Column(String(255), nullable=False, unique=True, index=True)
    stream_name = Column(String(500), nullable=True)
    # LiveKit URL for this specific stream
    livekit_url = Column(String(500), nullable=False, default="wss://pump-prod-tg2x8veh.livekit.cloud")
    # LiveKit token or API credentials (encrypted)
    livekit_api_key = Column(String(255), nullable=True)
    livekit_api_secret = Column(String(255), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    auto_record = Column(Boolean, default=True, nullable=False)
    # Stream-specific configuration (quality settings, etc.)
    config = Column(JSON, nullable=True)
    last_polled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship to stream history
    sessions = relationship("WebRTCSession", back_populates="subscription", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<WebRTCSubscription {self.stream_name} ({self.stream_id})>"
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "stream_id": self.stream_id,
            "stream_name": self.stream_name,
            "livekit_url": self.livekit_url,
            "enabled": self.enabled,
            "auto_record": self.auto_record,
            "config": self.config,
            "last_polled_at": self.last_polled_at.isoformat() if self.last_polled_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WebRTCSession(Base):
    """
    WebRTS session tracking model.
    
    This table tracks discovered WebRTC streams and their recording status.
    Similar to YouTube videos but for WebRTC sessions.
    """
    
    __tablename__ = "webrtc_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    session_id = Column(String(255), nullable=False, unique=True, index=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("webrtc_subscriptions.id", ondelete="CASCADE"), nullable=False)
    stream_name = Column(String(500), nullable=True)
    stream_uri = Column(String(1000), nullable=True)
    # Recording status tracking
    recording_status = Column(String(50), default="pending", nullable=False)  # pending, recording, completed, failed
    recording_path = Column(String(1000), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    error_message = Column(String(1000), nullable=True)
    # Session metadata
    stream_metadata = Column(JSON, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship to subscription
    subscription = relationship("WebRTCSubscription", back_populates="sessions")
    
    def __repr__(self):
        return f"<WebRTCSession {self.session_id} ({self.stream_name})>"
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "session_id": self.session_id,
            "subscription_id": str(self.subscription_id),
            "stream_name": self.stream_name,
            "stream_uri": self.stream_uri,
            "recording_status": self.recording_status,
            "recording_path": self.recording_path,
            "file_size_bytes": self.file_size_bytes,
            "duration_seconds": self.duration_seconds,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }