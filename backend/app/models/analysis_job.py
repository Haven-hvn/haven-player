from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.models.base import Base

class AnalysisJob(Base):
    __tablename__ = 'analysis_jobs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_path: Mapped[str] = mapped_column(String, ForeignKey('videos.path'))
    status: Mapped[str] = mapped_column(String, default='pending')  # pending, processing, completed, failed
    progress: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    error: Mapped[Optional[str]] = mapped_column(String)
    
    video: Mapped['Video'] = relationship('Video', back_populates='analysis_jobs')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'video_path': self.video_path,
            'status': self.status,
            'progress': self.progress,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error': self.error
        }
