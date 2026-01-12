"""
Plugin mixins for standardized operations.

This module provides mixin classes that plugins can inherit from
to support domain-specific operations beyond the core interface.

Mixins allow plugins to advertise their capabilities without
requiring custom API endpoints for each plugin.
"""

from typing import Dict, Any, List
from abc import ABC, abstractmethod

from app.plugins.plugin_interface import MediaSource, ArchiveResult


class CollectionPluginMixin(ABC):
    """
    Mixin for plugins that work with collections of sources.
    
    Examples:
    - YouTubePlugin: Channels (collections of videos)
    - BitTorrentPlugin: Trackers (collections of torrents)
    - IPTVPlugin: Playlists (collections of streams)
    
    Plugins that inherit from this mixin support:
    - Subscribing/unsubscribing to collections
    - Listing subscriptions
    - Discovering sources from specific subscriptions
    - Archiving all sources from a subscription
    """
    
    @abstractmethod
    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a collection (channel, tracker, playlist).
        
        Args:
            collection_uri: URI of the collection to subscribe to
            config: Optional configuration (quality, format, etc.)
            
        Returns:
            Dict with subscription info
            {
                "success": bool,
                "collection_id": str,
                "collection_name": str,
                "config": dict,
                "created_at": str
            }
        """
        pass
    
    @abstractmethod
    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a collection.
        
        Args:
            collection_id: ID of the collection to unsubscribe from
            
        Returns:
            Dict with result
            {
                "success": bool,
                "message": str,
                "error": str (optional)
            }
        """
        pass
    
    @abstractmethod
    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all subscriptions.
        
        Returns:
            List of subscription dicts
            [
                {
                    "collection_id": str,
                    "collection_name": str,
                    "collection_uri": str,
                    "enabled": bool,
                    "created_at": str,
                    "last_polled_at": str (optional),
                    "source_count": int (optional)
                },
                ...
            ]
        """
        pass
    
    @abstractmethod
    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        """
        Get subscription details.
        
        Args:
            collection_id: ID of the subscription
            
        Returns:
            Subscription dict with full details
        """
        pass
    
    @abstractmethod
    async def discover_from_subscription(
        self,
        collection_id: str
    ) -> List[MediaSource]:
        """
        Discover sources from a specific subscription.
        
        This is a targeted version of discover_sources() that only
        polls one collection instead of all subscriptions.
        
        Args:
            collection_id: ID of the subscription to poll
            
        Returns:
            List of MediaSource objects
        """
        pass
    
    @abstractmethod
    async def archive_from_subscription(
        self,
        collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all sources from a subscription.
        
        This is a batch operation that discovers and archives all
        sources from a specific collection.
        
        Args:
            collection_id: ID of the subscription
            
        Returns:
            List of ArchiveResult objects
        """
        pass


class SourcePluginMixin(ABC):
    """
    Mixin for plugins that work with individual sources.
    
    Examples:
    - PumpFunPlugin: Individual live streams
    - HTTPPlugin: Individual downloadable files
    
    Plugins that inherit from this mixin support:
    - Listing all known sources
    - Getting status of specific sources
    - Managing source metadata
    """
    
    @abstractmethod
    async def list_sources(self) -> List[Dict[str, Any]]:
        """
        List all known sources (both discovered and archived).
        
        Returns:
            List of source dicts
            [
                {
                    "source_id": str,
                    "media_type": str,
                    "uri": str,
                    "status": str,  # "discovered", "archived", "failed"
                    "metadata": dict,
                    "archived_at": str (optional),
                    "output_path": str (optional)
                },
                ...
            ]
        """
        pass
    
    @abstractmethod
    async def get_source_status(self, source_id: str) -> Dict[str, Any]:
        """
        Get status of a specific source.
        
        Args:
            source_id: ID of the source
            
        Returns:
            Source status dict
            {
                "source_id": str,
                "media_type": str,
                "uri": str,
                "status": str,
                "progress": float (optional),  # 0.0 to 1.0
                "error": str (optional),
                "metadata": dict,
                "archived_at": str (optional),
                "output_path": str (optional),
                "file_size_bytes": int (optional),
                "duration_seconds": int (optional)
            }
        """
        pass


class ConfigurablePluginMixin(ABC):
    """
    Mixin for plugins that support runtime configuration.
    
    Examples:
    - All plugins can inherit this for configuration management
    
    Plugins that inherit from this mixin support:
    - Getting current configuration
    - Updating configuration
    - Resetting to defaults
    """
    
    @abstractmethod
    def get_config(self) -> Dict[str, Any]:
        """
        Get current plugin configuration.
        
        Returns:
            Current configuration dict
        """
        pass
    
    @abstractmethod
    async def update_config(self, config: Dict[str, Any]) -> bool:
        """
        Update plugin configuration.
        
        Args:
            config: New configuration (partial update allowed)
            
        Returns:
            True if update successful
        """
        pass
    
    @abstractmethod
    def get_default_config(self) -> Dict[str, Any]:
        """
        Get default configuration.
        
        Returns:
            Default configuration dict
        """
        pass


class ObservablePluginMixin(ABC):
    """
    Mixin for plugins that support real-time notifications.
    
    Examples:
    - PumpFunPlugin: Notify when stream goes live
    - YouTubePlugin: Notify when new video discovered
    
    Plugins that inherit from this mixin support:
    - Event callbacks
    - WebSocket subscriptions
    - Real-time status updates
    """
    
    def add_event_callback(self, event_type: str, callback: callable):
        """
        Register a callback for a specific event type.
        
        Args:
            event_type: Type of event (e.g., "source_discovered", "archive_complete")
            callback: Callable function(event_data)
        """
        # Default implementation: no-op
        pass
    
    def remove_event_callback(self, event_type: str, callback: callable):
        """
        Remove a previously registered callback.
        
        Args:
            event_type: Type of event
            callback: Callable function to remove
        """
        # Default implementation: no-op
        pass
    
    async def get_event_stream(self):
        """
        Get async generator for real-time events.
        
        Returns:
            Async generator yielding event dicts
        """
        # Default implementation: empty generator
        return
        yield  # Make this a generator