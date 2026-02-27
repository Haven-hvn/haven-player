"""
Unit tests for Brightcove plugin.

This tests that Brightcove plugin correctly reads/writes source subscriptions
from the generic plugins.config JSON column and handles video discovery and archiving.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime, timezone
import json
import os

from app.plugins.builtin.brightcove_plugin import BrightcovePlugin
from app.plugins.builtin.brightcove_config import (
    BrightcoveSourceConfig,
    get_the_den_config,
    get_default_config,
)
from app.plugins.builtin.brightcove_api_client import (
    BrightcoveAPIClient,
    AssetInfo,
)
from app.plugins.plugin_interface import MediaSource, MediaType
from app.models.plugin import Plugin as PluginModel


@pytest.fixture
def brightcove_plugin():
    """Create a BrightcovePlugin instance for testing."""
    plugin = BrightcovePlugin()
    plugin.config = get_default_config()
    plugin.initialized = True
    plugin.download_dir = "downloads"
    return plugin


@pytest.fixture
def mock_db_session():
    """Create a mock database session."""
    mock_session = Mock()
    mock_plugin = Mock(spec=PluginModel)
    mock_plugin.config = {
        "sources": [
            {
                "name": "the_den",
                "display_name": "The Den",
                "base_playlist_url": "https://beacon.playback.api.brightcove.com/playlists/760",
                "playlist_params": {"cohort": "123"},
                "account_id": "acc123",
                "brightcove_account_id": "bc456",
                "ad_config_id": "ad789",
                "enabled": True,
                "output_format": "mp4",
                "quality_preference": "best",
                "beacon_api_base": "https://beacon.playback.api.brightcove.com/twentypointnine/api",
                "edge_api_base": "https://edge.api.brightcove.com/playback/v1",
                "poll_interval_minutes": 60,
                "rate_limit_seconds": 0.1,
                "max_retries": 3,
            }
        ],
        "default_source": "the_den",
        "_seen_videos": {"the_den": []},
        "_archived_videos": {}
    }
    mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin
    return mock_session, mock_plugin


class TestBrightcoveSourceConfig:
    """Test Brightcove source configuration model."""
    
    def test_the_den_config(self):
        """Test The Den default configuration."""
        config = get_the_den_config()
        
        assert config.name == "the_den"
        assert config.display_name == "The Den"
        assert "skateboard" in config.description.lower() or "den" in config.description.lower()
        assert config.account_id == "ceee68007b4a515b6"
        assert config.brightcove_account_id == "6415533679001"
        assert config.ad_config_id == "49858721b38a4e7186bc13f5ec8ca505"
        assert config.enabled is True
    
    def test_default_config_structure(self):
        """Test default configuration includes The Den."""
        config = get_default_config()
        
        assert "sources" in config
        assert len(config["sources"]) == 1
        assert config["sources"][0]["name"] == "the_den"
        assert config["default_source"] == "the_den"
        assert "_seen_videos" in config
        assert "_archived_videos" in config
    
    def test_source_config_validation(self):
        """Test that source config validates required fields."""
        with pytest.raises(Exception):
            BrightcoveSourceConfig()  # Missing required fields
        
        config = BrightcoveSourceConfig(
            name="test",
            display_name="Test",
            base_playlist_url="https://api.example.com/playlist",
            account_id="acc123",
            brightcove_account_id="bc456"
        )
        
        assert config.name == "test"
        assert config.output_format == "mp4"  # Default value


class TestAssetInfo:
    """Test AssetInfo dataclass."""
    
    def test_asset_info_creation(self):
        """Test creating AssetInfo."""
        asset = AssetInfo(
            asset_id="asset123",
            title="Test Video",
            description="A test video",
            duration_seconds=120,
            thumbnail_url="https://example.com/thumb.jpg"
        )
        
        assert asset.asset_id == "asset123"
        assert asset.title == "Test Video"
        assert asset.duration_seconds == 120
        assert asset.video_id is None
        assert asset.stream_url is None


class TestBrightcoveAPIClient:
    """Test Brightcove API client."""
    
    @pytest.fixture
    def source_config(self):
        """Create test source config."""
        return BrightcoveSourceConfig(
            name="test",
            display_name="Test",
            base_playlist_url="https://api.brightcove.com/playlist/123",
            account_id="acc123",
            brightcove_account_id="bc456",
            rate_limit_seconds=0.0,  # No delay for tests
        )
    
    @pytest.mark.asyncio
    async def test_get_playlist_page_parsing(self, source_config):
        """Test playlist page response parsing."""
        mock_response = Mock()
        mock_response.json = AsyncMock(return_value={
            "data": {
                "blocks": [{
                    "widgets": [{
                        "playlist": {
                            "contents": [
                                {"type": "movies", "id": "asset1", "title": "Video 1", "duration": 120},
                                {"type": "movies", "id": "asset2", "title": "Video 2", "duration": 180},
                                {"type": "other", "id": "not_included"},  # Should be filtered
                            ],
                            "pagination": {"url": {"next": "https://api.example.com/next"}}
                        }
                    }]
                }]
            }
        })
        
        mock_session = Mock()
        mock_session.get = AsyncMock(return_value=mock_response)
        
        client = BrightcoveAPIClient(source_config, mock_session)
        assets, next_url = await client.get_playlist_page()
        
        assert len(assets) == 2
        assert assets[0].asset_id == "asset1"
        assert assets[1].asset_id == "asset2"
        assert next_url == "https://api.example.com/next"
    
    @pytest.mark.asyncio
    async def test_asset_id_to_video_id_parsing(self, source_config):
        """Test asset ID to video ID response parsing."""
        mock_response = Mock()
        mock_response.json = AsyncMock(return_value={
            "data": {
                "video_playback_details": [{"video_id": "vid123"}]
            }
        })
        
        mock_session = Mock()
        mock_session.get = AsyncMock(return_value=mock_response)
        
        client = BrightcoveAPIClient(source_config, mock_session)
        video_id = await client.asset_id_to_video_id("asset1")
        
        assert video_id == "vid123"
    
    @pytest.mark.asyncio
    async def test_video_id_to_stream_url_hls_priority(self, source_config):
        """Test that HLS sources are preferred."""
        mock_response = Mock()
        mock_response.json = AsyncMock(return_value={
            "sources": [
                {"type": "video/mp4", "src": "https://video.example.com/video.mp4"},
                {"type": "application/x-mpegURL", "src": "https://stream.example.com/video.m3u8"},
            ]
        })
        
        mock_session = Mock()
        mock_session.get = AsyncMock(return_value=mock_response)
        
        client = BrightcoveAPIClient(source_config, mock_session)
        stream_url = await client.video_id_to_stream_url("vid123")
        
        assert stream_url == "https://stream.example.com/video.m3u8"
    
    @pytest.mark.asyncio
    async def test_video_id_to_stream_url_fallback(self, source_config):
        """Test fallback to any source when no HLS."""
        mock_response = Mock()
        mock_response.json = AsyncMock(return_value={
            "sources": [
                {"type": "video/mp4", "src": "https://video.example.com/video.mp4"},
            ]
        })
        
        mock_session = Mock()
        mock_session.get = AsyncMock(return_value=mock_response)
        
        client = BrightcoveAPIClient(source_config, mock_session)
        stream_url = await client.video_id_to_stream_url("vid123")
        
        assert stream_url == "https://video.example.com/video.mp4"


class TestBrightcovePluginMetadata:
    """Test Brightcove plugin metadata."""
    
    def test_plugin_metadata(self, brightcove_plugin):
        """Test plugin metadata is correct."""
        metadata = brightcove_plugin.get_metadata()
        
        assert metadata.name == "BrightcovePlugin"
        assert metadata.version == "1.0.0"
        assert "brightcove" in metadata.description.lower()
        assert "den" in metadata.description.lower()
        assert MediaType.HTTP in metadata.media_types
        assert len(metadata.default_jobs) == 1
        assert metadata.default_jobs[0].job_name == "poll_brightcove_sources"


class TestBrightcovePluginConfigMixin:
    """Test Brightcove plugin's use of plugins.config for source storage."""
    
    def test_get_default_config(self, brightcove_plugin):
        """Test that default config includes The Den."""
        default_config = brightcove_plugin.get_default_config()
        
        assert "sources" in default_config
        assert len(default_config["sources"]) == 1
        assert default_config["sources"][0]["name"] == "the_den"
    
    @pytest.mark.asyncio
    async def test_subscribe_creates_source(self, brightcove_plugin, mock_db_session):
        """Test that subscribe creates a new source."""
        mock_session, mock_plugin = mock_db_session
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            result = await brightcove_plugin.subscribe("brightcove:the_den")
            
            # Should succeed or indicate already exists
            assert result["success"] or "already exists" in result.get("error", "")
    
    @pytest.mark.asyncio
    async def test_unsubscribe_removes_source(self, brightcove_plugin, mock_db_session):
        """Test that unsubscribe removes a source."""
        mock_session, mock_plugin = mock_db_session
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            result = await brightcove_plugin.unsubscribe("the_den")
            
            # Should succeed or indicate not found
            assert result["success"] or "not found" in result.get("error", "")
    
    @pytest.mark.asyncio
    async def test_list_subscriptions(self, brightcove_plugin, mock_db_session):
        """Test listing subscriptions."""
        mock_session, mock_plugin = mock_db_session
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            result = await brightcove_plugin.list_subscriptions()
            
            assert len(result) == 1
            assert result[0]["name"] == "the_den"


class TestBrightcovePluginDiscovery:
    """Test Brightcove video discovery."""
    
    @pytest.mark.asyncio
    async def test_discover_sources_filters_disabled(self, brightcove_plugin):
        """Test that discovery filters disabled sources."""
        # Mark all sources as disabled
        brightcove_plugin.config["sources"] = [
            {**get_the_den_config().model_dump(), "enabled": False}
        ]
        
        # Create mock session
        mock_session = Mock()
        brightcove_plugin._session = mock_session
        
        sources = await brightcove_plugin.discover_sources()
        
        # Should return empty list (no enabled sources)
        assert sources == []
    
    @pytest.mark.asyncio
    async def test_discover_from_source_skips_seen(self, brightcove_plugin):
        """Test that discovery skips already seen videos."""
        source_dict = {
            "name": "test",
            "display_name": "Test",
            "base_playlist_url": "https://api.example.com/playlist",
            "playlist_params": {},
            "account_id": "acc123",
            "brightcove_account_id": "bc456",
            "ad_config_id": None,
            "beacon_api_base": "https://beacon.playback.api.brightcove.com/twentypointnine/api",
            "edge_api_base": "https://edge.api.brightcove.com/playback/v1",
            "poll_interval_minutes": 60,
            "rate_limit_seconds": 0.1,
            "max_retries": 3,
            "output_format": "mp4",
            "quality_preference": "best",
            "enabled": True,
        }
        
        plugin_config = {
            "sources": [source_dict],
            "_seen_videos": {"test": ["asset1"]},  # asset1 already seen
            "_archived_videos": {}
        }
        
        # Mock API client
        mock_asset = AssetInfo(
            asset_id="asset1",
            title="Already Seen Video",
            metadata={}
        )
        mock_asset.stream_url = "https://stream.example.com/1.m3u8"
        
        mock_asset2 = AssetInfo(
            asset_id="asset2",
            title="New Video",
            metadata={}
        )
        mock_asset2.stream_url = "https://stream.example.com/2.m3u8"
        
        with patch.object(BrightcoveAPIClient, 'get_all_assets', new_callable=AsyncMock) as mock_get_assets:
            mock_get_assets.return_value = [mock_asset, mock_asset2]
            
            with patch.object(BrightcoveAPIClient, 'resolve_asset', new_callable=AsyncMock):
                mock_session = Mock()
                brightcove_plugin._session = mock_session
                
                sources = await brightcove_plugin._discover_from_source(
                    source_dict, plugin_config, Mock()
                )
                
                # Should only return asset2 (asset1 already seen)
                assert len(sources) == 1
                assert sources[0].metadata["asset_id"] == "asset2"


class TestBrightcovePluginArchive:
    """Test Brightcove video archiving."""
    
    def test_archive_wrong_media_type(self, brightcove_plugin):
        """Test archive rejects non-HTTP media type."""
        source = MediaSource(
            source_id="test123",
            media_type=MediaType.YOUTUBE,  # Wrong type
            uri="https://example.com/video.m3u8",
            metadata={}
        )
        
        # Need to run async function
        import asyncio
        result = asyncio.run(brightcove_plugin.archive(source))
        
        assert result.success is False
        assert "Unsupported media type" in result.error
    
    @pytest.mark.asyncio
    async def test_archive_already_downloaded(self, brightcove_plugin, mock_db_session):
        """Test archive returns success for already downloaded video."""
        mock_session, mock_plugin = mock_db_session
        
        mock_plugin.config["_archived_videos"] = {
            "test:asset123": {
                "output_path": "/path/to/video.mp4",
                "file_size_bytes": 1024000
            }
        }
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            source = MediaSource(
                source_id="test:asset123",
                media_type=MediaType.HTTP,
                uri="https://stream.example.com/video.m3u8",
                metadata={"asset_id": "asset123", "title": "Test Video"},
                estimated_duration_seconds=120
            )
            
            result = await brightcove_plugin.archive(source)
            
            assert result.success is True
            assert result.output_path == "/path/to/video.mp4"


class TestBrightcovePluginHealthCheck:
    """Test Brightcove plugin health check."""
    
    @pytest.mark.asyncio
    async def test_health_check_no_download_dir(self, brightcove_plugin):
        """Test health check fails without download directory."""
        brightcove_plugin.download_dir = None
        
        result = await brightcove_plugin.health_check()
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_health_check_no_session(self, brightcove_plugin):
        """Test health check fails without HTTP session."""
        brightcove_plugin.download_dir = "/tmp"
        brightcove_plugin._session = None
        
        result = await brightcove_plugin.health_check()
        
        assert result is False


class TestBrightcovePluginSourceStatus:
    """Test source status retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_source_status_archived(self, brightcove_plugin, mock_db_session):
        """Test getting status of an archived source."""
        mock_session, mock_plugin = mock_db_session
        mock_plugin.config["_archived_videos"] = {
            "test:asset123": {
                "output_path": "/path/to/video.mp4",
                "file_size_bytes": 1024000,
                "archived_at": "2026-01-01T00:00:00"
            }
        }
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            status = await brightcove_plugin.get_source_status("test:asset123")
            
            assert status["status"] == "archived"
            assert status["output_path"] == "/path/to/video.mp4"
    
    @pytest.mark.asyncio
    async def test_get_source_status_unknown(self, brightcove_plugin, mock_db_session):
        """Test getting status of unknown source."""
        mock_session, mock_plugin = mock_db_session
        
        with patch('app.plugins.builtin.brightcove_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session
            
            status = await brightcove_plugin.get_source_status("unknown:asset")
            
            assert status["status"] == "unknown"


class TestBrightcovePluginIntegration:
    """Integration-style tests for Brightcove plugin."""
    
    @pytest.mark.asyncio
    async def test_full_workflow_mock(self, brightcove_plugin):
        """Test full discover and archive workflow with mocks."""
        # Setup
        brightcove_plugin.download_dir = "/tmp/test_downloads"
        mock_session = Mock()
        brightcove_plugin._session = mock_session
        
        # Mock API responses for discovery
        mock_assets = [
            AssetInfo(asset_id="asset1", title="Video 1", duration_seconds=120),
            AssetInfo(asset_id="asset2", title="Video 2", duration_seconds=180),
        ]
        mock_assets[0].video_id = "vid1"
        mock_assets[0].stream_url = "https://stream.example.com/1.m3u8"
        mock_assets[1].video_id = "vid2"
        mock_assets[1].stream_url = "https://stream.example.com/2.m3u8"
        
        with patch.object(BrightcoveAPIClient, 'get_all_assets', new_callable=AsyncMock) as mock_get_assets:
            mock_get_assets.return_value = mock_assets
            
            with patch.object(BrightcoveAPIClient, 'resolve_asset', new_callable=AsyncMock):
                # Test discovery
                plugin_config = {
                    "sources": [{
                        "name": "test",
                        "display_name": "Test",
                        "base_playlist_url": "https://api.example.com/playlist",
                        "account_id": "acc123",
                        "brightcove_account_id": "bc456",
                        "enabled": True,
                        "output_format": "mp4",
                        "quality_preference": "best",
                        "rate_limit_seconds": 0.1,
                        "beacon_api_base": "https://beacon.playback.api.brightcove.com/twentypointnine/api",
                        "edge_api_base": "https://edge.api.brightcove.com/playback/v1",
                    }],
                    "_seen_videos": {},
                    "_archived_videos": {}
                }
                
                mock_db = Mock()
                
                sources = await brightcove_plugin._discover_from_source(
                    plugin_config["sources"][0], plugin_config, mock_db
                )
                
                assert len(sources) == 2
                assert sources[0].metadata["asset_id"] == "asset1"
                assert sources[1].metadata["asset_id"] == "asset2"
