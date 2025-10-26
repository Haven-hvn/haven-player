import pytest
import asyncio
import os
import tempfile
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.api.videos import upload_livekit_recording
from app.models.video import Video
from app.models.database import get_db
from app.main import app

client = TestClient(app)

class TestLiveKitRecordingUpload:
    """Test cases for LiveKit recording upload functionality."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = Mock(spec=Session)
        db.query.return_value.order_by.return_value.first.return_value = None
        db.add = Mock()
        db.commit = Mock()
        db.refresh = Mock()
        return db

    @pytest.fixture
    def sample_video_file(self):
        """Create a sample video file for testing."""
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
            f.write(b'mock video content')
            f.flush()
            yield f.name
        os.unlink(f.name)

    @pytest.fixture
    def mock_video_file(self):
        """Create a mock UploadFile."""
        mock_file = Mock()
        mock_file.read = AsyncMock(return_value=b'mock video content')
        mock_file.filename = 'test_recording.webm'
        return mock_file

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_success(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test successful upload of LiveKit recording."""
        # Setup mocks
        mock_get_duration.return_value = 120.0
        mock_calculate_phash.return_value = 'abc123def456'
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle
        
        # Create mock video entry
        mock_video = Video(
            id=1,
            path='/recordings/test.webm',
            title='LiveKit Recording - participant-1',
            duration=120,
            has_ai_data=False,
            thumbnail_path=None,
            position=0,
            phash='abc123def456'
        )
        mock_db.refresh.return_value = mock_video

        # Call the function
        result = asyncio.run(upload_livekit_recording(
            video_file=mock_video_file,
            participant_id='participant-1',
            mint_id='mint-123',
            source='livekit',
            mime_type='video/webm;codecs=vp9',
            db=mock_db
        ))

        # Assertions
        assert result['status'] == 'uploaded'
        assert 'upload_id' in result
        assert result['video_id'] == 1
        assert result['duration'] == 120
        assert 'LiveKit recording uploaded and queued for analysis' in result['message']
        
        # Verify database operations
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_duplicate_detection(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test duplicate detection during upload."""
        # Setup mocks
        mock_get_duration.return_value = 120.0
        mock_calculate_phash.return_value = 'abc123def456'
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle
        
        # Mock existing video with similar phash
        existing_video = Mock()
        existing_video.id = 1
        existing_video.phash = 'abc123def457'  # Similar phash (distance = 1)
        
        mock_db.query.return_value.filter.return_value.all.return_value = [(1, 'abc123def457')]

        # Call the function and expect duplicate detection
        with pytest.raises(Exception) as exc_info:
            asyncio.run(upload_livekit_recording(
                video_file=mock_video_file,
                participant_id='participant-1',
                mint_id='mint-123',
                source='livekit',
                mime_type='video/webm;codecs=vp9',
                db=mock_db
            ))
        
        assert 'Duplicate video detected' in str(exc_info.value)

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_duration_error(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test handling of duration calculation errors."""
        # Setup mocks
        mock_get_duration.side_effect = Exception('Duration calculation failed')
        mock_calculate_phash.return_value = 'abc123def456'
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle

        # Call the function
        result = asyncio.run(upload_livekit_recording(
            video_file=mock_video_file,
            participant_id='participant-1',
            mint_id='mint-123',
            source='livekit',
            mime_type='video/webm;codecs=vp9',
            db=mock_db
        ))

        # Should handle error gracefully and set duration to 0
        assert result['duration'] == 0
        assert result['status'] == 'uploaded'

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_phash_error(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test handling of phash calculation errors."""
        # Setup mocks
        mock_get_duration.return_value = 120.0
        mock_calculate_phash.side_effect = Exception('Phash calculation failed')
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle

        # Call the function
        result = asyncio.run(upload_livekit_recording(
            video_file=mock_video_file,
            participant_id='participant-1',
            mint_id='mint-123',
            source='livekit',
            mime_type='video/webm;codecs=vp9',
            db=mock_db
        ))

        # Should handle error gracefully and set phash to None
        assert result['status'] == 'uploaded'
        # Verify that a video was still created despite phash error
        mock_db.add.assert_called_once()

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_file_extension_detection(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test correct file extension detection based on mime type."""
        # Setup mocks
        mock_get_duration.return_value = 120.0
        mock_calculate_phash.return_value = 'abc123def456'
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle

        # Test with MP4 mime type
        result = asyncio.run(upload_livekit_recording(
            video_file=mock_video_file,
            participant_id='participant-1',
            mint_id='mint-123',
            source='livekit',
            mime_type='video/mp4',
            db=mock_db
        ))

        # Should create .mp4 file
        assert result['status'] == 'uploaded'
        # Verify the file path contains .mp4 extension
        assert '.mp4' in result['filepath']

    def test_upload_livekit_recording_invalid_file(self, mock_db):
        """Test handling of invalid file upload."""
        # Create a mock file that raises an exception
        mock_file = Mock()
        mock_file.read = AsyncMock(side_effect=Exception('File read error'))

        with pytest.raises(Exception) as exc_info:
            asyncio.run(upload_livekit_recording(
                video_file=mock_file,
                participant_id='participant-1',
                mint_id='mint-123',
                source='livekit',
                mime_type='video/webm;codecs=vp9',
                db=mock_db
            ))
        
        assert 'File read error' in str(exc_info.value)

    @patch('app.api.videos.get_video_duration')
    @patch('app.api.videos.calculate_phash')
    @patch('app.api.videos.aiofiles.open')
    @patch('app.api.videos.os.makedirs')
    def test_upload_livekit_recording_position_assignment(
        self, 
        mock_makedirs, 
        mock_aiofiles_open, 
        mock_calculate_phash, 
        mock_get_duration,
        mock_db,
        mock_video_file
    ):
        """Test correct position assignment for new videos."""
        # Setup mocks
        mock_get_duration.return_value = 120.0
        mock_calculate_phash.return_value = 'abc123def456'
        
        mock_file_handle = AsyncMock()
        mock_aiofiles_open.return_value.__aenter__.return_value = mock_file_handle

        # Mock existing video with position 5
        existing_video = Mock()
        existing_video.position = 5
        mock_db.query.return_value.order_by.return_value.first.return_value = existing_video

        # Call the function
        result = asyncio.run(upload_livekit_recording(
            video_file=mock_video_file,
            participant_id='participant-1',
            mint_id='mint-123',
            source='livekit',
            mime_type='video/webm;codecs=vp9',
            db=mock_db
        ))

        # Should assign position 6 (max + 1)
        assert result['status'] == 'uploaded'
        # Verify that the video was created with the correct position
        mock_db.add.assert_called_once()
        added_video = mock_db.add.call_args[0][0]
        assert added_video.position == 6
