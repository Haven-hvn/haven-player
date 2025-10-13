"""
Unit tests for lazy container initialization in WebRTC recording service.
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from pathlib import Path
from datetime import datetime, timezone

# Mock the imports that might not be available in test environment
with patch.dict('sys.modules', {
    'livekit.rtc': Mock(),
    'av': Mock(),
    'numpy': Mock(),
    'psutil': Mock()
}):
    from app.services.webrtc_recording_service import AiortcFileRecorder, RecordingState


class TestLazyContainerInitialization:
    """Test lazy container initialization behavior."""

    @pytest.fixture
    def mock_recorder(self):
        """Create a mock recorder instance for testing."""
        # Mock the required dependencies
        mock_room = Mock()
        mock_stream_info = Mock()
        mock_stream_info.participant_sid = "test_participant"
        
        config = {
            "video_codec": "libx264",
            "audio_codec": "aac", 
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080
        }
        
        recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=mock_stream_info,
            output_dir=Path("/tmp/test_recordings"),
            config=config,
            room=mock_room
        )
        
        # Mock the tracks
        recorder.video_track = Mock()
        recorder.audio_track = Mock()
        
        return recorder

    def test_container_initialization_flag_defaults_to_false(self, mock_recorder):
        """Test that _container_initialized flag defaults to False."""
        assert mock_recorder._container_initialized is False

    @pytest.mark.asyncio
    async def test_setup_container_idempotency(self, mock_recorder):
        """Test that _setup_container is idempotent."""
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container_impl') as mock_setup:
            mock_setup.return_value = None
            
            # First call should setup container
            await mock_recorder._setup_container()
            assert mock_recorder._container_initialized is True
            assert mock_setup.call_count == 1
            
            # Second call should be skipped
            await mock_recorder._setup_container()
            assert mock_setup.call_count == 1  # Should not be called again

    @pytest.mark.asyncio
    async def test_video_frame_triggers_lazy_initialization(self, mock_recorder):
        """Test that first video frame triggers container initialization."""
        mock_frame = Mock()
        mock_frame.width = 1920
        mock_frame.height = 1080
        mock_frame.data = b"fake_frame_data"
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            mock_setup.return_value = None
            
            # Mock the video stream
            mock_recorder.video_stream = Mock()
            mock_recorder.container = Mock()
            
            # Call video frame handler
            await mock_recorder._on_video_frame(mock_frame)
            
            # Should have called setup_container
            mock_setup.assert_called_once()
            assert mock_recorder._container_initialized is True

    @pytest.mark.asyncio
    async def test_audio_frame_triggers_lazy_initialization(self, mock_recorder):
        """Test that first audio frame triggers container initialization."""
        mock_frame = Mock()
        mock_frame.sample_rate = 48000
        mock_frame.num_channels = 2
        mock_frame.data = b"fake_audio_data"
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            mock_setup.return_value = None
            
            # Mock the audio stream
            mock_recorder.audio_stream = Mock()
            mock_recorder.container = Mock()
            
            # Call audio frame handler
            await mock_recorder._on_audio_frame(mock_frame)
            
            # Should have called setup_container
            mock_setup.assert_called_once()
            assert mock_recorder._container_initialized is True

    @pytest.mark.asyncio
    async def test_video_frame_after_initialization_skips_setup(self, mock_recorder):
        """Test that video frames after initialization don't call setup again."""
        mock_frame = Mock()
        mock_frame.width = 1920
        mock_frame.height = 1080
        mock_frame.data = b"fake_frame_data"
        
        # Pre-initialize the container
        mock_recorder._container_initialized = True
        mock_recorder.video_stream = Mock()
        mock_recorder.container = Mock()
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            # Call video frame handler
            await mock_recorder._on_video_frame(mock_frame)
            
            # Should not have called setup_container
            mock_setup.assert_not_called()

    @pytest.mark.asyncio
    async def test_audio_frame_after_initialization_skips_setup(self, mock_recorder):
        """Test that audio frames after initialization don't call setup again."""
        mock_frame = Mock()
        mock_frame.sample_rate = 48000
        mock_frame.num_channels = 2
        mock_frame.data = b"fake_audio_data"
        
        # Pre-initialize the container
        mock_recorder._container_initialized = True
        mock_recorder.audio_stream = Mock()
        mock_recorder.container = Mock()
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            # Call audio frame handler
            await mock_recorder._on_audio_frame(mock_frame)
            
            # Should not have called setup_container
            mock_setup.assert_not_called()

    @pytest.mark.asyncio
    async def test_container_setup_failure_handling(self, mock_recorder):
        """Test that container setup failures are handled gracefully."""
        mock_frame = Mock()
        mock_frame.width = 1920
        mock_frame.height = 1080
        mock_frame.data = b"fake_frame_data"
        
        # Mock the container setup to fail
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            mock_setup.side_effect = Exception("Container setup failed")
            
            # Call video frame handler
            await mock_recorder._on_video_frame(mock_frame)
            
            # Should not raise an exception, just return early
            assert mock_recorder._container_initialized is False

    @pytest.mark.asyncio
    async def test_video_frame_without_stream_after_init(self, mock_recorder):
        """Test that video frames are skipped if stream not available after init."""
        mock_frame = Mock()
        mock_frame.width = 1920
        mock_frame.height = 1080
        mock_frame.data = b"fake_frame_data"
        
        # Pre-initialize but don't set video stream
        mock_recorder._container_initialized = True
        mock_recorder.video_stream = None  # No video stream
        mock_recorder.container = Mock()
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            # Call video frame handler
            await mock_recorder._on_video_frame(mock_frame)
            
            # Should not have called setup_container
            mock_setup.assert_not_called()

    @pytest.mark.asyncio
    async def test_audio_frame_without_stream_after_init(self, mock_recorder):
        """Test that audio frames are skipped if stream not available after init."""
        mock_frame = Mock()
        mock_frame.sample_rate = 48000
        mock_frame.num_channels = 2
        mock_frame.data = b"fake_audio_data"
        
        # Pre-initialize but don't set audio stream
        mock_recorder._container_initialized = True
        mock_recorder.audio_stream = None  # No audio stream
        mock_recorder.container = Mock()
        
        # Mock the container setup
        with patch.object(mock_recorder, '_setup_container') as mock_setup:
            # Call audio frame handler
            await mock_recorder._on_audio_frame(mock_frame)
            
            # Should not have called setup_container
            mock_setup.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__])
