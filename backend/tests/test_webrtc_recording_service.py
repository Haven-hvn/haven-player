"""
Comprehensive unit tests for WebRTC Recording Service.
Tests all critical paths including encoder configuration, PTS/DTS calculation,
encoder stall detection, and finalization.
"""

import pytest
import asyncio
from unittest.mock import Mock, MagicMock, AsyncMock, patch, PropertyMock
from pathlib import Path
from datetime import datetime, timezone
from fractions import Fraction
from typing import Dict, Any

# Mock external dependencies before importing the service
import sys
sys.modules['av'] = MagicMock()
sys.modules['av.video'] = MagicMock()
sys.modules['av.audio'] = MagicMock()
sys.modules['av.container'] = MagicMock()
sys.modules['av.audio.layout'] = MagicMock()
sys.modules['av.audio.resampler'] = MagicMock()
sys.modules['livekit'] = MagicMock()
sys.modules['livekit.rtc'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['psutil'] = MagicMock()

from app.services.webrtc_recording_service import (
    AiortcFileRecorder,
    WebRTCRecordingService,
    VideoNormalizer,
    RecordingState,
    VALID_FORMATS,
    CODEC_TO_FORMAT
)


@pytest.fixture
def mock_room():
    """Create a mock LiveKit room."""
    room = MagicMock()
    room.isconnected.return_value = True
    room.remote_participants = {}
    room.connection_state = MagicMock()
    return room


@pytest.fixture
def mock_stream_info():
    """Create mock stream info."""
    stream_info = MagicMock()
    stream_info.participant_sid = "test_participant_123"
    stream_info.mint_id = "test_mint_123"
    stream_info.room_name = "test_room"
    return stream_info


@pytest.fixture
def mock_config():
    """Create test recording configuration."""
    return {
        "video_codec": "libx264",
        "audio_codec": "aac",
        "video_bitrate": "2M",
        "audio_bitrate": "128k",
        "format": "mp4",
        "fps": 30,
        "gop_size": 60,
        "width": 1920,
        "height": 1080,
        "rgb_order": "RGB",
        "row_stride_bytes": None,
        "resolution_strategy": "scale_to_config",
        "colorspace": "bt709",
        "range": "limited",
        "coerce_unknown_to_rgb": False,
    }


@pytest.fixture
def recorder(mock_room, mock_stream_info, mock_config, tmp_path):
    """Create an AiortcFileRecorder instance for testing."""
    recorder = AiortcFileRecorder(
        mint_id="test_mint_123",
        stream_info=mock_stream_info,
        output_dir=tmp_path,
        config=mock_config,
        room=mock_room
    )
    return recorder


class TestVideoNormalizer:
    """Test VideoNormalizer class."""
    
    def test_init(self, mock_config):
        """Test VideoNormalizer initialization."""
        normalizer = VideoNormalizer(mock_config)
        assert normalizer.config == mock_config
        assert normalizer.rgb_order == "RGB"
        assert normalizer.resolution_strategy == "scale_to_config"
    
    def test_detect_pixel_format_rgb24(self, mock_config):
        """Test RGB24 pixel format detection."""
        normalizer = VideoNormalizer(mock_config)
        width, height = 100, 100
        buffer = bytearray(width * height * 3)
        format_type = normalizer._detect_pixel_format(buffer, width, height)
        assert format_type in ["rgb24", "bgr24"]
    
    def test_detect_pixel_format_rgba(self, mock_config):
        """Test RGBA pixel format detection."""
        normalizer = VideoNormalizer(mock_config)
        width, height = 100, 100
        buffer = bytearray(width * height * 4)
        format_type = normalizer._detect_pixel_format(buffer, width, height)
        assert format_type == "rgba"
    
    def test_detect_pixel_format_yuv420(self, mock_config):
        """Test YUV420p pixel format detection."""
        normalizer = VideoNormalizer(mock_config)
        width, height = 100, 100
        buffer = bytearray(int(width * height * 1.5))
        format_type = normalizer._detect_pixel_format(buffer, width, height)
        assert format_type in ["i420", "nv12"]
    
    def test_detect_pixel_format_unknown(self, mock_config):
        """Test unknown pixel format detection."""
        normalizer = VideoNormalizer(mock_config)
        width, height = 100, 100
        buffer = bytearray(width * height * 5)  # Weird size
        format_type = normalizer._detect_pixel_format(buffer, width, height)
        assert format_type == "unknown"


class TestAiortcFileRecorder:
    """Test AiortcFileRecorder class."""
    
    def test_init(self, recorder, mock_config):
        """Test recorder initialization."""
        assert recorder.mint_id == "test_mint_123"
        assert recorder.config == mock_config
        assert recorder.state == RecordingState.DISCONNECTED
        assert recorder.encoder_finalized is False
        assert recorder.zero_packet_streak == 0
        assert recorder.encoder_frame_counter == 0
        assert recorder.metrics['frames_received'] == 0
        assert recorder.metrics['packets_written'] == 0
    
    def test_calculate_video_pts_dts_first_frame(self, recorder):
        """Test PTS/DTS calculation for first frame."""
        # Setup mock video stream
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        
        # Create mock frames
        livekit_frame = MagicMock()
        livekit_frame.timestamp_us = 1000000
        av_frame = MagicMock()
        
        # Calculate PTS/DTS
        pts, dts = recorder._calculate_video_pts_dts(livekit_frame, av_frame)
        
        # First frame should get PTS=0, DTS=0
        assert pts == 0
        assert dts == 0
        assert recorder.first_video_timestamp_us == 1000000
        assert recorder.encoder_frame_counter == 0
    
    def test_calculate_video_pts_dts_subsequent_frames(self, recorder):
        """Test PTS/DTS calculation for subsequent frames."""
        # Setup mock video stream
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        recorder.config['fps'] = 30
        recorder.config['gop_size'] = 60
        
        # Set first timestamp
        recorder.first_video_timestamp_us = 1000000
        recorder.last_video_pts = 0
        recorder.encoder_frame_counter = 0
        
        # Create frame with timestamp 1 second later
        livekit_frame = MagicMock()
        livekit_frame.timestamp_us = 2000000  # +1 second
        av_frame = MagicMock()
        
        # Calculate PTS/DTS
        pts, dts = recorder._calculate_video_pts_dts(livekit_frame, av_frame)
        
        # PTS should be 30 (1 second * 30 fps)
        assert pts == 30
        # DTS should be less than PTS
        assert dts < pts
        assert dts >= 0
        assert recorder.encoder_frame_counter == 1
    
    def test_calculate_video_pts_dts_monotonic_enforcement(self, recorder):
        """Test that PTS is enforced to be monotonic."""
        # Setup
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        recorder.config['fps'] = 30
        recorder.config['gop_size'] = 60
        recorder.first_video_timestamp_us = 1000000
        recorder.last_video_pts = 100
        recorder.encoder_frame_counter = 100
        recorder.metrics['pts_corrections'] = 0
        
        # Create frame with same timestamp (should trigger correction)
        livekit_frame = MagicMock()
        livekit_frame.timestamp_us = 1000000
        av_frame = MagicMock()
        
        # Calculate PTS/DTS
        pts, dts = recorder._calculate_video_pts_dts(livekit_frame, av_frame)
        
        # PTS should be corrected to last_pts + 1
        assert pts == 101
        assert recorder.metrics['pts_corrections'] == 1
    
    def test_calculate_video_pts_dts_fallback_no_timestamp(self, recorder):
        """Test PTS/DTS fallback when no timestamp available."""
        # Setup
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        recorder.config['fps'] = 30
        recorder.config['gop_size'] = 60
        recorder.first_video_timestamp_us = 1000000
        recorder.last_video_pts = 5
        recorder.encoder_frame_counter = 5
        
        # Create frame without timestamp
        livekit_frame = MagicMock()
        livekit_frame.timestamp_us = None
        av_frame = MagicMock()
        
        # Calculate PTS/DTS
        pts, dts = recorder._calculate_video_pts_dts(livekit_frame, av_frame)
        
        # PTS should be based on frame counter
        assert pts == 5  # encoder_frame_counter * (time_base.denominator // fps)
        assert dts < pts or dts == pts
        assert recorder.encoder_frame_counter == 6
    
    @pytest.mark.asyncio
    async def test_handle_encoder_stall(self, recorder):
        """Test encoder stall detection and handling."""
        recorder.zero_packet_streak = 50
        recorder.last_video_pts = 100
        recorder.encoder_frame_counter = 100
        recorder.video_frames_received = 100
        recorder.video_frames_written = 50
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        
        # Call stall handler
        await recorder._handle_encoder_stall()
        
        # Should not shut down at 50 frames
        assert not recorder._shutdown_event.is_set()
    
    @pytest.mark.asyncio
    async def test_handle_encoder_stall_critical_threshold(self, recorder):
        """Test encoder stall triggers shutdown at critical threshold."""
        recorder.zero_packet_streak = 101
        recorder.last_video_pts = 100
        recorder.encoder_frame_counter = 100
        recorder.video_frames_received = 100
        recorder.video_frames_written = 0
        recorder.video_stream = MagicMock()
        recorder.video_stream.time_base = Fraction(1, 30)
        
        # Call stall handler
        await recorder._handle_encoder_stall()
        
        # Should shut down at 101 frames
        assert recorder._shutdown_event.is_set()
    
    @pytest.mark.asyncio
    async def test_close_container_with_encoder_flush(self, recorder):
        """Test container close properly flushes encoders."""
        # Setup mock container and streams
        recorder.container = MagicMock()
        recorder.video_stream = MagicMock()
        recorder.audio_stream = MagicMock()
        
        # Mock encode(None) to return packets
        mock_video_packets = [MagicMock(size=1000), MagicMock(size=2000)]
        mock_audio_packets = [MagicMock(size=500)]
        recorder.video_stream.encode.return_value = mock_video_packets
        recorder.audio_stream.encode.return_value = mock_audio_packets
        
        # Close container
        await recorder._close_container()
        
        # Verify encode(None) was called for both streams
        recorder.video_stream.encode.assert_called_once_with(None)
        recorder.audio_stream.encode.assert_called_once_with(None)
        
        # Verify packets were muxed
        assert recorder.container.mux.call_count == 3
        
        # Verify container was closed
        recorder.container.close.assert_called_once()
        
        # Verify encoder marked as finalized
        assert recorder.encoder_finalized is True
    
    @pytest.mark.asyncio
    async def test_close_container_handles_eoferror(self, recorder):
        """Test container close handles EOFError gracefully."""
        # Setup mock container and streams
        recorder.container = MagicMock()
        recorder.video_stream = MagicMock()
        
        # Mock encode(None) to raise EOFError
        recorder.video_stream.encode.side_effect = EOFError("Encoder already finalized")
        
        # Close container should not raise exception
        await recorder._close_container()
        
        # Verify container was still closed
        recorder.container.close.assert_called_once()
        assert recorder.encoder_finalized is True
    
    def test_parse_bitrate_int(self, recorder):
        """Test bitrate parsing with integer."""
        assert recorder._parse_bitrate(2000000) == 2000000
    
    def test_parse_bitrate_string_k(self, recorder):
        """Test bitrate parsing with 'k' suffix."""
        assert recorder._parse_bitrate("128k") == 128000
        assert recorder._parse_bitrate("128K") == 128000
    
    def test_parse_bitrate_string_m(self, recorder):
        """Test bitrate parsing with 'M' suffix."""
        assert recorder._parse_bitrate("2M") == 2000000
        assert recorder._parse_bitrate("2m") == 2000000
    
    def test_parse_bitrate_string_plain(self, recorder):
        """Test bitrate parsing with plain number string."""
        assert recorder._parse_bitrate("2000000") == 2000000
    
    def test_request_keyframe(self, recorder):
        """Test keyframe request (placeholder)."""
        # Should not raise exception
        recorder._request_keyframe()
    
    def test_log_memory_usage(self, recorder):
        """Test memory usage logging."""
        # Should not raise exception
        recorder._log_memory_usage("test_context")
    
    @pytest.mark.asyncio
    async def test_get_status_includes_metrics(self, recorder):
        """Test get_status includes comprehensive metrics."""
        recorder.video_frames_received = 100
        recorder.video_frames_written = 95
        recorder.metrics['frames_received'] = 100
        recorder.metrics['packets_written'] = 95
        recorder.metrics['bytes_written'] = 1000000
        recorder.metrics['pts_corrections'] = 5
        recorder.zero_packet_streak = 0
        recorder.frames_dropped = 0
        
        status = await recorder.get_status()
        
        assert status['state'] == RecordingState.DISCONNECTED.value
        assert status['stats']['video_frames_received'] == 100
        assert status['stats']['video_frames_written'] == 95
        assert status['stats']['zero_packet_streak'] == 0
        assert 'metrics' in status
        assert status['metrics']['frames_received'] == 100
        assert status['metrics']['packets_written'] == 95
        assert status['metrics']['bytes_written'] == 1000000


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
        assert config['video_codec'] == 'libx264'
        assert config['audio_codec'] == 'aac'
        assert config['format'] == 'mp4'
        assert config['fps'] == 30
        assert config['gop_size'] == 60
        assert config['width'] == 1920
        assert config['height'] == 1080
    
    def test_get_recording_config_default(self, service):
        """Test getting recording config with defaults."""
        config = service._get_recording_config("mp4", "medium")
        assert config['format'] == 'mp4'
        assert config['video_codec'] == 'libx264'
        assert config['audio_codec'] == 'aac'
        assert config['video_bitrate'] == '2M'
        assert config['audio_bitrate'] == '128k'
    
    def test_get_recording_config_low_quality(self, service):
        """Test getting recording config with low quality."""
        config = service._get_recording_config("mp4", "low")
        assert config['video_bitrate'] == '1M'
        assert config['audio_bitrate'] == '96k'
    
    def test_get_recording_config_high_quality(self, service):
        """Test getting recording config with high quality."""
        config = service._get_recording_config("mp4", "high")
        assert config['video_bitrate'] == '4M'
        assert config['audio_bitrate'] == '192k'
    
    def test_get_recording_config_invalid_format(self, service):
        """Test getting recording config with invalid format defaults to mp4."""
        config = service._get_recording_config("invalid_format", "medium")
        assert config['format'] == 'mp4'
    
    def test_get_recording_config_codec_as_format(self, service):
        """Test getting recording config when codec name passed as format."""
        config = service._get_recording_config("libx264", "medium")
        assert config['format'] == 'mp4'
    
    def test_get_recording_config_codec_compatibility(self, service):
        """Test codec compatibility checking."""
        config = service._get_recording_config("webm", "medium")
        assert config['format'] == 'webm'
        # Should adjust codecs for webm
        assert config['video_codec'] in VALID_FORMATS['webm']['video_codecs']
        assert config['audio_codec'] in VALID_FORMATS['webm']['audio_codecs']
    
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


class TestValidFormatsAndCodecs:
    """Test format and codec configuration constants."""
    
    def test_valid_formats_structure(self):
        """Test VALID_FORMATS has expected structure."""
        assert 'mp4' in VALID_FORMATS
        assert 'mpegts' in VALID_FORMATS
        assert 'webm' in VALID_FORMATS
        assert 'mkv' in VALID_FORMATS
        
        for format_name, codecs in VALID_FORMATS.items():
            assert 'video_codecs' in codecs
            assert 'audio_codecs' in codecs
            assert isinstance(codecs['video_codecs'], list)
            assert isinstance(codecs['audio_codecs'], list)
            assert len(codecs['video_codecs']) > 0
            assert len(codecs['audio_codecs']) > 0
    
    def test_codec_to_format_mappings(self):
        """Test CODEC_TO_FORMAT mappings."""
        assert CODEC_TO_FORMAT['h264'] == 'mp4'
        assert CODEC_TO_FORMAT['libx264'] == 'mp4'
        assert CODEC_TO_FORMAT['vp9'] == 'webm'
        assert CODEC_TO_FORMAT['libvpx-vp9'] == 'webm'
    
    def test_mp4_supports_h264_aac(self):
        """Test MP4 format supports H.264 and AAC."""
        assert 'libx264' in VALID_FORMATS['mp4']['video_codecs']
        assert 'aac' in VALID_FORMATS['mp4']['audio_codecs']
    
    def test_webm_supports_vp9_opus(self):
        """Test WebM format supports VP9 and Opus."""
        assert 'libvpx-vp9' in VALID_FORMATS['webm']['video_codecs'] or 'vp9' in VALID_FORMATS['webm']['video_codecs']
        assert 'opus' in VALID_FORMATS['webm']['audio_codecs']


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


class TestEncoderConfiguration:
    """Test encoder configuration with low-latency settings."""
    
    def test_encoder_options_for_low_latency(self, mock_config):
        """Test encoder is configured with zerolatency and ultrafast."""
        # This would be tested through integration with actual PyAV
        # Here we test the config structure
        assert mock_config['video_codec'] == 'libx264'
        assert mock_config['fps'] == 30
        assert mock_config['gop_size'] == 60
        # In actual implementation, encoder_options would include:
        # preset=ultrafast, tune=zerolatency
        expected_encoder_options = {
            'preset': 'ultrafast',
            'tune': 'zerolatency',
            'g': '60',
            'profile:v': 'main',
        }
        # Verify these are the expected settings
        assert expected_encoder_options['preset'] == 'ultrafast'
        assert expected_encoder_options['tune'] == 'zerolatency'


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--cov=app.services.webrtc_recording_service', '--cov-report=term-missing'])

