"""
Unit tests for UploadQueue model VLM fields.

Tests the VLM analysis status fields and helper methods in the UploadQueue model.
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.upload_queue import UploadQueue
from app.models.video import Video


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_upload_queue_vlm_model.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Provide a database session for tests."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


class TestVLMAnalysisFields:
    """Test VLM analysis status fields in UploadQueue model."""

    def test_vlm_analysis_status_field_exists(self, db_session):
        """Test that vlm_analysis_status field exists in model."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="pending"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_status == "pending"

    def test_vlm_analysis_started_at_field(self, db_session):
        """Test vlm_analysis_started_at field."""
        started_time = datetime(2026, 1, 10, 12, 0, 0, tzinfo=timezone.utc)
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="processing",
            vlm_analysis_started_at=started_time
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_started_at == started_time

    def test_vlm_analysis_completed_at_field(self, db_session):
        """Test vlm_analysis_completed_at field."""
        completed_time = datetime(2026, 1, 10, 12, 30, 0, tzinfo=timezone.utc)
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="completed",
            vlm_analysis_completed_at=completed_time
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_completed_at == completed_time

    def test_vlm_analysis_error_field(self, db_session):
        """Test vlm_analysis_error field."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="failed",
            vlm_analysis_error="VLM processing timed out"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_error == "VLM processing timed out"

    def test_vlm_analysis_status_nullable(self, db_session):
        """Test that vlm_analysis_status can be None (nullable)."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status=None
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_status is None

    def test_vlm_analysis_timestamps_nullable(self, db_session):
        """Test that VLM analysis timestamps can be None."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="pending",
            vlm_analysis_started_at=None,
            vlm_analysis_completed_at=None
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.vlm_analysis_started_at is None
        assert retrieved.vlm_analysis_completed_at is None


class TestVLMAnalysisHelperMethods:
    """Test VLM analysis helper methods."""

    def test_is_vlm_pending(self, db_session):
        """Test is_vlm_pending() method."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="pending"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is True
        assert retrieved.is_vlm_processing() is False
        assert retrieved.is_vlm_completed() is False
        assert retrieved.is_vlm_failed() is False
        assert retrieved.is_vlm_skipped() is False

    def test_is_vlm_processing(self, db_session):
        """Test is_vlm_processing() method."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is False
        assert retrieved.is_vlm_processing() is True
        assert retrieved.is_vlm_completed() is False
        assert retrieved.is_vlm_failed() is False
        assert retrieved.is_vlm_skipped() is False

    def test_is_vlm_completed(self, db_session):
        """Test is_vlm_completed() method."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="completed"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is False
        assert retrieved.is_vlm_processing() is False
        assert retrieved.is_vlm_completed() is True
        assert retrieved.is_vlm_failed() is False
        assert retrieved.is_vlm_skipped() is False

    def test_is_vlm_failed(self, db_session):
        """Test is_vlm_failed() method."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="failed"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is False
        assert retrieved.is_vlm_processing() is False
        assert retrieved.is_vlm_completed() is False
        assert retrieved.is_vlm_failed() is True
        assert retrieved.is_vlm_skipped() is False

    def test_is_vlm_skipped(self, db_session):
        """Test is_vlm_skipped() method."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="skipped"
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is False
        assert retrieved.is_vlm_processing() is False
        assert retrieved.is_vlm_completed() is False
        assert retrieved.is_vlm_failed() is False
        assert retrieved.is_vlm_skipped() is True

    def test_is_vlm_status_none(self, db_session):
        """Test VLM status helpers when status is None."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status=None
        )
        db_session.add(entry)
        db_session.commit()

        retrieved = db_session.query(UploadQueue).first()
        assert retrieved.is_vlm_pending() is False
        assert retrieved.is_vlm_processing() is False
        assert retrieved.is_vlm_completed() is False
        assert retrieved.is_vlm_failed() is False
        assert retrieved.is_vlm_skipped() is False


class TestToDictWithVLMFields:
    """Test to_dict() method includes VLM fields."""

    def test_to_dict_includes_vlm_fields(self, db_session):
        """Test that to_dict() includes all VLM fields."""
        started_time = datetime(2026, 1, 10, 12, 0, 0, tzinfo=timezone.utc)
        completed_time = datetime(2026, 1, 10, 12, 30, 0, tzinfo=timezone.utc)

        entry = UploadQueue(
            id=1,
            video_path="/test/video.mp4",
            status="completed",
            vlm_analysis_status="completed",
            vlm_analysis_started_at=started_time,
            vlm_analysis_completed_at=completed_time,
            vlm_analysis_error=None
        )
        db_session.add(entry)
        db_session.commit()

        result = entry.to_dict()

        # Verify VLM fields are included
        assert "vlm_analysis_status" in result
        assert "vlm_analysis_started_at" in result
        assert "vlm_analysis_completed_at" in result
        assert "vlm_analysis_error" in result

        # Verify values
        assert result["vlm_analysis_status"] == "completed"
        assert result["vlm_analysis_started_at"] == started_time.isoformat()
        assert result["vlm_analysis_completed_at"] == completed_time.isoformat()
        assert result["vlm_analysis_error"] is None

    def test_to_dict_with_null_vlm_timestamps(self, db_session):
        """Test to_dict() handles null VLM timestamps."""
        entry = UploadQueue(
            id=1,
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            vlm_analysis_started_at=None,
            vlm_analysis_completed_at=None,
            vlm_analysis_error=None
        )
        db_session.add(entry)
        db_session.commit()

        result = entry.to_dict()

        assert result["vlm_analysis_started_at"] is None
        assert result["vlm_analysis_completed_at"] is None

    def test_to_dict_with_vlm_error(self, db_session):
        """Test to_dict() includes VLM error message."""
        entry = UploadQueue(
            id=1,
            video_path="/test/video.mp4",
            status="failed",
            vlm_analysis_status="failed",
            vlm_analysis_error="VLM processing error"
        )
        db_session.add(entry)
        db_session.commit()

        result = entry.to_dict()

        assert result["vlm_analysis_error"] == "VLM processing error"


class TestVLMAnalysisStatusTransitions:
    """Test VLM analysis status transitions."""

    def test_pending_to_processing(self, db_session):
        """Test status transition from pending to processing."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="pending"
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_vlm_pending()

        # Transition
        entry.vlm_analysis_status = "processing"
        entry.vlm_analysis_started_at = datetime.now(timezone.utc)
        db_session.commit()

        assert entry.is_vlm_processing()

    def test_processing_to_completed(self, db_session):
        """Test status transition from processing to completed."""
        started_time = datetime.now(timezone.utc)

        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="processing",
            vlm_analysis_started_at=started_time
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_vlm_processing()

        # Transition
        entry.vlm_analysis_status = "completed"
        entry.vlm_analysis_completed_at = datetime.now(timezone.utc)
        db_session.commit()

        assert entry.is_vlm_completed()

    def test_processing_to_failed(self, db_session):
        """Test status transition from processing to failed."""
        started_time = datetime.now(timezone.utc)

        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="processing",
            vlm_analysis_started_at=started_time
        )
        db_session.add(entry)
        db_session.commit()

        # Transition
        entry.vlm_analysis_status = "failed"
        entry.vlm_analysis_error = "Processing failed"
        entry.vlm_analysis_completed_at = datetime.now(timezone.utc)
        db_session.commit()

        assert entry.is_vlm_failed()
        assert entry.vlm_analysis_error == "Processing failed"

    def test_processing_to_skipped(self, db_session):
        """Test status transition from processing to skipped."""
        started_time = datetime.now(timezone.utc)

        entry = UploadQueue(
            video_path="/test/video.mp4",
            vlm_analysis_status="processing",
            vlm_analysis_started_at=started_time
        )
        db_session.add(entry)
        db_session.commit()

        # Transition
        entry.vlm_analysis_status = "skipped"
        entry.vlm_analysis_error = "VLM disabled for this video"
        entry.vlm_analysis_completed_at = datetime.now(timezone.utc)
        db_session.commit()

        assert entry.is_vlm_skipped()
        assert entry.vlm_analysis_error == "VLM disabled for this video"


class TestVLMAndFileCoinParallelExecution:
    """Test scenarios for parallel VLM and FileCoin execution."""

    def test_both_pending_initial_state(self, db_session):
        """Test initial state with both FileCoin and VLM pending."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending"
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_pending()
        assert entry.is_vlm_pending()

    def test_vlm_completes_before_filecoin(self, db_session):
        """Test scenario where VLM completes before FileCoin."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="processing",
            vlm_analysis_status="completed",
            vlm_analysis_completed_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_processing()  # FileCoin still in progress
        assert entry.is_vlm_completed()  # VLM completed

    def test_filecoin_completes_before_vlm(self, db_session):
        """Test scenario where FileCoin completes before VLM."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            completed_at=datetime.now(timezone.utc),
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_completed()  # FileCoin completed
        assert entry.is_vlm_processing()  # VLM still in progress

    def test_both_completed(self, db_session):
        """Test scenario where both FileCoin and VLM complete."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            completed_at=datetime.now(timezone.utc),
            vlm_analysis_status="completed",
            vlm_analysis_completed_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_completed()
        assert entry.is_vlm_completed()

    def test_vlm_failed_filecoin_succeeds(self, db_session):
        """Test graceful degradation: VLM fails, FileCoin succeeds."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            completed_at=datetime.now(timezone.utc),
            vlm_analysis_status="failed",
            vlm_analysis_error="VLM processing error",
            vlm_analysis_completed_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_completed()  # FileCoin succeeded
        assert entry.is_vlm_failed()  # VLM failed
        assert entry.vlm_analysis_error is not None

    def test_vlm_skipped_filecoin_succeeds(self, db_session):
        """Test VLM skipped, FileCoin succeeds."""
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            completed_at=datetime.now(timezone.utc),
            vlm_analysis_status="skipped",
            vlm_analysis_error="VLM disabled",
            vlm_analysis_completed_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.is_completed()
        assert entry.is_vlm_skipped()

    def test_arkiv_sync_can_run_with_either_data(self, db_session):
        """Test that Arkiv sync is ready when either FileCoin or VLM completes."""
        from app.models.video import Video, Timestamp

        # Create video
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Scenario 1: FileCoin completed, VLM still pending
        entry1 = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            filecoin_root_cid="QmTest123",
            vlm_analysis_status="pending"
        )
        db_session.add(entry1)
        db_session.commit()

        # Arkiv can proceed with FileCoin data
        assert entry1.status == "completed"

        # Scenario 2: VLM completed, FileCoin still pending
        entry2 = UploadQueue(
            video_path="/test/video2.mp4",
            status="processing",
            vlm_analysis_status="completed"
        )
        db_session.add(entry2)
        db_session.commit()

        # Add timestamps
        timestamp = Timestamp(
            video_path="/test/video2.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        # Arkiv can proceed with timestamp data (when FileCoin completes)
        has_timestamps = db_session.query(Timestamp).filter(
            Timestamp.video_path == entry2.video_path
        ).count() > 0
        assert has_timestamps is True
