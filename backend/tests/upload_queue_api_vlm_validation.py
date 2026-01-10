"""
Integration tests for upload queue API VLM validation.

Tests that verify the upload queue API correctly validates video content
before setting VLM analysis status, especially for audio-only files.
"""
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.models.base import Base
from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video
from app.main import app

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


class TestUploadQueueVLMValidation:
    """Test VLM validation in upload queue API."""

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
    def client(self, db_session):
        """Provide a test client with overridden database."""
        app.dependency_overrides[get_db] = override_get_db
        try:
            yield TestClient(app)
        finally:
            app.dependency_overrides.clear()

    def test_audio_only_file_gets_vlm_skipped(self, client: TestClient, db_session):
        """Test that audio-only files get VLM status = 'skipped' even when enable_vlm=True."""
        # Create video record with VLM analysis enabled
        video = Video(
            title="Audio Only",
            path="D:\\downloads\\test\\audio.f251.webm",
            duration=60.0,
            file_size=1000000,
            file_extension="webm",
            enable_vlm_analysis=True  # VLM enabled but file is audio-only
        )
        db_session.add(video)
        db_session.commit()

        # Mock is_video_content to return False (audio-only)
        with patch('app.api.upload_queue.is_video_content', return_value=False) as mock_validator:
            response = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\audio.f251.webm",
                    "priority": 0,
                    "source": "plugin"
                }
            )

            assert response.status_code == 201
            data = response.json()
            assert data["vlm_analysis_status"] == "skipped"
            assert data["vlm_analysis_error"] == "File contains audio-only content (no video streams)"
            mock_validator.assert_called_once_with("D:\\downloads\\test\\audio.f251.webm")

    def test_video_file_gets_vlm_pending(self, client: TestClient, db_session):
        """Test that actual video files get VLM status = 'pending' when enable_vlm=True."""
        # Create video record with VLM analysis enabled
        video = Video(
            title="Video File",
            path="D:\\downloads\\test\\video.mp4",
            duration=60.0,
            file_size=5000000,
            file_extension="mp4",
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Mock is_video_content to return True (has video)
        with patch('app.api.upload_queue.is_video_content', return_value=True) as mock_validator:
            response = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\video.mp4",
                    "priority": 0,
                    "source": "plugin"
                }
            )

            assert response.status_code == 201
            data = response.json()
            assert data["vlm_analysis_status"] == "pending"
            assert data.get("vlm_analysis_error") is None
            mock_validator.assert_called_once_with("D:\\downloads\\test\\video.mp4")

    def test_disabled_vlm_ignored_validation(self, client: TestClient, db_session):
        """Test that files with VLM disabled skip validation entirely."""
        # Create video record with VLM analysis disabled
        video = Video(
            title="Disabled VLM",
            path="D:\\downloads\\test\\video.mp4",
            duration=60.0,
            file_size=5000000,
            file_extension="mp4",
            enable_vlm_analysis=False  # VLM disabled
        )
        db_session.add(video)
        db_session.commit()

        # Mock is_video_content - should not be called when VLM is disabled
        with patch('app.api.upload_queue.is_video_content') as mock_validator:
            response = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\video.mp4",
                    "priority": 0,
                    "source": "plugin"
                }
            )

            assert response.status_code == 201
            data = response.json()
            assert data["vlm_analysis_status"] == "skipped"
            # Validator should not be called when VLM is disabled
            mock_validator.assert_not_called()

    def test_re_queue_audio_file_maintains_skipped(self, client: TestClient, db_session):
        """Test that re-queueing audio files maintains skipped status."""
        # Create video record
        video = Video(
            title="Audio Requeue",
            path="D:\\downloads\\test\\audio_requeue.f251.webm",
            duration=60.0,
            file_size=1000000,
            file_extension="webm",
            enable_vlm_analysis=True
        )
        db_session.add(video)
        db_session.commit()

        # Mock is_video_content to return False
        with patch('app.api.upload_queue.is_video_content', return_value=False):
            # First queue
            response1 = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\audio_requeue.f251.webm",
                    "priority": 0,
                    "source": "plugin"
                }
            )
            assert response1.status_code == 201
            data1 = response1.json()
            assert data1["vlm_analysis_status"] == "skipped"

            # Try to re-queue (should still be skipped)
            response2 = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\audio_requeue.f251.webm",
                    "priority": 1,
                    "source": "plugin"
                }
            )
            assert response2.status_code == 201  # 201 with existing entry
            data2 = response2.json()
            assert data2["vlm_analysis_status"] == "skipped"

    def test_video_not_in_database_defaults_to_no_vlm(self, client: TestClient):
        """Test that files not in database default to VLM disabled."""
        # Don't create a video record - simulate database lookup finding nothing
        with patch('app.api.upload_queue.is_video_content') as mock_validator:
            response = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\new_video.mp4",
                    "priority": 0,
                    "source": "plugin"
                }
            )

            assert response.status_code == 201
            data = response.json()
            # Should be 'skipped' because video.enable_vlm_analysis defaults to False
            assert data["vlm_analysis_status"] == "skipped"
            # Validator should not be called when VLM is disabled
            mock_validator.assert_not_called()

    def test_multiple_audio_files_all_skipped(self, client: TestClient, db_session):
        """Test that multiple audio-only files are all correctly skipped."""
        audio_files = [
            ("D:\\downloads\\test\\audio1.f251.webm", ".f251.webm"),
            ("D:\\downloads\\test\\audio2.f140.m4a", ".f140.m4a"),
            ("D:\\downloads\\test\\audio3.f137.m4a", ".f137.m4a"),
        ]

        for file_path, extension in audio_files:
            # Create video record
            video = Video(
                title=f"Audio {extension}",
                path=file_path,
                duration=60.0,
                file_size=1000000,
                file_extension=extension.lstrip('.'),
                enable_vlm_analysis=True
            )
            db_session.add(video)
            db_session.commit()

        # Mock validator to return False for all
        with patch('app.api.upload_queue.is_video_content', return_value=False):
            for file_path, extension in audio_files:
                response = client.post(
                    "/api/upload-queue",
                    json={
                        "video_path": file_path,
                        "priority": 0,
                        "source": "plugin"
                    }
                )

                assert response.status_code == 201
                data = response.json()
                assert data["vlm_analysis_status"] == "skipped"

    def test_failed_queue_entry_updated_with_validation(self, client: TestClient, db_session):
        """Test that failed queue entries are updated with validation on re-queue."""
        # Create video record
        video = Video(
            title="Failed Audio Requeue",
            path="D:\\downloads\\test\\failed_audio.f251.webm",
            duration=60.0,
            file_size=1000000,
            file_extension="webm",
            enable_vlm_analysis=True
        )
        db_session.add(video)

        # Create existing failed queue entry
        existing_queue = UploadQueue(
            video_path="D:\\downloads\\test\\failed_audio.f251.webm",
            status="failed",
            priority=0,
            attempts=1,
            vlm_analysis_status="failed"  # Marked as failed from previous attempt
        )
        db_session.add(existing_queue)
        db_session.commit()

        # Mock validator to return False (audio-only)
        with patch('app.api.upload_queue.is_video_content', return_value=False):
            # Re-queue failed entry
            response = client.post(
                "/api/upload-queue",
                json={
                    "video_path": "D:\\downloads\\test\\failed_audio.f251.webm",
                    "priority": 0,
                    "source": "plugin"
                }
            )

            assert response.status_code == 201
            data = response.json()
            # Should be reset to pending but then validated to skipped
            assert data["vlm_analysis_status"] == "skipped"
            assert data["status"] == "pending"  # Upload status should be reset
            assert data["attempts"] == 0  # Attempts should be reset
