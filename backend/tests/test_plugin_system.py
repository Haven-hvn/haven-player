"""
Unit tests for the plugin system.
"""

import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from app.plugins.plugin_manager import PluginManager
from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
)


class MockPlugin(ArchiverPlugin):
    """Mock plugin for testing."""
    
    def __init__(self):
        self.initialized = False
        self._sources = []
    
    def get_metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="mock-plugin",
            version="1.0.0",
            description="Mock plugin for testing",
            media_types=[MediaType.CUSTOM],
            author="Test Author",
        )
    
    async def discover_sources(self):
        return self._sources
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        return ArchiveResult(
            success=True,
            output_path="/tmp/test.webm",
            file_size_bytes=1000000,
            duration_seconds=60,
        )
    
    async def initialize(self, config):
        self.initialized = True
        self.config = config
        return True
    
    async def health_check(self):
        return True
    
    def set_sources(self, sources):
        """Helper to set sources for testing."""
        self._sources = sources


@pytest.fixture
def mock_plugin():
    """Create a mock plugin instance."""
    return MockPlugin()


@pytest.fixture
def plugin_manager():
    """Create a plugin manager instance."""
    return PluginManager(plugin_dirs=[])


class TestPluginManager:
    """Test cases for PluginManager."""
    
    def test_plugin_manager_initialization(self, plugin_manager):
        """Test plugin manager initialization."""
        assert plugin_manager is not None
        assert isinstance(plugin_manager.plugins, dict)
        assert isinstance(plugin_manager.plugin_classes, dict)
        assert isinstance(plugin_manager.plugin_configs, dict)
    
    def test_load_plugin_success(self, plugin_manager, mock_plugin):
        """Test loading a plugin successfully."""
        # Register the mock plugin class
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin
        
        # Load the plugin
        import asyncio
        success = asyncio.run(plugin_manager.load_plugin("MockPlugin", {"test": "config"}))
        
        assert success is True
        assert "mock-plugin" in plugin_manager.plugins
        assert plugin_manager.plugins["mock-plugin"].initialized is True
    
    def test_load_plugin_already_loaded(self, plugin_manager, mock_plugin):
        """Test loading a plugin that's already loaded."""
        # Register and load plugin
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin
        
        import asyncio
        asyncio.run(plugin_manager.load_plugin("MockPlugin", {}))
        
        # Try to load again
        success = asyncio.run(plugin_manager.load_plugin("MockPlugin", {}))
        
        assert success is True  # Should still return True (idempotent)
    
    def test_load_plugin_not_found(self, plugin_manager):
        """Test loading a plugin that doesn't exist."""
        import asyncio
        success = asyncio.run(plugin_manager.load_plugin("NonExistentPlugin", {}))
        
        assert success is False
    
    def test_unload_plugin_success(self, plugin_manager, mock_plugin):
        """Test unloading a plugin successfully."""
        # Register and load plugin
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        # Unload the plugin
        import asyncio
        success = asyncio.run(plugin_manager.unload_plugin("mock-plugin"))
        
        assert success is True
        assert "mock-plugin" not in plugin_manager.plugins
    
    def test_unload_plugin_not_loaded(self, plugin_manager):
        """Test unloading a plugin that's not loaded."""
        import asyncio
        success = asyncio.run(plugin_manager.unload_plugin("nonexistent"))
        
        assert success is False
    
    def test_get_plugin(self, plugin_manager, mock_plugin):
        """Test getting a loaded plugin."""
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        plugin = plugin_manager.get_plugin("mock-plugin")
        
        assert plugin is not None
        assert plugin == mock_plugin
    
    def test_get_plugin_not_found(self, plugin_manager):
        """Test getting a plugin that doesn't exist."""
        plugin = plugin_manager.get_plugin("nonexistent")
        
        assert plugin is None
    
    def test_list_plugins(self, plugin_manager, mock_plugin):
        """Test listing all plugins."""
        # Add a loaded plugin
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        # Add a discovered but unloaded plugin
        plugin_manager.plugin_classes["AnotherPlugin"] = MockPlugin
        
        plugins = plugin_manager.list_plugins()
        
        assert len(plugins) == 2
        plugin_names = [p.name for p in plugins]
        assert "mock-plugin" in plugin_names
    
    def test_get_loaded_plugins(self, plugin_manager, mock_plugin):
        """Test getting list of loaded plugin names."""
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        plugin_manager.plugins["another-plugin"] = mock_plugin
        
        loaded = plugin_manager.get_loaded_plugins()
        
        assert len(loaded) == 2
        assert "mock-plugin" in loaded
        assert "another-plugin" in loaded
    
    def test_is_plugin_loaded(self, plugin_manager, mock_plugin):
        """Test checking if a plugin is loaded."""
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        assert plugin_manager.is_plugin_loaded("mock-plugin") is True
        assert plugin_manager.is_plugin_loaded("nonexistent") is False
    
    @pytest.mark.asyncio
    async def test_discover_all_sources(self, plugin_manager, mock_plugin):
        """Test discovering sources from all loaded plugins."""
        # Set up plugin with sources
        source = MediaSource(
            source_id="test-source",
            media_type=MediaType.CUSTOM,
            uri="custom://test",
        )
        mock_plugin.set_sources([source])
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        # Discover sources
        all_sources = await plugin_manager.discover_all_sources()
        
        assert "mock-plugin" in all_sources
        assert len(all_sources["mock-plugin"]) == 1
        assert all_sources["mock-plugin"][0].source_id == "test-source"
    
    @pytest.mark.asyncio
    async def test_archive_source(self, plugin_manager, mock_plugin):
        """Test archiving a source using a plugin."""
        source = MediaSource(
            source_id="test-source",
            media_type=MediaType.CUSTOM,
            uri="custom://test",
        )
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        # Archive source
        result = await plugin_manager.archive_source("mock-plugin", source)
        
        assert result.success is True
        assert result.output_path == "/tmp/test.webm"
    
    @pytest.mark.asyncio
    async def test_archive_source_plugin_not_found(self, plugin_manager):
        """Test archiving with a non-existent plugin."""
        source = MediaSource(
            source_id="test-source",
            media_type=MediaType.CUSTOM,
            uri="custom://test",
        )
        
        result = await plugin_manager.archive_source("nonexistent", source)
        
        assert result.success is False
        assert "not loaded" in result.error
    
    @pytest.mark.asyncio
    async def test_health_check_all(self, plugin_manager, mock_plugin):
        """Test health check on all loaded plugins."""
        plugin_manager.plugins["mock-plugin"] = mock_plugin
        
        health_status = await plugin_manager.health_check_all()
        
        assert "mock-plugin" in health_status
        assert health_status["mock-plugin"] is True
    
    @pytest.mark.asyncio
    async def test_restart_plugin(self, plugin_manager, mock_plugin):
        """Test restarting a plugin."""
        # Register and load plugin
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin
        await plugin_manager.load_plugin("MockPlugin", {"test": "config"})
        
        # Restart plugin
        success = await plugin_manager.restart_plugin("mock-plugin")
        
        assert success is True
        # Plugin should still be loaded after restart
        assert "mock-plugin" in plugin_manager.plugins
    
    @pytest.mark.asyncio
    async def test_restart_plugin_not_loaded(self, plugin_manager):
        """Test restarting a plugin that's not loaded."""
        success = await plugin_manager.restart_plugin("nonexistent")

        assert success is False

    @pytest.mark.asyncio
    async def test_unload_plugin_deletes_jobs(self, plugin_manager, mock_plugin):
        """Test that unloading a plugin deletes its associated jobs."""
        # Register and load plugin
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin

        # Set up a mock job scheduler
        mock_job_scheduler = Mock()
        mock_job_scheduler.delete_jobs_for_plugin = AsyncMock(return_value=2)
        plugin_manager.job_scheduler = mock_job_scheduler

        await plugin_manager.load_plugin("MockPlugin", {})

        # Unload the plugin
        success = await plugin_manager.unload_plugin("mock-plugin")

        assert success is True
        assert "mock-plugin" not in plugin_manager.plugins
        # Verify delete_jobs_for_plugin was called
        mock_job_scheduler.delete_jobs_for_plugin.assert_called_once_with("mock-plugin")

    @pytest.mark.asyncio
    async def test_unload_plugin_without_job_scheduler(self, plugin_manager, mock_plugin):
        """Test that unloading a plugin works without a job scheduler."""
        # Register and load plugin without job scheduler
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin
        plugin_manager.job_scheduler = None

        await plugin_manager.load_plugin("MockPlugin", {})

        # Unload the plugin (should succeed even without job scheduler)
        success = await plugin_manager.unload_plugin("mock-plugin")

        assert success is True
        assert "mock-plugin" not in plugin_manager.plugins

    @pytest.mark.asyncio
    async def test_unload_plugin_job_deletion_fails(self, plugin_manager, mock_plugin):
        """Test that unloading a plugin continues even if job deletion fails."""
        # Register and load plugin
        plugin_manager.plugin_classes["MockPlugin"] = MockPlugin

        # Set up a mock job scheduler that fails
        mock_job_scheduler = Mock()
        mock_job_scheduler.delete_jobs_for_plugin = AsyncMock(side_effect=Exception("DB error"))
        plugin_manager.job_scheduler = mock_job_scheduler

        await plugin_manager.load_plugin("MockPlugin", {})

        # Unload should fail due to job deletion error
        success = await plugin_manager.unload_plugin("mock-plugin")

        assert success is False
        # Verify delete_jobs_for_plugin was called
        mock_job_scheduler.delete_jobs_for_plugin.assert_called_once_with("mock-plugin")


class TestPluginInterface:
    """Test cases for plugin interface classes."""
    
    def test_media_source_creation(self):
        """Test creating a MediaSource."""
        source = MediaSource(
            source_id="test-source",
            media_type=MediaType.WEBRTC,
            uri="webrtc://pumpfun/test",
            metadata={"participants": 100},
            priority="high",
            estimated_size_bytes=50000000,
            estimated_duration_seconds=300,
        )
        
        assert source.source_id == "test-source"
        assert source.media_type == MediaType.WEBRTC
        assert source.uri == "webrtc://pumpfun/test"
        assert source.metadata["participants"] == 100
        assert source.priority == "high"
        assert source.estimated_size_bytes == 50000000
        assert source.estimated_duration_seconds == 300
    
    def test_media_source_to_dict(self):
        """Test converting MediaSource to dictionary."""
        source = MediaSource(
            source_id="test-source",
            media_type=MediaType.WEBRTC,
            uri="webrtc://pumpfun/test",
        )
        
        source_dict = source.to_dict()
        
        assert source_dict["source_id"] == "test-source"
        assert source_dict["media_type"] == "webrtc"
        assert source_dict["uri"] == "webrtc://pumpfun/test"
    
    def test_archive_result_success(self):
        """Test creating a successful ArchiveResult."""
        result = ArchiveResult(
            success=True,
            output_path="/tmp/test.webm",
            file_size_bytes=1000000,
            duration_seconds=60,
            metadata={"format": "webm"},
        )
        
        assert result.success is True
        assert result.output_path == "/tmp/test.webm"
        assert result.file_size_bytes == 1000000
        assert result.duration_seconds == 60
        assert result.metadata["format"] == "webm"
    
    def test_archive_result_failure(self):
        """Test creating a failed ArchiveResult."""
        result = ArchiveResult(
            success=False,
            error="Failed to archive",
        )
        
        assert result.success is False
        assert result.error == "Failed to archive"
        assert result.output_path is None
    
    def test_plugin_metadata_creation(self):
        """Test creating PluginMetadata."""
        metadata = PluginMetadata(
            name="test-plugin",
            version="1.0.0",
            description="Test plugin",
            media_types=[MediaType.WEBRTC, MediaType.YOUTUBE],
            author="Test Author",
        )
        
        assert metadata.name == "test-plugin"
        assert metadata.version == "1.0.0"
        assert metadata.description == "Test plugin"
        assert len(metadata.media_types) == 2
        assert MediaType.WEBRTC in metadata.media_types
        assert metadata.author == "Test Author"
    
    def test_plugin_metadata_to_dict(self):
        """Test converting PluginMetadata to dictionary."""
        metadata = PluginMetadata(
            name="test-plugin",
            version="1.0.0",
            description="Test plugin",
            media_types=[MediaType.WEBRTC],
        )
        
        metadata_dict = metadata.to_dict()
        
        assert metadata_dict["name"] == "test-plugin"
        assert metadata_dict["version"] == "1.0.0"
        assert metadata_dict["media_types"] == ["webrtc"]
    
    def test_archiver_plugin_supports_media_type(self, mock_plugin):
        """Test checking if plugin supports a media type."""
        assert mock_plugin.supports_media_type(MediaType.CUSTOM) is True
        assert mock_plugin.supports_media_type(MediaType.YOUTUBE) is False
