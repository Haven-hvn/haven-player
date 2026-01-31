"""
UploadQueue model for managing FileCoin upload queue.

This model tracks videos that need to be uploaded to FileCoin, including
their status, priority, and retry attempts.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class UploadQueue(Base):
    """
    UploadQueue model for tracking FileCoin upload jobs.

    This model maintains a queue of videos waiting to be uploaded to FileCoin,
    supporting retry logic, priority ordering, and tracking upload status.
    """
    __tablename__ = 'upload_queue'

    # Primary key
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Video reference (unique to prevent duplicates)
    video_path: Mapped[str] = mapped_column(String, nullable=False, index=True, unique=True)

    # Upload status
    # - pending: Waiting to be uploaded
    # - processing: Currently being uploaded
    # - completed: Successfully uploaded
    # - failed: Upload failed (may retry)
    # - cancelled: Upload cancelled by user
    status: Mapped[str] = mapped_column(String, default='pending', nullable=False)

    # Priority (higher values = higher priority)
    priority: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Retry tracking
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Error tracking
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    # Source tracking (where did this upload request come from?)
    # - plugin: Auto-upload from plugin download
    # - manual: Manually queued by user
    # - depin: Queued by DePinDashboard
    source: Mapped[str] = mapped_column(String, default='plugin', nullable=False)

    # Arkiv sync state tracking
    # - pending: Waiting for Arkiv sync (FileCoin upload completed, video flagged for sync)
    # - syncing: Arkiv sync in progress
    # - completed: Arkiv sync successful
    # - failed: Arkiv sync failed
    # - skipped: Arkiv sync intentionally skipped (no timestamps or share_to_arkiv=false)
    arkiv_sync_status: Mapped[str] = mapped_column(String, nullable=True)
    arkiv_sync_started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    arkiv_sync_completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    arkiv_sync_error: Mapped[str] = mapped_column(Text, nullable=True)

    # VLM analysis state tracking
    # - pending: Waiting for VLM analysis (if enabled)
    # - processing: VLM analysis in progress
    # - completed: VLM analysis successful
    # - failed: VLM analysis failed
    # - skipped: VLM analysis skipped (disabled or not needed)
    vlm_analysis_status: Mapped[str] = mapped_column(String, nullable=True)
    vlm_analysis_started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    vlm_analysis_completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    vlm_analysis_error: Mapped[str] = mapped_column(Text, nullable=True)
    
    # VLM JSON file upload state tracking
    # - pending: JSON file ready to upload to IPFS
    # - processing: JSON upload in progress
    # - completed: JSON uploaded successfully
    # - failed: JSON upload failed
    vlm_json_upload_status: Mapped[str] = mapped_column(String, nullable=True)
    vlm_json_upload_started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    vlm_json_upload_completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    vlm_json_upload_error: Mapped[str] = mapped_column(Text, nullable=True)

    # Overall status and failure sink
    # - pending: Job is pending (no stage has started)
    # - processing: At least one stage is in progress
    # - completed: All required stages completed successfully
    # - failed: One or more stages failed (job is in the failure sink)
    overall_status: Mapped[str] = mapped_column(String, default='pending', nullable=False, index=True)
    
    # Which stage failed (if overall_status is 'failed')
    # - download: Video download failed
    # - upload: FileCoin upload failed
    # - vlm_analysis: VLM analysis failed
    # - vlm_json_upload: VLM JSON upload failed
    # - arkiv_sync: Arkiv sync failed
    failed_stage: Mapped[str] = mapped_column(String, nullable=True, index=True)
    
    # When the failure occurred
    failed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    # Detailed error message for the failure
    failure_reason: Mapped[str] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        """
        Convert UploadQueue to dictionary representation.

        Returns:
            Dictionary with all upload queue fields
        """
        return {
            'id': self.id,
            'video_path': self.video_path,
            'status': self.status,
            'priority': self.priority,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'attempts': self.attempts,
            'max_attempts': self.max_attempts,
            'error_message': self.error_message,
            'source': self.source,
            'arkiv_sync_status': self.arkiv_sync_status,
            'arkiv_sync_started_at': self.arkiv_sync_started_at.isoformat() if self.arkiv_sync_started_at else None,
            'arkiv_sync_completed_at': self.arkiv_sync_completed_at.isoformat() if self.arkiv_sync_completed_at else None,
            'arkiv_sync_error': self.arkiv_sync_error,
            'vlm_analysis_status': self.vlm_analysis_status,
            'vlm_analysis_started_at': self.vlm_analysis_started_at.isoformat() if self.vlm_analysis_started_at else None,
            'vlm_analysis_completed_at': self.vlm_analysis_completed_at.isoformat() if self.vlm_analysis_completed_at else None,
            'vlm_analysis_error': self.vlm_analysis_error,
            'vlm_json_upload_status': self.vlm_json_upload_status,
            'vlm_json_upload_started_at': self.vlm_json_upload_started_at.isoformat() if self.vlm_json_upload_started_at else None,
            'vlm_json_upload_completed_at': self.vlm_json_upload_completed_at.isoformat() if self.vlm_json_upload_completed_at else None,
            'vlm_json_upload_error': self.vlm_json_upload_error,
            'overall_status': self.overall_status,
            'failed_stage': self.failed_stage,
            'failed_at': self.failed_at.isoformat() if self.failed_at else None,
            'failure_reason': self.failure_reason,
        }

    def can_retry(self) -> bool:
        """
        Check if this upload can be retried.

        Returns:
            True if attempts < max_attempts, False otherwise
        """
        return self.attempts < self.max_attempts

    def is_pending(self) -> bool:
        """
        Check if this upload is pending.

        Returns:
            True if status is 'pending', False otherwise
        """
        return self.status == 'pending'

    def is_processing(self) -> bool:
        """
        Check if this upload is currently processing.

        Returns:
            True if status is 'processing', False otherwise
        """
        return self.status == 'processing'

    def is_completed(self) -> bool:
        """
        Check if this upload completed successfully.

        Returns:
            True if status is 'completed', False otherwise
        """
        return self.status == 'completed'

    def is_failed(self) -> bool:
        """
        Check if this upload failed.

        Returns:
            True if status is 'failed', False otherwise
        """
        return self.status == 'failed'

    def needs_arkiv_sync(self) -> bool:
        """
        Check if video needs Arkiv sync.

        Returns:
            True if arkiv_sync_status is 'pending', False otherwise
        """
        return self.arkiv_sync_status == 'pending'

    def is_arkiv_pending(self) -> bool:
        """
        Check if Arkiv sync is pending.

        Returns:
            True if arkiv_sync_status is 'pending', False otherwise
        """
        return self.arkiv_sync_status == 'pending'

    def is_arkiv_syncing(self) -> bool:
        """
        Check if Arkiv sync is in progress.

        Returns:
            True if arkiv_sync_status is 'syncing', False otherwise
        """
        return self.arkiv_sync_status == 'syncing'

    def is_arkiv_completed(self) -> bool:
        """
        Check if Arkiv sync completed successfully.

        Returns:
            True if arkiv_sync_status is 'completed', False otherwise
        """
        return self.arkiv_sync_status == 'completed'

    def is_arkiv_failed(self) -> bool:
        """
        Check if Arkiv sync failed.

        Returns:
            True if arkiv_sync_status is 'failed', False otherwise
        """
        return self.arkiv_sync_status == 'failed'

    def can_retry_arkiv_sync(self) -> bool:
        """
        Check if Arkiv sync can be retried.

        Currently returns False as we don't support automatic retries for Arkiv sync.
        This can be extended later based on error type.

        Returns:
            False (no automatic retry supported yet)
        """
        return False

    def is_vlm_pending(self) -> bool:
        """
        Check if VLM analysis is pending.

        Returns:
            True if vlm_analysis_status is 'pending', False otherwise
        """
        return self.vlm_analysis_status == 'pending'

    def is_vlm_processing(self) -> bool:
        """
        Check if VLM analysis is in progress.

        Returns:
            True if vlm_analysis_status is 'processing', False otherwise
        """
        return self.vlm_analysis_status == 'processing'

    def is_vlm_completed(self) -> bool:
        """
        Check if VLM analysis completed successfully.

        Returns:
            True if vlm_analysis_status is 'completed', False otherwise
        """
        return self.vlm_analysis_status == 'completed'

    def is_vlm_failed(self) -> bool:
        """
        Check if VLM analysis failed.

        Returns:
            True if vlm_analysis_status is 'failed', False otherwise
        """
        return self.vlm_analysis_status == 'failed'

    def is_vlm_skipped(self) -> bool:
        """
        Check if VLM analysis was skipped.

        Returns:
            True if vlm_analysis_status is 'skipped', False otherwise
        """
        return self.vlm_analysis_status == 'skipped'

    def is_vlm_json_pending(self) -> bool:
        """
        Check if VLM JSON upload is pending.

        Returns:
            True if vlm_json_upload_status is 'pending', False otherwise
        """
        return self.vlm_json_upload_status == 'pending'

    def is_vlm_json_processing(self) -> bool:
        """
        Check if VLM JSON upload is in progress.

        Returns:
            True if vlm_json_upload_status is 'processing', False otherwise
        """
        return self.vlm_json_upload_status == 'processing'

    def is_vlm_json_completed(self) -> bool:
        """
        Check if VLM JSON upload completed successfully.

        Returns:
            True if vlm_json_upload_status is 'completed', False otherwise
        """
        return self.vlm_json_upload_status == 'completed'

    def is_vlm_json_failed(self) -> bool:
        """
        Check if VLM JSON upload failed.

        Returns:
            True if vlm_json_upload_status is 'failed', False otherwise
        """
        return self.vlm_json_upload_status == 'failed'

    def is_overall_failed(self) -> bool:
        """
        Check if the overall job has failed (in the failure sink).

        Returns:
            True if overall_status is 'failed', False otherwise
        """
        return self.overall_status == 'failed'

    def is_overall_processing(self) -> bool:
        """
        Check if the overall job is processing.

        Returns:
            True if overall_status is 'processing', False otherwise
        """
        return self.overall_status == 'processing'

    def is_overall_completed(self) -> bool:
        """
        Check if the overall job is completed.

        Returns:
            True if overall_status is 'completed', False otherwise
        """
        return self.overall_status == 'completed'

    def mark_as_failed(self, stage: str, reason: str) -> None:
        """
        Mark the job as failed in the failure sink.

        This prevents downstream stages from running.

        Args:
            stage: Which stage failed (download, upload, vlm_analysis, vlm_json_upload, arkiv_sync)
            reason: Detailed error message
        """
        from datetime import datetime, timezone
        self.overall_status = 'failed'
        self.failed_stage = stage
        self.failed_at = datetime.now(timezone.utc)
        self.failure_reason = reason

    def can_proceed(self) -> bool:
        """
        Check if downstream stages can proceed.

        Returns:
            True if job is not in failure sink, False otherwise
        """
        return self.overall_status != 'failed'

    def update_overall_status(self) -> None:
        """
        Update overall status based on individual stage statuses.

        This should be called after any stage status change.
        """
        # If already failed, stay failed
        if self.overall_status == 'failed':
            return

        # Check if any stage is processing
        if (self.status == 'processing' or
            self.vlm_analysis_status == 'processing' or
            self.vlm_json_upload_status == 'processing' or
            self.arkiv_sync_status == 'syncing'):
            self.overall_status = 'processing'
            return

        # Check if all required stages are completed
        # Required stages: upload (status='completed')
        # Optional stages: vlm_analysis, vlm_json_upload, arkiv_sync
        upload_complete = self.status == 'completed'
        vlm_complete = (self.vlm_analysis_status in ['completed', 'skipped'] or
                       self.vlm_analysis_status is None)
        vlm_json_complete = (self.vlm_json_upload_status in ['completed', 'skipped'] or
                            self.vlm_json_upload_status is None)
        arkiv_complete = (self.arkiv_sync_status in ['completed', 'skipped'] or
                         self.arkiv_sync_status is None)

        if upload_complete and vlm_complete and vlm_json_complete and arkiv_complete:
            self.overall_status = 'completed'
        else:
            self.overall_status = 'processing'
