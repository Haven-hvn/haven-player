"""
Unit tests for upload_queue API endpoints.

Tests all API endpoints for managing the FileCoin upload queue.
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import Base
from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_upload_queue.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def client():
    """Create a test client for each test."""
    # Create tables
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    # Drop tables after test
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Provide a database session for tests that need direct DB access."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


class TestUploadQueueResponseSerialization:
    """Test UploadQueueResponse datetime serialization."""

    def test_upload_queue_response_datetime_serialization(self, db_session):
        """Test that UploadQueueResponse serializes datetime fields to ISO strings."""
        from app.api.upload_queue import UploadQueueResponse

        # Create a test UploadQueue entry
        created_time = datetime(2026, 1, 10, 2, 15, 51, 670858, tzinfo=timezone.utc)
        started_time = datetime(2026, 1, 10, 2, 20, 0, 0, tzinfo=timezone.utc)
        completed_time = datetime(2026, 1, 10, 2, 25, 0, 0, tzinfo=timezone.utc)

        entry = UploadQueue(
            id=1,
            video_path="/test/path/video.mp4",
            status="completed",
            priority=1,
            created_at=created_time,
            started_at=started_time,
            completed_at=completed_time,
            attempts=1,
            max_attempts=3,
            source="plugin"
        )

        # Validate and serialize using the response model
        response = UploadQueueResponse.model_validate(entry)

        # Check that datetime fields are serialized as strings
        assert isinstance(response.created_at, str)
        assert response.created_at == created_time.isoformat()

        assert isinstance(response.started_at, str)
        assert response.started_at == started_time.isoformat()

        assert isinstance(response.completed_at, str)
        assert response.completed_at == completed_time.isoformat()

    def test_upload_queue_response_with_null_datetimes(self, db_session):
        """Test that UploadQueueResponse handles null datetime fields correctly."""
        from app.api.upload_queue import UploadQueueResponse

        entry = UploadQueue(
            id=1,
            video_path="/test/path/video.mp4",
            status="pending",
            priority=0,
            created_at=datetime.now(timezone.utc),
            started_at=None,
            completed_at=None,
            attempts=0,
            max_attempts=3,
            source="plugin"
        )

        response = UploadQueueResponse.model_validate(entry)

        # Check that null datetime fields are returned as None
        assert response.started_at is None
        assert response.completed_at is None
        # created_at should be serialized
        assert isinstance(response.created_at, str)

    def test_upload_queue_response_model_validation(self, db_session):
        """Test that UploadQueueResponse validates data types correctly."""
        from app.api.upload_queue import UploadQueueResponse

        # Create response with datetime fields
        created_at = datetime.now(timezone.utc)
        response = UploadQueueResponse(
            id=1,
            video_path="/test/video.mp4",
            status="pending",
            priority=0,
            created_at=created_at,
            started_at=None,
            completed_at=None,
            attempts=0,
            max_attempts=3,
            source="plugin"
        )

        # Check that the model serializes datetimes correctly when serialized to dict
        response_dict = response.model_dump()
        assert isinstance(response_dict["created_at"], str)
        assert response_dict["created_at"] == created_at.isoformat()
        assert response_dict["started_at"] is None
        assert response_dict["completed_at"] is None

    def test_model_dump_json(self, db_session):
        """Test that model_dump_json produces correct JSON."""
        from app.api.upload_queue import UploadQueueResponse
        import json

        created_at = datetime(2026, 1, 9, 21, 15, 51, 670858, tzinfo=timezone.utc)

        entry = UploadQueue(
            id=1,
            video_path="/test/video.mp4",
            status="processing",
            priority=1,
            created_at=created_at,
            started_at=created_at,
            attempts=1,
            max_attempts=3,
            source="plugin"
        )

        response = UploadQueueResponse.model_validate(entry)

        # Test JSON serialization
        json_str = response.model_dump_json()

        # Parse and verify it's valid JSON with string datetimes
        parsed = json.loads(json_str)
        assert isinstance(parsed["created_at"], str)
        assert isinstance(parsed["started_at"], str)
        assert parsed["completed_at"] is None


class TestAddToUploadQueue:
    """Tests for POST /upload-queue endpoint."""

    def test_add_to_upload_queue_success(self, client: TestClient):
        """Test successfully adding a video to the upload queue."""
        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/downloads/test/video.mp4",
                "priority": 1,
                "source": "plugin"
            }
        )

        assert response.status_code == 201
        data = response.json()

        assert data["id"] is not None
        assert data["video_path"] == "/downloads/test/video.mp4"
        assert data["status"] == "pending"
        assert data["priority"] == 1
        assert data["source"] == "plugin"
        assert data["attempts"] == 0
        assert data["max_attempts"] == 3

        # Verify datetime fields are strings (ISO format)
        assert isinstance(data["created_at"], str)
        assert data["started_at"] is None
        assert data["completed_at"] is None

    def test_add_to_upload_queue_already_completed(self, client: TestClient, db_session):
        """Test adding a video that's already completed - should return existing entry."""
        # First, add a video and mark it as completed
        entry = UploadQueue(
            video_path="/downloads/test/video.mp4",
            status="completed",
            priority=0,
            source="plugin"
        )
        db_session.add(entry)
        db_session.commit()

        # Try to add it again
        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/downloads/test/video.mp4",
                "priority": 1,
                "source": "plugin"
            }
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "completed"
        assert isinstance(data["created_at"], str)

    def test_add_to_upload_queue_already_processing(self, client: TestClient, db_session):
        """Test adding a video that's currently processing - should raise conflict."""
        # Add a video in processing state
        entry = UploadQueue(
            video_path="/downloads/test/video.mp4",
            status="processing",
            priority=1,
            source="plugin"
        )
        db_session.add(entry)
        db_session.commit()

        # Try to add it again
        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/downloads/test/video.mp4",
                "priority": 1,
                "source": "plugin"
            }
        )

        assert response.status_code == 409
        assert "already being uploaded" in response.json()["detail"].lower()

    def test_add_to_upload_queue_failed_requeue(self, client: TestClient, db_session):
        """Test that a failed upload can be re-queued."""
        # Add a video that failed
        entry = UploadQueue(
            video_path="/downloads/test/video.mp4",
            status="failed",
            priority=0,
            attempts=1,
            max_attempts=3,
            error_message="Upload failed",
            source="plugin"
        )
        db_session.add(entry)
        db_session.commit()

        # Re-queue with higher priority
        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/downloads/test/video.mp4",
                "priority": 2,
                "source": "plugin"
            }
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "pending"
        assert data["priority"] == 2
        assert data["attempts"] == 0
        assert data["error_message"] is None
        assert isinstance(data["created_at"], str)


class TestListUploadQueue:
    """Tests for GET /upload-queue endpoint."""

    def test_list_upload_queue_no_filter(self, client: TestClient, db_session):
        """Test listing all upload queue entries."""
        # Add multiple entries with different statuses
        entries = [
            UploadQueue(video_path="/test/video1.mp4", status="pending", priority=1, source="plugin"),
            UploadQueue(video_path="/test/video2.mp4", status="processing", priority=2, source="manual"),
            UploadQueue(video_path="/test/video3.mp4", status="completed", priority=0, source="depin"),
        ]
        for entry in entries:
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

        # Verify all entries have datetime fields as strings
        for entry in data:
            assert isinstance(entry["created_at"], str)
            if entry["status"] == "processing":
                assert isinstance(entry["started_at"], str)
            if entry["status"] == "completed":
                assert isinstance(entry["completed_at"], str)

    def test_list_upload_queue_filter_by_status(self, client: TestClient, db_session):
        """Test filtering upload queue by status."""
        entries = [
            UploadQueue(video_path="/test/video1.mp4", status="pending", priority=0),
            UploadQueue(video_path="/test/video2.mp4", status="pending", priority=1),
            UploadQueue(video_path="/test/video3.mp4", status="completed", priority=0),
        ]
        for entry in entries:
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue?status=pending")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(entry["status"] == "pending" for entry in data)

    def test_list_upload_queue_filter_by_source(self, client: TestClient, db_session):
        """Test filtering upload queue by source."""
        entries = [
            UploadQueue(video_path="/test/video1.mp4", status="pending", source="plugin"),
            UploadQueue(video_path="/test/video2.mp4", status="pending", source="manual"),
            UploadQueue(video_path="/test/video3.mp4", status="pending", source="plugin"),
        ]
        for entry in entries:
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue?source=plugin")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(entry["source"] == "plugin" for entry in data)

    def test_list_upload_queue_limit(self, client: TestClient, db_session):
        """Test limiting the number of results."""
        for i in range(10):
            entry = UploadQueue(video_path=f"/test/video{i}.mp4", status="pending", priority=i)
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue?limit=5")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5


class TestGetNextPendingUpload:
    """Tests for GET /upload-queue/pop endpoint."""

    def test_get_next_pending_upload_success(self, client: TestClient, db_session):
        """Test getting the next pending upload."""
        # Add two pending entries with different priorities
        entry1 = UploadQueue(video_path="/test/priority_high.mp4", status="pending", priority=2)
        entry2 = UploadQueue(video_path="/test/priority_low.mp4", status="pending", priority=1)
        db_session.add(entry1)
        db_session.add(entry2)
        db_session.commit()

        response = client.get("/api/upload-queue/pop")

        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert data["video_path"] == "/test/priority_high.mp4"  # Higher priority
        assert data["status"] == "processing"
        assert data["attempts"] == 1
        assert isinstance(data["started_at"], str)

    def test_get_next_pending_upload_same_priority_oldest_first(self, client: TestClient, db_session):
        """Test that with same priority, oldest created_at is returned first."""
        import time

        # Add two entries with same priority
        entry1 = UploadQueue(video_path="/test/old.mp4", status="pending", priority=1)
        db_session.add(entry1)
        db_session.commit()
        db_session.refresh(entry1)

        time.sleep(0.1)  # Ensure time difference

        entry2 = UploadQueue(video_path="/test/new.mp4", status="pending", priority=1)
        db_session.add(entry2)
        db_session.commit()

        response = client.get("/api/upload-queue/pop")

        assert response.status_code == 200
        data = response.json()
        assert data["video_path"] == "/test/old.mp4"

    def test_get_next_pending_upload_no_jobs(self, client: TestClient):
        """Test getting next pending upload when no jobs available."""
        response = client.get("/api/upload-queue")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

        response = client.get("/api/upload-queue/pop")
        assert response.status_code == 200
        data = response.json()
        assert data is None


class TestUpdateUploadStatus:
    """Tests for PUT /upload-queue/{queue_id}/status endpoint."""

    def test_update_upload_status_to_processing(self, client: TestClient, db_session):
        """Test updating upload status to processing."""
        # Create a pending upload
        entry = UploadQueue(video_path="/test/video.mp4", status="pending", priority=1)
        db_session.add(entry)
        db_session.commit()

        # Update to processing
        response = client.put(
            f"/api/upload-queue/{entry.id}/status",
            json={"status": "processing"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert data["attempts"] == 1
        assert isinstance(data["started_at"], str)

    def test_update_upload_status_to_completed(self, client: TestClient, db_session):
        """Test updating upload status to completed."""
        entry = UploadQueue(video_path="/test/video.mp4", status="processing", priority=1, attempts=1)
        db_session.add(entry)
        db_session.commit()

        # Update to completed
        response = client.put(
            f"/api/upload-queue/{entry.id}/status",
            json={"status": "completed"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert isinstance(data["completed_at"], str)

    def test_update_upload_status_with_filecoin_metadata(self, client: TestClient, db_session):
        """Test updating upload status with FileCoin metadata."""
        # Add a video to the database
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            width=1920,
            height=1080
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(video_path="/test/video.mp4", status="processing", priority=1)
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Update with filecoin metadata
        response = client.put(
            f"/api/upload-queue/{entry_id}/status",
            json={
                "status": "completed",
                "filecoin_metadata": {
                    "root_cid": "QmTest123",
                    "piece_cid": "Piece123",
                    "piece_id": 42,
                    "data_set_id": 100,
                    "is_encrypted": False
                }
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"

        # Verify video metadata was updated
        video = db_session.query(Video).filter(Video.path == "/test/video.mp4").first()
        assert video is not None
        assert video.filecoin_root_cid == "QmTest123"
        assert video.filecoin_piece_cid == "Piece123"

    def test_update_upload_status_to_failed(self, client: TestClient, db_session):
        """Test updating upload status to failed with error message."""
        entry = UploadQueue(video_path="/test/video.mp4", status="processing", priority=1)
        db_session.add(entry)
        db_session.commit()

        # Update to failed
        response = client.put(
            f"/api/upload-queue/{entry.id}/status",
            json={
                "status": "failed",
                "error": "Upload failed: Network timeout"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error_message"] == "Upload failed: Network timeout"
        assert isinstance(data["completed_at"], str)

    def test_update_upload_status_invalid_status(self, client: TestClient, db_session):
        """Test updating with invalid status."""
        entry = UploadQueue(video_path="/test/video.mp4", status="pending", priority=1)
        db_session.add(entry)
        db_session.commit()

        response = client.put(
            f"/api/upload-queue/{entry.id}/status",
            json={"status": "invalid_status"}
        )

        assert response.status_code == 400
        assert "Invalid status" in response.json()["detail"]

    def test_update_upload_status_not_found(self, client: TestClient):
        """Test updating non-existent upload entry."""
        response = client.put(
            "/api/upload-queue/999/status",
            json={"status": "completed"}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestRemoveFromUploadQueue:
    """Tests for DELETE /upload-queue/{queue_id} endpoint."""

    def test_remove_from_upload_queue(self, client: TestClient, db_session):
        """Test removing an upload from the queue."""
        entry = UploadQueue(video_path="/test/video.mp4", status="pending", priority=1)
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        response = client.delete(f"/api/upload-queue/{entry_id}")

        assert response.status_code == 204

        # Verify it's deleted
        found = db_session.query(UploadQueue).filter(UploadQueue.id == entry_id).first()
        assert found is None

    def test_remove_from_upload_queue_not_found(self, client: TestClient):
        """Test removing non-existent upload entry."""
        response = client.delete("/api/upload-queue/999")

        assert response.status_code == 404


class TestGetUploadQueueStats:
    """Tests for GET /upload-queue/stats endpoint."""

    def test_get_upload_queue_stats(self, client: TestClient, db_session):
        """Test getting upload queue statistics."""
        entries = [
            UploadQueue(video_path="/test/pending1.mp4", status="pending"),
            UploadQueue(video_path="/test/pending2.mp4", status="pending"),
            UploadQueue(video_path="/test/processing.mp4", status="processing"),
            UploadQueue(video_path="/test/completed.mp4", status="completed"),
            UploadQueue(video_path="/test/failed1.mp4", status="failed", attempts=1, max_attempts=3),
            UploadQueue(video_path="/test/failed2.mp4", status="failed", attempts=3, max_attempts=3),  # Non-retryable
            UploadQueue(video_path="/test/cancelled.mp4", status="cancelled"),
        ]
        for entry in entries:
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue/stats")

        assert response.status_code == 200
        data = response.json()

        assert data["total"] == 7
        assert data["pending"] == 2
        assert data["processing"] == 1
        assert data["completed"] == 1
        assert data["failed"] == 2
        assert data["cancelled"] == 1
        assert data["retryable"] == 1  # Only one failed with attempts < max_attempts
