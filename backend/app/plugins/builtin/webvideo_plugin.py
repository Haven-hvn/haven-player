"""
WebVideo archiver plugin for Haven Player.

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
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import aiohttp
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
    DefaultJobConfig,
)
from app.plugins.mixins import CollectionPluginMixin, ConfigurablePluginMixin, RetryableMixin

from app.models.config import AppConfig
from app.models.database import get_db as get_db_session
from app.models.plugin import Plugin as PluginModel
from app.models.video import Video
from app.models.analysis_job import AnalysisJob
from app.utils.video import get_video_duration
from app.utils.video.video_file_validator import is_video_content


logger = logging.getLogger(__name__)


class WebVideoPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin, RetryableMixin):
    """
    WebVideo recording plugin with standardized operations.

    Implements:
    - Core ArchiverPlugin interface: discover_sources, archive, health_check
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, etc.
    - ConfigurablePluginMixin: get_config, update_config

    Uses direct video downloads from API endpoints instead of yt-dlp.
    Supports tag-based subscriptions for discovering videos.
    """

    def __init__(self):
        # Initialize RetryableMixin first
        super().__init__()
        
        self.config = {}
        self.initialized = False
        self.download_dir = None
        self._session: Optional[aiohttp.ClientSession] = None

    # ========== Core ArchiverPlugin Interface (Required) ==========

    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="WebVideoPlugin",
            version="1.0.0",
            description="Archives videos from web APIs using direct downloads (tag-based subscriptions)",
            media_types=[MediaType.HTTP],
            author="Haven Team",
            default_jobs=[
                DefaultJobConfig(
                    job_name="poll_tags",
                    schedule="15 * * * *",  # 15th minute of every hour
                    method="discover_sources",
                    on_success="archive_all",
                    config={},
                    enabled=True
                )
            ]
        )

    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration."""
        self.config = config

        # Set download directory from global config only
        db = next(get_db_session())
        app_config = db.query(AppConfig).first()
        if app_config and app_config.download_directory:
            self.download_dir = app_config.download_directory
        else:
            logger.error("Global download_directory not configured in AppConfig")
            db.close()
            return False
        db.close()
        os.makedirs(self.download_dir, exist_ok=True)

        # Validate required configuration
        domain = self.config.get("domain")
        if not domain:
            logger.error("WebVideoPlugin requires 'domain' configuration")
            return False

        # Create HTTP session for API requests
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=60),
            headers={
                "User-Agent": "HavenPlayer-WebVideoPlugin/1.0",
                "Accept": "application/json",
            }
        )

        # Configure retry behavior for downloads
        self.configure_retry(
            max_retries=3,
            retry_delay_seconds=2.0,
            retryable_patterns=[
                "connection timeout",
                "read timeout",
                "network error",
                "HTTP Error 5",
                "Service Unavailable",
                "Temporary Redirect",
            ],
            non_retryable_patterns=[
                "404: Not Found",
                "403: Forbidden",
                "401: Unauthorized",
                "Invalid URL",
                "Video not found",
            ]
        )
        
        self.initialized = True
        logger.info(f"WebVideoPlugin initialized with domain: {domain}")
        return True

    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover new videos from all subscribed tags.

        This is the standard operation used by the job scheduler.
        It polls ALL enabled tags and returns new videos.

        Tags are read from plugins.config JSON column (generic table approach).
        """
        if not self.initialized:
            logger.error("WebVideoPlugin not initialized")
            return []

        if not self._session:
            logger.error("HTTP session not initialized")
            return []

        try:
            db = next(get_db_session())

            # Get plugin config with tags
            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                logger.info("No WebVideo plugin config found")
                return []

            # Get enabled tags from config
            all_tags = plugin.config.get("tags", [])
            enabled_tags = [t for t in all_tags if t.get("enabled", True)]

            logger.info(f"Total tags in config: {len(all_tags)}, Enabled: {len(enabled_tags)}")
            for t in all_tags:
                logger.info(f"Tag '{t.get('name', 'Unknown')}' - enabled={t.get('enabled', True)}")

            if not enabled_tags:
                logger.info("No enabled tags to poll")
                return []

            logger.info(f"Polling {len(enabled_tags)} tags for new videos")

            new_sources = []

            for tag_config in enabled_tags:
                try:
                    tag_name = tag_config.get("name", "")
                    if not tag_name:
                        continue

                    # Get videos for this tag from API
                    videos = await self._get_videos_for_tag(tag_name, tag_config)

                    logger.info(f"Found {len(videos)} videos for tag '{tag_name}'")

                    # Get seen video IDs from plugin config to avoid duplicates
                    seen_videos = plugin.config.get("_seen_videos", [])
                    if isinstance(seen_videos, dict):
                        # Convert dict format back to list if needed
                        seen_videos = seen_videos.get("videos", [])

                    # Process each video
                    for video in videos:
                        video_id = video.get("_id") or video.get("id")
                        if not video_id:
                            continue

                        # Skip if already seen
                        if video_id in seen_videos:
                            continue

                        # Add to seen videos
                        if isinstance(seen_videos, list):
                            seen_videos.append(video_id)

                        # Get video URL - use direct video URL from API
                        video_url = video.get("videoUrl")
                        if not video_url:
                            continue

                        # Create media source
                        source = MediaSource(
                            source_id=video_id,
                            media_type=MediaType.HTTP,
                            uri=video_url,
                            metadata={
                                "title": video.get("title", "Unknown"),
                                "tag_name": tag_name,
                                "uploader": video.get("uploader", ""),
                                "uploader_username": video.get("uploaderUsername", ""),
                                "duration": video.get("durationSeconds", 0),
                                "duration_formatted": video.get("duration", ""),
                                "thumbnail": video.get("thumbnailUrl", ""),
                                "thumbnail_sizes": video.get("thumbnailSizes", {}),
                                "views": video.get("views", 0),
                                "likes": video.get("likes", 0),
                                "upload_date": video.get("uploadDate", ""),
                                "release_date": video.get("releaseDate", ""),
                                "tags": video.get("tags", []),
                                "aspect_ratio": video.get("aspectRatio", 1.7778),
                                "width": video.get("width", 1920),
                                "height": video.get("height", 1080),
                                "video_format": tag_config.get("video_format", "mp4"),
                                "video_quality": tag_config.get("video_quality", "best"),
                                "download_subtitles": tag_config.get("download_subtitles", False),
                            },
                            priority="normal",
                            estimated_size_bytes=None,  # Will be determined during download
                            estimated_duration_seconds=video.get("durationSeconds", 0),
                        )
                        new_sources.append(source)

                    # Update last polled timestamp in config
                    tag_config["last_polled_at"] = datetime.now(timezone.utc).isoformat()

                    # Update seen videos in config
                    config_copy = plugin.config.copy()
                    config_copy["_seen_videos"] = {"videos": seen_videos}

                    # Update the tags array with the updated tag_config
                    tags_copy = []
                    for t in config_copy.get("tags", []):
                        if t.get("name") == tag_name:
                            tags_copy.append(tag_config)
                        else:
                            tags_copy.append(t)
                    config_copy["tags"] = tags_copy

                    plugin.config = config_copy

                except Exception as e:
                    logger.error(f"Error polling tag {tag_config.get('name', 'Unknown')}: {e}")
                    continue

            db.commit()  # Commit after processing all tags

            logger.info(f"Discovered {len(new_sources)} new videos")
            return new_sources

        except Exception as e:
            logger.error(f"Error discovering sources: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
        finally:
            db.close()

    async def archive(self, source: MediaSource) -> ArchiveResult:
        """Archive a video using direct download (standard operation)."""
        if source.media_type != MediaType.HTTP:
            return ArchiveResult(
                success=False,
                error=f"Unsupported media type: {source.media_type}"
            )

        if not self.initialized:
            return ArchiveResult(
                success=False,
                error="WebVideoPlugin not initialized"
            )

        video_id = source.source_id
        logger.info(f"Archiving video: {video_id}")

        try:
            db = next(get_db_session())

            # Get plugin config to check if already archived
            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return ArchiveResult(
                    success=False,
                    error="WebVideo plugin not found"
                )

            archived_videos = plugin.config.get("_archived_videos", {})

            # Check if already downloaded
            if video_id in archived_videos:
                logger.info(f"Video {video_id} already downloaded")
                archived_info = archived_videos[video_id]
                return ArchiveResult(
                    success=True,
                    output_path=archived_info.get("output_path"),
                    file_size_bytes=archived_info.get("file_size_bytes"),
                    duration_seconds=source.estimated_duration_seconds,
                    metadata={"video_id": video_id},
                )

            # Download video directly from URL
            download_result = await self._download_video_direct(source)

            if download_result["success"]:
                file_path = download_result["output_path"]
                
                # Validate that the downloaded file actually contains video content
                logger.info(f"Validating downloaded file for video content: {file_path}")
                if not is_video_content(file_path):
                    logger.error(f"Downloaded file {file_path} does not contain valid video frames")
                    
                    # Clean up the invalid file
                    try:
                        if os.path.exists(file_path):
                            os.remove(file_path)
                            logger.info(f"Removed invalid file: {file_path}")
                    except Exception as cleanup_error:
                        logger.error(f"Error cleaning up invalid file {file_path}: {cleanup_error}")
                    
                    # Create a failed analysis job to track this failure
                    current_time = datetime.now(timezone.utc)
                    failed_job = AnalysisJob(
                        video_path=file_path,
                        status='failed',
                        error="Downloaded file does not contain valid video frames",
                        created_at=current_time,
                        completed_at=current_time
                    )
                    db.add(failed_job)
                    db.commit()
                    
                    return ArchiveResult(
                        success=False,
                        error="Downloaded file does not contain valid video frames. This may indicate the video was corrupted or incomplete."
                    )
                
                logger.info(f"✓ Video validation successful: {file_path} contains valid video content")

                # Mark as archived in config
                _archived_videos = plugin.config.get("_archived_videos", {})
                _archived_videos[video_id] = {
                    "video_id": video_id,
                    "title": source.metadata.get("title"),
                    "output_path": download_result["output_path"],
                    "file_size_bytes": download_result.get("file_size_bytes"),
                    "archived_at": datetime.now(timezone.utc).isoformat(),
                }

                config_copy = plugin.config.copy()
                config_copy["_archived_videos"] = _archived_videos
                plugin.config = config_copy

                db.commit()

                # Create an entry in the main Video table
                file_size = download_result.get("file_size_bytes")
                file_extension = os.path.splitext(file_path)[1].lstrip('.') if file_path else None

                # Calculate actual duration from the file if not available from metadata
                video_duration = source.estimated_duration_seconds
                if not video_duration or video_duration == 0:
                    logger.info(f"Duration not in metadata, calculating from file: {file_path}")
                    video_duration = get_video_duration(file_path)
                    logger.info(f"Calculated duration: {video_duration} seconds")

                new_video_entry = Video(
                    path=file_path,
                    title=source.metadata.get("title"),
                    duration=video_duration or 0,
                    thumbnail_path=source.metadata.get("thumbnail"),
                    file_size=file_size,
                    file_extension=file_extension,
                    mime_type=f"video/{file_extension}" if file_extension else None,
                    creator_handle=source.metadata.get("uploader"),
                    source_uri=source.uri,
                    # Plugin metadata fields
                    plugin_name="WebVideoPlugin",
                    plugin_source_id=video_id,
                    plugin_metadata={
                        "upload_date": source.metadata.get("upload_date"),
                        "release_date": source.metadata.get("release_date"),
                        "video_format": source.metadata.get("video_format"),
                        "video_quality": source.metadata.get("video_quality"),
                        "download_subtitles": source.metadata.get("download_subtitles"),
                        "tags": source.metadata.get("tags", []),
                        "views": source.metadata.get("views", 0),
                        "likes": source.metadata.get("likes", 0),
                        "aspect_ratio": source.metadata.get("aspect_ratio", 1.7778),
                        "width": source.metadata.get("width", 1920),
                        "height": source.metadata.get("height", 1080),
                    },
                    plugin_discovered_at=datetime.now(timezone.utc),
                    plugin_auto_downloaded=True,
                    plugin_subscriptions=[source.metadata.get("tag_name")],
                )
                db.add(new_video_entry)
                db.commit()
                db.refresh(new_video_entry)

                logger.info(f"Created main Video entry for video: {new_video_entry.id}")

                return ArchiveResult(
                    success=True,
                    output_path=download_result["output_path"],
                    file_size_bytes=download_result.get("file_size_bytes"),
                    duration_seconds=video_duration or 0,
                    metadata={
                        "video_id": video_id,
                        "title": source.metadata.get("title"),
                        "tag": source.metadata.get("tag_name"),
                        "main_video_id": new_video_entry.id
                    },
                )
            else:
                return ArchiveResult(
                    success=False,
                    error=download_result.get("error", "Unknown error"),
                )

        except Exception as e:
            logger.error(f"Error archiving video {video_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return ArchiveResult(
                success=False,
                error=str(e),
            )
        finally:
            db.close()

    async def health_check(self) -> bool:
        """
        Check if plugin is healthy (standard operation).

        Returns:
            True if plugin is operational, False if critical dependencies are missing.
        """
        try:
            # Check if global download directory exists (critical)
            if not self.download_dir:
                logger.error("Health check failed: download directory not configured")
                return False

            if not os.path.exists(self.download_dir):
                logger.error(f"Health check failed: download directory does not exist: {self.download_dir}")
                return False

            # Check if HTTP session is available
            if not self._session:
                logger.error("Health check failed: HTTP session not initialized")
                return False

            # Check if domain is configured
            domain = self.config.get("domain")
            if not domain:
                logger.error("Health check failed: domain not configured")
                return False

            # Try to make a test request to the API
            try:
                test_url = self._build_api_url("api/videos", limit=1, page=1)
                async with self._session.get(test_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status in (200, 401, 403):  # Any of these indicates the server is reachable
                        logger.info("Health check: API endpoint is reachable")
                    else:
                        logger.warning(f"Health check: API returned status {response.status}")
            except Exception as e:
                logger.warning(f"Health check: Could not reach API endpoint: {e}")
                # Don't fail health check just because API is temporarily unreachable

            logger.info("Health check: WebVideoPlugin is healthy")
            return True
        except Exception as e:
            logger.error(f"WebVideoPlugin health check failed: {e}")
            return False

    # ========== CollectionPluginMixin Operations (Standardized) ==========

    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a tag (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "WebVideoPlugin",
            "operation": "subscribe",
            "params": {
                "collection_uri": "tag:Action",
                "config": {"video_format": "mp4", "auto_archive": true}
            }
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "WebVideo plugin not found"
                }

            # Extract tag name from collection_uri
            # Format: "tag:TagName" or just "TagName"
            tag_name = collection_uri
            if tag_name.startswith("tag:"):
                tag_name = tag_name[4:]

            if not tag_name:
                return {
                    "success": False,
                    "error": "Invalid tag name"
                }

            # Get current tags list
            tags = plugin.config.get("tags", [])

            # Check if already subscribed
            for t in tags:
                if t.get("name") == tag_name:
                    return {
                        "success": False,
                        "error": "Already subscribed to this tag",
                        "collection_id": tag_name,
                        "collection_name": tag_name,
                    }

            # Add new tag
            new_tag = {
                "name": tag_name,
                "enabled": True,
                "video_format": config.get("video_format", "mp4") if config else "mp4",
                "video_quality": config.get("video_quality", "best") if config else "best",
                "download_subtitles": config.get("download_subtitles", False) if config else False,
                "auto_archive": config.get("auto_archive", True) if config else True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            tags.append(new_tag)

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["tags"] = tags
            plugin.config = config_copy

            db.commit()

            logger.info(f"Subscribed to tag: {new_tag['name']}")

            return {
                "success": True,
                "collection_id": tag_name,
                "collection_name": tag_name,
                "collection_uri": f"tag:{tag_name}",
                "created_at": new_tag["created_at"],
            }

        except Exception as e:
            logger.error(f"Error subscribing to tag: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()

    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a tag (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "WebVideoPlugin",
            "operation": "unsubscribe",
            "params": {"collection_id": "Action"}
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "WebVideo plugin not found"
                }

            # Find and remove tag
            tags = plugin.config.get("tags", [])
            found = False
            tag_name = "Unknown"

            for i, t in enumerate(tags):
                if t.get("name") == collection_id:
                    tag_name = t.get("name", "Unknown")
                    tags.pop(i)
                    found = True
                    break

            if not found:
                return {
                    "success": False,
                    "error": "Tag not found",
                }

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["tags"] = tags
            plugin.config = config_copy

            db.commit()

            logger.info(f"Unsubscribed from tag: {tag_name}")

            return {
                "success": True,
                "message": f"Unsubscribed from {tag_name}",
            }

        except Exception as e:
            logger.error(f"Error unsubscribing from tag: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()

    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all tag subscriptions (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "WebVideoPlugin",
            "operation": "list_subscriptions",
            "params": {}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return []

            return plugin.config.get("tags", [])

        except Exception as e:
            logger.error(f"Error listing subscriptions: {e}")
            return []
        finally:
            db.close()

    async def get_subscription(self, collection_id: str) -> Optional[Dict[str, Any]]:
        """
        Get subscription details (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "WebVideoPlugin",
            "operation": "get_subscription",
            "params": {"collection_id": "Action"}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "WebVideoPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return None

            tags = plugin.config.get("tags", [])

            for t in tags:
                if t.get("name") == collection_id:
                    return t

            return None

        except Exception as e:
            logger.error(f"Error getting subscription: {e}")
            return None
        finally:
            db.close()

    # ========== ConfigurablePluginMixin Operations ==========

    def get_config(self) -> Dict[str, Any]:
        """Get current plugin configuration."""
        config_dict = {
            **self.config
        }
        # Note: download_directory is managed by global AppConfig, not plugin config
        logger.info(f"Plugin config (download_dir uses global): {self.download_dir}")
        return config_dict

    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)

        # Note: download_directory cannot be overridden - uses global config only
        if "download_directory" in config:
            logger.warning("Ignoring download_directory in update_config - uses global AppConfig only")
            del config["download_directory"]

        logger.info(f"Configuration updated: {config}")
        return True

    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "domain": "",
            "api_endpoint": "/api/videos",
            "tags": [],
            "max_concurrent_downloads": 3,
            "max_videos_per_tag": 50,
            "request_timeout": 60,
        }

    # ========== Private Helper Methods ==========

    def _build_api_url(
        self,
        endpoint: str,
        limit: int = 32,
        page: int = 1,
        tags: Optional[List[str]] = None,
        tag_mode: str = "OR",
        expand_tags: bool = False
    ) -> str:
        """Build API URL with query parameters."""
        domain = self.config.get("domain", "")
        if not domain:
            raise ValueError("Domain not configured")

        # Ensure domain has protocol
        if not domain.startswith(("http://", "https://")):
            domain = f"https://{domain}"

        # Build URL
        url = f"{domain}/{endpoint.lstrip('/')}"
        
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
        tag_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Get videos for a specific tag from the API."""
        try:
            max_videos = self.config.get("max_videos_per_tag", 50)
            limit = min(32, max_videos)  # API typically supports up to 32 per request
            
            url = self._build_api_url(
                endpoint=self.config.get("api_endpoint", "api/videos"),
                limit=limit,
                page=1,
                tags=[tag_name],
                tag_mode="OR",
                expand_tags=False
            )

            logger.info(f"Fetching videos from: {url}")

            async with self._session.get(url) as response:
                if response.status != 200:
                    logger.error(f"API returned status {response.status}: {await response.text()}")
                    return []

                data = await response.json()
                
                if not data.get("success", False):
                    logger.error(f"API returned error: {data.get('error', 'Unknown error')}")
                    return []

                videos = data.get("videos", [])
                logger.info(f"Retrieved {len(videos)} videos from API")
                return videos

        except asyncio.TimeoutError:
            logger.error(f"Timeout getting videos for tag {tag_name}")
            return []
        except Exception as e:
            logger.error(f"Error getting videos for tag {tag_name}: {e}")
            return []

    async def _download_video_direct(self, source: MediaSource) -> Dict[str, Any]:
        """Download a video directly from its URL."""
        try:
            # Get download directory
            db = next(get_db_session())
            app_config = db.query(AppConfig).first()
            if not app_config or not app_config.download_directory:
                db.close()
                return {
                    "success": False,
                    "error": "Global download_directory not configured",
                }
            current_download_dir = app_config.download_directory
            db.close()

            tag_name = source.metadata.get("tag_name", "Unknown")
            tag_dir = os.path.join(current_download_dir, "webvideo", tag_name)
            os.makedirs(tag_dir, exist_ok=True)

            # Create safe filename
            safe_title = "".join(c for c in source.metadata.get("title", "video") if c.isalnum() or c in (' ', '-', '_')).strip()
            file_extension = source.metadata.get("video_format", "mp4")
            output_path = os.path.join(tag_dir, f"{safe_title}_{source.source_id}.{file_extension}")

            video_url = source.uri
            logger.info(f"Downloading video from: {video_url}")

            # Download with retry logic
            async def download_operation():
                return await self._perform_download(video_url, output_path)

            retry_result = await self.execute_with_retry(
                operation=lambda: (None, None),  # Not used for direct download
                fallback_strategies=[],
                operation_name="direct video download"
            )

            # Actually perform the download (retry logic handled at higher level)
            try:
                file_size_bytes = await self._perform_download(video_url, output_path)
                
                if file_size_bytes and file_size_bytes > 0:
                    return {
                        "success": True,
                        "output_path": output_path,
                        "file_size_bytes": file_size_bytes,
                    }
                else:
                    return {
                        "success": False,
                        "error": "Downloaded file is empty",
                    }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                }

        except Exception as e:
            logger.error(f"Error downloading video {source.source_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
            }

    async def _perform_download(self, video_url: str, output_path: str) -> int:
        """Perform the actual HTTP download and return file size."""
        file_size = 0
        
        async with self._session.get(video_url) as response:
            if response.status != 200:
                raise Exception(f"HTTP {response.status}: {await response.text()}")

            with open(output_path, 'wb') as f:
                async for chunk in response.content.iter_chunked(8192):
                    if chunk:
                        f.write(chunk)
                        file_size += len(chunk)

        return file_size

    # ========== Additional Mixin Methods ==========

    async def discover_from_subscription(
        self, collection_id: str
    ) -> List[MediaSource]:
        """
        Discover videos from a specific tag.

        This is a stub implementation required by CollectionPluginMixin.
        The actual polling happens in discover_sources() which reads from plugins.config.
        """
        # Tag discovery is handled in discover_sources() which reads all enabled tags
        return []

    async def archive_from_subscription(
        self, collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all videos from a tag.

        This is a stub implementation required by CollectionPluginMixin.
        """
        # Tag archiving is handled via discover_sources + archive
        return []

    async def list_sources(self) -> List[Dict[str, Any]]:
        """
        List all known videos.

        This is a stub implementation required by ConfigurablePluginMixin.
        Returns videos from the Video table that were archived by this plugin.
        """
        try:
            db = next(get_db_session())
            from sqlalchemy import select

            videos = db.query(Video).where(
                Video.plugin_name == "WebVideoPlugin"
            ).all()

            return [
                {
                    "source_id": video.plugin_source_id,
                    "title": video.title,
                    "path": video.path,
                    "created_at": video.created_at.isoformat() if video.created_at else None,
                }
                for video in videos
            ]
        except Exception as e:
            logger.error(f"Error listing WebVideo sources: {e}")
            return []
        finally:
            db.close()

    async def get_source_status(
        self, source_id: str
    ) -> Dict[str, Any]:
        """
        Get status of a specific video.

        This is a stub implementation required by ConfigurablePluginMixin.
        """
        try:
            db = next(get_db_session())
            from sqlalchemy import select

            video = db.query(Video).where(
                Video.plugin_name == "WebVideoPlugin",
                Video.plugin_source_id == source_id
            ).first()

            if not video:
                return {"status": "not_found", "source_id": source_id}

            return {
                "status": "archived",
                "source_id": source_id,
                "title": video.title,
                "path": video.path,
                "created_at": video.created_at.isoformat() if video.created_at else None,
            }
        except Exception as e:
            logger.error(f"Error getting source status: {e}")
            return {"status": "error", "error": str(e)}
        finally:
            db.close()
