"""
WebVideo archiver plugin for Haven CLI.

This plugin provides generalized video website archiving functionality using
direct video downloads from API endpoints. It mirrors the YouTube plugin's
structure but uses direct video URLs instead of yt-dlp.

Features:
- Tag-based subscriptions (instead of channel-based)
- Direct video downloads from API-provided URLs
- Configurable domain and endpoint patterns
- Automatic polling for new videos by tags
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import aiohttp
import aiofiles

from haven_cli.plugins.base import (
    ArchiverPlugin,
    PluginCapability,
    PluginInfo,
    MediaSource,
    ArchiveResult,
)


logger = logging.getLogger(__name__)


class WebVideoPlugin(ArchiverPlugin):
    """
    WebVideo recording plugin for Haven CLI.

    Provides tag-based video discovery and direct download capabilities
    for video websites that expose APIs with standardized endpoints.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        """Initialize the WebVideo plugin."""
        super().__init__(config)
        self._session: Optional[aiohttp.ClientSession] = None
        self.download_dir: Optional[str] = None
        
        # Load configuration
        self.domain = self._config.get("domain", "")
        self.api_endpoint = self._config.get("api_endpoint", "api/videos")
        self.max_videos_per_tag = self._config.get("max_videos_per_tag", 50)
        self.request_timeout = self._config.get("request_timeout", 60)
        self.tags: List[Dict[str, Any]] = self._config.get("tags", [])

    @property
    def info(self) -> PluginInfo:
        """Get plugin information."""
        return PluginInfo(
            name="WebVideoPlugin",
            display_name="WebVideo Archiver",
            version="1.0.0",
            description="Archives videos from web APIs using direct downloads (tag-based subscriptions)",
            author="Haven Team",
            media_types=["http", "webvideo"],
            capabilities=[
                PluginCapability.DISCOVER,
                PluginCapability.ARCHIVE,
                PluginCapability.HEALTH_CHECK,
                PluginCapability.METADATA,
            ],
            config_schema={
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Domain of the video website (e.g., example.com)",
                    },
                    "api_endpoint": {
                        "type": "string",
                        "description": "API endpoint path (default: api/videos)",
                        "default": "api/videos",
                    },
                    "tags": {
                        "type": "array",
                        "description": "List of tag subscriptions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "enabled": {"type": "boolean", "default": True},
                                "video_format": {"type": "string", "default": "mp4"},
                                "video_quality": {"type": "string", "default": "best"},
                                "auto_archive": {"type": "boolean", "default": True},
                            },
                        },
                    },
                    "max_videos_per_tag": {
                        "type": "integer",
                        "description": "Maximum videos to fetch per tag",
                        "default": 50,
                    },
                    "request_timeout": {
                        "type": "integer",
                        "description": "HTTP request timeout in seconds",
                        "default": 60,
                    },
                },
                "required": ["domain"],
            },
        )

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate configuration
        if not self.domain:
            raise ValueError("WebVideoPlugin requires 'domain' configuration")

        # Set download directory
        self.download_dir = self._config.get("download_dir")
        if not self.download_dir:
            # Use default download directory
            self.download_dir = str(Path.home() / "haven" / "downloads" / "webvideo")
        
        os.makedirs(self.download_dir, exist_ok=True)

        # Create HTTP session
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=self.request_timeout),
            headers={
                "User-Agent": "HavenCLI-WebVideoPlugin/1.0",
                "Accept": "application/json",
            }
        )

        self._initialized = True
        logger.info(f"WebVideoPlugin initialized with domain: {self.domain}")

    async def shutdown(self) -> None:
        """Shutdown the plugin."""
        if self._session:
            await self._session.close()
            self._session = None
        self._initialized = False

    def _build_api_url(
        self,
        endpoint: Optional[str] = None,
        limit: int = 32,
        page: int = 1,
        tags: Optional[List[str]] = None,
        tag_mode: str = "OR",
        expand_tags: bool = False
    ) -> str:
        """Build API URL with query parameters."""
        domain = self.domain
        if not domain:
            raise ValueError("Domain not configured")

        # Ensure domain has protocol
        if not domain.startswith(("http://", "https://")):
            domain = f"https://{domain}"

        # Use configured endpoint or default
        path = endpoint or self.api_endpoint or "api/videos"
        url = f"{domain}/{path.lstrip('/')}"
        
        # Build query parameters
        params = []
        params.append(f"limit={limit}")
        params.append(f"page={page}")
        
        if tags:
            params.append(f"tags={','.join(tags)}")
            params.append(f"tagMode={tag_mode}")
        
        params.append(f"expandTags={str(expand_tags).lower()}")

        return f"{url}?{'&'.join(params)}"

    async def _get_videos_for_tag(
        self,
        tag_name: str,
        tag_config: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Get videos for a specific tag from the API."""
        if not self._session:
            raise RuntimeError("Plugin not initialized")

        try:
            limit = min(32, self.max_videos_per_tag)
            
            url = self._build_api_url(
                limit=limit,
                page=1,
                tags=[tag_name],
                tag_mode="OR",
                expand_tags=False
            )

            logger.info(f"Fetching videos from: {url}")

            async with self._session.get(url) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"API returned status {response.status}: {error_text}")
                    return []

                data = await response.json()
                
                if not data.get("success", False):
                    logger.error(f"API returned error: {data.get('error', 'Unknown error')}")
                    return []

                videos = data.get("videos", [])
                logger.info(f"Retrieved {len(videos)} videos from API for tag '{tag_name}'")
                return videos

        except asyncio.TimeoutError:
            logger.error(f"Timeout getting videos for tag {tag_name}")
            return []
        except Exception as e:
            logger.error(f"Error getting videos for tag {tag_name}: {e}")
            return []

    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover media sources to archive.

        Polls all enabled tags and returns new videos found.
        """
        if not self._initialized or not self._session:
            logger.error("WebVideoPlugin not initialized")
            return []

        # Get enabled tags
        enabled_tags = [t for t in self.tags if t.get("enabled", True)]
        
        if not enabled_tags:
            logger.info("No enabled tags to poll")
            return []

        logger.info(f"Polling {len(enabled_tags)} tags for new videos")

        new_sources = []
        seen_videos = set()

        for tag_config in enabled_tags:
            tag_name = tag_config.get("name", "")
            if not tag_name:
                continue

            try:
                videos = await self._get_videos_for_tag(tag_name, tag_config)

                for video in videos:
                    video_id = video.get("_id") or video.get("id")
                    if not video_id:
                        continue

                    # Skip duplicates
                    if video_id in seen_videos:
                        continue
                    seen_videos.add(video_id)

                    video_url = video.get("videoUrl")
                    if not video_url:
                        continue

                    source = MediaSource(
                        source_id=video_id,
                        media_type="http",
                        uri=video_url,
                        title=video.get("title", "Unknown"),
                        priority="medium",
                        metadata={
                            "title": video.get("title", "Unknown"),
                            "tag_name": tag_name,
                            "uploader": video.get("uploader", ""),
                            "uploader_username": video.get("uploaderUsername", ""),
                            "duration": video.get("durationSeconds", 0),
                            "duration_formatted": video.get("duration", ""),
                            "thumbnail": video.get("thumbnailUrl", ""),
                            "views": video.get("views", 0),
                            "likes": video.get("likes", 0),
                            "upload_date": video.get("uploadDate", ""),
                            "tags": video.get("tags", []),
                            "video_format": tag_config.get("video_format", "mp4"),
                            "video_quality": tag_config.get("video_quality", "best"),
                        },
                    )
                    new_sources.append(source)

            except Exception as e:
                logger.error(f"Error polling tag {tag_name}: {e}")
                continue

        logger.info(f"Discovered {len(new_sources)} new videos")
        return new_sources

    async def _download_with_progress(
        self,
        video_url: str,
        output_path: str,
        progress_callback: Optional[callable] = None
    ) -> int:
        """Download video with optional progress callback."""
        if not self._session:
            raise RuntimeError("Plugin not initialized")

        file_size = 0
        
        async with self._session.get(video_url) as response:
            if response.status != 200:
                raise Exception(f"HTTP {response.status}")

            total_size = response.headers.get('Content-Length')
            total_size = int(total_size) if total_size else None

            async with aiofiles.open(output_path, 'wb') as f:
                downloaded = 0
                async for chunk in response.content.iter_chunked(8192):
                    if chunk:
                        await f.write(chunk)
                        downloaded += len(chunk)
                        file_size = downloaded

                        if progress_callback and total_size:
                            progress = (downloaded / total_size) * 100
                            progress_callback(progress)

        return file_size

    async def archive(
        self,
        source: MediaSource,
        progress_callback: Optional[callable] = None
    ) -> ArchiveResult:
        """
        Archive a media source.

        Downloads the video directly from the provided URL.
        """
        if not self._initialized:
            return ArchiveResult(
                success=False,
                error="Plugin not initialized"
            )

        video_id = source.source_id
        video_url = source.uri
        
        logger.info(f"Archiving video: {video_id} from {video_url}")

        try:
            # Create output directory
            tag_name = source.metadata.get("tag_name", "misc")
            tag_dir = os.path.join(self.download_dir, tag_name)
            os.makedirs(tag_dir, exist_ok=True)

            # Create safe filename
            safe_title = "".join(
                c for c in source.metadata.get("title", "video")
                if c.isalnum() or c in (' ', '-', '_')
            ).strip()[:50]
            
            file_extension = source.metadata.get("video_format", "mp4")
            output_path = os.path.join(
                tag_dir,
                f"{safe_title}_{video_id}.{file_extension}"
            )

            # Check if already exists
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                logger.info(f"Video already exists: {output_path}")
                return ArchiveResult(
                    success=True,
                    output_path=output_path,
                    file_size=file_size,
                    duration=source.metadata.get("duration", 0),
                    metadata={"video_id": video_id, "existing": True},
                )

            # Download video
            logger.info(f"Downloading to: {output_path}")
            file_size = await self._download_with_progress(
                video_url,
                output_path,
                progress_callback
            )

            if file_size == 0:
                os.remove(output_path)
                return ArchiveResult(
                    success=False,
                    error="Downloaded file is empty"
                )

            logger.info(f"Download complete: {file_size} bytes")

            return ArchiveResult(
                success=True,
                output_path=output_path,
                file_size=file_size,
                duration=source.metadata.get("duration", 0),
                metadata={
                    "video_id": video_id,
                    "title": source.metadata.get("title"),
                    "tag": tag_name,
                },
            )

        except Exception as e:
            logger.error(f"Error archiving video {video_id}: {e}")
            return ArchiveResult(
                success=False,
                error=str(e),
            )

    async def health_check(self) -> bool:
        """Check if the plugin is healthy."""
        if not self._initialized:
            return False

        if not self._session:
            return False

        if not self.domain:
            return False

        # Try to reach the API
        try:
            url = self._build_api_url(limit=1, page=1)
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                # Any response indicates the server is reachable
                logger.info(f"Health check: API returned status {response.status}")
                return True
        except Exception as e:
            logger.warning(f"Health check: Could not reach API: {e}")
            # Still report healthy if configuration is valid
            return True

    # ========== Tag Subscription Methods ==========

    def add_tag_subscription(
        self,
        tag_name: str,
        video_format: str = "mp4",
        video_quality: str = "best",
        auto_archive: bool = True
    ) -> Dict[str, Any]:
        """
        Add a new tag subscription.

        Args:
            tag_name: The tag to subscribe to
            video_format: Preferred video format (mp4, webm, etc.)
            video_quality: Preferred quality (best, 1080p, 720p, etc.)
            auto_archive: Whether to auto-archive new videos

        Returns:
            Subscription info dict
        """
        # Check if already subscribed
        for tag in self.tags:
            if tag.get("name") == tag_name:
                return {
                    "success": False,
                    "error": f"Already subscribed to tag: {tag_name}",
                }

        new_tag = {
            "name": tag_name,
            "enabled": True,
            "video_format": video_format,
            "video_quality": video_quality,
            "auto_archive": auto_archive,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        self.tags.append(new_tag)
        self._config["tags"] = self.tags

        logger.info(f"Added tag subscription: {tag_name}")

        return {
            "success": True,
            "tag": new_tag,
        }

    def remove_tag_subscription(self, tag_name: str) -> Dict[str, Any]:
        """
        Remove a tag subscription.

        Args:
            tag_name: The tag to unsubscribe from

        Returns:
            Result dict
        """
        for i, tag in enumerate(self.tags):
            if tag.get("name") == tag_name:
                removed = self.tags.pop(i)
                self._config["tags"] = self.tags
                
                logger.info(f"Removed tag subscription: {tag_name}")
                
                return {
                    "success": True,
                    "removed": removed,
                }

        return {
            "success": False,
            "error": f"Tag not found: {tag_name}",
        }

    def list_tag_subscriptions(self) -> List[Dict[str, Any]]:
        """List all tag subscriptions."""
        return self.tags

    def enable_tag(self, tag_name: str) -> bool:
        """Enable a tag subscription."""
        for tag in self.tags:
            if tag.get("name") == tag_name:
                tag["enabled"] = True
                self._config["tags"] = self.tags
                return True
        return False

    def disable_tag(self, tag_name: str) -> bool:
        """Disable a tag subscription."""
        for tag in self.tags:
            if tag.get("name") == tag_name:
                tag["enabled"] = False
                self._config["tags"] = self.tags
                return True
        return False
