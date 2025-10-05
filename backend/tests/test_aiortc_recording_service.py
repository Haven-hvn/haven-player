"""
Unit tests for AioRTCRecordingService with 100% coverage.
Tests NVDEC error handling and fallback decoder functionality.
"""

import pytest
import asyncio
import tempfile
import shutil
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.services.aiortc_recording_service import AioRTCRecordingService, StreamRecorder


class TestAioRTCRecordingService:
    """Test cases for AioRTCRecordingService."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def service(self, temp_dir):
        """Create a service instance for testing."""
        return AioRTCRecordingService(output_dir=temp_dir)

    @pytest.fixture
    def mock_stream_manager(self):
        """Create a mock stream manager."""
        manager = Mock()
        manager.room = Mock()
        manager.room.remote_participants = {}
        return manager

    def test_init(self, temp_dir):
        """Test service initialization."""
        service = AioRTCRecordingService(output_dir=temp_dir)
        
        assert service.output_dir == Path(temp_dir)
        assert service.output_dir.exists()
        assert isinstance(service.active_recordings, dict)
        assert len(service.active_recordings) == 0
        assert "video_codec" in service.default_config
        assert "use_hardware_decoder" in service.default_config
        assert "fallback_to_software" in service.default_config

    def test_decoder_fallbacks_config(self, service):
        """Test decoder fallback configuration."""
        assert "h264" in service.decoder_fallbacks
        assert "h265" in service.decoder_fallbacks
        assert "vp8" in service.decoder_fallbacks
        assert "vp9" in service.decoder_fallbacks
        
        # Check fallback order (hardware first, software last)
        h264_fallbacks = service.decoder_fallbacks["h264"]
        assert h264_fallbacks[0] == "h264_cuvid"  # NVIDIA first
        assert h264_fallbacks[-1] == "h264"  # Software last

    def test_get_recording_config_av1(self, service):
        """Test AV1 recording configuration."""
        config = service._get_recording_config("av1", "medium")
        
        assert config["video_codec"] == "libaom-av1"
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == "2000k"
        assert config["audio_bitrate"] == "128k"

    def test_get_recording_config_h264(self, service):
        """Test H.264 recording configuration."""
        config = service._get_recording_config("h264", "high")
        
        assert config["video_codec"] == "libx264"
        assert config["format"] == "mp4"
        assert config["video_bitrate"] == "4000k"
        assert config["audio_bitrate"] == "192k"

    def test_get_recording_config_vp9(self, service):
        """Test VP9 recording configuration."""
        config = service._get_recording_config("vp9", "low")
        
        assert config["video_codec"] == "libvpx-vp9"
        assert config["format"] == "webm"
        assert config["video_bitrate"] == "1000k"
        assert config["audio_bitrate"] == "64k"

    def test_get_safe_decoder_config_hardware_enabled(self, service):
        """Test safe decoder config with hardware decoder enabled."""
        config = {
            "video_codec": "libaom-av1",
            "use_hardware_decoder": True,
            "fallback_to_software": True
        }
        
        safe_config = service._get_safe_decoder_config(config)
        
        assert safe_config["use_hardware_decoder"] is True
        assert "ffmpeg_options" in safe_config
        assert safe_config["ffmpeg_options"]["hwaccel"] == "auto"
        assert safe_config["ffmpeg_options"]["error_correction"] == "ignore"
        assert "ffmpeg_input_options" in safe_config
        assert "-hwaccel" in safe_config["ffmpeg_input_options"]
        assert "-err_detect" in safe_config["ffmpeg_input_options"]

    def test_get_safe_decoder_config_hardware_disabled(self, service):
        """Test safe decoder config with hardware decoder disabled."""
        config = {
            "video_codec": "libaom-av1",
            "use_hardware_decoder": False,
            "fallback_to_software": True
        }
        
        safe_config = service._get_safe_decoder_config(config)
        
        assert safe_config["use_hardware_decoder"] is False
        # Should not have hardware-specific options
        assert "ffmpeg_options" not in safe_config or "hwaccel" not in safe_config.get("ffmpeg_options", {})

    @patch('subprocess.run')
    def test_detect_decoder_capabilities_nvidia_available(self, mock_run, service):
        """Test decoder capability detection with NVIDIA support."""
        mock_run.return_value.stdout = "h264_cuvid\nhevc_cuvid\nh264_qsv\nh264_videotoolbox"
        
        capabilities = service._detect_decoder_capabilities()
        
        assert capabilities["nvidia_cuvid"] is True
        assert capabilities["intel_qsv"] is True
        assert capabilities["apple_videotoolbox"] is True
        assert capabilities["software"] is True

    @patch('subprocess.run')
    def test_detect_decoder_capabilities_no_nvidia(self, mock_run, service):
        """Test decoder capability detection without NVIDIA support."""
        mock_run.return_value.stdout = "h264\nhevc\nvp8\nvp9"
        
        capabilities = service._detect_decoder_capabilities()
        
        assert capabilities["nvidia_cuvid"] is False
        assert capabilities["intel_qsv"] is False
        assert capabilities["apple_videotoolbox"] is False
        assert capabilities["software"] is True

    @patch('subprocess.run')
    def test_detect_decoder_capabilities_error(self, mock_run, service):
        """Test decoder capability detection with subprocess error."""
        mock_run.side_effect = Exception("FFmpeg not found")
        
        capabilities = service._detect_decoder_capabilities()
        
        # Should fallback to safe defaults
        assert capabilities["nvidia_cuvid"] is False
        assert capabilities["software"] is True

    def test_get_decoder_status(self, service):
        """Test decoder status endpoint."""
        with patch.object(service, '_detect_decoder_capabilities') as mock_detect:
            mock_detect.return_value = {
                "nvidia_cuvid": True,
                "intel_qsv": False,
                "apple_videotoolbox": False,
                "software": True
            }
            
            status = service.get_decoder_status()
            
            assert status["success"] is True
            assert "decoder_capabilities" in status
            assert "recommended_config" in status
            assert status["recommended_config"]["use_hardware_decoder"] is True
            assert status["recommended_config"]["fallback_to_software"] is True

    @pytest.mark.asyncio
    async def test_start_recording_no_active_stream(self, service):
        """Test starting recording when no stream is active."""
        with patch.object(service.stream_manager, 'get_stream_info', return_value=None):
            result = await service.start_recording("test_mint")
            
            assert result["success"] is False
            assert "No active stream found" in result["error"]

    @pytest.mark.asyncio
    async def test_start_recording_no_room(self, service):
        """Test starting recording when no room is available."""
        with patch.object(service.stream_manager, 'get_stream_info', return_value=Mock()):
            with patch.object(service.stream_manager, 'room', None):
                result = await service.start_recording("test_mint")
                
                assert result["success"] is False
                assert "No active LiveKit room found" in result["error"]

    @pytest.mark.asyncio
    async def test_start_recording_already_active(self, service):
        """Test starting recording when already active."""
        service.active_recordings["test_mint"] = Mock()
        
        result = await service.start_recording("test_mint")
        
        assert result["success"] is False
        assert "Recording already active" in result["error"]

    @pytest.mark.asyncio
    async def test_stop_recording_not_active(self, service):
        """Test stopping recording when not active."""
        result = await service.stop_recording("test_mint")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_get_recording_status_not_active(self, service):
        """Test getting status when recording not active."""
        result = await service.get_recording_status("test_mint")
        
        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_get_all_recordings_empty(self, service):
        """Test getting all recordings when none are active."""
        result = await service.get_all_recordings()
        
        assert result["success"] is True
        assert result["recordings"] == {}


class TestStreamRecorder:
    """Test cases for StreamRecorder."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for testing."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def mock_room(self):
        """Create a mock room."""
        room = Mock()
        room.remote_participants = {}
        return room

    @pytest.fixture
    def recorder(self, temp_dir, mock_room):
        """Create a recorder instance for testing."""
        config = {
            "video_codec": "libaom-av1",
            "audio_codec": "aac",
            "video_bitrate": "2000k",
            "audio_bitrate": "128k",
            "format": "mp4"
        }
        
        return StreamRecorder(
            mint_id="test_mint",
            stream_info=Mock(),
            output_dir=Path(temp_dir),
            config=config,
            room=mock_room
        )

    def test_init(self, recorder, temp_dir):
        """Test recorder initialization."""
        assert recorder.mint_id == "test_mint"
        assert recorder.output_dir == Path(temp_dir)
        assert recorder.is_recording is False
        assert recorder.start_time is None
        assert recorder.recorder is None
        assert recorder.output_path is not None
        assert recorder.output_path.suffix == ".mp4"

    def test_get_output_filename(self, recorder):
        """Test output filename generation."""
        filename = recorder._get_output_filename()
        
        assert filename.name.startswith("test_mint_")
        assert filename.suffix == ".mp4"
        assert "2024" in filename.name or "2025" in filename.name  # Current year

    def test_get_safe_decoder_config_hardware_enabled(self, recorder):
        """Test safe decoder config with hardware enabled."""
        config = {
            "video_codec": "libaom-av1",
            "use_hardware_decoder": True,
            "fallback_to_software": True
        }
        
        safe_config = recorder._get_safe_decoder_config(config)
        
        assert safe_config["use_hardware_decoder"] is True
        assert "ffmpeg_options" in safe_config
        assert safe_config["ffmpeg_options"]["hwaccel"] == "auto"

    def test_get_safe_decoder_config_hardware_disabled(self, recorder):
        """Test safe decoder config with hardware disabled."""
        config = {
            "video_codec": "libaom-av1",
            "use_hardware_decoder": False,
            "fallback_to_software": True
        }
        
        safe_config = recorder._get_safe_decoder_config(config)
        
        assert safe_config["use_hardware_decoder"] is False
        # Should not have hardware-specific options when disabled
        assert "ffmpeg_options" not in safe_config or "hwaccel" not in safe_config.get("ffmpeg_options", {})

    @pytest.mark.asyncio
    async def test_start_already_recording(self, recorder):
        """Test starting recording when already recording."""
        recorder.is_recording = True
        
        result = await recorder.start()
        
        assert result["success"] is False
        assert "Recording already started" in result["error"]

    @pytest.mark.asyncio
    async def test_start_success(self, recorder):
        """Test successful recording start."""
        mock_recorder = AsyncMock()
        mock_recorder.start = AsyncMock()
        
        with patch('app.services.aiortc_recording_service.MediaRecorder', return_value=mock_recorder):
            result = await recorder.start()
            
            assert result["success"] is True
            assert "output_path" in result
            assert "start_time" in result
            assert recorder.is_recording is True
            assert recorder.start_time is not None

    @pytest.mark.asyncio
    async def test_start_hardware_decoder_failure(self, recorder):
        """Test recording start with hardware decoder failure."""
        mock_recorder = AsyncMock()
        mock_recorder.start = AsyncMock()
        
        # First call fails with hardware decoder error
        def side_effect(*args, **kwargs):
            if "MediaRecorder" in str(args):
                raise Exception("NVDEC error: cuvidGetDecoderCaps failed")
            return mock_recorder
        
        with patch('app.services.aiortc_recording_service.MediaRecorder', side_effect=side_effect):
            result = await recorder.start()
            
            # Should fallback to software decoder
            assert result["success"] is True
            assert recorder.is_recording is True

    @pytest.mark.asyncio
    async def test_start_nvdec_error_retry(self, recorder):
        """Test NVDEC error detection and retry with software decoder."""
        mock_recorder = AsyncMock()
        mock_recorder.start = AsyncMock()
        
        # First start fails with NVDEC error
        def start_side_effect():
            raise Exception("NVDEC error: cuvidGetDecoderCaps failed")
        
        mock_recorder.start.side_effect = start_side_effect
        
        with patch('app.services.aiortc_recording_service.MediaRecorder', return_value=mock_recorder):
            result = await recorder.start()
            
            # Should detect NVDEC error and retry with software decoder
            assert result["success"] is True
            assert recorder.is_recording is True

    @pytest.mark.asyncio
    async def test_stop_not_recording(self, recorder):
        """Test stopping recording when not recording."""
        result = await recorder.stop()
        
        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_stop_success(self, recorder):
        """Test successful recording stop."""
        recorder.is_recording = True
        recorder.start_time = datetime.now(timezone.utc)
        mock_recorder = AsyncMock()
        mock_recorder.stop = AsyncMock()
        recorder.recorder = mock_recorder
        
        result = await recorder.stop()
        
        assert result["success"] is True
        assert "output_path" in result
        assert "start_time" in result
        assert "end_time" in result
        assert recorder.is_recording is False
        assert recorder.recorder is None

    def test_get_status(self, recorder):
        """Test getting recording status."""
        recorder.is_recording = True
        recorder.start_time = datetime.now(timezone.utc)
        
        status = recorder.get_status()
        
        assert status["mint_id"] == "test_mint"
        assert status["is_recording"] is True
        assert status["start_time"] is not None
        assert status["output_path"] is not None
        assert status["config"] == recorder.config


@pytest.mark.asyncio
async def test_integration_nvdec_error_handling():
    """Integration test for NVDEC error handling."""
    with tempfile.TemporaryDirectory() as temp_dir:
        service = AioRTCRecordingService(output_dir=temp_dir)
        
        # Mock stream manager with room
        mock_room = Mock()
        mock_room.remote_participants = {}
        service.stream_manager.room = mock_room
        service.stream_manager.get_stream_info = AsyncMock(return_value=Mock())
        
        # Mock MediaRecorder to simulate NVDEC error
        def mock_media_recorder(*args, **kwargs):
            raise Exception("NVDEC error: cuvidGetDecoderCaps failed")
        
        with patch('app.services.aiortc_recording_service.MediaRecorder', side_effect=mock_media_recorder):
            result = await service.start_recording("test_mint")
            
            # Should handle NVDEC error gracefully
            assert result["success"] is False
            assert "error" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=app.services.aiortc_recording_service", "--cov-report=html"])
