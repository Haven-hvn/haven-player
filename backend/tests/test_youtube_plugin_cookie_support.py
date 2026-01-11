"""
Unit tests for YouTube plugin cookie file management.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

from app.plugins.builtin.youtube_plugin import YouTubePlugin
from app.plugins.plugin_interface import MediaSource, MediaType


@pytest.fixture
def youtube_plugin():
    """Create a YouTubePlugin instance for testing."""
    plugin = YouTubePlugin()
    plugin.config = {"max_videos_per_channel": 5}
    plugin.initialized = True
    plugin.download_dir = "downloads"
    return plugin


class TestCookieFileManagement:
    """Test YouTube plugin's cookie file management."""

    def test_get_cookie_file_path_when_configured(self, youtube_plugin):
        """Test that cookie file path is retrieved from config when configured."""
        youtube_plugin.config["cookie_file_path"] = "/path/to/cookies.txt"

        assert youtube_plugin._get_cookie_file_path() == "/path/to/cookies.txt"

    def test_get_cookie_file_path_when_not_configured(self, youtube_plugin):
        """Test that None is returned when cookie file is not configured."""
        assert youtube_plugin._get_cookie_file_path() is None

    @patch('os.path.exists')
    @patch('os.path.isfile')
    @patch('builtins.open')
    def test_validate_cookie_file_none_path(self, mock_open, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation returns False when path is None."""
        result = youtube_plugin._validate_cookie_file(None)

        assert result is False
        mock_exists.assert_not_called()
        mock_isfile.assert_not_called()

    @patch('os.path.exists')
    @patch('os.path.isfile')
    def test_validate_cookie_file_not_exists(self, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation returns False when file doesn't exist."""
        mock_exists.return_value = False

        result = youtube_plugin._validate_cookie_file("/path/to/cookies.txt")

        assert result is False
        mock_isfile.assert_not_called()

    @patch('os.path.exists')
    @patch('os.path.isfile')
    def test_validate_cookie_file_not_a_file(self, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation returns False when path is not a file."""
        mock_exists.return_value = True
        mock_isfile.return_value = False

        result = youtube_plugin._validate_cookie_file("/path/to/cookies.txt")

        assert result is False

    @patch('os.path.exists')
    @patch('os.path.isfile')
    @patch('builtins.open')
    def test_validate_cookie_file_valid_netscape_format(self, mock_open, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation accepts valid Netscape format files."""
        mock_exists.return_value = True
        mock_isfile.return_value = True
        mock_file = MagicMock()
        mock_file.readline.return_value = "# Netscape HTTP Cookie File"
        mock_open.return_value.__enter__.return_value = mock_file

        result = youtube_plugin._validate_cookie_file("/valid/cookies.txt")

        assert result is True

    @patch('os.path.exists')
    @patch('os.path.isfile')
    @patch('builtins.open')
    def test_validate_cookie_file_valid_readable(self, mock_open, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation accepts readable files even if not perfect format."""
        mock_exists.return_value = True
        mock_isfile.return_value = True
        mock_file = MagicMock()
        mock_file.readline.return_value = "http://youtube.com"
        mock_open.return_value.__enter__.return_value = mock_file

        result = youtube_plugin._validate_cookie_file("/readable/cookies.txt")

        # Still returns True - lets yt-dlp validate the format
        assert result is True

    @patch('os.path.exists')
    @patch('os.path.isfile')
    @patch('builtins.open', side_effect=PermissionError("Access denied"))
    def test_validate_cookie_file_not_readable(self, mock_open, mock_isfile, mock_exists, youtube_plugin):
        """Test that validation rejects non-readable files."""
        mock_exists.return_value = True
        mock_isfile.return_value = True

        result = youtube_plugin._validate_cookie_file("/protected/cookies.txt")

        assert result is False

    def test_set_cookie_file_with_valid_path(self, youtube_plugin):
        """Test that set_cookie_file successfully sets a valid cookie file."""
        with patch('os.path.isabs') as mock_isabs:
            mock_isabs.return_value = True
            
            with patch.object(youtube_plugin, '_validate_cookie_file') as mock_validate:
                mock_validate.return_value = True

                result = youtube_plugin.set_cookie_file("/absolute/path/to/cookies.txt")

                assert result is True
                assert youtube_plugin.config["cookie_file_path"] == "/absolute/path/to/cookies.txt"

    def test_set_cookie_file_with_relative_path(self, youtube_plugin):
        """Test that set_cookie_file rejects relative paths."""
        result = youtube_plugin.set_cookie_file("relative/path/cookies.txt")

        assert result is False
        assert "cookie_file_path" not in youtube_plugin.config or \
               youtube_plugin.config.get("cookie_file_path") != "relative/path/cookies.txt"

    def test_set_cookie_file_with_invalid_file(self, youtube_plugin):
        """Test that set_cookie_file rejects invalid cookie files."""
        with patch('os.path.isabs') as mock_isabs:
            mock_isabs.return_value = True
            
            with patch.object(youtube_plugin, '_validate_cookie_file') as mock_validate:
                mock_validate.return_value = False

                result = youtube_plugin.set_cookie_file("/invalid/path/cookies.txt")

                assert result is False

    def test_set_cookie_file_with_none_disables_cookies(self, youtube_plugin):
        """Test that setting cookie file to None disables cookie support."""
        youtube_plugin.config["cookie_file_path"] = "/old/path/cookies.txt"
        result = youtube_plugin.set_cookie_file(None)

        assert result is True
        assert "cookie_file_path" not in youtube_plugin.config

    def test_get_cookie_guidance_content(self, youtube_plugin):
        """Test that cookie guidance contains helpful information."""
        guidance = youtube_plugin._get_cookie_guidance()

        assert "YouTube Authentication Help" in guidance
        assert "age-gated" in guidance
        assert "Get cookies.txt LOCALLY" in guidance
        assert "https://github.com/yt-dlp/yt-dlp/wiki/Extractors" in guidance


class TestDownloadWithCookies:
    """Test YouTube video download with cookies."""

    @patch('app.plugins.builtin.youtube_plugin.get_db_session')
    @patch('subprocess.run')
    @patch('os.path.exists')
    @patch('os.makedirs')
    @pytest.mark.asyncio
    async def test_download_includes_cookies_when_configured(
        self, mock_makedirs, mock_exists, mock_run, mock_get_db, youtube_plugin
    ):
        """Test that download command includes cookies when configured."""
        # Set up mock database
        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = "./downloads"
        mock_session.query.return_value.first.return_value = mock_app_config
        mock_get_db.return_value = mock_session

        # Configure valid cookie path
        youtube_plugin.config["cookie_file_path"] = "/path/to/cookies.txt"

        with patch.object(youtube_plugin, '_is_ffmpeg_available', return_value=False):
            with patch.object(youtube_plugin, '_is_js_runtime_available', return_value=False):
                source = MediaSource(
                    source_id="test123",
                    media_type=MediaType.YOUTUBE,
                    uri="https://youtube.com/watch?v=test123",
                    metadata={
                        "title": "Test Video",
                        "channel_name": "Test Channel",
                        "video_format": "mp4",
                        "video_quality": "best"
                    },
                )

                mock_run.return_value = Mock(
                    returncode=0,
                    stdout="[download] Destination: /downloads/test.mp4\n",
                    stderr=""
                )
                mock_exists.return_value = True

                await youtube_plugin._download_video(source)

        # Check that cookies were added to command
        calls = mock_run.call_args_list
        cookies_found = False
        for call in calls:
            cmd = call[0][0] if call[0] else []
            if "--cookies" in cmd:
                idx = cmd.index("--cookies")
                assert cmd[idx + 1] == "/path/to/cookies.txt"
                cookies_found = True
                break
        assert cookies_found, "Cookies flag not found in command"

    @patch('app.plugins.builtin.youtube_plugin.get_db_session')
    @patch('subprocess.run')
    @patch('os.path.exists')
    @patch('os.makedirs')
    @pytest.mark.asyncio
    async def test_download_excludes_cookies_when_invalid(
        self, mock_makedirs, mock_exists, mock_run, mock_get_db, youtube_plugin
    ):
        """Test that download excludes cookies when file is invalid."""
        # Set up mock database
        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = "./downloads"
        mock_session.query.return_value.first.return_value = mock_app_config
        mock_get_db.return_value = mock_session

        # Configure invalid cookie path
        youtube_plugin.config["cookie_file_path"] = "/invalid/path/cookies.txt"

        with patch.object(youtube_plugin, '_is_ffmpeg_available', return_value=False):
            with patch.object(youtube_plugin, '_is_js_runtime_available', return_value=False):
                source = MediaSource(
                    source_id="test123",
                    media_type=MediaType.YOUTUBE,
                    uri="https://youtube.com/watch?v=test123",
                    metadata={
                        "title": "Test Video",
                        "channel_name": "Test Channel",
                        "video_format": "mp4",
                        "video_quality": "best"
                    },
                )

                mock_run.return_value = Mock(
                    returncode=0,
                    stdout="[download] Destination: /downloads/test.mp4\n",
                    stderr=""
                )
                mock_exists.side_effect = lambda x: x != "/invalid/path/cookies.txt"

                await youtube_plugin._download_video(source)

        # Check that cookies were NOT added to command
        calls = mock_run.call_args_list
        for call in calls:
            cmd = call[0][0] if call[0] else []
            assert "--cookies" not in cmd, "Cookies flag should not be added for invalid cookie file"
