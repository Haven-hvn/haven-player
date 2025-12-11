from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime, Text
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
    phash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    file_extension: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    codec: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    creator_handle: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_uri: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    analysis_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    share_to_arkiv: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    arkiv_entity_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Pump.fun token association
    mint_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    
    # Filecoin storage metadata
    filecoin_root_cid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    filecoin_piece_cid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    filecoin_piece_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    filecoin_data_set_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    filecoin_uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cid_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # SHA256 hash of filecoin_root_cid for Arkiv dedupe
    encrypted_filecoin_cid: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Lit-encrypted CID for Arkiv sync when encrypted
    
    # Lit Protocol encryption metadata
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lit_encryption_metadata: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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
            'phash': self.phash,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'file_size': self.file_size,
            'file_extension': self.file_extension,
            'mime_type': self.mime_type,
            'codec': self.codec,
            'creator_handle': self.creator_handle,
            'source_uri': self.source_uri,
            'analysis_model': self.analysis_model,
            'share_to_arkiv': self.share_to_arkiv,
            'arkiv_entity_key': self.arkiv_entity_key,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'mint_id': self.mint_id,
            'filecoin_root_cid': self.filecoin_root_cid,
            'filecoin_piece_cid': self.filecoin_piece_cid,
            'filecoin_piece_id': self.filecoin_piece_id,
            'filecoin_data_set_id': self.filecoin_data_set_id,
            'filecoin_uploaded_at': self.filecoin_uploaded_at.isoformat() if self.filecoin_uploaded_at else None,
            'cid_hash': self.cid_hash,
            'encrypted_filecoin_cid': self.encrypted_filecoin_cid,
            'is_encrypted': self.is_encrypted,
            'lit_encryption_metadata': self.lit_encryption_metadata,
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
