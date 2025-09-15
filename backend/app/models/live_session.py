from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class LiveSession(Base):
    __tablename__ = 'live_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_name: Mapped[str] = mapped_column(String, nullable=False)
    participant_sid: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="active")  # active, completed, interrupted
    record_session: Mapped[bool] = mapped_column(Boolean, default=False)
    recording_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'room_name': self.room_name,
            'participant_sid': self.participant_sid,
            'status': self.status,
            'record_session': self.record_session,
            'recording_path': self.recording_path,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
