"""
Unit tests for upload_queue API endpoints with VLM support.

Tests VLM-related API endpoints including popping jobs, updating status,
and VLM stats in queue statistics.
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
from app.models.video import Video, Timestamp


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_upload_queue_vlm.db"
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


class TestVLMAnalysisPopEndpoint:
    """Tests for GET /upload-queue/vlm/pop endpoint."""

    def test_pop_vlm_analysis_job_success(self, client: TestClient, db_session):
        """Test popping next VLM analysis job."""
        # Create a test video with VLM enabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Create a queue entry with pending VLM analysis
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue/vlm/pop")

        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert data["video_path"] == "/test/video.mp4"
        assert data["vlm_analysis_status"] == "processing"
        assert isinstance(data["vlm_analysis_started_at"], str)

    def test_pop_vlm_analysis_job_no_jobs(self, client: TestClient):
        """Test popping VLM analysis job when no jobs available."""
        response = client.get("/api/upload-queue/vlm/pop")

        assert response.status_code == 200
        data = response.json()
        assert data is None

    def test_pop_vlm_analysis_job_oldest_first(self, client: TestClient, db_session):
        """Test that oldest pending VLM job is returned first."""
        import time

        # Create video
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Add first entry
        entry1 = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(entry1)
        db_session.commit()
        db_session.refresh(entry1)

        time.sleep(0.1)  # Ensure time difference

        # Add another video and entry
        video2 = Video(
            title="Test Video 2",
            path="/test/video2.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video2)
        db_session.commit()

        entry2 = UploadQueue(
            video_path="/test/video2.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(entry2)
        db_session.commit()

        response = client.get("/api/upload-queue/vlm/pop")

        assert response.status_code == 200
        data = response.json()
        assert data["video_path"] == "/test/video.mp4"  # Oldest first

    def test_pop_vlm_analysis_job_only_pending(self, client: TestClient, db_session):
        """Test that only pending VLM jobs are popped, not processing/completed."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Create entry with processing status
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing",
            priority=1
        )
        db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue/vlm/pop")

        # Should return None because no pending jobs
        assert response.status_code == 200
        data = response.json()
        assert data is None


class TestVLMAnalysisUpdateEndpoint:
    """Tests for PUT /upload-queue/{queue_id}/vlm-analysis endpoint."""

    def test_update_vlm_analysis_status_completed(self, client: TestClient, db_session):
        """Test updating VLM analysis status to completed."""
        # Create video
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Update VLM analysis to completed
        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={
                "vlm_analysis_status": "completed"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vlm_analysis_status"] == "completed"
        assert isinstance(data["vlm_analysis_completed_at"], str)

    def test_update_vlm_analysis_status_failed(self, client: TestClient, db_session):
        """Test updating VLM analysis status to failed."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={
                "vlm_analysis_status": "failed",
                "vlm_analysis_error": "VLM processing timed out"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vlm_analysis_status"] == "failed"
        assert isinstance(data["vlm_analysis_completed_at"], str)
        assert data["vlm_analysis_error"] == "VLM processing timed out"

    def test_update_vlm_analysis_status_skipped(self, client: TestClient, db_session):
        """Test updating VLM analysis status to skipped."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={
                "vlm_analysis_status": "skipped",
                "vlm_analysis_error": "VLM disabled for this video"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vlm_analysis_status"] == "skipped"
        assert isinstance(data["vlm_analysis_completed_at"], str)

    def test_update_vlm_analysis_invalid_status(self, client: TestClient, db_session):
        """Test updating VLM analysis with invalid status."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()

        response = client.put(
            f"/api/upload-queue/{entry.id}/vlm-analysis",
            json={"vlm_analysis_status": "invalid_status"}
        )

        assert response.status_code == 400
        assert "Invalid vlm_analysis_status" in response.json()["detail"]

    def test_update_vlm_analysis_not_found(self, client: TestClient):
        """Test updating VLM analysis for non-existent entry."""
        response = client.put(
            "/api/upload-queue/999/vlm-analysis",
            json={"vlm_analysis_status": "completed"}
        )

        assert response.status_code == 404

    def test_update_vlm_triggers_arkiv_with_timestamps(self, client: TestClient, db_session):
        """Test that completing VLM analysis triggers Arkiv sync when timestamps exist."""
        # Create video with Arkiv enabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=True
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry
        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Add timestamps
        timestamp = Timestamp(
            video_path="/test/video.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        # Update VLM analysis to completed
        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={"vlm_analysis_status": "completed"}
        )

        assert response.status_code == 200
        data = response.json()
        # Arkiv sync should be queued
        assert data["arkiv_sync_status"] == "pending"

    def test_update_vlm_no_arkiv_if_disabled(self, client: TestClient, db_session):
        """Test that Arkiv sync is not queued if video.share_to_arkiv is False."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=False
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Add timestamps
        timestamp = Timestamp(
            video_path="/test/video.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={"vlm_analysis_status": "completed"}
        )

        assert response.status_code == 200
        data = response.json()
        # Arkiv sync should NOT be queued
        assert data["arkiv_sync_status"] is None


class TestUploadQueueAddToQueueWithVLM:
    """Tests for POST /upload-queue with VLM integration."""

    def test_add_to_queue_respects_vlm_preference(self, client: TestClient, db_session):
        """Test that adding to queue respects video's VLM preference."""
        # Create video with VLM enabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/test/video.mp4",
                "priority": 1,
                "source": "plugin"
            }
        )

        assert response.status_code == 201
        data = response.json()
        # VLM analysis should be pending
        assert data["vlm_analysis_status"] == "pending"

    def test_add_to_queue_vlm_disabled(self, client: TestClient, db_session):
        """Test that adding to queue sets VLM to skipped when disabled."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=False
        )
        db_session.add(video)
        db_session.commit()

        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/test/video.mp4",
                "priority": 1,
                "source": "plugin"
            }
        )

        assert response.status_code == 201
        data = response.json()
        # VLM analysis should be skipped
        assert data["vlm_analysis_status"] == "skipped"

    def test_add_to_queue_no_video_defaults_vlm_to_skipped(self, client: TestClient):
        """Test that adding to queue without video defaults VLM to skipped."""
        response = client.post(
            "/api/upload-queue",
            json={
                "video_path": "/nonexistent/video.mp4",
                "priority": 1,
                "source": "manual"
            }
        )

        assert response.status_code == 201
        data = response.json()
        # VLM analysis should be skipped when video doesn't exist
        assert data["vlm_analysis_status"] == "skipped"


class TestUploadQueueStatsWithVLM:
    """Tests for GET /upload-queue/stats with VLM statistics."""

    def test_get_upload_queue_stats_vlm_counts(self, client: TestClient, db_session):
        """Test getting upload queue statistics with VLM counts."""
        # Create video
        video1 = Video(
            title="Test Video 1",
            path="/test/video1.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        video2 = Video(
            title="Test Video 2",
            path="/test/video2.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        video3 = Video(
            title="Test Video 3",
            path="/test/video3.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )

        db_session.add_all([video1, video2, video3])
        db_session.commit()

        # Create entries with different VLM statuses
        entries = [
            UploadQueue(
                video_path="/test/video1.mp4",
                status="pending",
                vlm_analysis_status="pending"
            ),
            UploadQueue(
                video_path="/test/video2.mp4",
                status="pending",
                vlm_analysis_status="completed",
                vlm_analysis_completed_at=datetime.now(timezone.utc)
            ),
            UploadQueue(
                video_path="/test/video3.mp4",
                status="pending",
                vlm_analysis_status="processing"
            ),
            UploadQueue(
                video_path="/test/video4.mp4",
                status="pending",
                vlm_analysis_status="failed",
                vlm_analysis_completed_at=datetime.now(timezone.utc)
            ),
            UploadQueue(
                video_path="/test/video5.mp4",
                status="pending",
                vlm_analysis_status="skipped",
                vlm_analysis_completed_at=datetime.now(timezone.utc)
            ),
        ]
        for entry in entries:
            db_session.add(entry)
        db_session.commit()

        response = client.get("/api/upload-queue/stats")

        assert response.status_code == 200
        data = response.json()

        # Verify VLM stats
        assert data["vlm_analysis_pending"] == 1
        assert data["vlm_analysis_processing"] == 1
        assert data["vlm_analysis_completed"] == 1
        assert data["vlm_analysis_failed"] == 1
        assert data["vlm_analysis_skipped"] == 1
        assert data["total"] == 5


class TestParallelExecutionScenarios:
    """Tests for parallel execution scenarios in the API."""

    def test_filecoin_complete_queues_arkiv(self, client: TestClient, db_session):
        """Test that completing FileCoin upload queues Arkiv sync (parallel scenario)."""
        # Create video with VLM enabled but not yet completed
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=True
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="processing",
            vlm_analysis_status="pending"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Complete FileCoin upload
        response = client.put(
            f"/api/upload-queue/{entry_id}/status",
            json={
                "status": "completed",
                "filecoin_metadata": {
                    "root_cid": "QmTest123",
                    "piece_cid": "Piece123",
                    "piece_id": 42,
                    "data_set_id": 100
                }
            }
        )

        assert response.status_code == 200
        data = response.json()
        # Arkiv sync should be queued even though VLM is still pending
        assert data["arkiv_sync_status"] == "pending"

    def test_vlm_complete_updates_arkiv_if_not_exists(self, client: TestClient, db_session):
        """Test that completing VLM updates Arkiv sync if not already queued."""
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=True,
            filecoin_root_cid="QmTest123"
        )
        db_session.add(video)
        db_session.commit()

        entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            vlm_analysis_status="processing"
        )
        db_session.add(entry)
        db_session.commit()
        entry_id = entry.id

        # Add timestamps
        timestamp = Timestamp(
            video_path="/test/video.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        # Complete VLM analysis
        response = client.put(
            f"/api/upload-queue/{entry_id}/vlm-analysis",
            json={"vlm_analysis_status": "completed"}
        )

        assert response.status_code == 200
        data = response.json()
        # Arkiv sync should be queued if not already pending
        assert data["arkiv_sync_status"] == "pending"
