"""
Plugin configuration model for Haven Player.

This module defines the database model for storing plugin configuration.
"""

from sqlalchemy import Column, String, Boolean, JSON, Integer, DateTime, text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4

from app.models.base import Base


class Plugin(Base):
    """
    Plugin configuration model.
    
    This table stores configuration for plugins that have been enabled
    and configured by the user.
    """
    
    __tablename__ = "plugins"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()"))
    name = Column(String(255), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    config = Column(JSON, nullable=True)
    priority = Column(Integer, default=0, nullable=False)
    version = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<Plugin {self.name} (enabled={self.enabled})>"
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": str(self.id),
            "name": self.name,
            "enabled": self.enabled,
            "config": self.config,
            "priority": self.priority,
            "version": self.version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
