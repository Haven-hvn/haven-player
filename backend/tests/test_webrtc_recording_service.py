"""
Unit tests for WebRTC Recording Service using LiveKit's ParticipantRecorder.
"""

import pytest
from unittest.mock import MagicMock
from pathlib import Path

# Mock external dependencies before importing the service
import sys
sys.modules['livekit'] = MagicMock()
sys.modules['livekit.rtc'] = MagicMock()
sys.modules['psutil'] = MagicMock()

from app.services.webrtc_recording_service import (
    WebRTCRecordingService,
    RecordingState
)


@pytest.fixture
def mock_room():
    """Create a mock LiveKit room."""
    room = MagicMock()
    room.isconnected.return_value = True
    room.remote_participants = {}
    room.connection_state = MagicMock()
    return room






class TestWebRTCRecordingService:
    """Test WebRTCRecordingService class."""
    
    @pytest.fixture
    def service(self, tmp_path):
        """Create WebRTCRecordingService instance."""
        return WebRTCRecordingService(output_dir=str(tmp_path))
    
    def test_init(self, service):
        """Test service initialization."""
        assert service.output_dir.exists()
        assert isinstance(service.active_recordings, dict)
        assert len(service.active_recordings) == 0
    
    def test_default_config(self, service):
        """Test default configuration."""
        config = service.default_config
        assert config['video_codec'] == 'vp9'
        assert config['audio_codec'] == 'opus'
        assert config['format'] == 'webm'
        assert config['fps'] == 30
        assert config['video_quality'] == 'best'
    
    @pytest.mark.asyncio
    async def test_get_all_recordings_empty(self, service):
        """Test getting all recordings when none are active."""
        result = await service.get_all_recordings()
        assert result['success'] is True
        assert result['count'] == 0
        assert len(result['recordings']) == 0
    
    @pytest.mark.asyncio
    async def test_get_recording_status_not_found(self, service):
        """Test getting status for non-existent recording."""
        result = await service.get_recording_status("nonexistent_mint")
        assert result['success'] is False
        assert 'error' in result


class TestRecordingState:
    """Test RecordingState enum."""
    
    def test_recording_states(self):
        """Test all recording states are defined."""
        assert RecordingState.DISCONNECTED.value == "disconnected"
        assert RecordingState.CONNECTING.value == "connecting"
        assert RecordingState.CONNECTED.value == "connected"
        assert RecordingState.SUBSCRIBING.value == "subscribing"
        assert RecordingState.SUBSCRIBED.value == "subscribed"
        assert RecordingState.RECORDING.value == "recording"
        assert RecordingState.STOPPING.value == "stopping"
        assert RecordingState.STOPPED.value == "stopped"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--cov=app.services.webrtc_recording_service', '--cov-report=term-missing'])

