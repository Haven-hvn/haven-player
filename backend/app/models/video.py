from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.analysis_job import AnalysisJob

class Video(Base):
    __tablename__ = 'videos'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    duration: Mapped[int] = mapped_column(Integer)
    has_ai_data: Mapped[bool] = mapped_column(Boolean, default=False)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    timestamps: Mapped[List['Timestamp']] = relationship('Timestamp', back_populates='video', cascade='all, delete-orphan')
    analysis_jobs: Mapped[List['AnalysisJob']] = relationship('AnalysisJob', back_populates='video', cascade='all, delete-orphan')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'path': self.path,
            'title': self.title,
            'duration': self.duration,
            'has_ai_data': self.has_ai_data,
            'thumbnail_path': self.thumbnail_path,
            'position': self.position,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Timestamp(Base):
    __tablename__ = 'timestamps'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_path: Mapped[str] = mapped_column(String, ForeignKey('videos.path'))
    tag_name: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[Optional[float]] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    video: Mapped[Video] = relationship('Video', back_populates='timestamps')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'video_path': self.video_path,
            'tag_name': self.tag_name,
            'start_time': self.start_time,
            'end_time': self.end_time,
            'confidence': self.confidence
        }
