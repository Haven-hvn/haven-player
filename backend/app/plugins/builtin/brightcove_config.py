"""
Configuration models for Brightcove plugin.

This module defines Pydantic models for Brightcove plugin configuration,
including default presets for known Brightcove-powered sites like The Den.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class BrightcoveSourceConfig(BaseModel):
    """Configuration for a single Brightcove source.
    
    This model defines all the parameters needed to archive videos from
    a Brightcove-powered streaming site.
    
    Attributes:
        name: Unique identifier for this source instance
        display_name: Human-readable name for UI display
        description: Optional description of the source
        
        # API Configuration
        base_playlist_url: The starting playlist URL for discovery
        playlist_params: URL parameters for playlist requests
        account_id: Beacon account ID for API calls
        brightcove_account_id: Brightcove account ID for edge API
        ad_config_id: Optional ad configuration ID for stream URLs
        
        # API Endpoints (overrideable for different Brightcove deployments)
        beacon_api_base: Base URL for Beacon API
        edge_api_base: Base URL for Edge Playback API
        
        # Behavior
        poll_interval_minutes: How often to check for new videos
        rate_limit_seconds: Delay between API calls
        max_retries: Number of retry attempts for failed downloads
        
        # Download options
        output_format: Preferred video format (mp4, mkv, etc.)
        quality_preference: Video quality preference (best, 1080p, 720p, etc.)
        enabled: Whether this source is active
    """
    
    # Identity
    name: str = Field(..., description="Unique identifier for this source")
    display_name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Source description")
    
    # API Configuration
    base_playlist_url: str = Field(..., description="Starting playlist URL")
    playlist_params: Dict[str, str] = Field(
        default_factory=dict,
        description="URL parameters for playlist requests"
    )
    account_id: str = Field(..., description="Beacon account ID")
    brightcove_account_id: str = Field(..., description="Brightcove account ID")
    ad_config_id: Optional[str] = Field(None, description="Ad config ID for streams")
    
    # API Endpoints
    beacon_api_base: str = Field(
        "https://beacon.playback.api.brightcove.com/twentypointnine/api",
        description="Beacon API base URL"
    )
    edge_api_base: str = Field(
        "https://edge.api.brightcove.com/playback/v1",
        description="Edge Playback API base URL"
    )
    
    # Behavior
    poll_interval_minutes: int = Field(60, description="Polling interval in minutes")
    rate_limit_seconds: float = Field(1.0, description="Rate limit between API calls")
    max_retries: int = Field(3, description="Max retry attempts")
    
    # Download options
    output_format: str = Field("mp4", description="Output video format")
    quality_preference: str = Field("best", description="Quality preference")
    enabled: bool = Field(True, description="Whether source is enabled")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "the_den",
                "display_name": "The Den",
                "base_playlist_url": "https://beacon.playback.api.brightcove.com/twentypointnine/api/playlists/760",
                "playlist_params": {
                    "cohort": "98890104",
                    "device_type": "web",
                    "device_layout": "web",
                    "playlist_id": "760"
                },
                "account_id": "ceee68007b4a515b6",
                "brightcove_account_id": "6415533679001",
                "ad_config_id": "49858721b38a4e7186bc13f5ec8ca505"
            }
        }


class BrightcovePluginConfig(BaseModel):
    """Overall configuration for Brightcove plugin.
    
    This model stores all configured Brightcove sources and plugin-wide settings.
    
    Attributes:
        sources: List of configured Brightcove sources
        default_source: Name of the default source to use
        max_concurrent_downloads: Maximum parallel downloads
        download_subtitles: Whether to download subtitles when available
    """
    
    sources: List[BrightcoveSourceConfig] = Field(
        default_factory=list,
        description="Configured Brightcove sources"
    )
    default_source: Optional[str] = Field(
        None,
        description="Default source name"
    )
    max_concurrent_downloads: int = Field(
        2,
        description="Maximum concurrent downloads"
    )
    download_subtitles: bool = Field(
        False,
        description="Download subtitles when available"
    )
    
    # Internal tracking (not user-configurable)
    _seen_videos: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Seen video IDs per source"
    )
    _archived_videos: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Archived video metadata"
    )


def get_the_den_config() -> BrightcoveSourceConfig:
    """Get the default configuration for The Den (watchentertheden.com).
    
    Returns:
        BrightcoveSourceConfig for The Den skateboard content
    """
    return BrightcoveSourceConfig(
        name="the_den",
        display_name="The Den",
        description="Skateboard videos from watchentertheden.com",
        base_playlist_url="https://beacon.playback.api.brightcove.com/twentypointnine/api/playlists/760",
        playlist_params={
            "cohort": "98890104",
            "device_type": "web",
            "device_layout": "web",
            "playlist_id": "760"
        },
        account_id="ceee68007b4a515b6",
        brightcove_account_id="6415533679001",
        ad_config_id="49858721b38a4e7186bc13f5ec8ca505",
        beacon_api_base="https://beacon.playback.api.brightcove.com/twentypointnine/api",
        edge_api_base="https://edge.api.brightcove.com/playback/v1",
        poll_interval_minutes=60,
        rate_limit_seconds=1.0,
        max_retries=3,
        output_format="mp4",
        quality_preference="best",
        enabled=True
    )


def get_default_config() -> Dict[str, Any]:
    """Get the default plugin configuration with The Den preset.
    
    Returns:
        Dictionary with default configuration including The Den source
    """
    the_den = get_the_den_config()
    return {
        "sources": [the_den.model_dump()],
        "default_source": "the_den",
        "max_concurrent_downloads": 2,
        "download_subtitles": False,
        "_seen_videos": {},
        "_archived_videos": {}
    }
