"""
Unit tests for PumpFun plugin JSON config storage.

This tests that PumpFun plugin correctly reads/writes stream subscriptions
from the generic plugins.config JSON column, following the same pattern
as YouTube plugin.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime

from app.plugins.builtin.pumpfun_plugin import PumpFunPlugin
from app.models.plugin import Plugin as PluginModel
from app.plugins.plugin_interface import MediaSource, MediaType


@pytest.fixture
def pumpfun_plugin():
    """Create a PumpFunPlugin instance for testing."""
    plugin = PumpFunPlugin()
    # Initialize with mock config
    plugin.config = {
        "output_format": "webm",
        "video_quality": "best",
    }
    plugin._initialized = True
    
    # Mock services
    plugin.pumpfun_service = Mock()
    plugin.recording_service = Mock()
    
    return plugin


@pytest.fixture
def mock_db_session():
    """Create a mock database session."""
    mock_session = Mock()
    mock_plugin = Mock(spec=PluginModel)
    mock_plugin.config = {
        "streams": [
            {
                "stream_id": "test_mint_123",
                "stream_name": "Test Stream",
                "enabled": True,
                "priority": 5,
                "created_at": "2026-01-01T00:00:00",
            },
            {
                "stream_id": "disabled_mint_456",
                "stream_name": "Disabled Stream",
                "enabled": False,
                "priority": 3,
                "created_at": "2026-01-02T00:00:00",
            },
        ],
        "output_format": "webm",
        "video_quality": "best",
    }
    mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin
    return mock_session


class TestPumpFunPluginConfig:
    """Test PumpFun plugin's use of plugins.config for stream storage."""

    @pytest.mark.asyncio
    async def test_subscribe_saves_to_config(self, pumpfun_plugin, mock_db_session):
        """Test that subscribe adds stream to plugins.config."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = await pumpfun_plugin.subscribe(
                "new_mint_789",
                {
                    "stream_name": "New Stream",
                    "priority": 7,
                }
            )

            assert result["success"] is True
            assert result["stream_id"] == "new_mint_789"
            assert result["stream_name"] == "New Stream"
            assert result["priority"] == 7

            # Check that config was updated
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            streams = mock_plugin.config["streams"]
            assert len(streams) == 3  # 2 existing + 1 new
            assert any(s["stream_id"] == "new_mint_789" for s in streams)

    @pytest.mark.asyncio
    async def test_subscribe_already_subscribed(self, pumpfun_plugin, mock_db_session):
        """Test that subscribe fails if already subscribed."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = await pumpfun_plugin.subscribe(
                "test_mint_123",
                {"stream_name": "Duplicate Stream"}
            )

            assert result["success"] is False
            assert "Already subscribed" in result["error"]
            assert result["stream_id"] == "test_mint_123"

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_from_config(self, pumpfun_plugin, mock_db_session):
        """Test that unsubscribe removes stream from plugins.config."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = await pumpfun_plugin.unsubscribe("test_mint_123")

            assert result["success"] is True
            assert "test_mint_123" in result["message"]

            # Check that config was updated
            mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
            streams = mock_plugin.config["streams"]
            assert len(streams) == 1  # 2 existing - 1 removed
            assert not any(s["stream_id"] == "test_mint_123" for s in streams)

    @pytest.mark.asyncio
    async def test_unsubscribe_not_found(self, pumpfun_plugin, mock_db_session):
        """Test that unsubscribe fails for non-existent stream."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            result = await pumpfun_plugin.unsubscribe("non_existent_mint")

            assert result["success"] is False
            assert "Stream subscription not found" in result["error"]

    @pytest.mark.asyncio
    async def test_list_subscriptions_reads_from_config(self, pumpfun_plugin, mock_db_session):
        """Test that list_subscriptions reads from plugins.config."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscriptions = await pumpfun_plugin.list_subscriptions()

            assert len(subscriptions) == 2
            assert subscriptions[0]["stream_id"] == "test_mint_123"
            assert subscriptions[0]["enabled"] is True
            assert subscriptions[1]["stream_id"] == "disabled_mint_456"
            assert subscriptions[1]["enabled"] is False

    @pytest.mark.asyncio
    async def test_get_subscription_by_id(self, pumpfun_plugin, mock_db_session):
        """Test that get_subscription retrieves from plugins.config."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscription = await pumpfun_plugin.get_subscription("test_mint_123")

            assert subscription is not None
            assert subscription["stream_name"] == "Test Stream"
            assert subscription["stream_id"] == "test_mint_123"
            assert subscription["priority"] == 5

    @pytest.mark.asyncio
    async def test_get_subscription_not_found(self, pumpfun_plugin, mock_db_session):
        """Test that get_subscription returns None for non-existent stream."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            subscription = await pumpfun_plugin.get_subscription("non_existent_mint")

            assert subscription is None

    @pytest.mark.asyncio
    async def test_discover_sources_with_subscribed_streams(self, pumpfun_plugin, mock_db_session):
        """Test that discover_sources checks subscribed streams for live status."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Mock live streams from service - only one subscribed stream is live
            mock_live_streams = [
                {
                    "mint": "test_mint_123",
                    "name": "Test Stream Live",
                    "symbol": "TEST",
                    "num_participants": 50,
                    "nsfw": False,
                    "thumbnail": "https://example.com/thumb.jpg",
                    "creator": "Test Creator",
                    "image_uri": "https://example.com/image.jpg",
                },
                {
                    "mint": "other_mint",
                    "name": "Other Stream",
                    "symbol": "OTHER",
                    "num_participants": 100,
                    "nsfw": False,
                }
            ]
            pumpfun_plugin.pumpfun_service.get_currently_live_streams = AsyncMock(
                return_value=mock_live_streams
            )

            sources = await pumpfun_plugin.discover_sources()

            # Should only return the subscribed stream that's live (test_mint_123)
            # Not the other_mint because not subscribed
            assert len(sources) == 1
            assert sources[0].source_id == "test_mint_123"
            assert sources[0].metadata["is_currently_live"] is True
            assert sources[0].metadata["num_participants"] == 50

    @pytest.mark.asyncio
    async def test_discover_sources_no_subscriptions(self, pumpfun_plugin):
        """Test that discover_sources returns all streams when no subscriptions."""
        mock_session = Mock()
        mock_plugin = Mock(spec=PluginModel)
        mock_plugin.config = {"streams": []}  # No subscriptions
        mock_session.query.return_value.filter.return_value.first.return_value = mock_plugin

        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            # Mock live streams
            mock_live_streams = [
                {
                    "mint": "mint1",
                    "name": "Stream 1",
                    "symbol": "S1",
                    "num_participants": 30,
                    "nsfw": False,
                },
                {
                    "mint": "mint2",
                    "name": "Stream 2",
                    "symbol": "S2",
                    "num_participants": 70,
                    "nsfw": False,
                }
            ]
            pumpfun_plugin.pumpfun_service.get_currently_live_streams = AsyncMock(
                return_value=mock_live_streams
            )

            sources = await pumpfun_plugin.discover_sources(limit=5)

            # Should return all streams when no subscriptions
            assert len(sources) == 2

    @pytest.mark.asyncio
    async def test_discover_from_subscription_live(self, pumpfun_plugin, mock_db_session):
        """Test that discover_from_subscription checks if subscribed stream is live."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Mock live streams
            mock_live_streams = [
                {
                    "mint": "test_mint_123",
                    "name": "Test Stream Live",
                    "symbol": "TEST",
                    "num_participants": 75,
                    "nsfw": False,
                    "thumbnail": "https://example.com/thumb.jpg",
                }
            ]
            pumpfun_plugin.pumpfun_service.get_currently_live_streams = AsyncMock(
                return_value=mock_live_streams
            )

            sources = await pumpfun_plugin.discover_from_subscription("test_mint_123")

            # Should return live stream
            assert len(sources) == 1
            assert sources[0].source_id == "test_mint_123"
            assert sources[0].metadata["is_currently_live"] is True

    @pytest.mark.asyncio
    async def test_discover_from_subscription_not_live(self, pumpfun_plugin, mock_db_session):
        """Test that discover_from_subscription returns empty if stream not live."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            # Mock live streams - does not include our subscribed stream
            mock_live_streams = [
                {
                    "mint": "other_mint",
                    "name": "Other Stream",
                    "symbol": "OTHER",
                    "num_participants": 50,
                }
            ]
            pumpfun_plugin.pumpfun_service.get_currently_live_streams = AsyncMock(
                return_value=mock_live_streams
            )

            sources = await pumpfun_plugin.discover_from_subscription("test_mint_123")

            # Should return empty list
            assert len(sources) == 0

    @pytest.mark.asyncio
    async def test_discover_from_subscription_not_found(self, pumpfun_plugin, mock_db_session):
        """Test that discover_from_subscription returns empty for non-existent subscription."""
        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_db_session

            sources = await pumpfun_plugin.discover_from_subscription("non_existent_mint")

            assert len(sources) == 0

    @pytest.mark.asyncio
    async def test_no_config_returns_empty(self, pumpfun_plugin):
        """Test handling when plugin config doesn't exist."""
        mock_session = Mock()
        mock_session.query.return_value.filter.return_value.first.return_value = None

        with patch('app.plugins.builtin.pumpfun_plugin.get_db_session') as mock_get_db:
            mock_get_db.return_value = mock_session

            subscriptions = await pumpfun_plugin.list_subscriptions()
            assert subscriptions == []

            subscription = await pumpfun_plugin.get_subscription("any_id")
            assert subscription is None


class TestPumpFunPluginNoTracking:
    """Test that PumpFun plugin doesn't need seen/archived tracking unlike YouTube."""

    def test_config_structure_no_tracking_fields(self, pumpfun_plugin, mock_db_session):
        """Test that PumpFun config doesn't have _seen or _archived fields."""
        mock_plugin = mock_db_session.query.return_value.filter.return_value.first.return_value
        config = mock_plugin.config
        
        # PumpFun should NOT have these tracking fields (unlike YouTube)
        assert "_seen" not in config
        assert "_archived" not in config
        assert "_seen_videos" not in config
        assert "_archived_videos" not in config
        
        # Should have streams array
        assert "streams" in config
        assert isinstance(config["streams"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])