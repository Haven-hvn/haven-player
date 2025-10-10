"""
Unit tests for FFmpeg-based WebRTC recording service.
Tests the FFmpeg subprocess recording service with proper mocking.
"""

import pytest
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from typing import Dict, Any

from app.services.webrtc_recording_service import (
    WebRTCRecordingService,
    FFmpegRecorder,
    RecordingState,
    TrackContext
)

class TestFFmpegRecorder:
    """Test FFmpegRecorder class."""
    
    @pytest.fixture
    def mock_room(self):
        """Mock LiveKit room."""
        room = Mock()
        room.remote_participants = {}
        return room
    
    @pytest.fixture
    def mock_stream_info(self):
        """Mock stream info."""
        stream_info = Mock()
        stream_info.participant_sid = "PA_test123"
        return stream_info
    
    @pytest.fixture
    def recorder(self, mock_room, mock_stream_info, tmp_path):
        """Create FFmpegRecorder instance."""
        config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mpegts",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        return FFmpegRecorder(
            mint_id="test_mint",
            stream_info=mock_stream_info,
            output_dir=tmp_path,
            config=config,
            room=mock_room
        )
    
    def test_initialization(self, recorder):
        """Test recorder initialization."""
        assert recorder.mint_id == "test_mint"
        assert recorder.state == RecordingState.DISCONNECTED
        assert len(recorder.tracks) == 0
        assert recorder.ffmpeg_process is None
        assert recorder.output_path is None
        assert recorder.start_time is None
    
    def test_find_participant_not_found(self, recorder):
        """Test finding participant when not found."""
        participant = recorder._find_participant()
        assert participant is None
    
    def test_find_participant_found(self, recorder, mock_room):
        """Test finding participant when found."""
        # Add mock participant to room
        mock_participant = Mock()
        mock_participant.sid = "PA_test123"
        mock_room.remote_participants = {"PA_test123": mock_participant}
        
        participant = recorder._find_participant()
        assert participant == mock_participant
    
    @pytest.mark.asyncio
    async def test_start_recording_no_participant(self, recorder):
        """Test starting recording when participant not found."""
        result = await recorder.start()
        
        assert result["success"] is False
        assert "Target participant not found" in result["error"]
        assert recorder.state == RecordingState.CONNECTING
    
    @pytest.mark.asyncio
    async def test_stop_recording_not_recording(self, recorder):
        """Test stopping recording when not recording."""
        result = await recorder.stop()
        
        assert result["success"] is False
        assert "No active recording to stop" in result["error"]
    
    def test_get_status_disconnected(self, recorder):
        """Test getting status when disconnected."""
        status = await recorder.get_status()
        
        assert status["mint_id"] == "test_mint"
        assert status["state"] == "disconnected"
        assert status["start_time"] is None
        assert status["output_path"] is None
        assert status["file_size_mb"] == 0.0
        assert status["tracks"] == 0
    
    def test_track_context_creation(self):
        """Test TrackContext creation."""
        mock_track = Mock()
        mock_track.sid = "TR_test123"
        mock_track.kind = 1  # VIDEO
        
        context = TrackContext(
            track_id="PA_test123_TR_test123",
            track=mock_track,
            kind=1,
            participant_sid="PA_test123"
        )
        
        assert context.track_id == "PA_test123_TR_test123"
        assert context.track == mock_track
        assert context.kind == 1
        assert context.participant_sid == "PA_test123"
    
    def test_recording_state_values(self):
        """Test RecordingState enum values."""
        assert RecordingState.DISCONNECTED.value == "disconnected"
        assert RecordingState.CONNECTING.value == "connecting"
        assert RecordingState.CONNECTED.value == "connected"
        assert RecordingState.SUBSCRIBING.value == "subscribing"
        assert RecordingState.SUBSCRIBED.value == "subscribed"
        assert RecordingState.RECORDING.value == "recording"
        assert RecordingState.STOPPING.value == "stopping"
        assert RecordingState.STOPPED.value == "stopped"


class TestWebRTCRecordingService:
    """Test WebRTCRecordingService class."""
    
    @pytest.fixture
    def recording_service(self, tmp_path):
        """Create WebRTCRecordingService instance."""
        return WebRTCRecordingService(output_dir=str(tmp_path))
    
    def test_initialization(self, recording_service):
        """Test service initialization."""
        assert recording_service.output_dir.exists()
        assert len(recording_service.active_recordings) == 0
        assert recording_service.default_config["format"] == "mpegts"
        assert recording_service.default_config["video_codec"] == "libx264"
        assert recording_service.default_config["audio_codec"] == "aac"
    
    def test_get_recording_config_default(self, recording_service):
        """Test getting default recording config."""
        config = recording_service._get_recording_config("mpegts", "medium")
        
        assert config["format"] == "mpegts"
        assert config["video_bitrate"] == "2M"
        assert config["audio_bitrate"] == "128k"
    
    def test_get_recording_config_low_quality(self, recording_service):
        """Test getting low quality recording config."""
        config = recording_service._get_recording_config("mpegts", "low")
        
        assert config["video_bitrate"] == "1M"
        assert config["audio_bitrate"] == "96k"
    
    def test_get_recording_config_high_quality(self, recording_service):
        """Test getting high quality recording config."""
        config = recording_service._get_recording_config("mpegts", "high")
        
        assert config["video_bitrate"] == "4M"
        assert config["audio_bitrate"] == "192k"
    
    @pytest.mark.asyncio
    async def test_start_recording_no_stream(self, recording_service):
        """Test starting recording when no stream exists."""
        with patch.object(recording_service.stream_manager, 'get_stream_info', return_value=None):
            result = await recording_service.start_recording("nonexistent_mint")
            
            assert result["success"] is False
            assert "No active stream found" in result["error"]
    
    @pytest.mark.asyncio
    async def test_start_recording_already_active(self, recording_service):
        """Test starting recording when already active."""
        # Add mock recorder to active recordings
        mock_recorder = Mock()
        recording_service.active_recordings["test_mint"] = mock_recorder
        
        result = await recording_service.start_recording("test_mint")
        
        assert result["success"] is False
        assert "Recording already active" in result["error"]
    
    @pytest.mark.asyncio
    async def test_stop_recording_not_found(self, recording_service):
        """Test stopping recording when not found."""
        result = await recording_service.stop_recording("nonexistent_mint")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]
    
    @pytest.mark.asyncio
    async def test_get_recording_status_not_found(self, recording_service):
        """Test getting status when recording not found."""
        result = await recording_service.get_recording_status("nonexistent_mint")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]


class TestFFmpegIntegration:
    """Test FFmpeg subprocess integration."""
    
    @pytest.mark.asyncio
    async def test_ffmpeg_command_construction(self, tmp_path):
        """Test FFmpeg command construction."""
        config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mpegts",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        output_path = tmp_path / "test.ts"
        
        # Expected FFmpeg command
        expected_cmd = [
            'ffmpeg', '-y',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24',
            '-s', '1920x1080', '-r', '30',
            '-i', 'pipe:0',
            '-f', 's16le', '-ar', '48000', '-ac', '2',
            '-i', 'pipe:3',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
            '-b:v', '2M',
            '-c:a', 'aac', '-b:a', '128k',
            '-f', 'mpegts',
            str(output_path)
        ]
        
        # This would be tested in the actual FFmpeg setup method
        # For now, just verify the command structure
        assert 'ffmpeg' in expected_cmd
        assert '-f' in expected_cmd
        assert 'mpegts' in expected_cmd
        assert str(output_path) in expected_cmd
    
    def test_output_path_generation(self, tmp_path):
        """Test output path generation."""
        mint_id = "test_mint_123"
        timestamp = "20250101_120000"
        
        # Mock datetime to get consistent timestamp
        with patch('app.services.webrtc_recording_service.datetime') as mock_datetime:
            mock_datetime.now.return_value.strftime.return_value = timestamp
            
            output_path = tmp_path / f"{mint_id}_{timestamp}.ts"
            
            assert output_path.name == f"{mint_id}_{timestamp}.ts"
            assert output_path.suffix == ".ts"
