"""
Unit tests for BitTorrent plugin using plugins.config approach.

This tests that BitTorrent plugin correctly reads/writes subscriptions
from the generic plugins.config JSON column.
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime

from app.plugins.builtin.bittorrent_plugin import BitTorrentPlugin
from app.models.plugin import Plugin as PluginModel
from app.plugins.plugin_interface import MediaSource, MediaType


@pytest.fixture
def bittorrent_plugin():
    """Create a BitTorrentPlugin instance for testing."""
    plugin = BitTorrentPlugin()
    # Initialize with mock config (no download_directory - uses global)
    plugin.config = {
        "glitter_endpoint": "https://gw.magnode.ru/v1/sql/query",
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
        "subscriptions": [
            {
                "search_term": "python tutorial",
                "enabled": True,
                "auto_download": True,
                "created_at": "2026-01-01T00:00:00",
            },
            {
                "search_term": "disabled search",
                "enabled": False,
                "auto_download": True,
                "created_at": "2026-01-01T00:00:00",
            },
        ],
        "_seen_infohashes": [],
        "_archived_torrents": {},
        "glitter_endpoint": "https://gw.magnode.ru/v1/sql/query",
    }
    mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin
    return mock_session


class TestBitTorrentPluginConfig:
    """Test BitTorrent plugin's use of plugins.config for subscription storage."""

    def test_discover_sources_reads_from_config(self, bittorrent_plugin, mock_db_session):
        """Test that discover_sources reads subscriptions from plugins.config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Mock Glitter API response
            with patch('app.plugins.builtin.bittorrent_plugin.query_glitter_protocol') as mock_query:
                mock_query.return_value = [
                    {
                        "infohash": "abc123",
                        "name": "Python Tutorial Video",
                        "size": 1024000,
                    }
                ]

                sources = bittorrent_plugin.discover_sources()

                # Should find enabled subscriptions and create media sources
                assert len(sources) == 1
                assert sources[0].source_id == "abc123"
                assert sources[0].media_type == MediaType.BITTORRENT

    def test_discover_sources_filters_disabled_subscriptions(self, bittorrent_plugin, mock_db_session):
        """Test that discover_sources only polls enabled subscriptions."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            with patch('app.plugins.builtin.bittorrent_plugin.query_glitter_protocol') as mock_query:
                mock_query.return_value = []

                sources = bittorrent_plugin.discover_sources()

                # Should only query enabled subscriptions (1, not 2)
                assert mock_query.call_count == 1
                assert mock_query.call_args[0][0] == "python tutorial"

    def test_subscribe_saves_to_config(self, bittorrent_plugin, mock_db_session):
        """Test that subscribe adds subscription to plugins.config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = bittorrent_plugin.subscribe(
                "machine learning course",
                {"enabled": True, "auto_download": False}
            )

            assert result["success"] is True
            assert result["collection_id"] == "machine learning course"
            assert result["collection_name"] == "machine learning course"

            # Check that config was updated
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            subscriptions = mock_plugin.config["subscriptions"]
            assert len(subscriptions) == 3  # 2 existing + 1 new
            assert any(sub["search_term"] == "machine learning course" for sub in subscriptions)

    def test_unsubscribe_removes_from_config(self, bittorrent_plugin, mock_db_session):
        """Test that unsubscribe removes subscription from plugins.config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = bittorrent_plugin.unsubscribe("python tutorial")

            assert result["success"] is True
            assert "python tutorial" in result["message"]

            # Check that config was updated
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            subscriptions = mock_plugin.config["subscriptions"]
            assert len(subscriptions) == 1  # 2 existing - 1 removed
            assert not any(sub["search_term"] == "python tutorial" for sub in subscriptions)

    def test_list_subscriptions_reads_from_config(self, bittorrent_plugin, mock_db_session):
        """Test that list_subscriptions reads from plugins.config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscriptions = bittorrent_plugin.list_subscriptions()

            assert len(subscriptions) == 2
            assert subscriptions[0]["search_term"] == "python tutorial"
            assert subscriptions[0]["enabled"] is True
            assert subscriptions[1]["search_term"] == "disabled search"
            assert subscriptions[1]["enabled"] is False

    def test_archive_marks_torrent_in_config(self, bittorrent_plugin, mock_db_session):
        """Test that archive updates _archived_torrents in config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            source = MediaSource(
                source_id="abc123",
                media_type=MediaType.BITTORRENT,
                uri="magnet:?xt=urn:btih:abc123",
                metadata={"name": "Test Torrent"},
            )

            with patch('app.plugins.builtin.bittorrent_plugin.lt.session') as mock_lt_session:
                mock_handle = Mock()
                mock_handle.has_metadata.return_value = True
                mock_handle.status.return_value.is_finished = True
                mock_handle.get_torrent_info.return_value.name.return_value = "Test Torrent"
                mock_lt_session.add_magnet_uri.return_value = mock_handle

                with patch('os.path.exists', return_value=True):
                    with patch('os.path.join', side_effect=lambda *args: "/".join(args)):
                        result = bittorrent_plugin.archive(source)

                        # Check that torrent was marked as archived in config
                        mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
                        assert "abc123" in mock_plugin.config["_archived_torrents"]
                        archived = mock_plugin.config["_archived_torrents"]["abc123"]
                        assert archived["infohash"] == "abc123"
                        assert archived["name"] == "Test Torrent"

    def test_get_subscription_by_id(self, bittorrent_plugin, mock_db_session):
        """Test that get_subscription retrieves from plugins.config."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscription = bittorrent_plugin.get_subscription("python tutorial")

            assert subscription is not None
            assert subscription["search_term"] == "python tutorial"
            assert subscription["enabled"] is True

    def test_no_config_returns_empty(self, bittorrent_plugin):
        """Test handling when plugin config doesn't exist."""
        mock_session = Mock()
        mock_session.query.return_value.filter.return_value.first.return_value = None

        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            sources = bittorrent_plugin.discover_sources()
            assert sources == []

            subscriptions = bittorrent_plugin.list_subscriptions()
            assert subscriptions == []

    def test_discover_sources_tracks_seen_infohashes(self, bittorrent_plugin, mock_db_session):
        """Test that discover_sources tracks seen infohashes to avoid duplicates."""
        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Add seen infohash to config
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            mock_plugin.config["_seen_infohashes"] = ["abc123"]

            with patch('app.plugins.builtin.bittorrent_plugin.query_glitter_protocol') as mock_query:
                # Return torrents including one that's already seen
                mock_query.return_value = [
                    {
                        "infohash": "abc123",
                        "name": "Already Seen",
                        "size": 1024000,
                    },
                    {
                        "infohash": "def456",
                        "name": "New Torrent",
                        "size": 2048000,
                    },
                ]

                sources = bittorrent_plugin.discover_sources()

                # Should only return new torrent (def456), not seen torrent (abc123)
                assert len(sources) == 1
                assert sources[0].source_id == "def456"

                # Check that seen infohashes were updated
                assert "def456" in mock_plugin.config["_seen_infohashes"]


class TestBitTorrentPluginDefaultConfig:
    """Test BitTorrent plugin's default config."""

    def test_get_default_config(self, bittorrent_plugin):
        """Test that default config contains expected structure."""
        default_config = bittorrent_plugin.get_default_config()

        assert "subscriptions" in default_config
        assert isinstance(default_config["subscriptions"], list)
        assert "glitter_endpoint" in default_config
        # download_directory should NOT be in default config (uses global instead)
        assert "download_directory" not in default_config

    @pytest.mark.asyncio
    async def test_loads_glitter_endpoint_from_config(self, bittorrent_plugin):
        """Test that initialize loads glitter_endpoint from plugin config."""
        mock_session = Mock()
        mock_plugin = Mock(spec=PluginModel)
        mock_plugin.config = {
            "glitter_endpoint": "https://custom-endpoint.com/query",
        }
        mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin
        mock_app_config = Mock()
        mock_app_config.download_directory = "/global/downloads"
        mock_session.query.return_value.first.return_value = mock_app_config

        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            with patch('os.makedirs'):
                with patch('app.plugins.builtin.bittorrent_plugin.lt') as mock_lt:
                    mock_lt.version = "1.0.0"

                    result = await bittorrent_plugin.initialize({})

                    assert result is True
                    assert bittorrent_plugin.glitter_endpoint == "https://custom-endpoint.com/query"


class TestBitTorrentPluginDownloadDirectory:
    """Test BitTorrent plugin's use of global download directory."""

    @pytest.mark.asyncio
    async def test_initialize_uses_global_download_directory(self):
        """Test that initialize uses global download_directory from AppConfig."""
        plugin = BitTorrentPlugin()

        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = "/global/downloads"
        mock_plugin = Mock(spec=PluginModel)
        mock_plugin.config = {}
        mock_session.query.return_value.filter.return_value.first.return_value = mock_app_config

        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            with patch('os.makedirs'):
                with patch('app.plugins.builtin.bittorrent_plugin.lt') as mock_lt:
                    mock_lt.version = "1.0.0"

                    result = await plugin.initialize({})

                    assert result is True
                    assert plugin.download_dir == "/global/downloads"

    @pytest.mark.asyncio
    async def test_initialize_fails_without_global_download_directory(self):
        """Test that initialize fails when global download_directory is not configured."""
        plugin = BitTorrentPlugin()

        mock_session = Mock()
        mock_session.query.return_value.first.return_value = None

        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            result = await plugin.initialize({})

            assert result is False
            assert plugin.download_dir is None

    @pytest.mark.asyncio
    async def test_initialize_fails_with_empty_global_download_directory(self):
        """Test that initialize fails when global download_directory is empty."""
        plugin = BitTorrentPlugin()

        mock_session = Mock()
        mock_app_config = Mock()
        mock_app_config.download_directory = None
        mock_session.query.return_value.first.return_value = mock_app_config

        with patch('app.plugins.builtin.bittorrent_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            result = await plugin.initialize({})

            assert result is False
            assert plugin.download_dir is None

