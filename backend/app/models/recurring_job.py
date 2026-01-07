"""
Recurring job model for plugin system.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.base import Base


class RecurringJob(Base):
    """
    Recurring job definition for plugins.
    
    This model stores the configuration for jobs that run on a schedule
    (e.g., polling YouTube channel every hour).
    """
    __tablename__ = "recurring_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    plugin_name = Column(String, index=True, nullable=False)
    job_name = Column(String, index=True, nullable=False)
    
    # Cron-like schedule: "minute hour day month weekday"
    # Examples: "0 * * * *" (every hour), "*/30 * * * *" (every 30 minutes)
    schedule = Column(String, nullable=False)
    
    # Plugin method to call (e.g., "discover_sources", "poll_channel")
    method = Column(String, nullable=False)
    
    # What to do with results: "archive_all", "archive_new", "log_only"
    on_success = Column(String, default="log_only")
    
    # Job configuration (passed to plugin method)
    config = Column(JSON, default={})
    
    # Job status
    enabled = Column(Boolean, default=True)
    is_running = Column(Boolean, default=False)
    
    # Execution tracking
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True, index=True)
    
    # Statistics
    total_runs = Column(Integer, default=0)
    successful_runs = Column(Integer, default=0)
    failed_runs = Column(Integer, default=0)
    
    # Error tracking
    last_error = Column(String, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "plugin_name": self.plugin_name,
            "job_name": self.job_name,
            "schedule": self.schedule,
            "method": self.method,
            "on_success": self.on_success,
            "config": self.config,
            "enabled": self.enabled,
            "is_running": self.is_running,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "total_runs": self.total_runs,
            "successful_runs": self.successful_runs,
            "failed_runs": self.failed_runs,
            "last_error": self.last_error,
            "last_error_at": self.last_error_at.isoformat() if self.last_error_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }