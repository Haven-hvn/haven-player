"""
Plugin system for Haven Player.

This module provides a plugin architecture for extending the Haven Player
with additional media sources and archivers.
"""

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
)

from app.plugins.plugin_manager import PluginManager

__all__ = [
    "ArchiverPlugin",
    "PluginMetadata",
    "MediaSource",
    "ArchiveResult",
    "MediaType",
    "PluginManager",
]
