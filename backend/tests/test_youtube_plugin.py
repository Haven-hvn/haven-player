"""
Unit tests for YouTube plugin using plugins.config approach.

This tests that YouTube plugin correctly reads/writes channel subscriptions
from the generic plugins.config JSON column.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
import json

from app.plugins.builtin.youtube_plugin import YouTubePlugin
from app.models.plugin import Plugin as PluginModel
from app.plugins.plugin_interface import MediaSource, MediaType


@pytest.fixture
def youtube_plugin():
    """Create a YouTubePlugin instance for testing."""
    plugin = YouTubePlugin()
    # Initialize with mock config (no download_directory - uses global)
    plugin.config = {
        "max_videos_per_channel": 5,
    }
    plugin.initialized = True
    plugin.download_dir = "downloads"  # Global download directory
    return plugin


@pytest.fixture
def mock_db_session():
    """Create a mock database session."""
    mock_session = Mock()
    mock_plugin = Mock(spec=PluginModel)
    mock_plugin.config = {
        "channels": [
            {
                "name": "Test Channel",
                "channel_id": "UC_test123",
                "channel_url": "https://youtube.com/@testchannel",
                "enabled": True,
                "video_format": "best",
                "download_subtitles": False,
                "auto_archive": True,
                "created_at": "2026-01-01T00:00:00",
            },
            {
                "name": "Disabled Channel",
                "channel_id": "UC_disabled",
                "channel_url": "https://youtube.com/@disabled",
                "enabled": False,
                "video_format": "best",
                "download_subtitles": False,
                "auto_archive": True,
                "created_at": "2026-01-01T00:00:00",
            },
        ],
        "_seen_videos": {},
        "_archived_videos": {},
    }
    mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin
    return mock_session


class TestYouTubePluginConfig:
    """Test YouTube plugin's use of plugins.config for channel storage."""

    def test_discover_sources_reads_from_config(self, youtube_plugin, mock_db_session):
        """Test that discover_sources reads channels from plugins.config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Mock yt-dlp response
            with patch.object(youtube_plugin, '_get_channel_videos_from_url') as mock_get_videos:
                mock_get_videos.return_value = [
                    {
                        "id": "video123",
                        "url": "https://youtube.com/watch?v=video123",
                        "title": "Test Video",
                        "duration": 120,
                        "thumbnail": "https://example.com/thumb.jpg",
                        "upload_date": "20260101",
                        "filesize": 1024000,
                    }
                ]

                sources = youtube_plugin.discover_sources()

                # Should find enabled channel and create a media source
                assert len(sources) == 1
                assert sources[0].source_id == "video123"
                assert sources[0].media_type == MediaType.YOUTUBE
                assert sources[0].metadata["channel_name"] == "Test Channel"

    def test_discover_sources_filters_disabled_channels(self, youtube_plugin, mock_db_session):
        """Test that discover_sources only polls enabled channels."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            with patch.object(youtube_plugin, '_get_channel_videos_from_url') as mock_get_videos:
                mock_get_videos.return_value = []

                sources = youtube_plugin.discover_sources()

                # Should only query enabled channels (1, not 2)
                assert mock_get_videos.call_count == 1
                assert mock_get_videos.call_args[0][0] == "https://youtube.com/@testchannel"

    def test_subscribe_saves_to_config(self, youtube_plugin, mock_db_session):
        """Test that subscribe adds channel to plugins.config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            with patch.object(youtube_plugin, '_extract_channel_id') as mock_extract_id:
                mock_extract_id.return_value = "UC_newchannel"

                with patch.object(youtube_plugin, '_get_channel_name') as mock_get_name:
                    mock_get_name.return_value = "New Channel"

                    result = youtube_plugin.subscribe(
                        "https://youtube.com/@newchannel",
                        {"video_format": "1080p", "download_subtitles": True}
                    )

                    assert result["success"] is True
                    assert result["collection_id"] == "UC_newchannel"
                    assert result["collection_name"] == "New Channel"

                    # Check that config was updated
                    mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
                    channels = mock_plugin.config["channels"]
                    assert len(channels) == 3  # 2 existing + 1 new
                    assert any(ch["channel_id"] == "UC_newchannel" for ch in channels)

    def test_unsubscribe_removes_from_config(self, youtube_plugin, mock_db_session):
        """Test that unsubscribe removes channel from plugins.config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = youtube_plugin.unsubscribe("UC_test123")

            assert result["success"] is True
            assert "Test Channel" in result["message"]

            # Check that config was updated
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            channels = mock_plugin.config["channels"]
            assert len(channels) == 1  # 2 existing - 1 removed
            assert not any(ch["channel_id"] == "UC_test123" for ch in channels)

    def test_list_subscriptions_reads_from_config(self, youtube_plugin, mock_db_session):
        """Test that list_subscriptions reads from plugins.config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscriptions = youtube_plugin.list_subscriptions()

            assert len(subscriptions) == 2
            assert subscriptions[0]["name"] == "Test Channel"
            assert subscriptions[0]["enabled"] is True
            assert subscriptions[1]["name"] == "Disabled Channel"
            assert subscriptions[1]["enabled"] is False

    def test_archive_marks_seen_in_config(self, youtube_plugin, mock_db_session):
        """Test that archive updates _archived_videos in config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            source = MediaSource(
                source_id="video123",
                media_type=MediaType.YOUTUBE,
                uri="https://youtube.com/watch?v=video123",
                metadata={"title": "Test Video", "channel_name": "Test Channel"},
            )

            with patch.object(youtube_plugin, '_download_video') as mock_download:
                mock_download.return_value = {
                    "success": True,
                    "output_path": "/downloads/test_video.mp4",
                    "file_size_bytes": 1024000,
                }

                with patch('os.path.exists', return_value=True):
                    with patch('os.path.getsize', return_value=1024000):
                        result = youtube_plugin.archive(source)

                        assert result["success"] is True

                        # Check that video was marked as archived in config
                        mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
                        assert "video123" in mock_plugin.config["_archived_videos"]
                        archived = mock_plugin.config["_archived_videos"]["video123"]
                        assert archived["video_id"] == "video123"
                        assert archived["output_path"] == "/downloads/test_video.mp4"

    def test_get_subscription_by_id(self, youtube_plugin, mock_db_session):
        """Test that get_subscription retrieves from plugins.config."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscription = youtube_plugin.get_subscription("UC_test123")

            assert subscription is not None
            assert subscription["name"] == "Test Channel"
            assert subscription["channel_id"] == "UC_test123"

    def test_no_config_returns_empty(self, youtube_plugin):
        """Test handling when plugin config doesn't exist."""
        mock_session = Mock()
        mock_session.query.return_value.filter.return_value.first.return_value = None

        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            sources = youtube_plugin.discover_sources()
            assert sources == []

            subscriptions = youtube_plugin.list_subscriptions()
            assert subscriptions == []

    def test_discover_sources_tracks_seen_videos(self, youtube_plugin, mock_db_session):
        """Test that discover_sources tracks seen videos to avoid duplicates."""
        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Add seen video to config
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            mock_plugin.config["_seen_videos"] = {"Test Channel": ["video123"]}

            with patch.object(youtube_plugin, '_get_channel_videos_from_url') as mock_get_videos:
                # Return same video twice
                mock_get_videos.return_value = [
                    {
                        "id": "video123",
                        "url": "https://youtube.com/watch?v=video123",
                        "title": "Already Seen",
                        "duration": 120,
                        "thumbnail": "https://example.com/thumb.jpg",
                        "upload_date": "20260101",
                    },
                    {
                        "id": "video456",
                        "url": "https://youtube.com/watch?v=video456",
                        "title": "New Video",
                        "duration": 180,
                        "thumbnail": "https://example.com/thumb2.jpg",
                        "upload_date": "20260102",
                    },
                ]

                sources = youtube_plugin.discover_sources()

                # Should only return new video (video456), not seen video (video123)
                assert len(sources) == 1
                assert sources[0].source_id == "video456"

                # Check that seen videos were updated
                assert "video456" in mock_plugin.config["_seen_videos"]["Test Channel"]


class TestYouTubePluginDefaultConfig:
    """Test YouTube plugin's default config."""

    def test_get_default_config(self, youtube_plugin):
        """Test that default config contains expected structure."""
        default_config = youtube_plugin.get_default_config()

        assert "channels" in default_config
        assert isinstance(default_config["channels"], list)
        assert "max_concurrent_downloads" in default_config
        assert "max_videos_per_channel" in default_config
        # download_directory should NOT be in default config (uses global instead)
        assert "download_directory" not in default_config


class TestYouTubePluginDownloadDirectory:
    """Test YouTube plugin's use of global download directory."""

    def test_initialize_uses_global_download_directory(self):
        """Test that initialize uses global download_directory from AppConfig."""
        plugin = YouTubePlugin()

        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = "/global/downloads"
        mock_session.query.return_value.first.return_value = mock_app_config

        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            with patch('subprocess.run', return_value=Mock(returncode=0, stdout="version")):
                with patch('os.makedirs'):
                    result = plugin.initialize({})

                    assert result is True
                    assert plugin.download_dir == "/global/downloads"

    def test_initialize_fails_without_global_download_directory(self):
        """Test that initialize fails when global download_directory is not configured."""
        plugin = YouTubePlugin()

        mock_session = Mock()
        mock_session.query.return_value.first.return_value = None

        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            result = plugin.initialize({})

            assert result is False
            assert plugin.download_dir is None

    def test_initialize_fails_with_empty_global_download_directory(self):
        """Test that initialize fails when global download_directory is empty."""
        plugin = YouTubePlugin()

        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = None
        mock_session.query.return_value.first.return_value = mock_app_config

        with patch('app.plugins.builtin.youtube_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            result = plugin.initialize({})

            assert result is False
            assert plugin.download_dir is None

