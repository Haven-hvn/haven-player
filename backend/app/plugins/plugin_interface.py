"""
Plugin interface definitions for Haven Player.

This module defines the abstract base classes and data structures that all
archiver plugins must implement.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from enum import Enum


class MediaType(str, Enum):
    """Types of media that plugins can archive."""
    WEBRTC = "webrtc"
    YOUTUBE = "youtube"
    BITTORRENT = "bittorrent"
    IPTV = "iptv"
    HTTP = "http"
    CUSTOM = "custom"


class MediaSource:
    """
    Unified media source representation.
    
    Attributes:
        source_id: Unique identifier for the source (e.g., mint_id, video_id)
        media_type: Type of media (see MediaType enum)
        uri: URI or URL of the media source
        metadata: Additional metadata about the source
        priority: Priority level for recording scheduling
        estimated_size_bytes: Estimated file size in bytes (optional)
        estimated_duration_seconds: Estimated duration in seconds (optional)
    """
    
    def __init__(
        self,
        source_id: str,
        media_type: MediaType,
        uri: str,
        metadata: Optional[Dict[str, Any]] = None,
        priority: str = "normal",
        estimated_size_bytes: Optional[int] = None,
        estimated_duration_seconds: Optional[int] = None,
    ):
        self.source_id = source_id
        self.media_type = media_type
        self.uri = uri
        self.metadata = metadata or {}
        self.priority = priority
        self.estimated_size_bytes = estimated_size_bytes
        self.estimated_duration_seconds = estimated_duration_seconds
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "source_id": self.source_id,
            "media_type": self.media_type.value,
            "uri": self.uri,
            "metadata": self.metadata,
            "priority": self.priority,
            "estimated_size_bytes": self.estimated_size_bytes,
            "estimated_duration_seconds": self.estimated_duration_seconds,
        }


class ArchiveResult:
    """
    Result of archiving a media source.
    
    Attributes:
        success: Whether archiving succeeded
        output_path: Path to the archived file (if successful)
        file_size_bytes: Size of the archived file (if successful)
        duration_seconds: Duration of the archived media (if successful)
        error: Error message (if failed)
        metadata: Additional metadata about the archive
    """
    
    def __init__(
        self,
        success: bool,
        output_path: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        duration_seconds: Optional[int] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.success = success
        self.output_path = output_path
        self.file_size_bytes = file_size_bytes
        self.duration_seconds = duration_seconds
        self.error = error
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "success": self.success,
            "output_path": self.output_path,
            "file_size_bytes": self.file_size_bytes,
            "duration_seconds": self.duration_seconds,
            "error": self.error,
            "metadata": self.metadata,
        }


class PluginMetadata:
    """
    Plugin metadata information.
    
    Attributes:
        name: Unique name of the plugin
        version: Version string (semver recommended)
        description: Human-readable description
        media_types: List of media types this plugin supports
        author: Plugin author (optional)
    """
    
    def __init__(
        self,
        name: str,
        version: str,
        description: str,
        media_types: List[MediaType],
        author: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
    ):
        self.name = name
        self.version = version
        self.description = description
        self.media_types = media_types
        self.author = author
        self.capabilities = capabilities or []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "media_types": [t.value for t in self.media_types],
            "author": self.author,
            "capabilities": self.capabilities,
        }


class ArchiverPlugin(ABC):
    """
    Base class for all archiver plugins.
    
    Plugins must inherit from this class and implement all abstract methods.
    Plugins should be able to:
    1. Discover available media sources
    2. Archive a specific media source
    3. Initialize with configuration
    4. Report health status
    
    Example:
        class MyWebRTCPlugin(ArchiverPlugin):
            def get_metadata(self) -> PluginMetadata:
                return PluginMetadata(
                    name="my-webrtc",
                    version="1.0.0",
                    description="My WebRTC archiver",
                    media_types=[MediaType.WEBRTC],
                )
            
            async def discover_sources(self) -> List[MediaSource]:
                # Discover sources
                return []
            
            # Implement other abstract methods...
    """
    
    @abstractmethod
    def get_metadata(self) -> PluginMetadata:
        """
        Return plugin metadata.
        
        Returns:
            PluginMetadata object with plugin information
        """
        pass
    
    @abstractmethod
    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover available media sources.
        
        This method should find and return all available media sources
        that this plugin can archive.
        
        Returns:
            List of MediaSource objects representing available sources
        """
        pass
    
    @abstractmethod
    async def archive(self, source: MediaSource) -> ArchiveResult:
        """
        Archive a media source.
        
        This method should download/record the specified media source
        and save it to disk.
        
        Args:
            source: The MediaSource to archive
            
        Returns:
            ArchiveResult with success status and output information
        """
        pass
    
    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> bool:
        """
        Initialize plugin with configuration.
        
        This method is called when the plugin is loaded. Use it to
        set up any necessary resources or validate configuration.
        
        Args:
            config: Configuration dictionary for the plugin
            
        Returns:
            True if initialization succeeded, False otherwise
        """
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if plugin is healthy.
        
        This method should verify that the plugin is functioning correctly
        and can perform its operations.
        
        Returns:
            True if plugin is healthy, False otherwise
        """
        pass
    
    def supports_media_type(self, media_type: MediaType) -> bool:
        """
        Check if plugin supports a media type.
        
        Args:
            media_type: The MediaType to check
            
        Returns:
            True if plugin supports this media type, False otherwise
        """
        meta = self.get_metadata()
        return media_type in meta.media_types
