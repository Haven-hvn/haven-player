"""
Brightcove API client for Haven Player.

This module provides a client for interacting with Brightcove's Beacon API
and Edge Playback API to discover and download videos from Brightcove-powered
streaming sites.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
from urllib.parse import urlencode, parse_qs, urlparse, urlunparse

import aiohttp

from app.plugins.builtin.brightcove_config import BrightcoveSourceConfig

logger = logging.getLogger(__name__)


class AssetInfo:
    """Information about a Brightcove asset."""
    
    def __init__(
        self,
        asset_id: str,
        title: str,
        description: Optional[str] = None,
        duration_seconds: Optional[int] = None,
        thumbnail_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.asset_id = asset_id
        self.title = title
        self.description = description
        self.duration_seconds = duration_seconds
        self.thumbnail_url = thumbnail_url
        self.metadata = metadata or {}
        self.video_id: Optional[str] = None
        self.stream_url: Optional[str] = None


class BrightcoveAPIClient:
    """Client for Brightcove Beacon and Edge Playback APIs.
    
    This client handles:
    - Playlist pagination and discovery
    - Asset ID to video ID resolution
    - Video ID to HLS stream URL resolution
    - Rate limiting between requests
    
    Example:
        config = BrightcoveSourceConfig(...)
        client = BrightcoveAPIClient(config)
        
        # Get all assets from playlist
        assets = await client.get_all_assets()
        
        # Resolve asset to stream URL
        for asset in assets:
            stream_url = await client.get_stream_url(asset.asset_id)
            if stream_url:
                asset.stream_url = stream_url
    """
    
    def __init__(
        self,
        config: BrightcoveSourceConfig,
        session: Optional[aiohttp.ClientSession] = None
    ):
        """Initialize the API client.
        
        Args:
            config: Configuration for this Brightcove source
            session: Optional aiohttp session (creates one if not provided)
        """
        self.config = config
        self._session = session
        self._owned_session = session is None
        
    async def __aenter__(self):
        """Async context manager entry."""
        if self._owned_session and self._session is None:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60),
                headers={
                    "User-Agent": "HavenPlayer-BrightcovePlugin/1.0",
                    "Accept": "application/json",
                }
            )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._owned_session and self._session:
            await self._session.close()
            self._session = None
    
    async def _get(
        self,
        url: str,
        params: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Optional[Dict[str, Any]]:
        """Make a GET request with rate limiting.
        
        Args:
            url: URL to request
            params: Optional query parameters
            headers: Optional additional headers
            
        Returns:
            JSON response as dict, or None on failure
        """
        if not self._session:
            raise RuntimeError("Client not initialized. Use 'async with' or call initialize()")
        
        try:
            async with self._session.get(url, params=params, headers=headers) as response:
                if response.status != 200:
                    logger.error(f"API request failed: {url} - Status {response.status}")
                    return None
                
                data = await response.json()
                
                # Apply rate limiting
                await asyncio.sleep(self.config.rate_limit_seconds)
                
                return data
                
        except aiohttp.ClientError as e:
            logger.error(f"HTTP error requesting {url}: {e}")
            return None
        except asyncio.TimeoutError:
            logger.error(f"Timeout requesting {url}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error requesting {url}: {e}")
            return None
    
    def _build_playlist_url(self, params: Optional[Dict[str, str]] = None) -> str:
        """Build the playlist URL with parameters.
        
        Args:
            params: Optional additional parameters to merge
            
        Returns:
            Full playlist URL
        """
        base_url = self.config.base_playlist_url
        
        # Parse existing URL
        parsed = urlparse(base_url)
        existing_params = parse_qs(parsed.query)
        
        # Merge with config params
        merged_params = self.config.playlist_params.copy()
        if params:
            merged_params.update(params)
        
        # Add account_id if not present
        if "account_id" not in merged_params:
            merged_params["account_id"] = self.config.account_id
        
        # Build query string
        query = urlencode(merged_params)
        
        # Reconstruct URL
        return urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            query,
            parsed.fragment
        ))
    
    async def get_playlist_page(
        self,
        url: Optional[str] = None
    ) -> tuple[List[AssetInfo], Optional[str]]:
        """Get a single page of playlist contents.
        
        Args:
            url: URL to fetch (uses base_playlist_url if None)
            
        Returns:
            Tuple of (list of AssetInfo, next page URL or None)
        """
        fetch_url = url or self._build_playlist_url()
        logger.info(f"Fetching playlist page: {fetch_url}")
        
        data = await self._get(fetch_url)
        if not data:
            return [], None
        
        try:
            # Navigate to contents array
            blocks = data.get("data", {}).get("blocks", [])
            if not blocks:
                logger.warning("No blocks found in playlist response")
                return [], None
            
            widgets = blocks[0].get("widgets", [])
            if not widgets:
                logger.warning("No widgets found in playlist response")
                return [], None
            
            playlist = widgets[0].get("playlist", {})
            contents = playlist.get("contents", [])
            pagination = playlist.get("pagination", {})
            
            assets = []
            for item in contents:
                if item.get("type") == "movies" and "id" in item:
                    asset = AssetInfo(
                        asset_id=item["id"],
                        title=item.get("title", "Unknown"),
                        description=item.get("description"),
                        duration_seconds=item.get("duration"),
                        thumbnail_url=item.get("thumbnailUrl") or item.get("thumbnail_url"),
                        metadata=item
                    )
                    assets.append(asset)
            
            # Get next page URL
            next_url = pagination.get("url", {}).get("next")
            
            logger.info(f"Found {len(assets)} assets, next page: {next_url is not None}")
            return assets, next_url
            
        except (KeyError, IndexError) as e:
            logger.error(f"Error parsing playlist response: {e}")
            return [], None
    
    async def get_all_assets(self) -> List[AssetInfo]:
        """Get all assets from the playlist, handling pagination.
        
        Returns:
            List of all AssetInfo objects from the playlist
        """
        all_assets = []
        next_url = None
        page_count = 0
        
        while True:
            assets, next_url = await self.get_playlist_page(next_url)
            all_assets.extend(assets)
            page_count += 1
            
            if not next_url:
                break
            
            # Safety limit
            if page_count > 100:
                logger.warning("Reached maximum page limit (100)")
                break
        
        logger.info(f"Total assets fetched: {len(all_assets)} from {page_count} pages")
        return all_assets
    
    async def asset_id_to_video_id(self, asset_id: str) -> Optional[str]:
        """Convert an asset ID to a Brightcove video ID.
        
        Args:
            asset_id: The asset ID from the playlist
            
        Returns:
            Brightcove video ID or None if resolution fails
        """
        url = f"{self.config.beacon_api_base}/account/{self.config.account_id}/asset_info/{asset_id}"
        params = {
            "device_type": "web",
            "ngsw-bypass": "1"
        }
        
        logger.debug(f"Resolving asset {asset_id} to video ID")
        
        data = await self._get(url, params=params)
        if not data:
            return None
        
        try:
            vpd = data.get("data", {}).get("video_playback_details", [])
            if vpd and len(vpd) > 0 and "video_id" in vpd[0]:
                video_id = vpd[0]["video_id"]
                logger.debug(f"Asset {asset_id} resolved to video {video_id}")
                return video_id
        except (KeyError, IndexError) as e:
            logger.error(f"Error parsing asset info response: {e}")
        
        logger.warning(f"Could not resolve video ID for asset {asset_id}")
        return None
    
    async def video_id_to_stream_url(self, video_id: str) -> Optional[str]:
        """Get the HLS stream URL for a video ID.
        
        Args:
            video_id: Brightcove video ID
            
        Returns:
            HLS stream URL or None if not found
        """
        url = f"{self.config.edge_api_base}/accounts/{self.config.brightcove_account_id}/videos/{video_id}"
        
        # Add ad config if available
        params = {}
        if self.config.ad_config_id:
            params["ad_config_id"] = self.config.ad_config_id
        
        logger.debug(f"Getting stream URL for video {video_id}")
        
        data = await self._get(url, params=params if params else None)
        if not data:
            return None
        
        try:
            sources = data.get("sources", [])
            
            # Find HLS source
            for source in sources:
                if source.get("type") == "application/x-mpegURL" and "src" in source:
                    stream_url = source["src"]
                    logger.debug(f"Found HLS stream URL for video {video_id}")
                    return stream_url
            
            # Fallback: any source with src
            for source in sources:
                if "src" in source:
                    logger.debug(f"Using fallback stream URL for video {video_id}")
                    return source["src"]
                    
        except Exception as e:
            logger.error(f"Error parsing stream response: {e}")
        
        logger.warning(f"No stream URL found for video {video_id}")
        return None
    
    async def get_stream_url(self, asset_id: str) -> Optional[str]:
        """Get the HLS stream URL for an asset ID (convenience method).
        
        This method resolves the asset ID to video ID, then gets the stream URL.
        
        Args:
            asset_id: The asset ID from the playlist
            
        Returns:
            HLS stream URL or None if resolution fails at any step
        """
        video_id = await self.asset_id_to_video_id(asset_id)
        if not video_id:
            return None
        
        return await self.video_id_to_stream_url(video_id)
    
    async def resolve_asset(self, asset: AssetInfo) -> AssetInfo:
        """Resolve an asset fully (asset ID -> video ID -> stream URL).
        
        Args:
            asset: AssetInfo to resolve (modified in place)
            
        Returns:
            The same AssetInfo with video_id and stream_url populated
        """
        video_id = await self.asset_id_to_video_id(asset.asset_id)
        if video_id:
            asset.video_id = video_id
            asset.stream_url = await self.video_id_to_stream_url(video_id)
        return asset
