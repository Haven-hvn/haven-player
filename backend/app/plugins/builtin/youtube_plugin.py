"""
YouTube archiver plugin for Haven Player (Refactored).

This plugin uses the generic plugins.config JSON column for storing channel subscriptions,
following Haven Player's architecture principle that plugin systems should leverage generic
tables rather than creating their own dedicated tables.

All operations are accessible via the generic /api/plugins/execute endpoint.
"""

import asyncio
import json
import logging
import os
import platform
import subprocess
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone # Import timezone
from unidecode import unidecode

from sqlalchemy import select, update
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
from app.models.video import Video, Timestamp
from app.models.analysis_job import AnalysisJob
from app.utils.video import get_video_duration
from app.utils.video.video_file_validator import is_video_content


logger = logging.getLogger(__name__)


class YouTubePlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin, RetryableMixin):
    """
    YouTube recording plugin with standardized operations.

    Implements:
    - Core ArchiverPlugin interface: discover_sources, archive, health_check
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, etc.
    - ConfigurablePluginMixin: get_config, update_config

    All operations accessible via POST /api/plugins/execute

    Channel subscriptions are stored in plugins.config JSON column (generic table approach).
    """

    def __init__(self):
        # Initialize RetryableMixin first
        super().__init__()
        
        self.config = {}
        self.initialized = False
        self.download_dir = None  # Will be set from global config on initialization
        self.js_runtime_path = None  # Path to detected JS runtime (Deno or Node.js)
        self.js_runtime_type = None  # 'deno' or 'nodejs'

    # ========== JavaScript Runtime Detection ==========

    def _detect_js_runtime(self) -> Tuple[Optional[str], Optional[str]]:
        """
        Detect available JavaScript runtime (Deno or Node.js).

        Returns:
            Tuple of (runtime_type, path) where runtime_type is 'deno' or 'nodejs',
            or (None, None) if no runtime is found.
        """
        # Check Deno first (smaller, faster, preferred by yt-dlp)
        try:
            result = subprocess.run(
                ["deno", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                logger.info("Detected JavaScript runtime: Deno")
                return ("deno", "deno")
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            pass

        # Check Node.js as fallback
        try:
            result = subprocess.run(
                ["node", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                logger.info("Detected JavaScript runtime: Node.js")
                return ("nodejs", "node")
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            pass

        return (None, None)

    def _get_js_runtime_path(self) -> Optional[str]:
        """
        Get the path to the detected JavaScript runtime.

        Returns:
            Path to the JS runtime executable, or None if not available.
        """
        return self.js_runtime_path

    def _is_js_runtime_available(self) -> bool:
        """
        Check if a JavaScript runtime is available.

        Returns:
            True if Deno or Node.js is available, False otherwise.
        """
        return self.js_runtime_path is not None

    def _get_runtime_installation_guide(self) -> str:
        """
        Get platform-specific installation guide for JavaScript runtime.

        Returns:
            String with installation instructions for the current platform.
        """
        system = platform.system()
        guide = "\nYouTube requires a JavaScript runtime (Deno or Node.js) for full functionality:\n\n"

        if system == "Darwin":  # macOS
            guide += "  macOS Installation:\n"
            guide += "    brew install deno\n"
            guide += "    # Alternatively: brew install node\n"
        elif system == "Windows":
            guide += "  Windows Installation:\n"
            guide += "    Deno: https://deno.land/install\n"
            guide += "    Node.js: https://nodejs.org/\n"
        elif system == "Linux":
            guide += "  Linux Installation:\n"
            guide += "    Deno: curl -fsSL https://deno.land/install.sh | sh\n"
            guide += "    # Or using package manager (e.g.): sudo apt install nodejs\n"
        else:
            guide += "  Visit https://deno.land or https://nodejs.org for installation instructions.\n"

        guide += "\nAfter installation, restart the application to enable full YouTube download capabilities.\n"
        return guide

    # ========== Core ArchiverPlugin Interface (Required) ==========

    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="YouTubePlugin",
            version="1.0.0",
            description="Archives YouTube videos from subscribed channels using yt-dlp",
            media_types=[MediaType.YOUTUBE],
            author="Haven Team",
            default_jobs=[
                DefaultJobConfig(
                    job_name="poll_channels",
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
            # No fallback - require global config
            logger.error("Global download_directory not configured in AppConfig")
            db.close()
            return False
        db.close()
        os.makedirs(self.download_dir, exist_ok=True)

        # Ensure yt-dlp is available
        try:
            result = subprocess.run(
                ["yt-dlp", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                logger.error("yt-dlp not found. Please install it first.")
                return False
            logger.info(f"yt-dlp version: {result.stdout.strip()}")
        except FileNotFoundError:
            logger.error("yt-dlp not found. Please install it first.")
            return False
        except subprocess.TimeoutExpired:
            logger.error("yt-dlp command timed out")
            return False
        except Exception as e:
            logger.error(f"Error checking yt-dlp: {e}")
            return False

        # Detect JavaScript runtime for yt-dlp
        runtime_type, runtime_path = self._detect_js_runtime()
        if runtime_type and runtime_path:
            self.js_runtime_type = runtime_type
            self.js_runtime_path = runtime_path
            logger.info(f"JavaScript runtime available: {runtime_type} (yt-dlp will use it with EJS challenge solver)")
        else:
            logger.warning("YouTube downloads are in basic mode: JavaScript runtime not detected.")
            logger.warning("Currently: only basic download formats will work (lower quality, may fail for some videos).")
            logger.warning(self._get_runtime_installation_guide())

        # Configure retry behavior for YouTube downloads
        self.configure_retry(
            max_retries=3,
            retry_delay_seconds=2.0,
            retryable_patterns=[
                "JavaScript runtime",
                "Requested format is not available",
                "Sign in to confirm your age",
                "HTTP Error 429",
                "Too Many Requests",
                "network error",
                "connection timeout",
                "read timeout",
            ],
            non_retryable_patterns=[
                "Video unavailable",
                "Private video",
                "This video is not available",
                "404: Not Found",
                "copyright claim",
            ]
        )
        
        self.initialized = True
        logger.info("YouTubePlugin initialized")
        return True

    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover new videos from all subscribed channels.

        This is the standard operation used by the job scheduler.
        It polls ALL enabled channels and returns new videos.

        Channels are read from plugins.config JSON column (generic table approach).
        """
        if not self.initialized:
            logger.error("YouTubePlugin not initialized")
            return []

        try:
            db = next(get_db_session())

            # Get plugin config with channels
            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                logger.info("No YouTube plugin config found")
                return []

            # Get enabled channels from config
            all_channels = plugin.config.get("channels", [])
            enabled_channels = [ch for ch in all_channels if ch.get("enabled", True)]

            logger.info(f"Total channels in config: {len(all_channels)}, Enabled: {len(enabled_channels)}")
            for ch in all_channels:
                logger.info(f"Channel '{ch.get('name', 'Unknown')}' - enabled={ch.get('enabled', True)}, url={ch.get('channel_url')}")

            if not enabled_channels:
                logger.info("No enabled channels to poll")
                return []

            logger.info(f"Polling {len(enabled_channels)} channels for new videos")

            new_sources = []

            for channel_config in enabled_channels:
                try:
                    # Get channel videos using yt-dlp
                    videos = await self._get_channel_videos_from_url(channel_config.get("channel_url"))

                    channel_name = channel_config.get("name", "Unknown")
                    logger.info(f"Found {len(videos)} videos for channel {channel_name}")

                    # Get seen video IDs from plugin config to avoid duplicates
                    seen_videos = plugin.config.get("_seen_videos", {})
                    if isinstance(seen_videos, dict):
                        # Convert lists back to sets for comparison
                        seen_videos = {k: set(v) if isinstance(v, list) else v for k, v in seen_videos.items()}

                    # Process each video
                    for video in videos:
                        video_id = video["id"]

                        # Skip if already seen
                        if video_id in seen_videos.get(channel_name, set()):
                            continue

                        # Add to seen videos
                        if channel_name not in seen_videos:
                            seen_videos[channel_name] = set()
                        seen_videos[channel_name].add(video_id)

                        # Create media source
                        source = MediaSource(
                            source_id=video_id,
                            media_type=MediaType.YOUTUBE,
                            uri=video["url"],
                            metadata={
                                "title": video.get("title"),
                                "channel_name": channel_name,
                                "channel_url": channel_config.get("channel_url"),
                                "duration": video.get("duration"),
                                "thumbnail": video.get("thumbnail"),
                                "upload_date": video.get("upload_date"),
                                # Map frontend settings to yt-dlp parameters
                                "video_format": channel_config.get("video_format", "mp4"),  # Container: mp4, webm, mkv
                                "video_quality": channel_config.get("video_quality", "best"),  # Quality: best, 1080p, 720p, 480p
                                "download_subtitles": channel_config.get("download_subtitles", False),
                            },
                            priority="normal",
                            estimated_size_bytes=video.get("filesize"),
                            estimated_duration_seconds=video.get("duration"),
                        )
                        new_sources.append(source)

                    # Update last polled timestamp in config
                    channel_config["last_polled_at"] = datetime.utcnow().isoformat()

                    # Update seen videos in config (convert sets back to lists for JSON serialization)
                    config_copy = plugin.config.copy()
                    config_copy["_seen_videos"] = {k: list(v) for k, v in seen_videos.items()}

                    # Update the channels array with the updated channel_config
                    channels_copy = []
                    for ch in config_copy.get("channels", []):
                        if ch.get("channel_url") == channel_config.get("channel_url"):
                            channels_copy.append(channel_config)
                        else:
                            channels_copy.append(ch)
                    config_copy["channels"] = channels_copy

                    plugin.config = config_copy

                except Exception as e:
                    logger.error(f"Error polling channel {channel_config.get('name', 'Unknown')}: {e}")
                    continue

            db.commit()  # Commit after processing all channels

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
        """Archive a YouTube video (standard operation)."""
        if source.media_type != MediaType.YOUTUBE:
            return ArchiveResult(
                success=False,
                error=f"Unsupported media type: {source.media_type}"
            )

        if not self.initialized:
            return ArchiveResult(
                success=False,
                error="YouTubePlugin not initialized"
            )

        video_id = source.source_id
        logger.info(f"Archiving YouTube video: {video_id}")

        try:
            db = next(get_db_session())

            # Get plugin config to check if already archived
            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return ArchiveResult(
                    success=False,
                    error="YouTube plugin not found"
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

            # Download video
            download_result = await self._download_video(source)

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
                    current_time = datetime.utcnow()
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
                        error="Downloaded file does not contain valid video frames. This may indicate the video was downloaded as audio-only or the download was corrupted."
                    )
                
                logger.info(f"✓ Video validation successful: {file_path} contains valid video content")

                # Mark as archived in config
                _archived_videos = plugin.config.get("_archived_videos", {})
                _archived_videos[video_id] = {
                    "video_id": video_id,
                    "title": source.metadata.get("title"),
                    "output_path": download_result["output_path"],
                    "file_size_bytes": download_result.get("file_size_bytes"),
                    "archived_at": datetime.utcnow().isoformat(),
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
                    creator_handle=source.metadata.get("channel_name"),
                    source_uri=source.uri,
                    # Plugin metadata fields - stores YouTube-specific data without dedicated tables
                    plugin_name="YouTubePlugin",
                    plugin_source_id=video_id,
                    plugin_metadata={
                        "upload_date": source.metadata.get("upload_date"),
                        "video_format": source.metadata.get("video_format"),  # Container
                        "video_quality": source.metadata.get("video_quality"),  # Quality
                        "download_subtitles": source.metadata.get("download_subtitles"),
                    },
                    plugin_discovered_at=datetime.utcnow(),
                    plugin_auto_downloaded=True,
                    plugin_subscriptions=[source.metadata.get("channel_name")],
                )
                db.add(new_video_entry)
                db.commit()
                db.refresh(new_video_entry)

                logger.info(f"Created main Video entry for YouTube video: {new_video_entry.id}")

                return ArchiveResult(
                    success=True,
                    output_path=download_result["output_path"],
                    file_size_bytes=download_result.get("file_size_bytes"),
                    duration_seconds=video_duration or 0,  # Use calculated duration
                    metadata={
                        "video_id": video_id,
                        "title": source.metadata.get("title"),
                        "channel": source.metadata.get("channel_name"),
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
            True if plugin is operational (even in degraded mode without JS runtime),
            False if critical dependencies are missing.
        """
        try:
            # Check yt-dlp availability (critical)
            result = subprocess.run(
                ["yt-dlp", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                logger.error("Health check failed: yt-dlp not available")
                return False

            # Check if global download directory exists (critical)
            if not self.download_dir:
                logger.error("Health check failed: download directory not configured")
                return False

            if not os.path.exists(self.download_dir):
                logger.error(f"Health check failed: download directory does not exist: {self.download_dir}")
                return False

            # Check JS runtime availability (non-critical, warn if missing)
            if self._is_js_runtime_available():
                logger.info(f"Health check: Enhanced mode (using {self.js_runtime_type} runtime with EJS challenge solver)")
            else:
                logger.warning("Health check: Basic mode (no JS runtime - limited functionality)")
                logger.warning("See installation logs for guidance on enabling full YouTube extraction")

            return True
        except Exception as e:
            logger.error(f"YouTubePlugin health check failed: {e}")
            return False

    # ========== CollectionPluginMixin Operations (Standardized) ==========

    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a YouTube channel (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "YouTubePlugin",
            "operation": "subscribe",
            "params": {
                "collection_uri": "https://youtube.com/@channelname",
                "config": {"video_format": "1080p", "download_subtitles": false}
            }
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "YouTube plugin not found"
                }

            # Extract channel ID from URL
            channel_id = await self._extract_channel_id(collection_uri)
            if not channel_id:
                return {
                    "success": False,
                    "error": "Could not extract channel ID from URL"
                }

            # Get channel name if not provided in config
            channel_name = config.get("name") if config else None
            if not channel_name:
                channel_name = await self._get_channel_name(collection_uri)

            # Get current channels list
            channels = plugin.config.get("channels", [])

            # Check if already subscribed
            for ch in channels:
                if ch.get("channel_url") == collection_uri:
                    return {
                        "success": False,
                        "error": "Already subscribed to this channel",
                        "collection_id": channel_id,
                        "collection_name": ch.get("name", "Unknown"),
                    }

            # Add new channel
            new_channel = {
                "name": channel_name or channel_id,
                "channel_id": channel_id,
                "channel_url": collection_uri,
                "enabled": True,
                "video_format": config.get("video_format", "mp4") if config else "mp4",  # Container: mp4, webm, mkv
                "video_quality": config.get("video_quality", "best") if config else "best",  # Quality: best, 1080p, 720p, 480p
                "download_subtitles": config.get("download_subtitles", False) if config else False,
                "auto_archive": config.get("auto_archive", True) if config else True,
                "created_at": datetime.utcnow().isoformat(),
            }

            channels.append(new_channel)

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["channels"] = channels
            plugin.config = config_copy

            db.commit()

            logger.info(f"Subscribed to channel: {new_channel['name']}")

            return {
                "success": True,
                "collection_id": channel_id,
                "collection_name": new_channel["name"],
                "collection_uri": collection_uri,
                "created_at": new_channel["created_at"],
            }

        except Exception as e:
            logger.error(f"Error subscribing to channel: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()

    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a YouTube channel (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "YouTubePlugin",
            "operation": "unsubscribe",
            "params": {"collection_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw"}
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "YouTube plugin not found"
                }

            # Find and remove channel
            channels = plugin.config.get("channels", [])
            found = False
            channel_name = "Unknown"

            for i, ch in enumerate(channels):
                if ch.get("channel_id") == collection_id or ch.get("channel_url") == collection_id:
                    channel_name = ch.get("name", "Unknown")
                    channels.pop(i)
                    found = True
                    break

            if not found:
                return {
                    "success": False,
                    "error": "Channel not found",
                }

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["channels"] = channels
            plugin.config = config_copy

            db.commit()

            logger.info(f"Unsubscribed from channel: {channel_name}")

            return {
                "success": True,
                "message": f"Unsubscribed from {channel_name}",
            }

        except Exception as e:
            logger.error(f"Error unsubscribing from channel: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()

    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all channel subscriptions (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "YouTubePlugin",
            "operation": "list_subscriptions",
            "params": {}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return []

            return plugin.config.get("channels", [])

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
            "plugin_name": "YouTubePlugin",
            "operation": "get_subscription",
            "params": {"collection_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw"}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "YouTubePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return None

            channels = plugin.config.get("channels", [])

            for ch in channels:
                if ch.get("channel_id") == collection_id or ch.get("channel_url") == collection_id:
                    return ch

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
            "channels": [],
            "max_concurrent_downloads": 3,
            "max_videos_per_channel": 50,
        }

    # ========== Private Helper Methods ==========

    async def _get_channel_videos_from_url(self, channel_url: str) -> List[Dict[str, Any]]:
        """Get videos from a YouTube channel URL using yt-dlp."""
        try:
            cmd = [
                "yt-dlp",
                "--flat-playlist",
                "--dump-json",
                "--skip-download",
                channel_url
            ]

            max_videos = self.config.get("max_videos_per_channel", 50)
            if max_videos:
                cmd.extend(["--playlist-end", str(max_videos)])

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )

            if result.returncode != 0:
                logger.error(f"yt-dlp error for channel {channel_url}: {result.stderr}")
                return []

            videos = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                try:
                    video_data = json.loads(line)
                    videos.append(video_data)
                except json.JSONDecodeError:
                    continue

            return videos

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout getting videos for channel {channel_url}")
            return []
        except Exception as e:
            logger.error(f"Error getting channel videos: {e}")
            return []

    def _build_download_command(
        self,
        source: MediaSource,
        output_template: str,
        video_format: str,
        video_quality: str,
        ffmpeg_available: bool
    ) -> Tuple[List[str], Dict[str, Any]]:
        """
        Build the yt-dlp download command based on format and quality settings.
        
        Args:
            source: MediaSource to download
            output_template: Output file template
            video_format: Container format (mp4, webm, mkv)
            video_quality: Quality setting (best, 1080p, 720p, 480p)
            ffmpeg_available: Whether FFmpeg is available for stream merging
            
        Returns:
            Tuple of (command_args, extra_context)
        """
        # Build format string based on quality setting and FFmpeg availability
        if video_quality == "best":
            # Best quality with requested container
            if ffmpeg_available:
                # Can merge separate streams for optimal quality
                format_str = f"bestvideo[ext={video_format}]+bestaudio/bestvideo+bestaudio/best[acodec!=none][ext={video_format}]/best[acodec!=none]"
            else:
                # Use combined streams only (no merging)
                format_str = f"best[vcodec!=none][acodec!=none][ext={video_format}]/best[vcodec!=none][acodec!=none]"
        else:
            # Specific quality with requested container
            # Convert "1080p" to height=1080 for yt-dlp
            height = video_quality.replace("p", "")

            if ffmpeg_available:
                # Can merge separate streams for optimized quality
                format_str = (
                    f"bestvideo[height<={height}][ext={video_format}]+bestaudio/"
                    f"bestvideo[height<={height}]+bestaudio/"
                    f"bestvideo+bestaudio"
                )
            else:
                # Use combined streams only (no merging required)
                format_str = (
                    f"best[height<={height}][vcodec!=none][acodec!=none][ext={video_format}]/"
                    f"best[height<={height}][vcodec!=none][acodec!=none]/"
                    f"best[vcodec!=none][acodec!=none]"
                )

        logger.info(f"Using yt-dlp format string: {format_str}")

        cmd = [
            "yt-dlp",
            "--format", format_str,
            "--output", output_template,
            source.uri
        ]

        # Add merge format option if container specified and FFmpeg is available
        # Only applies when using separate streams (+ merging)
        if video_format != "mp4" and ffmpeg_available:
            cmd.extend(["-S", f"ext:{video_format}"])

        # Add JavaScript runtime if available (for signature decryption)
        if self._is_js_runtime_available():
            # Use 'ejs:github' to download challenge solver script from GitHub (faster, no npm install)
            cmd.extend(["--remote-components", "ejs:github"])
            cmd.extend(["--js-runtimes", self.js_runtime_type])
            logger.info(f"Using JavaScript runtime ({self.js_runtime_type}) with EJS challenge solver for full YouTube decryption")
        else:
            logger.debug("No JS runtime available - using degraded mode")

        # Add cookie file if configured (for age-gated/bot-protected videos)
        cookie_path = self._get_cookie_file_path()
        if cookie_path:
            if self._validate_cookie_file(cookie_path):
                cmd.extend(["--cookies", cookie_path])
                logger.info("Using authentication cookies for download")
            else:
                logger.warning("Cookie file configured but invalid - downloading without authentication")

        if source.metadata.get("download_subtitles"):
            cmd.extend(["--write-subs", "--write-auto-subs", "--sub-lang", "en"])

        logger.info(f"yt-dlp command: {' '.join(cmd)}")

        extra_context = {
            "output_template": output_template,
            "video_format": video_format,
            "video_quality": video_quality,
            "ffmpeg_available": ffmpeg_available,
        }

        return (cmd, extra_context)

    def _build_fallback_command(
        self,
        source: MediaSource,
        output_template: str
    ) -> Tuple[List[str], Dict[str, Any]]:
        """
        Build a simpler fallback download command that doesn't require complex merging.
        
        Args:
            source: MediaSource to download
            output_template: Output file template
            
        Returns:
            Tuple of (command_args, extra_context)
        """
        simple_cmd = ["yt-dlp"]

        # Add JavaScript components for the fallback too
        if self._is_js_runtime_available():
            simple_cmd.extend(["--remote-components", "ejs:github", "--js-runtimes", self.js_runtime_type])

        # Add the simpler format that doesn't require complex merging
        simple_cmd.extend([
            "--format", "worst[vcodec!=none][ext=mp4]/best[vcodec!=none][ext=mp4]?/worst[vcodec!=none]",
            "--output", output_template,
            source.uri
        ])

        logger.info(f"Built fallback command: {' '.join(simple_cmd)}")

        extra_context = {
            "output_template": output_template,
            "is_fallback": True,
        }

        return (simple_cmd, extra_context)

    def _extract_output_path(
        self,
        result_stdout: str,
        channel_dir: str,
        safe_title: str,
        source_id: str
    ) -> Tuple[Optional[str], Optional[int]]:
        """
        Extract the output file path from yt-dlp stdout.
        
        Args:
            result_stdout: Standard output from yt-dlp
            channel_dir: Directory where the file should be
            safe_title: Sanitized video title
            source_id: Video source ID
            
        Returns:
            Tuple of (output_path, file_size_bytes)
        """
        output_path = None
        file_size_bytes = None

        # Look for various merge patterns in yt-dlp output
        # Common patterns include:
        # 1. [ffmpeg] Merging formats into "filename.ext"
        # 2. [Merger] Merging into "filename.ext"  
        # 3. [download] Merging formats into "filename.ext"
        # 4. The final [download] Destination: line (after merge)
        merge_patterns = [
            ("[ffmpeg] Merging formats into", "yt-dlp with ffmpeg merge"),
            ("[Merger] Merging into", "yt-dlp merger"),
            ("[download] Merging formats into", "yt-dlp download merge")
        ]
        
        for pattern, description in merge_patterns:
            for line in result_stdout.split('\n'):
                if pattern in line:
                    # Extract the final merged filename (removes quotes if present)
                    output_path = line.split(pattern)[1].strip().strip('"').strip("'")
                    logger.info(f"Found merged file via {description}: {output_path}")
                    break
            if output_path:
                break
        
        # If still no output path, look for the final download destination
        # Collect all download destinations and find the most likely video file
        if not output_path:
            download_paths = []
            for line in result_stdout.split('\n'):
                if "[download] Destination:" in line:
                    path = line.split("[download] Destination:")[1].strip()
                    download_paths.append(path)
            
            # Log all found download paths for debugging
            if download_paths:
                logger.debug(f"Found download destinations: {download_paths}")
            
            # Filter out audio-only files and find the actual video file
            # Look for files with video extensions (.mp4, .mkv, .webm, .avi, .mov, .flv)
            video_extensions = {'.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv'}
            for path in download_paths:
                ext = os.path.splitext(path)[1].lower()
                if ext in video_extensions:
                    output_path = path
                    logger.info(f"Selected video file by extension {ext}: {output_path}")
                    break
            
            # If no video file found with standard extensions, try any file that's not audio-only
            if not output_path and download_paths:
                # Filter out known audio-only extensions
                audio_extensions = {'.m4a', '.mp3', '.aac', '.wav', '.flac', '.opus', '.ogg', '.f140', '.f251'}
                for path in download_paths:
                    ext = os.path.splitext(path)[1].lower()
                    if ext not in audio_extensions:
                        output_path = path
                        logger.info(f"Selected non-audio file {ext}: {output_path}")
                        break
            
            # Last resort: use the last download destination
            if not output_path and download_paths:
                output_path = download_paths[-1]
                logger.info(f"Using last download destination: {output_path}")

        # Validate that we actually got an output path and the file exists
        # First check if the detected output path exists
        if output_path and os.path.exists(output_path):
            # Found the file at the detected path
            file_size_bytes = os.path.getsize(output_path)
            logger.info(f"Successfully downloaded video to: {output_path}")
        else:
            # File not found at detected path, search for it in the output directory
            # This handles cases where yt-dlp creates temporary files or renames files
            search_prefix = f"{safe_title}_{source_id}".lower()
            logger.info(f"Searching for files with prefix '{search_prefix}' in {channel_dir}")
            
            # Search for files matching the pattern (case-insensitive)
            matching_files = []
            try:
                file_list = os.listdir(channel_dir)
                logger.info(f"Files in directory: {file_list}")
                for file in file_list:
                    if file.lower().startswith(search_prefix):
                        file_path = os.path.join(channel_dir, file)
                        if os.path.isfile(file_path):
                            matching_files.append(file_path)
                            logger.info(f"Found matching file: {file_path}")
            except Exception as e:
                logger.error(f"Error searching for files in {channel_dir}: {e}")
                matching_files = []
            
            # Filter out small files (likely temporary/intermediate files)
            # and prioritize video files
            video_files = []
            for file_path in matching_files:
                try:
                    file_size = os.path.getsize(file_path)
                    if file_size > 1024 * 1024:  # At least 1MB (video files are larger)
                        video_files.append((file_path, file_size))
                except Exception:
                    continue
            
            # Sort by file size (largest first) - video files are usually larger than audio
            video_files.sort(key=lambda x: x[1], reverse=True)
            
            if video_files:
                output_path, file_size_bytes = video_files[0]
                logger.info(f"Found video file via search: {output_path} (size: {file_size_bytes} bytes)")
            elif matching_files:
                # Use any file if no large files found
                output_path = matching_files[0]
                file_size_bytes = os.path.getsize(output_path) if os.path.exists(output_path) else 0
                logger.info(f"Using found file (may be small/audio): {output_path}")
            else:
                # No file found at all
                output_path = None
                file_size_bytes = None

        return (output_path, file_size_bytes)

    async def _download_video(self, source: MediaSource) -> Dict[str, Any]:
        """Download a YouTube video using yt-dlp with retry logic."""
        try:
            # Always get the latest global download directory
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

            channel_name = source.metadata.get("channel_name", "Unknown")
            channel_dir = os.path.join(current_download_dir, channel_name)
            os.makedirs(channel_dir, exist_ok=True)

            # Transliterate Unicode to ASCII (preserves Japanese->romaji, Cyrillic->Latin, etc.)
            transliterated_title = unidecode(source.metadata.get("title", "video"))
            # Then sanitize the ASCII-only title
            safe_title = "".join(c for c in transliterated_title if c.isalnum() or c in (' ', '-', '_'))
            # Include video ID to ensure unique filenames
            output_template = os.path.join(channel_dir, f"{safe_title}_{source.source_id}.%(ext)s")

            # Get requested format and quality settings
            video_format = source.metadata.get("video_format", "mp4")  # Container: mp4, webm, mkv
            video_quality = source.metadata.get("video_quality", "best")  # Quality: best, 1080p, 720p, 480p

            logger.info(f"Video settings - Format (container): {video_format}, Quality: {video_quality}")

            # Check if FFmpeg is available for stream merging
            ffmpeg_available = self._is_ffmpeg_available()
            if not ffmpeg_available:
                logger.warning("FFmpeg not detected. Using combined stream formats (no merging required).")
                logger.warning("Install FFmpeg for better format quality and file size optimization:")
                logger.warning("  - macOS: brew install ffmpeg")
                logger.warning("  - Windows: Download from https://ffmpeg.org/download.html")

            # Define primary download operation
            def primary_operation():
                return self._build_download_command(
                    source, output_template, video_format, video_quality, ffmpeg_available
                )

            # Define fallback operation (simpler format)
            def fallback_operation():
                return self._build_fallback_command(source, output_template)

            # Execute download with retry logic using RetryableMixin
            logger.info(f"Downloading video: {source.uri}")
            retry_result = await self.execute_with_retry(
                operation=primary_operation,
                fallback_strategies=[fallback_operation],
                operation_name="yt-dlp download"
            )

            if not retry_result["success"]:
                # All attempts failed
                error_msg = retry_result.get("error", "Unknown error")
                
                # Add helpful info about JavaScript runtime if relevant
                if "JavaScript runtime" in error_msg or "Requested format" in error_msg:
                    error_msg += "\n\n" + self._get_runtime_installation_guide()
                
                return {
                    "success": False,
                    "error": error_msg,
                }

            # Download succeeded, extract output path from result
            result_stdout = retry_result.get("stdout", "")
            result_stderr = retry_result.get("stderr", "")
            
            # Debug: log yt-dlp output for troubleshooting
            logger.debug(f"yt-dlp stdout (first 10 lines): {list(result_stdout.split('\\n')[:10])}")

            # Extract output path from yt-dlp output
            output_path, file_size_bytes = self._extract_output_path(
                result_stdout, channel_dir, safe_title, source.source_id
            )

            if not output_path:
                error_msg = f"Download completed but no valid file found. Check yt-dlp output for details."
                logger.error(error_msg)
                logger.debug(f"yt-dlp stderr: {result_stderr}")
                return {
                    "success": False,
                    "error": error_msg,
                }

            return {
                "success": True,
                "output_path": output_path,
                "file_size_bytes": file_size_bytes,
            }

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout downloading video {source.source_id}")
            return {
                "success": False,
                "error": "Download timeout exceeded",
            }
        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
            }

    async def _extract_channel_id(self, channel_url: str) -> Optional[str]:
        """Extract channel ID from a YouTube channel URL."""
        try:
            cmd = [
                "yt-dlp",
                "--dump-json",
                "--flat-playlist",
                "--skip-download",
                channel_url
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                return None

            data = json.loads(result.stdout.strip())
            return data.get("channel_id") or data.get("channel")

        except Exception as e:
            logger.error(f"Error extracting channel ID: {e}")
            return None

    async def _get_channel_name(self, channel_url: str) -> Optional[str]:
        """Get channel name from URL."""
        try:
            cmd = [
                "yt-dlp",
                "--dump-json",
                "--flat-playlist",
                "--skip-download",
                channel_url
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                return None

            data = json.loads(result.stdout.strip())
            return data.get("channel") or data.get("uploader")
        except Exception as e:
            logger.error(f"Error getting channel name: {e}")
            return None

    def _is_ffmpeg_available(self) -> bool:
        """
        Check if FFmpeg is installed and accessible.

        Returns:
            True if FFmpeg is available and can be executed, False otherwise
        """
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            return False

    # ========== Cookie Management Methods ==========

    def _get_cookie_file_path(self) -> Optional[str]:
        """
        Get the configured YouTube cookie file path from plugin config.

        Returns:
            Path to cookie file, or None if not configured.
        """
        cookie_path = self.config.get("cookie_file_path")
        return cookie_path

    def _validate_cookie_file(self, cookie_path: Optional[str]) -> bool:
        """
        Validate that the cookie file exists and is readable.

        Args:
            cookie_path: Path to the cookie file.

        Returns:
            True if cookie file is valid, False otherwise.
        """
        if not cookie_path:
            return False

        if not os.path.exists(cookie_path):
            logger.warning(f"Cookie file not found: {cookie_path}")
            return False

        if not os.path.isfile(cookie_path):
            logger.warning(f"Cookie path exists but is not a file: {cookie_path}")
            return False

        # Check if file is readable
        try:
            with open(cookie_path, 'r') as f:
                # Read first 10 characters to verify we can access the file
                # (Netscape format typically starts with "# Netscape HTTP Cookie File")
                first_line = f.readline()
                if first_line and ("# Netscape" in first_line or "http" in first_line):
                    logger.info(f"Valid cookie file loaded: {cookie_path}")
                    return True
                # File exists and is readable, but might not be Netscape format
                # Still allow it - yt-dlp will validate format
                return True
        except PermissionError:
            logger.error(f"Cookie file exists but cannot be read: {cookie_path}")
            return False
        except Exception as e:
            logger.warning(f"Warning validating cookie file: {e}")
            return False

    def set_cookie_file(self, cookie_file_path: Optional[str]) -> bool:
        """
        Set the YouTube cookie file path for authentication.

        This allows downloading age-gated and bot-protected videos.

        Args:
            cookie_file_path: Absolute path to cookie file in Netscape format.
                             Set to None to disable cookie support.

        Returns:
            True if cookie file was set successfully, False otherwise.

        Note:
            Cookies should be exported in Netscape cookie format from your browser.
            See: https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies
        """
        if cookie_file_path is None:
            # Disable cookie support
            if "cookie_file_path" in self.config:
                del self.config["cookie_file_path"]
            logger.info("Cookie support disabled")
            return True

        # Validate absolute path
        if not os.path.isabs(cookie_file_path):
            logger.error("Cookie file path must be absolute")
            return False

        # Validate file exists and is accessible
        if not self._validate_cookie_file(cookie_file_path):
            logger.error(f"Invalid cookie file: {cookie_file_path}")
            return False

        # Store in config
        self.config["cookie_file_path"] = cookie_file_path
        logger.info(f"Cookie file configured: {cookie_file_path}")
        logger.info("This enables downloading age-gated and bot-protected videos")

        # Provide guidance for users
        logger.info("To export cookies from Chrome/Firefox, see:")
        logger.info("  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies")

        return True

    def _get_cookie_guidance(self) -> str:
        """
        Get guidance for extracting YouTube cookies from browsers.

        Returns:
            String with instructions for cookie extraction.
        """
        guidance = "\nYouTube Authentication Help:\n\n"
        guidance += "To download age-gated videos, you need to authenticate with cookies:\n\n"
        guidance += "Option 1 - Browser Extension (Recommended):\n"
        guidance += "  1. Install 'Get cookies.txt LOCALLY' extension (Chrome/Firefox)\n"
        guidance += "  2. Open YouTube and sign in\n"
        guidance += "  3. Click the extension icon and export cookies\n"
        guidance += "  4. Save the file and provide its path via set_cookie_file()\n\n"
        guidance += "Option 2 - yt-dlp Browser Export:\n"
        guidance += "  1. Run: yt-dlp --cookies-from-browser chrome\n"
        guidance += "  2. Extract cookies and save to file\n"
        guidance += "  3. Use the saved cookie file path\n\n"
        guidance += "See https://github.com/yt-dlp/yt-dlp/wiki/Extractors for details.\n"
        return guidance


    # ========== Additional Mixin Methods ==========

    async def discover_from_subscription(
        self, collection_id: str
    ) -> List[MediaSource]:
        """
        Discover videos from a specific channel.

        This is a stub implementation required by CollectionPluginMixin.
        The actual polling happens in discover_sources() which reads from plugins.config.
        """
        # Channel discovery is handled in discover_sources() which reads all enabled channels
        # This method exists for API compatibility but doesn't do anything in this implementation
        return []

    async def archive_from_subscription(
        self, collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all videos from a channel.

        This is a stub implementation required by CollectionPluginMixin.
        """
        # Channel archiving is handled via discover_sources + archive
        # This method exists for API compatibility
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
                Video.plugin_name == "YouTubePlugin"
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
            logger.error(f"Error listing YouTube sources: {e}")
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
                Video.plugin_name == "YouTubePlugin",
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
