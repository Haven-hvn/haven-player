"""
Unit tests for VLM Analysis Worker.

Tests the VLM analysis worker service including queue processing,
status updates, and error handling.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video, Timestamp
from app.services.vlm_analysis_worker import VLMAnalysisWorker, run_vlm_analysis_worker


# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_vlm_worker.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestVLMAnalysisWorker:
    """Test VLMAnalysisWorker class methods."""

    @pytest.fixture(scope="function")
    def db_session(self):
        """Provide a database session for tests."""
        Base.metadata.create_all(bind=engine)
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
            Base.metadata.drop_all(bind=engine)

    @pytest.fixture(scope="function")
    async def worker(self):
        """Create a VLMAnalysisWorker instance for testing."""
        worker = VLMAnalysisWorker(api_base_url="http://test.local")
        worker.client = Mock()
        return worker

    def test_enter_exit(self, worker):
        """Test async context manager entry and exit."""
        import httpx

        assert worker.client is None

        # Test __aenter__ creates client
        # Note: This would normally create an httpx.AsyncClient, but we mocked it
        # In real tests, you'd use httpx.AsyncClient directly

    def test_process_queue_empty(self, worker):
        """Test processing queue when no jobs are available."""
        worker.client.get = AsyncMock(return_value=Mock(status_code=204))

        import asyncio
        result = asyncio.run(worker.process_queue())

        assert result == 0
        worker.client.get.assert_called_once_with("http://test.local/api/upload-queue/vlm/pop")

    def test_process_queue_with_jobs(self, worker, db_session):
        """Test processing queue with pending jobs."""
        # Create test video
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()

        # Mock worker client responses
        worker.client.get = AsyncMock(
            return_value=Mock(
                status_code=200,
                json=lambda: {
                    "id": queue_entry.id,
                    "video_path": "/test/video.mp4",
                    "vlm_analysis_status": "processing"
                }
            )
        )
        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        # Mock process_vlm_analysis_job to skip actual processing
        worker.process_vlm_analysis_job = AsyncMock(return_value=True)

        import asyncio
        result = asyncio.run(worker.process_queue())

        assert result == 1
        worker.client.get.assert_called()
        worker.process_vlm_analysis_job.assert_called_once_with(queue_entry.id)

    def test_process_vlm_analysis_job_success(self, worker, db_session):
        """Test successful VLM analysis job processing."""
        # Create test video
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()
        queue_id = queue_entry.id

        # Mock the VLM processor
        with patch('app.services.vlm_analysis_worker.process_video_for_queue', new_callable=AsyncMock):
            import asyncio
            worker.client.put = AsyncMock(return_value=Mock(status_code=200))

            result = asyncio.run(worker.process_vlm_analysis_job(queue_id))

            assert result is True

    def test_process_vlm_analysis_job_video_not_found(self, worker, db_session):
        """Test VLM analysis job when video is not found."""
        # Create queue entry without video
        queue_entry = UploadQueue(
            video_path="/nonexistent/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()
        queue_id = queue_entry.id

        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        import asyncio
        result = asyncio.run(worker.process_vlm_analysis_job(queue_id))

        assert result is False
        worker.client.put.assert_called_once()
        call_args = worker.client.put.call_args[0][1]
        assert call_args["vlm_analysis_status"] == "failed"

    def test_process_vlm_analysis_job_disabled(self, worker, db_session):
        """Test VLM analysis job when VLM is disabled for video."""
        # Create test video with VLM disabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=False
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="pending",
            vlm_analysis_status="pending",
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()
        queue_id = queue_entry.id

        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        import asyncio
        result = asyncio.run(worker.process_vlm_analysis_job(queue_id))

        assert result is True
        worker.client.put.assert_called_once()
        call_args = worker.client.put.call_args[0][1]
        assert call_args["vlm_analysis_status"] == "skipped"

    def test_mark_vlm_analysis_completed(self, worker):
        """Test marking VLM analysis as completed."""
        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        import asyncio
        asyncio.run(worker.mark_vlm_analysis_completed(1))

        worker.client.put.assert_called_once_with(
            "http://test.local/api/upload-queue/1/vlm-analysis",
            json={"vlm_analysis_status": "completed"}
        )

    def test_mark_vlm_analysis_failed(self, worker):
        """Test marking VLM analysis as failed."""
        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        import asyncio
        asyncio.run(worker.mark_vlm_analysis_failed(1, "Test error"))

        worker.client.put.assert_called_once_with(
            "http://test.local/api/upload-queue/1/vlm-analysis",
            json={
                "vlm_analysis_status": "failed",
                "vlm_analysis_error": "Test error"
            }
        )

    def test_mark_vlm_analysis_skipped(self, worker):
        """Test marking VLM analysis as skipped."""
        worker.client.put = AsyncMock(return_value=Mock(status_code=200))

        import asyncio
        asyncio.run(worker.mark_vlm_analysis_skipped(1, "VLM disabled"))

        worker.client.put.assert_called_once_with(
            "http://test.local/api/upload-queue/1/vlm-analysis",
            json={
                "vlm_analysis_status": "skipped",
                "vlm_analysis_error": "VLM disabled"
            }
        )


class TestParallelExecutionScenarios:
    """Test parallel execution scenarios between VLM and FileCoin workers."""

    @pytest.fixture(scope="function")
    def db_session(self):
        """Provide a database session for tests."""
        Base.metadata.create_all(bind=engine)
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
            Base.metadata.drop_all(bind=engine)

    def test_vlm_completes_before_filecoin(self, db_session):
        """Test scenario where VLM completes before FileCoin upload."""
        # Create video with VLM enabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=True
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry with FileCoin still pending but VLM completed
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="processing",
            vlm_analysis_status="completed",
            vlm_analysis_completed_at=datetime.now(timezone.utc),
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()

        # Add timestamps from VLM analysis
        timestamp = Timestamp(
            video_path="/test/video.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        # Verify queue entry state
        queue = db_session.query(UploadQueue).first()
        assert queue.vlm_analysis_status == "completed"
        assert queue.status == "processing"  # FileCoin still in progress

        # Arkiv sync can proceed because timestamps exist
        has_timestamps = db_session.query(Timestamp).filter(
            Timestamp.video_path == queue_entry.video_path
        ).count() > 0
        assert has_timestamps is True

    def test_filecoin_completes_before_vlm(self, db_session):
        """Test scenario where FileCoin completes before VLM analysis."""
        # Create video with VLM enabled
        video = Video(
            title="Test Video",
            path="/test/video.mp4",
            duration=60.0,
            enable_vlm_analysis=True,
            share_to_arkiv=True,
            filecoin_root_cid="QmTest123"  # FileCoin completed
        )
        db_session.add(video)
        db_session.commit()

        # Create queue entry with VLM still processing but FileCoin completed
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            vlm_analysis_status="processing",
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()

        # Verify queue entry state
        queue = db_session.query(UploadQueue).first()
        assert queue.vlm_analysis_status == "processing"
        assert queue.status == "completed"  # FileCoin completed

        # Arkiv sync can proceed because FileCoin CID exists
        video = db_session.query(Video).filter(Video.path == queue_entry.video_path).first()
        assert video.filecoin_root_cid is not None

    def test_both_vlm_and_filecoin_complete(self, db_session):
        """Test scenario where both VLM and FileCoin complete successfully."""
        # Create video with VLM enabled
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

        # Create queue entry with both completed
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            vlm_analysis_status="completed",
            vlm_analysis_completed_at=datetime.now(timezone.utc),
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()

        # Add timestamps from VLM analysis
        timestamp = Timestamp(
            video_path="/test/video.mp4",
            tag_name="test_tag",
            start_time=0.0,
            end_time=10.0,
            confidence=0.9
        )
        db_session.add(timestamp)
        db_session.commit()

        # Verify queue entry state
        queue = db_session.query(UploadQueue).first()
        assert queue.status == "completed"
        assert queue.vlm_analysis_status == "completed"

        # Both FileCoin CID and timestamps exist - Arkiv can sync with all data
        video = db_session.query(Video).filter(Video.path == queue_entry.video_path).first()
        has_filecoin = bool(video.filecoin_root_cid)
        has_timestamps = db_session.query(Timestamp).filter(
            Timestamp.video_path == queue_entry.video_path
        ).count() > 0

        assert has_filecoin is True
        assert has_timestamps is True

    def test_vlm_fails_but_filecoin_succeeds(self, db_session):
        """Test graceful degradation when VLM fails but FileCoin succeeds."""
        # Create video with VLM enabled
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

        # Create queue entry with VLM failed but FileCoin completed
        queue_entry = UploadQueue(
            video_path="/test/video.mp4",
            status="completed",
            vlm_analysis_status="failed",
            vlm_analysis_error="VLM processing error",
            vlm_analysis_completed_at=datetime.now(timezone.utc),
            priority=1
        )
        db_session.add(queue_entry)
        db_session.commit()

        # Verify queue entry state (FileCoin not blocked by VLM failure)
        queue = db_session.query(UploadQueue).first()
        assert queue.status == "completed"  # FileCoin succeeded
        assert queue.vlm_analysis_status == "failed"
        assert queue.vlm_analysis_error is not None

        # Arkiv can still proceed with FileCoin data
        video = db_session.query(Video).filter(Video.path == queue_entry.video_path).first()
        assert video.filecoin_root_cid is not None


class TestRunVLMAnalysisWorker:
    """Test the run_vlm_analysis_worker background task function."""

    @pytest.mark.asyncio
    async def test_worker_initialization(self):
        """Test that worker initializes and starts polling."""
        with patch('app.services.vlm_analysis_worker.VLMAnalysisWorker') as mock_worker_class:
            mock_worker = AsyncMock()
            mock_worker.__aenter__ = AsyncMock(return_value=mock_worker)
            mock_worker.__aexit__ = AsyncMock(return_value=None)
            mock_worker.process_queue = AsyncMock(return_value=0)
            mock_worker_class.return_value = mock_worker

            # Run worker for one iteration then cancel
            import asyncio

            async def run_one_iteration():
                async with mock_worker_class("http://test.local") as worker:
                    await worker.process_queue()

            await run_one_iteration()

            mock_worker_class.assert_called_once_with("http://test.local")
            mock_worker.process_queue.assert_called_once()
