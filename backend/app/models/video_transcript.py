"""
VideoTranscript model for storing YouTube video transcripts and their summaries.

This module defines the database model for storing raw transcript content
and IPFS references to LLM-generated summaries.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.models.base import Base


class VideoTranscript(Base):
    """
    VideoTranscript model for storing YouTube video transcripts.

    Stores:
    - Raw transcript content (full text from YouTube auto-generated subtitles)
    - Summary CID (IPFS reference to LLM-generated summary JSON)
    - Timestamps for tracking processing

    Relationships:
    - video: Link to the Video table (one-to-one)
    """
    __tablename__ = "video_transcripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey('videos.id', ondelete='CASCADE'),
        nullable=False,
        unique=True,
        index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary_cid: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationship to Video table
    video: Mapped['Video'] = relationship(
        'Video',
        back_populates='transcript',
        uselist=False
    )

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            'id': self.id,
            'video_id': self.video_id,
            'content': self.content,
            'summary_cid': self.summary_cid,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
