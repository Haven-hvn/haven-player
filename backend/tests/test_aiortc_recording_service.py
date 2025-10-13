"""
Tests for the aiortc-based WebRTC recording service.
"""

import asyncio
import pytest
from pathlib import Path
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from app.services.webrtc_recording_service import (
    AiortcFileRecorder,
    WebRTCRecordingService,
    RecordingState
)


class TestAiortcFileRecorder:
    """Test the AiortcFileRecorder class."""

    @pytest.fixture
    def mock_stream_info(self):
        return Mock(
            participant_sid="test_participant_123"
        )

    @pytest.fixture
    def mock_room(self):
        room = Mock()
        room.remote_participants = {}
        room.isconnected.return_value = True
        return room

    @pytest.fixture
    def mock_config(self):
        return {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mpegts",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }

    @pytest.fixture
    def output_dir(self, tmp_path):
        return tmp_path / "recordings"

    @pytest.fixture
    def recorder(self, mock_stream_info, mock_room, mock_config, output_dir):
        return AiortcFileRecorder(
            mint_id="test_mint_123",
            stream_info=mock_stream_info,
            output_dir=output_dir,
            config=mock_config,
            room=mock_room
        )

    @patch('app.services.webrtc_recording_service.AV_AVAILABLE', True)
    def test_recorder_initialization(self, recorder):
        """Test recorder initialization."""
        assert recorder.mint_id == "test_mint_123"
        assert recorder.state == RecordingState.DISCONNECTED
        assert recorder.container is None
        assert recorder.output_path is None
        assert recorder.video_frames_received == 0
        assert recorder.audio_frames_received == 0
        assert recorder._shutdown is False

    @patch('app.services.webrtc_recording_service.AV_AVAILABLE', False)
    def test_recorder_initialization_no_av(self):
        """Test recorder initialization when PyAV is not available."""
        with pytest.raises(ImportError, match="PyAV \\(av\\) is required"):
            AiortcFileRecorder(
                mint_id="test",
                stream_info=Mock(),
                output_dir=Path("test"),
                config={},
                room=Mock()
            )

    @pytest.mark.asyncio
    async def test_start_recording_no_participant(self, recorder):
        """Test starting recording when participant not found."""
        recorder._find_participant = Mock(return_value=None)

        result = await recorder.start()

        assert result["success"] is False
        assert "Target participant not found" in result["error"]

    @pytest.mark.asyncio
    async def test_start_recording_success(self, recorder, mock_room):
        """Test successful recording start."""
        # Mock participant and tracks
        participant = Mock()
        participant.sid = "test_participant_123"
        participant.track_publications = {}

        video_track = Mock()
        video_track.sid = "video_track_123"
        video_track.kind = 1  # rtc.TrackKind.KIND_VIDEO

        audio_track = Mock()
        audio_track.sid = "audio_track_123"
        audio_track.kind = 2  # rtc.TrackKind.KIND_AUDIO

        track_publication = Mock()
        track_publication.sid = "track_pub_123"
        track_publication.track = video_track
        participant.track_publications = {"track_pub_123": track_publication}

        recorder._find_participant = Mock(return_value=participant)
        recorder._subscribe_to_tracks = AsyncMock()
        recorder._setup_existing_track_handlers = AsyncMock()
        recorder.room.on = Mock()

        # Mock PyAV container creation
        mock_container = Mock()
        mock_video_stream = Mock()
        mock_video_stream.time_base = Mock()

        with patch('av.open', return_value=mock_container) as mock_av_open, \
             patch.object(mock_container, 'add_stream', return_value=mock_video_stream) as mock_add_stream:

            result = await recorder.start()

            assert result["success"] is True
            assert "output_path" in result
            assert recorder.state == RecordingState.RECORDING
            assert recorder.start_time is not None

    @pytest.mark.asyncio
    async def test_stop_recording(self, recorder):
        """Test stopping recording."""
        # Set up recorder as if it's recording
        recorder.state = RecordingState.RECORDING
        recorder.start_time = datetime.now(timezone.utc)
        recorder.container = Mock()
        recorder.output_path = Path("/tmp/test.ts")

        with patch.object(recorder, '_close_container') as mock_close:
            result = await recorder.stop()

            assert result["success"] is True
            assert recorder.state == RecordingState.STOPPED
            mock_close.assert_called_once()

    @pytest.mark.asyncio
    async def test_stop_recording_not_recording(self, recorder):
        """Test stopping recording when not recording."""
        recorder.state = RecordingState.STOPPED

        result = await recorder.stop()

        assert result["success"] is False
        assert "No active recording to stop" in result["error"]

    @pytest.mark.asyncio
    async def test_get_status(self, recorder):
        """Test getting recording status."""
        recorder.state = RecordingState.RECORDING
        recorder.start_time = datetime.now(timezone.utc)
        recorder.output_path = Path("/tmp/test.ts")
        recorder.container = Mock()

        # Mock file size
        with patch.object(Path, 'stat') as mock_stat:
            mock_stat.return_value.st_size = 1024 * 1024  # 1MB

            result = await recorder.get_status()

            assert result["mint_id"] == "test_mint_123"
            assert result["state"] == "recording"
            assert result["recording_mode"] == "aiortc"
            assert result["is_recording"] is True
            assert result["file_size_mb"] == 1.0

    @pytest.mark.asyncio
    async def test_get_status_no_container(self, recorder):
        """Test getting status when no container."""
        recorder.state = RecordingState.RECORDING
        recorder.container = None

        result = await recorder.get_status()

        assert result["recording_mode"] == "none"
        assert result["is_recording"] is False


class TestWebRTCRecordingService:
    """Test the WebRTCRecordingService class."""

    @pytest.fixture
    def service(self, tmp_path):
        return WebRTCRecordingService(output_dir=str(tmp_path / "recordings"))

    @pytest.mark.asyncio
    async def test_start_recording(self, service):
        """Test starting a recording."""
        # Mock stream manager
        service.stream_manager.get_stream_info = AsyncMock(return_value=Mock(participant_sid="test_participant"))
        service.stream_manager.room = Mock(isconnected=lambda: True)

        # Mock recorder creation and start
        mock_recorder = AsyncMock()
        mock_recorder.start = AsyncMock(return_value={
            "success": True,
            "output_path": "/tmp/test.ts",
            "start_time": datetime.now(timezone.utc).isoformat(),
            "tracks": 1,
            "stats": {"video_frames": 0, "audio_frames": 0, "dropped_frames": 0, "pli_requests": 0, "track_subscriptions": 1, "connection_time": 0.0, "subscription_time": 0.0}
        })

        with patch('app.services.webrtc_recording_service.AiortcFileRecorder', return_value=mock_recorder):
            result = await service.start_recording("test_mint_123")

            assert result["success"] is True
            assert "test_mint_123" in service.active_recordings

    @pytest.mark.asyncio
    async def test_start_recording_already_active(self, service):
        """Test starting recording when already active."""
        service.active_recordings["test_mint_123"] = Mock()

        result = await service.start_recording("test_mint_123")

        assert result["success"] is False
        assert "Recording already active" in result["error"]

    @pytest.mark.asyncio
    async def test_stop_recording(self, service):
        """Test stopping a recording."""
        mock_recorder = AsyncMock()
        mock_recorder.stop = AsyncMock(return_value={
            "success": True,
            "output_path": "/tmp/test.ts",
            "file_size_bytes": 1024,
            "duration_seconds": 10.0,
            "stats": {"video_frames": 300, "audio_frames": 0, "dropped_frames": 0, "pli_requests": 0, "track_subscriptions": 1, "connection_time": 0.0, "subscription_time": 0.0}
        })

        service.active_recordings["test_mint_123"] = mock_recorder

        result = await service.stop_recording("test_mint_123")

        assert result["success"] is True
        assert "test_mint_123" not in service.active_recordings

    @pytest.mark.asyncio
    async def test_stop_recording_not_active(self, service):
        """Test stopping recording when not active."""
        result = await service.stop_recording("test_mint_123")

        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_get_recording_status(self, service):
        """Test getting recording status."""
        mock_recorder = AsyncMock()
        mock_recorder.get_status = AsyncMock(return_value={
            "mint_id": "test_mint_123",
            "state": "recording",
            "recording_mode": "aiortc",
            "is_recording": True
        })

        service.active_recordings["test_mint_123"] = mock_recorder

        result = await service.get_recording_status("test_mint_123")

        assert result["success"] is True
        assert result["mint_id"] == "test_mint_123"

    @pytest.mark.asyncio
    async def test_get_recording_status_not_active(self, service):
        """Test getting status when not active."""
        result = await service.get_recording_status("test_mint_123")

        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_get_all_recordings(self, service):
        """Test getting all recordings."""
        mock_recorder1 = AsyncMock()
        mock_recorder1.get_status = AsyncMock(return_value={
            "mint_id": "test_mint_123",
            "state": "recording"
        })

        mock_recorder2 = AsyncMock()
        mock_recorder2.get_status = AsyncMock(return_value={
            "mint_id": "test_mint_456",
            "state": "recording"
        })

        service.active_recordings = {
            "test_mint_123": mock_recorder1,
            "test_mint_456": mock_recorder2
        }

        result = await service.get_all_recordings()

        assert result["success"] is True
        assert len(result["recordings"]) == 2
        assert "test_mint_123" in result["recordings"]
        assert "test_mint_456" in result["recordings"]
