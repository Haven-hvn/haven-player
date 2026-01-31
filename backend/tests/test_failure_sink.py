"""
Test failure sink functionality.

This test verifies that:
1. Jobs are marked as failed when a stage fails
2. Downstream stages are skipped when a job is in the failure sink
3. Overall status is updated correctly
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_failure_sink.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create a fresh database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_mark_as_failed(db_session):
    """Test that mark_as_failed correctly sets failure sink fields."""
    # Create a test queue entry
    queue_entry = UploadQueue(
        video_path="/test/video.mp4",
        priority=0,
        source="test",
        status="pending",
    )
    db_session.add(queue_entry)
    db_session.commit()
    db_session.refresh(queue_entry)

    # Mark as failed
    queue_entry.mark_as_failed(
        stage="upload",
        reason="Test upload failure"
    )
    db_session.commit()
    db_session.refresh(queue_entry)

    # Verify failure sink fields
    assert queue_entry.overall_status == "failed"
    assert queue_entry.failed_stage == "upload"
    assert queue_entry.failed_at is not None
    assert queue_entry.failure_reason == "Test upload failure"

    # Verify helper methods
    assert queue_entry.is_overall_failed() is True
    assert queue_entry.can_proceed() is False


def test_can_proceed(db_session):
    """Test that can_proceed returns False for failed jobs."""
    # Create a test queue entry
    queue_entry = UploadQueue(
        video_path="/test/video2.mp4",
        priority=0,
        source="test",
        status="pending",
    )
    db_session.add(queue_entry)
    db_session.commit()
    db_session.refresh(queue_entry)

    # Initially should be able to proceed
    assert queue_entry.can_proceed() is True

    # Mark as failed
    queue_entry.mark_as_failed(
        stage="vlm_analysis",
        reason="Test VLM failure"
    )
    db_session.commit()
    db_session.refresh(queue_entry)

    # Now should not be able to proceed
    assert queue_entry.can_proceed() is False


def test_update_overall_status(db_session):
    """Test that update_overall_status correctly updates overall status."""
    # Create a test queue entry
    queue_entry = UploadQueue(
        video_path="/test/video3.mp4",
        priority=0,
        source="test",
        status="pending",
    )
    db_session.add(queue_entry)
    db_session.commit()
    db_session.refresh(queue_entry)

    # Initially pending
    assert queue_entry.overall_status == "pending"

    # Mark upload as processing
    queue_entry.status = "processing"
    queue_entry.update_overall_status()
    db_session.commit()
    db_session.refresh(queue_entry)

    assert queue_entry.overall_status == "processing"

    # Mark upload as completed
    queue_entry.status = "completed"
    queue_entry.vlm_analysis_status = "skipped"
    queue_entry.vlm_json_upload_status = None
    queue_entry.arkiv_sync_status = None
    queue_entry.update_overall_status()
    db_session.commit()
    db_session.refresh(queue_entry)

    assert queue_entry.overall_status == "completed"


def test_failure_prevents_downstream(db_session):
    """Test that failure prevents downstream stages from running."""
    # Create a test queue entry
    queue_entry = UploadQueue(
        video_path="/test/video4.mp4",
        priority=0,
        source="test",
        status="pending",
        vlm_analysis_status="pending",
    )
    db_session.add(queue_entry)
    db_session.commit()
    db_session.refresh(queue_entry)

    # Mark upload as failed
    queue_entry.mark_as_failed(
        stage="upload",
        reason="Encryption failed"
    )
    db_session.commit()
    db_session.refresh(queue_entry)

    # Verify VLM analysis is still pending (not automatically skipped)
    # The API endpoint should skip it when it tries to process
    assert queue_entry.vlm_analysis_status == "pending"

    # Verify job cannot proceed
    assert queue_entry.can_proceed() is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
