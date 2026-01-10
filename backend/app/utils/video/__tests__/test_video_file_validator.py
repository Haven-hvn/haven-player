"""
Unit tests for video_file_validator module.

Tests the video file validation utilities.
"""
import pytest
import sys
from unittest.mock import patch, MagicMock
import os

# Mock modules that might not be available in test environment
sys.modules['decord'] = MagicMock()
sys.modules['decord._ffi'] = MagicMock()
sys.modules['decord._ffi.base'] = MagicMock()

from app.utils.video.video_file_validator import (
    skip_quick_audio_files,
    has_video_stream,
    is_video_content,
    AUDIO_FORMAT_CODES
)


class TestSkipQuickAudioFiles:
    """Test skip_quick_audio_files function."""

    def test_skip_f251_webm(self):
        """Test that .f251.webm files are identified as audio-only."""
        file_path = "/path/to/video.f251.webm"
        assert skip_quick_audio_files(file_path) is True

    def test_skip_f140_m4a(self):
        """Test that .f140.m4a files are identified as audio-only."""
        file_path = "/path/to/video.f140.m4a"
        assert skip_quick_audio_files(file_path) is True

    def test_skip_all_known_format_codes(self):
        """Test that all known audio format codes are detected."""
        for format_code in AUDIO_FORMAT_CODES:
            file_path = f"/path/to/video{format_code}.webm"
            assert skip_quick_audio_files(file_path) is True, f"Failed to detect {format_code}"

    def test_do_not_skip_normal_video(self):
        """Test that normal video files are not skipped."""
        assert skip_quick_audio_files("/path/to/video.mp4") is False
        assert skip_quick_audio_files("/path/to/video.webm") is False
        assert skip_quick_audio_files("/path/to/video.mkv") is False


class TestHasVideoStream:
    """Test has_video_stream function."""

    @patch('app.utils.video.video_file_validator.DECORD_AVAILABLE', True)
    @patch('app.utils.video.video_file_validator.decord')
    def test_has_video_stream_success(self, mock_decord):
        """Test successful video stream detection."""
        mock_video_reader = MagicMock()
        mock_decord.VideoReader.return_value = mock_video_reader
        mock_decord.cpu.return_value = MagicMock()

        result = has_video_stream("/path/to/video.mp4")

        assert result is True
        mock_decord.VideoReader.assert_called_once()

    @patch('app.utils.video.video_file_validator.DECORD_AVAILABLE', True)
    @patch('app.utils.video.video_file_validator.decord')
    def test_has_video_stream_no_video_stream_error(self, mock_decord):
        """Test handling of audio-only files that raise DECORDError."""
        mock_decord.VideoReader.side_effect = Exception("cannot find video stream with wanted index: -1")
        mock_decord.cpu.return_value = MagicMock()

        result = has_video_stream("/path/to/audio.f251.webm")

        assert result is False

    @patch('app.utils.video.video_file_validator.DECORD_AVAILABLE', False)
    def test_decord_not_available(self):
        """Test behavior when decord is not available."""
        result = has_video_stream("/path/to/video.mp4")
        # Should return True conservatively when decord is unavailable
        assert result is True


class TestIsVideoContent:
    """Test is_video_content function."""

    @patch('app.utils.video.video_file_validator.has_video_stream')
    def test_is_video_content_known_audio_file(self, mock_has_video):
        """Test that known audio format codes are quickly skipped."""
        mock_has_video.return_value = True  # This shouldn't be called

        result = is_video_content("/path/to/audio.f251.webm")

        # Should skip quick without calling has_video_stream
        assert result is False
        mock_has_video.assert_not_called()

    @patch('app.utils.video.video_file_validator.has_video_stream')
    def test_is_video_content_normal_video_file(self, mock_has_video):
        """Test that normal video files use decord verification."""
        mock_has_video.return_value = True

        result = is_video_content("/path/to/video.mp4")

        assert result is True
        mock_has_video.assert_called_once_with("/path/to/video.mp4")

    @patch('app.utils.video.video_file_validator.has_video_stream')
    def test_is_video_content_audio_only_after_decord_check(self, mock_has_video):
        """Test that files failing decord check are identified as audio-only."""
        mock_has_video.return_value = False

        result = is_video_content("/path/to/unknown.webm")

        assert result is False
        mock_has_video.assert_called_once_with("/path/to/unknown.webm")


class TestAUDIO_FORMAT_CODES:
    """Test AUDIO_FORMAT_CODES constant."""

    def test_audio_format_codes_defined(self):
        """Test that audio format codes are properly defined."""
        assert AUDIO_FORMAT_CODES
        assert '.f140' in AUDIO_FORMAT_CODES
        assert '.f251' in AUDIO_FORMAT_CODES

    def test_all_format_codes_start_with_dot(self):
        """Test that all format codes start with a dot for matching."""
        for code in AUDIO_FORMAT_CODES:
            assert code.startswith('.'), f"Format code {code} should start with dot"
