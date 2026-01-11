"""
Unit tests for YouTube plugin JavaScript runtime detection.
"""

import pytest
import subprocess
from unittest.mock import Mock, patch

from app.plugins.builtin.youtube_plugin import YouTubePlugin


@pytest.fixture
def youtube_plugin():
    """Create a YouTubePlugin instance for testing."""
    plugin = YouTubePlugin()
    plugin.config = {"max_videos_per_channel": 5}
    plugin.initialized = True
    plugin.download_dir = "downloads"
    return plugin


class TestJavaScriptRuntimeDetection:
    """Test JavaScript runtime detection methods."""

    @patch('subprocess.run')
    def test_detect_js_runtime_deno_available(self, mock_run, youtube_plugin):
        """Test that Deno is detected when available."""
        mock_run.return_value = Mock(returncode=0, stdout="deno 1.0.0")

        runtime_type, runtime_path = youtube_plugin._detect_js_runtime()

        assert runtime_type == "deno"
        assert runtime_path == "deno"
        assert mock_run.call_count == 1

    @patch('subprocess.run')
    def test_detect_js_runtime_nodejs_available(self, mock_run, youtube_plugin):
        """Test that Node.js is detected when Deno is not available."""
        mock_run.side_effect = [
            Mock(returncode=1, stderr="deno not found"),  # Deno fails
            Mock(returncode=0, stdout="v20.10.0", stderr=""),  # Node.js succeeds
        ]

        runtime_type, runtime_path = youtube_plugin._detect_js_runtime()

        assert runtime_type == "nodejs"
        assert runtime_path == "node"
        assert mock_run.call_count == 2

    @patch('subprocess.run')
    def test_detect_js_runtime_none_available(self, mock_run, youtube_plugin):
        """Test that None is returned when neither Deno nor Node.js is available."""
        # Both Deno and Node.js fail
        mock_run.side_effect = [
            Mock(returncode=1, stderr="deno not found"),
            Mock(returncode=1, stderr="node not found"),
        ]

        runtime_type, runtime_path = youtube_plugin._detect_js_runtime()

        assert runtime_type is None
        assert runtime_path is None
        assert mock_run.call_count == 2

    @patch('subprocess.run')
    def test_detect_js_runtime_deno_timeout(self, mock_run, youtube_plugin):
        """Test that timeout is handled gracefully during runtime detection."""
        mock_run.side_effect = subprocess.TimeoutExpired("deno", 5)

        runtime_type, runtime_path = youtube_plugin._detect_js_runtime()

        assert runtime_type is None
        assert runtime_path is None

    @patch('subprocess.run')
    def test_detect_js_runtime_deno_not_found(self, mock_run, youtube_plugin):
        """Test that FileNotFoundError is handled gracefully."""
        mock_run.side_effect = FileNotFoundError("deno not found")

        runtime_type, runtime_path = youtube_plugin._detect_js_runtime()

        assert runtime_type is None
        assert runtime_path is None

    def test_is_js_runtime_available_when_runtimes_detected(self, youtube_plugin):
        """Test that _is_js_runtime_available returns True when runtime is detected."""
        youtube_plugin.js_runtime_path = "deno"
        youtube_plugin.js_runtime_type = "deno"

        assert youtube_plugin._is_js_runtime_available() is True

    def test_is_js_runtime_available_when_no_runtime(self, youtube_plugin):
        """Test that _is_js_runtime_available returns False when no runtime is detected."""
        youtube_plugin.js_runtime_path = None
        youtube_plugin.js_runtime_type = None

        assert youtube_plugin._is_js_runtime_available() is False

    def test_get_js_runtime_path_when_available(self, youtube_plugin):
        """Test that _get_js_runtime_path returns the runtime path when available."""
        youtube_plugin.js_runtime_path = "deno"

        assert youtube_plugin._get_js_runtime_path() == "deno"

    def test_get_js_runtime_path_when_not_available(self, youtube_plugin):
        """Test that _get_js_runtime_path returns None when no runtime is available."""
        youtube_plugin.js_runtime_path = None

        assert youtube_plugin._get_js_runtime_path() is None

    @patch('app.plugins.builtin.youtube_plugin.platform.system')
    def test_get_runtime_installation_guide_macos(self, mock_system):
        """Test that macOS-specific installation guide is provided."""
        mock_system.return_value = "Darwin"

        plugin = YouTubePlugin()
        guide = plugin._get_runtime_installation_guide()

        assert "macOS Installation:" in guide
        assert "brew install deno" in guide
        assert "brew install node" in guide

    @patch('app.plugins.builtin.youtube_plugin.platform.system')
    def test_get_runtime_installation_guide_windows(self, mock_system):
        """Test that Windows-specific installation guide is provided."""
        mock_system.return_value = "Windows"

        plugin = YouTubePlugin()
        guide = plugin._get_runtime_installation_guide()

        assert "Windows Installation:" in guide
        assert "deno.land" in guide
        assert "nodejs.org" in guide

    @patch('app.plugins.builtin.youtube_plugin.platform.system')
    def test_get_runtime_installation_guide_linux(self, mock_system):
        """Test that Linux-specific installation guide is provided."""
        mock_system.return_value = "Linux"

        plugin = YouTubePlugin()
        guide = plugin._get_runtime_installation_guide()

        assert "Linux Installation:" in guide
        assert "curl -fsSL" in guide
        assert "install.sh" in guide


class TestHealthCheckWithRuntime:
    """Test health check behavior with JavaScript runtime."""

    @patch('subprocess.run')
    @patch('os.path.exists')
    @pytest.mark.asyncio
    async def test_health_check_healthy_with_runtime(self, mock_exists, mock_run, youtube_plugin):
        """Test that health check reports healthy when runtime is available."""
        mock_exists.return_value = True
        mock_run.return_value = Mock(returncode=0, stdout="yt-dlp version")

        # Set up runtime
        youtube_plugin.js_runtime_path = "deno"
        youtube_plugin.js_runtime_type = "deno"

        result = await youtube_plugin.health_check()

        assert result is True

    @patch('subprocess.run')
    @patch('os.path.exists')
    @pytest.mark.asyncio
    async def test_health_check_degraded_without_runtime(self, mock_exists, mock_run, youtube_plugin):
        """Test that health check reports degraded mode when runtime is missing."""
        mock_exists.return_value = True
        mock_run.return_value = Mock(returncode=0, stdout="yt-dlp version")

        # No runtime
        youtube_plugin.js_runtime_path = None
        youtube_plugin.js_runtime_type = None

        result = await youtube_plugin.health_check()

        # Should still return True (not false) - runtime is non-critical
        assert result is True
