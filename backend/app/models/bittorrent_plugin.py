from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import Base


class BitTorrentSubscription(Base):
    __tablename__ = "bittorrent_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    search_term = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    torrents = relationship("BitTorrentTorrent", back_populates="subscription")


class BitTorrentTorrent(Base):
    __tablename__ = "bittorrent_torrents"
    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("bittorrent_subscriptions.id"))
    subscription = relationship("BitTorrentSubscription", back_populates="torrents")
    infohash = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    discovered_at = Column(DateTime(timezone=True), server_default=func.now())
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=True)
    video = relationship("Video")
    auto_download = Column(Boolean, default=True, nullable=False)
