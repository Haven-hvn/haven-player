from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Text, Boolean, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class LiveSession(Base):
    __tablename__ = 'live_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # Pump.fun specific fields
    mint_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    coin_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    coin_symbol: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    coin_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    creator: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usd_market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    num_participants: Mapped[int] = mapped_column(Integer, default=0)
    nsfw: Mapped[bool] = mapped_column(Boolean, default=False)
    website: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    twitter: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    telegram: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # LiveKit session fields
    room_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # LiveKit room name (different from mint_id)
    participant_sid: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="active")  # active, completed, interrupted
    
    # Recording fields
    record_session: Mapped[bool] = mapped_column(Boolean, default=False)
    recording_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Timestamps
    start_time: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            # Pump.fun fields
            'mint_id': self.mint_id,
            'coin_name': self.coin_name,
            'coin_symbol': self.coin_symbol,
            'coin_description': self.coin_description,
            'image_uri': self.image_uri,
            'thumbnail': self.thumbnail,
            'creator': self.creator,
            'market_cap': self.market_cap,
            'usd_market_cap': self.usd_market_cap,
            'num_participants': self.num_participants,
            'nsfw': self.nsfw,
            'website': self.website,
            'twitter': self.twitter,
            'telegram': self.telegram,
            # LiveKit fields
            'room_name': self.room_name,
            'participant_sid': self.participant_sid,
            'status': self.status,
            # Recording fields
            'record_session': self.record_session,
            'recording_path': self.recording_path,
            # Timestamps
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
