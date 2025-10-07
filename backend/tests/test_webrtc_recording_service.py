"""
Unit tests for WebRTC recording service.
Tests the WebRTC-based recording service with proper mocking of LiveKit components.
"""

import pytest
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from typing import Dict, Any

from app.services.webrtc_recording_service import (
    WebRTCRecordingService,
    WebRTCRecorder,
    RecordingState,
    TrackContext,
    MediaClock,
    BoundedQueue
)
from livekit import rtc


@pytest.fixture
def mock_stream_manager() -> Mock:
    """Create a mock StreamManager."""
    manager = Mock()
    manager.room = Mock(spec=rtc.Room)
    manager.room.name = "test-room"
    manager.room.remote_participants = {}
    manager.room.is_connected = Mock(return_value=True)
    
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
    video_track.sid = "video_track_123"
    
    video_pub = Mock(spec=rtc.RemoteTrackPublication)
    video_pub.track = video_track
    video_pub.kind = rtc.TrackKind.KIND_VIDEO
    video_pub.subscribed = True
    video_pub.set_subscribed = Mock()
    
    # Create mock audio track
    audio_track = Mock(spec=rtc.RemoteAudioTrack)
    audio_track.kind = rtc.TrackKind.KIND_AUDIO
    audio_track.sid = "audio_track_123"
    
    audio_pub = Mock(spec=rtc.RemoteTrackPublication)
    audio_pub.track = audio_track
    audio_pub.kind = rtc.TrackKind.KIND_AUDIO
    audio_pub.subscribed = True
    audio_pub.set_subscribed = Mock()
    
    participant.track_publications = {
        "video": video_pub,
        "audio": audio_pub
    }
    
    return participant


@pytest.fixture
def recording_service(tmp_path: Path) -> WebRTCRecordingService:
    """Create a WebRTCRecordingService instance with temp directory."""
    service = WebRTCRecordingService(output_dir=str(tmp_path))
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
    video_stream.time_base = None
    
    audio_stream = Mock()
    audio_stream.bit_rate = 128000
    audio_stream.encode = Mock(return_value=[])
    audio_stream.time_base = None
    
    container.add_stream = Mock(side_effect=[video_stream, audio_stream])
    container.close = Mock()
    container.mux = Mock()
    
    return container


class TestWebRTCRecordingService:
    """Test suite for WebRTCRecordingService."""
    
    @pytest.mark.asyncio
    async def test_initialization(self, recording_service: WebRTCRecordingService) -> None:
        """Test service initialization."""
        assert recording_service.output_dir.exists()
        assert recording_service.active_recordings == {}
        assert "low" in recording_service.default_config
        assert "medium" in recording_service.default_config
        assert "high" in recording_service.default_config
        assert recording_service.timeouts['connection'] == 20.0
        assert recording_service.timeouts['subscription'] == 10.0
    
    @pytest.mark.asyncio
    async def test_start_recording_success(
        self, 
        recording_service: WebRTCRecordingService,
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
        with patch('app.services.webrtc_recording_service.av.open') as mock_av_open:
            mock_container = Mock()
            mock_container.add_stream = Mock(side_effect=[Mock(), Mock()])
            mock_av_open.return_value = mock_container
            
            # Mock the frame processing tasks to not actually run
            with patch.object(WebRTCRecorder, '_start_frame_processing', new_callable=AsyncMock):
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
        recording_service: WebRTCRecordingService,
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
        recording_service: WebRTCRecordingService,
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
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test successful recording stop."""
        # Setup
        mock_recorder = AsyncMock(spec=WebRTCRecorder)
        mock_recorder.stop = AsyncMock(return_value={
            "success": True,
            "output_path": "/path/to/output.mp4",
            "stats": {"video_frames": 100, "audio_frames": 200}
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
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test stopping recording that isn't active."""
        result = await recording_service.stop_recording(mint_id="test-mint-123")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_recording_status_success(
        self, 
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting recording status."""
        # Setup
        mock_recorder = AsyncMock(spec=WebRTCRecorder)
        mock_recorder.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-123",
            "state": "recording",
            "stats": {"video_frames": 50, "audio_frames": 100}
        })
        recording_service.active_recordings["test-mint-123"] = mock_recorder
        
        # Get status
        result = await recording_service.get_recording_status(mint_id="test-mint-123")
        
        # Verify
        assert result["mint_id"] == "test-mint-123"
        assert result["state"] == "recording"
        mock_recorder.get_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_recording_status_not_found(
        self, 
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting status for non-existent recording."""
        result = await recording_service.get_recording_status(mint_id="test-mint-123")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_all_recordings(
        self, 
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting all active recordings."""
        # Setup multiple recordings
        mock_recorder1 = AsyncMock(spec=WebRTCRecorder)
        mock_recorder1.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-1",
            "state": "recording"
        })
        
        mock_recorder2 = AsyncMock(spec=WebRTCRecorder)
        mock_recorder2.get_status = AsyncMock(return_value={
            "mint_id": "test-mint-2",
            "state": "recording"
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
        recording_service: WebRTCRecordingService
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
        recording_service: WebRTCRecordingService
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
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting high quality recording config."""
        config = recording_service._get_recording_config("mp4", "high")
        
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == 4000000
        assert config["audio_bitrate"] == 192000
        assert config["width"] == 1920
        assert config["height"] == 1080
    
    def test_get_recording_config_webm_format(
        self, 
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting WebM format recording config."""
        config = recording_service._get_recording_config("webm", "medium")
        
        assert config["format"] == "webm"
        assert config["video_codec"] == "libvpx-vp9"
        assert config["audio_codec"] == "libopus"
    
    def test_get_recording_config_av1_format(
        self, 
        recording_service: WebRTCRecordingService
    ) -> None:
        """Test getting AV1 format recording config."""
        config = recording_service._get_recording_config("av1", "medium")
        
        assert config["format"] == "mp4"
        assert config["video_codec"] == "libaom-av1"


class TestWebRTCRecorder:
    """Test suite for WebRTCRecorder."""
    
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
        
        recorder = WebRTCRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=Mock(),
            timeouts={"connection": 20.0, "subscription": 10.0, "keyframe": 2.0, "read_deadline": 5.0, "encode_timeout": 1.0},
            queue_config={"video_max_items": 60, "audio_max_items": 200}
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
        mock_room.is_connected = Mock(return_value=True)
        
        recorder = WebRTCRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=mock_room,
            timeouts={"connection": 20.0, "subscription": 10.0, "keyframe": 2.0, "read_deadline": 5.0, "encode_timeout": 1.0},
            queue_config={"video_max_items": 60, "audio_max_items": 200}
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
        
        recorder = WebRTCRecorder(
            mint_id="test-mint-123",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=Mock(),
            timeouts={"connection": 20.0, "subscription": 10.0, "keyframe": 2.0, "read_deadline": 5.0, "encode_timeout": 1.0},
            queue_config={"video_max_items": 60, "audio_max_items": 200}
        )
        
        status = await recorder.get_status()
        
        assert status["mint_id"] == "test-mint-123"
        assert status["state"] == "disconnected"
        assert status["stats"]["video_frames"] == 0
        assert status["stats"]["audio_frames"] == 0


class TestMediaClock:
    """Test suite for MediaClock."""
    
    def test_register_track(self) -> None:
        """Test track registration."""
        clock = MediaClock()
        
        clock.register_track("track1", rtc.TrackKind.KIND_VIDEO, 1000, 1234567890.0)
        
        assert "track1" in clock.track_clocks
        assert clock.track_clocks["track1"]["clock_rate"] == 90000
        assert clock.track_clocks["track1"]["first_rtp_timestamp"] == 1000
        assert clock.track_clocks["track1"]["first_wall_time"] == 1234567890.0
    
    def test_rtp_to_pts_video(self) -> None:
        """Test RTP to PTS conversion for video."""
        clock = MediaClock()
        clock.register_track("video1", rtc.TrackKind.KIND_VIDEO, 1000, 1234567890.0)
        
        # Test normal case
        pts = clock.rtp_to_pts("video1", 2000)
        assert pts == 1000  # 2000 - 1000 = 1000
        
        # Test wrap-around case
        pts = clock.rtp_to_pts("video1", 4294967295)  # Max 32-bit value
        assert pts == 4294966295  # 4294967295 - 1000 = 4294966295
    
    def test_rtp_to_pts_audio(self) -> None:
        """Test RTP to PTS conversion for audio."""
        clock = MediaClock()
        clock.register_track("audio1", rtc.TrackKind.KIND_AUDIO, 1000, 1234567890.0)
        
        pts = clock.rtp_to_pts("audio1", 2000)
        assert pts == 1000  # 2000 - 1000 = 1000
    
    def test_rtp_to_pts_unknown_track(self) -> None:
        """Test RTP to PTS conversion for unknown track."""
        clock = MediaClock()
        
        pts = clock.rtp_to_pts("unknown", 2000)
        assert pts == 0


class TestBoundedQueue:
    """Test suite for BoundedQueue."""
    
    def test_put_and_get(self) -> None:
        """Test basic put and get operations."""
        queue = BoundedQueue(max_items=3, track_kind=rtc.TrackKind.KIND_VIDEO)
        
        # Put items
        assert queue.put("item1") is True
        assert queue.put("item2") is True
        assert queue.put("item3") is True
        
        # Queue should be full
        assert queue.is_full() is True
        
        # Get items
        assert queue.get() == "item1"
        assert queue.get() == "item2"
        assert queue.get() == "item3"
        
        # Queue should be empty
        assert queue.size() == 0
    
    def test_drop_oldest_when_full(self) -> None:
        """Test that oldest items are dropped when queue is full."""
        queue = BoundedQueue(max_items=2, track_kind=rtc.TrackKind.KIND_VIDEO)
        
        # Fill queue
        assert queue.put("item1") is True
        assert queue.put("item2") is True
        
        # Try to put another item - should drop oldest
        assert queue.put("item3") is True
        
        # Should have item2 and item3
        assert queue.get() == "item2"
        assert queue.get() == "item3"
        
        # Should have dropped 1 item
        assert queue.dropped_count == 1
    
    def test_statistics(self) -> None:
        """Test queue statistics."""
        queue = BoundedQueue(max_items=2, track_kind=rtc.TrackKind.KIND_VIDEO)
        
        # Put items
        queue.put("item1")
        queue.put("item2")
        queue.put("item3")  # This will drop item1
        
        assert queue.total_enqueued == 3
        assert queue.dropped_count == 1
        assert queue.size() == 2
    
    def test_get_timeout(self) -> None:
        """Test get with timeout."""
        queue = BoundedQueue(max_items=2, track_kind=rtc.TrackKind.KIND_VIDEO)
        
        # Get from empty queue with timeout
        result = queue.get(timeout=0.1)
        assert result is None


class TestTrackContext:
    """Test suite for TrackContext."""
    
    def test_track_context_creation(self) -> None:
        """Test TrackContext creation."""
        mock_track = Mock()
        mock_pub = Mock()
        
        context = TrackContext(
            track_id="test_track",
            track=mock_track,
            publication=mock_pub,
            kind=rtc.TrackKind.KIND_VIDEO
        )
        
        assert context.track_id == "test_track"
        assert context.track == mock_track
        assert context.publication == mock_pub
        assert context.kind == rtc.TrackKind.KIND_VIDEO
        assert context.frame_count == 0
        assert context.is_active is False
        assert context.first_rtp_timestamp is None
        assert context.first_wall_time is None


class TestRecordingState:
    """Test suite for RecordingState enum."""
    
    def test_recording_state_values(self) -> None:
        """Test RecordingState enum values."""
        assert RecordingState.DISCONNECTED.value == "disconnected"
        assert RecordingState.CONNECTING.value == "connecting"
        assert RecordingState.CONNECTED.value == "connected"
        assert RecordingState.SUBSCRIBING.value == "subscribing"
        assert RecordingState.SUBSCRIBED.value == "subscribed"
        assert RecordingState.RECORDING.value == "recording"
        assert RecordingState.STOPPING.value == "stopping"
        assert RecordingState.STOPPED.value == "stopped"
    
    def test_recording_state_transitions(self) -> None:
        """Test that state transitions make sense."""
        # Valid transitions
        assert RecordingState.DISCONNECTED != RecordingState.CONNECTING
        assert RecordingState.CONNECTING != RecordingState.CONNECTED
        assert RecordingState.CONNECTED != RecordingState.SUBSCRIBING
        assert RecordingState.SUBSCRIBING != RecordingState.SUBSCRIBED
        assert RecordingState.SUBSCRIBED != RecordingState.RECORDING
        assert RecordingState.RECORDING != RecordingState.STOPPING
        assert RecordingState.STOPPING != RecordingState.STOPPED
