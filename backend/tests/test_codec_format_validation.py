"""
Unit tests for codec/format validation in WebRTC recording service.
"""

import pytest
from unittest.mock import Mock, patch
from pathlib import Path

# Mock the imports that might not be available in test environment
with patch.dict('sys.modules', {
    'livekit.rtc': Mock(),
    'av': Mock(),
    'numpy': Mock(),
    'psutil': Mock()
}):
    from app.services.webrtc_recording_service import WebRTCRecordingService, VALID_FORMATS, CODEC_TO_FORMAT


class TestCodecFormatValidation:
    """Test codec/format validation and correction."""

    @pytest.fixture
    def recording_service(self):
        """Create a WebRTCRecordingService instance for testing."""
        return WebRTCRecordingService(output_dir="/tmp/test_recordings")

    def test_valid_formats_are_accepted(self, recording_service):
        """Test that valid container formats are accepted without changes."""
        for format_name in VALID_FORMATS.keys():
            config = recording_service._get_recording_config(format_name, "medium")
            assert config["format"] == format_name
            assert "video_codec" in config
            assert "audio_codec" in config

    def test_codec_names_are_corrected_to_formats(self, recording_service):
        """Test that codec names are automatically corrected to appropriate formats."""
        test_cases = [
            ("h264", "mp4"),
            ("libx264", "mp4"),
            ("h265", "mp4"),
            ("libx265", "mp4"),
            ("vp9", "webm"),
            ("libvpx-vp9", "webm")
        ]
        
        for codec_name, expected_format in test_cases:
            config = recording_service._get_recording_config(codec_name, "medium")
            assert config["format"] == expected_format

    def test_invalid_formats_default_to_mp4(self, recording_service):
        """Test that invalid formats default to mp4."""
        invalid_formats = ["invalid", "xyz", "unknown", "test"]
        
        for invalid_format in invalid_formats:
            config = recording_service._get_recording_config(invalid_format, "medium")
            assert config["format"] == "mp4"

    def test_codec_compatibility_checking(self, recording_service):
        """Test that incompatible codec/format combinations are corrected."""
        # Test webm format with incompatible AAC codec
        config = recording_service._get_recording_config("webm", "medium")
        # Should use opus instead of aac for webm
        assert config["audio_codec"] == "opus"
        
        # Test mp4 format with incompatible opus codec
        # This would require changing the default config, but let's test the logic
        original_audio_codec = recording_service.default_config["audio_codec"]
        recording_service.default_config["audio_codec"] = "opus"  # Incompatible with mp4
        
        config = recording_service._get_recording_config("mp4", "medium")
        # Should use aac instead of opus for mp4
        assert config["audio_codec"] == "aac"
        
        # Restore original
        recording_service.default_config["audio_codec"] = original_audio_codec

    def test_quality_presets_are_applied(self, recording_service):
        """Test that quality presets are correctly applied."""
        # Test low quality
        config = recording_service._get_recording_config("mp4", "low")
        assert config["video_bitrate"] == "1M"
        assert config["audio_bitrate"] == "96k"
        
        # Test high quality
        config = recording_service._get_recording_config("mp4", "high")
        assert config["video_bitrate"] == "4M"
        assert config["audio_bitrate"] == "192k"
        
        # Test medium quality (default)
        config = recording_service._get_recording_config("mp4", "medium")
        assert config["video_bitrate"] == "2M"  # Default
        assert config["audio_bitrate"] == "128k"  # Default

    def test_format_validation_constants(self):
        """Test that format validation constants are properly defined."""
        # Check that all expected formats are present
        expected_formats = ["mp4", "mpegts", "webm", "mkv"]
        for format_name in expected_formats:
            assert format_name in VALID_FORMATS
            assert "video_codecs" in VALID_FORMATS[format_name]
            assert "audio_codecs" in VALID_FORMATS[format_name]
            assert len(VALID_FORMATS[format_name]["video_codecs"]) > 0
            assert len(VALID_FORMATS[format_name]["audio_codecs"]) > 0

    def test_codec_to_format_mapping(self):
        """Test that codec to format mapping is complete."""
        # Check that all expected codecs are mapped
        expected_codecs = ["h264", "libx264", "h265", "libx265", "vp9", "libvpx-vp9"]
        for codec_name in expected_codecs:
            assert codec_name in CODEC_TO_FORMAT
            assert CODEC_TO_FORMAT[codec_name] in VALID_FORMATS

    def test_mp4_format_compatibility(self, recording_service):
        """Test MP4 format with various codec combinations."""
        config = recording_service._get_recording_config("mp4", "medium")
        
        # MP4 should use H.264 and AAC
        assert config["format"] == "mp4"
        assert config["video_codec"] in ["libx264", "h264"]
        assert config["audio_codec"] == "aac"

    def test_webm_format_compatibility(self, recording_service):
        """Test WebM format with VP9/Opus combination."""
        # Temporarily change default codecs to test compatibility
        original_video_codec = recording_service.default_config["video_codec"]
        original_audio_codec = recording_service.default_config["audio_codec"]
        
        recording_service.default_config["video_codec"] = "libvpx-vp9"
        recording_service.default_config["audio_codec"] = "opus"
        
        config = recording_service._get_recording_config("webm", "medium")
        assert config["format"] == "webm"
        assert config["video_codec"] in ["libvpx-vp9", "vp9"]
        assert config["audio_codec"] in ["opus", "vorbis"]
        
        # Restore original
        recording_service.default_config["video_codec"] = original_video_codec
        recording_service.default_config["audio_codec"] = original_audio_codec

    def test_mpegts_format_compatibility(self, recording_service):
        """Test MPEG-TS format compatibility."""
        config = recording_service._get_recording_config("mpegts", "medium")
        
        assert config["format"] == "mpegts"
        assert config["video_codec"] in ["libx264", "h264"]
        assert config["audio_codec"] in ["aac", "mp3"]

    def test_mkv_format_compatibility(self, recording_service):
        """Test MKV format compatibility."""
        config = recording_service._get_recording_config("mkv", "medium")
        
        assert config["format"] == "mkv"
        assert config["video_codec"] in ["libx264", "h264", "libx265", "h265", "libvpx-vp9"]
        assert config["audio_codec"] in ["aac", "opus", "mp3"]

    def test_warning_messages_for_invalid_formats(self, recording_service, caplog):
        """Test that warning messages are logged for invalid formats."""
        with caplog.at_level("WARNING"):
            recording_service._get_recording_config("invalid_format", "medium")
        
        # Should log a warning about invalid format
        assert "Invalid format 'invalid_format'" in caplog.text
        assert "defaulting to 'mp4'" in caplog.text

    def test_warning_messages_for_codec_names(self, recording_service, caplog):
        """Test that warning messages are logged when codec names are used as formats."""
        with caplog.at_level("WARNING"):
            recording_service._get_recording_config("h264", "medium")
        
        # Should log a warning about codec being used as format
        assert "'h264' is a codec, not a format" in caplog.text
        assert "Using 'mp4' as container format" in caplog.text

    def test_warning_messages_for_incompatible_codecs(self, recording_service, caplog):
        """Test that warning messages are logged for incompatible codec/format combinations."""
        # Temporarily set incompatible codecs
        original_audio_codec = recording_service.default_config["audio_codec"]
        recording_service.default_config["audio_codec"] = "opus"  # Incompatible with mp4
        
        with caplog.at_level("WARNING"):
            recording_service._get_recording_config("mp4", "medium")
        
        # Should log a warning about incompatible audio codec
        assert "Audio codec 'opus' not compatible with 'mp4'" in caplog.text
        assert "using 'aac'" in caplog.text
        
        # Restore original
        recording_service.default_config["audio_codec"] = original_audio_codec


if __name__ == "__main__":
    pytest.main([__file__])
