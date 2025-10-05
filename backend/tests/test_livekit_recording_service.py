"""
Unit tests for LiveKit native recording service.
Tests the recording service with proper mocking of LiveKit components.
"""

import pytest
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from typing import Dict, Any

from app.services.livekit_recording_service import (
    LiveKitRecordingService,
    StreamRecorder
)
from livekit import rtc


@pytest.fixture
def mock_stream_manager() -> Mock:
    """Create a mock StreamManager."""
    manager = Mock()
    manager.room = Mock(spec=rtc.Room)
    manager.room.name = "test-room"
    manager.room.remote_participants = {}
    
    # Mock stream info
    mock_stream_info = Mock()
    mock_stream_info.mint_id = "test-mint-123"
    mock_stream_info.room_name = "test-room"
    mock_stream_info.participant_sid = "PA_test123"
    mock_stream_info.stream_url = "wss://test.livekit.cloud"
    mock_stream_info.token = "test-token"
    mock_stream_info.stream_data = {"test": "data"}
    
    manager.get_stream_info = AsyncMock(return_value=mock_stream_info)
    
    return manager


@pytest.fixture
def mock_participant() -> Mock:
    """Create a mock RemoteParticipant with tracks."""
    participant = Mock(spec=rtc.RemoteParticipant)
    participant.sid = "PA_test123"
    participant.identity = "test-user"
    
    # Create mock video track
    video_track = Mock(spec=rtc.RemoteVideoTrack)
    video_track.kind = rtc.TrackKind.KIND_VIDEO
    
    video_pub = Mock(spec=rtc.RemoteTrackPublication)
    video_pub.track = video_track
    video_pub.kind = rtc.TrackKind.KIND_VIDEO
    
    # Create mock audio track
    audio_track = Mock(spec=rtc.RemoteAudioTrack)
    audio_track.kind = rtc.TrackKind.KIND_AUDIO
    
    audio_pub = Mock(spec=rtc.RemoteTrackPublication)
    audio_pub.track = audio_track
    audio_pub.kind = rtc.TrackKind.KIND_AUDIO
    
    participant.track_publications = {
        "video": video_pub,
        "audio": audio_pub
    }
    
    return participant


@pytest.fixture
def recording_service(tmp_path: Path) -> LiveKitRecordingService:
    """Create a LiveKitRecordingService instance with temp directory."""
    service = LiveKitRecordingService(output_dir=str(tmp_path))
    return service


@pytest.fixture
def mock_av_container() -> Mock:
    """Create a mock PyAV output container."""
    container = Mock()
    
    video_stream = Mock()
    video_stream.width = 1920
    video_stream.height = 1080
    video_stream.pix_fmt = 'yuv420p'
    video_stream.bit_rate = 2000000
    video_stream.encode = Mock(return_value=[])
    
    audio_stream = Mock()
    audio_stream.bit_rate = 128000
    audio_stream.encode = Mock(return_value=[])
    
    container.add_stream = Mock(side_effect=[video_stream, audio_stream])
    container.close = Mock()
    container.mux = Mock()
    
    return container


class TestLiveKitRecordingService:
    """Test suite for LiveKitRecordingService."""
    
    @pytest.mark.asyncio
    async def test_initialization(self, recording_service: LiveKitRecordingService) -> None:
        """Test service initialization."""
        assert recording_service.output_dir.exists()
        assert recording_service.active_recordings == {}
        assert "low" in recording_service.quality_presets
        assert "medium" in recording_service.quality_presets
        assert "high" in recording_service.quality_presets
    
    @pytest.mark.asyncio
    async def test_start_recording_success(
        self, 
        recording_service: LiveKitRecordingService,
        mock_stream_manager: Mock,
        mock_participant: Mock
    ) -> None:
        """Test successful recording start."""
        # Setup
        recording_service.stream_manager = mock_stream_manager
        mock_stream_manager.room.remote_participants = {
            "PA_test123": mock_participant
        }
        
        # Mock PyAV
        with patch('app.services.livekit_recording_service.av.open') as mock_av_open:
            mock_container = Mock()
            mock_container.add_stream = Mock(side_effect=[Mock(), Mock()])
            mock_av_open.return_value = mock_container
            
            # Mock the encoding task to not actually run
            with patch.object(StreamRecorder, '_encoding_loop', new_callable=AsyncMock):
                # Start recording
                result = await recording_service.start_recording(
                    mint_id="test-mint-123",
                    output_format="mp4",
                    video_quality="medium"
                )
        
        # Verify
        assert result["success"] is True
        assert result["mint_id"] == "test-mint-123"
        assert "output_path" in result
        assert "test-mint-123" in recording_service.active_recordings
    
    @pytest.mark.asyncio
    async def test_start_recording_no_stream(
        self, 
        recording_service: LiveKitRecordingService,
        mock_stream_manager: Mock
    ) -> None:
        """Test starting recording with no active stream."""
        # Setup
        recording_service.stream_manager = mock_stream_manager
        mock_stream_manager.get_stream_info = AsyncMock(return_value=None)
        
        # Start recording
        result = await recording_service.start_recording(
            mint_id="test-mint-123",
            output_format="mp4",
            video_quality="medium"
        )
        
        # Verify
        assert result["success"] is False
        assert "No active stream" in result["error"]
    
    @pytest.mark.asyncio
    async def test_start_recording_already_active(
        self, 
        recording_service: LiveKitRecordingService,
        mock_stream_manager: Mock,
        mock_participant: Mock
    ) -> None:
        """Test starting recording when already active."""
        # Setup
        recording_service.stream_manager = mock_stream_manager
        mock_stream_manager.room.remote_participants = {
            "PA_test123": mock_participant
        }
        
        # Add a mock active recording
        mock_recorder = Mock()
        recording_service.active_recordings["test-mint-123"] = mock_recorder
        
        # Try to start again
        result = await recording_service.start_recording(
            mint_id="test-mint-123",
            output_format="mp4",
            video_quality="medium"
        )
        
        # Verify
        assert result["success"] is False
        assert "already active" in result["error"]
    
    @pytest.mark.asyncio
    async def test_stop_recording_success(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test successful recording stop."""
        # Setup
        mock_recorder = AsyncMock(spec=StreamRecorder)
        mock_recorder.stop = AsyncMock(return_value={
            "success": True,
            "output_path": "/path/to/output.mp4",
            "video_frames": 100,
            "audio_frames": 200
        })
        recording_service.active_recordings["test-mint-123"] = mock_recorder
        
        # Stop recording
        result = await recording_service.stop_recording(mint_id="test-mint-123")
        
        # Verify
        assert result["success"] is True
        assert "test-mint-123" not in recording_service.active_recordings
        mock_recorder.stop.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_stop_recording_not_active(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test stopping recording that isn't active."""
        result = await recording_service.stop_recording(mint_id="test-mint-123")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_recording_status_success(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting recording status."""
        # Setup
        mock_recorder = AsyncMock(spec=StreamRecorder)
        mock_recorder.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-123",
            "is_recording": True,
            "video_frames": 50,
            "audio_frames": 100
        })
        recording_service.active_recordings["test-mint-123"] = mock_recorder
        
        # Get status
        result = await recording_service.get_recording_status(mint_id="test-mint-123")
        
        # Verify
        assert result["mint_id"] == "test-mint-123"
        assert result["is_recording"] is True
        mock_recorder.get_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_recording_status_not_found(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting status for non-existent recording."""
        result = await recording_service.get_recording_status(mint_id="test-mint-123")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_all_recordings(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting all active recordings."""
        # Setup multiple recordings
        mock_recorder1 = AsyncMock(spec=StreamRecorder)
        mock_recorder1.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-1",
            "is_recording": True
        })
        
        mock_recorder2 = AsyncMock(spec=StreamRecorder)
        mock_recorder2.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-2",
            "is_recording": True
        })
        
        recording_service.active_recordings["test-mint-1"] = mock_recorder1
        recording_service.active_recordings["test-mint-2"] = mock_recorder2
        
        # Get all recordings
        result = await recording_service.get_all_recordings()
        
        # Verify
        assert result["success"] is True
        assert "test-mint-1" in result["recordings"]
        assert "test-mint-2" in result["recordings"]
    
    def test_get_recording_config_low_quality(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting low quality recording config."""
        config = recording_service._get_recording_config("mp4", "low")
        
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == 1000000
        assert config["audio_bitrate"] == 64000
        assert config["width"] == 1280
        assert config["height"] == 720
    
    def test_get_recording_config_medium_quality(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting medium quality recording config."""
        config = recording_service._get_recording_config("mp4", "medium")
        
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == 2000000
        assert config["audio_bitrate"] == 128000
        assert config["width"] == 1920
        assert config["height"] == 1080
    
    def test_get_recording_config_high_quality(
        self, 
        recording_service: LiveKitRecordingService
    ) -> None:
        """Test getting high quality recording config."""
        config = recording_service._get_recording_config("mp4", "high")
        
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == 4000000
        assert config["audio_bitrate"] == 192000
        assert config["width"] == 1920
        assert config["height"] == 1080


class TestStreamRecorder:
    """Test suite for StreamRecorder."""
    
    def test_output_filename_generation(self, tmp_path: Path) -> None:
        """Test output filename generation."""
        mock_stream_info = Mock()
        mock_stream_info.participant_sid = "PA_test123"
        
        config = {
            "format": "mp4",
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": 2000000,
            "audio_bitrate": 128000,
            "fps": 30,
            "width": 1920,
            "height": 1080
        }
        
        recorder = StreamRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=Mock()
        )
        
        assert recorder.output_path is not None
        assert "test-mint-123" in str(recorder.output_path)
        assert str(recorder.output_path).endswith(".mp4")
    
    @pytest.mark.asyncio
    async def test_start_recording_no_participant(self, tmp_path: Path) -> None:
        """Test starting recording when participant not found."""
        mock_stream_info = Mock()
        mock_stream_info.participant_sid = "PA_test123"
        
        config = {
            "format": "mp4",
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": 2000000,
            "audio_bitrate": 128000,
            "fps": 30,
            "width": 1920,
            "height": 1080
        }
        
        mock_room = Mock()
        mock_room.remote_participants = {}
        
        recorder = StreamRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=mock_room
        )
        
        result = await recorder.start()
        
        assert result["success"] is False
        assert "Participant not found" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_status(self, tmp_path: Path) -> None:
        """Test getting recorder status."""
        mock_stream_info = Mock()
        mock_stream_info.participant_sid = "PA_test123"
        
        config = {
            "format": "mp4",
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": 2000000,
            "audio_bitrate": 128000,
            "fps": 30,
            "width": 1920,
            "height": 1080
        }
        
        recorder = StreamRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=Mock()
        )
        
        status = await recorder.get_status()
        
        assert status["mint_id"] == "test-mint-123"
        assert status["is_recording"] is False
        assert status["video_frames"] == 0
        assert status["audio_frames"] == 0

