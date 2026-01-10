from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Text, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class AppConfig(Base):
    __tablename__ = 'app_config'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # AI Analysis Configuration
    analysis_tags: Mapped[str] = mapped_column(Text, default="person,car,bicycle,motorcycle,airplane,bus,train,truck,boat,traffic_light,stop_sign,walking,running,standing,sitting,talking,eating,drinking,phone,laptop,book,bag,umbrella,skateboard,surfboard,tennis_racket")
    # LLM Configuration
    llm_base_url: Mapped[str] = mapped_column(String, default="http://localhost:1234")
    llm_model: Mapped[str] = mapped_column(String, default="HuggingFaceTB/SmolVLM-Instruct")
    # Processing Configuration
    max_batch_size: Mapped[int] = mapped_column(Integer, default=1)
    # Recording Configuration
    recording_directory: Mapped[str] = mapped_column(String, default="~/.haven-player/recordings")
    # Global Plugin Configuration
    download_directory: Mapped[str] = mapped_column(String, default="downloads")
    # Upload Coordinator Configuration
    upload_coordinator_enabled: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # None = auto-detect
    upload_coordinator_plugin_overrides: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    upload_coordinator_priority: Mapped[int] = mapped_column(Integer, default=0)
    # Metadata
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'analysis_tags': self.analysis_tags,
            'llm_base_url': self.llm_base_url,
            'llm_model': self.llm_model,
            'max_batch_size': self.max_batch_size,
            'recording_directory': self.recording_directory,
            'download_directory': self.download_directory,
            'upload_coordinator_enabled': self.upload_coordinator_enabled,
            'upload_coordinator_plugin_overrides': self.upload_coordinator_plugin_overrides,
            'upload_coordinator_priority': self.upload_coordinator_priority,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

