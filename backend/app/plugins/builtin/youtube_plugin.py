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
import subprocess
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone # Import timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
)
from app.plugins.mixins import CollectionPluginMixin, ConfigurablePluginMixin

from app.models.config import AppConfig
from app.models.database import get_db as get_db_session
from app.models.plugin import Plugin as PluginModel
from app.models.video import Video, Timestamp
from app.models.analysis_job import AnalysisJob


logger = logging.getLogger(__name__)


class YouTubePlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
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
        self.config = {}
        self.initialized = False
        self.download_dir = "downloads/youtube" # Default, will be overwritten by global config

    # ========== Core ArchiverPlugin Interface (Required) ==========

    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="YouTubePlugin",
            version="1.0.0",
            description="Archives YouTube videos from subscribed channels using yt-dlp",
            media_types=[MediaType.YOUTUBE],
            author="Haven Team",
        )

    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration."""
        self.config = config

        # Set download directory
        db = next(get_db_session())
        app_config = db.query(AppConfig).first()
        if app_config and app_config.download_directory:
            self.download_dir = app_config.download_directory
        else:
            self.download_dir = config.get("download_dir", "downloads/youtube")
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
                file_path = download_result["output_path"]
                file_size = download_result.get("file_size_bytes")
                file_extension = os.path.splitext(file_path)[1].lstrip('.') if file_path else None

                new_video_entry = Video(
                    path=file_path,
                    title=source.metadata.get("title"),
                    duration=source.estimated_duration_seconds,
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
                    duration_seconds=source.estimated_duration_seconds,
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
        """Check if plugin is healthy (standard operation)."""
        try:
            result = subprocess.run(
                ["yt-dlp", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                return False

            if not os.path.exists(self.download_dir):
                return False

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
        return {
            "download_dir": self.download_dir,
            **self.config
        }

    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)

        if "download_dir" in config:
            self.download_dir = config["download_dir"]
            os.makedirs(self.download_dir, exist_ok=True)

        logger.info(f"Configuration updated: {config}")
        return True

    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "channels": [],
            "max_concurrent_downloads": 3,
            "download_dir": self.download_dir,
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

    async def _download_video(self, source: MediaSource) -> Dict[str, Any]:
        """Download a YouTube video using yt-dlp."""
        try:
            channel_name = source.metadata.get("channel_name", "Unknown")
            channel_dir = os.path.join(self.download_dir, channel_name)
            os.makedirs(channel_dir, exist_ok=True)

            safe_title = "".join(c for c in source.metadata.get("title", "video") if c.isalnum() or c in (' ', '-', '_'))
            output_template = os.path.join(channel_dir, f"{safe_title}.%(ext)s")

            # Get requested format and quality settings
            video_format = source.metadata.get("video_format", "mp4")  # Container: mp4, webm, mkv
            video_quality = source.metadata.get("video_quality", "best")  # Quality: best, 1080p, 720p, 480p

            logger.info(f"Video settings - Format (container): {video_format}, Quality: {video_quality}")

            # Build format string based on quality setting
            # Format syntax: quality[ext=container] for best match
            if video_quality == "best":
                # Best quality with requested container
                format_str = f"best[ext={video_format}]/best"
            else:
                # Specific quality with requested container
                # Convert "1080p" to height=1080 for yt-dlp
                height = video_quality.replace("p", "")
                format_str = f"bestvideo[height<={height}][ext={video_format}]+bestaudio/bestvideo[height<={height}]/best[height<={height}][ext={video_format}]/best[height<={height}]"

            logger.info(f"Using yt-dlp format string: {format_str}")

            cmd = [
                "yt-dlp",
                "--format", format_str,
                "--output", output_template,
                source.uri
            ]

            # Add merge format if container specified and not mp4
            if video_format != "mp4":
                cmd.extend(["-S", f"ext:{video_format}"])

            logger.info(f"yt-dlp command: {' '.join(cmd)}")

            if source.metadata.get("download_subtitles"):
                cmd.extend(["--write-subs", "--write-auto-subs", "--sub-lang", "en"])

            logger.info(f"Downloading video: {source.uri}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=3600
            )

            if result.returncode != 0:
                stderr_output = result.stderr

                # Check if the error is related to JavaScript runtime
                if "JavaScript runtime" in stderr_output or "Requested format is not available" in stderr_output:
                    logger.warning(f"Initial format failed, trying simpler format without video+audio merge")
                    # Try a much simpler format that doesn't require JS signature decoding
                    simple_cmd = [
                        "yt-dlp",
                        "--format", "worst[ext=mp4]/best[ext=mp4]?/worst",
                        "--output", output_template,
                        source.uri
                    ]

                    logger.info(f"Retrying with simpler format: {' '.join(simple_cmd)}")
                    fallback_result = subprocess.run(
                        simple_cmd,
                        capture_output=True,
                        text=True,
                        timeout=3600
                    )

                    if fallback_result.returncode == 0:
                        result = fallback_result
                        logger.info("✓ Fallback format succeeded!")
                    else:
                        # Fallback failed, use original error
                        logger.error(f"Fallback also failed: {fallback_result.stderr}")
                        stderr_output = result.stderr + "\n\n" + fallback_result.stderr

                        # Add helpful info about JavaScript runtime
                        install_hint = """
\n\n\tYouTube downloads may fail without a JavaScript runtime.
\tTo fix this, install Deno or Node.js:
\t\tbrew install deno  # or
\t\tbrew install node

\tThen specify it in yt-dlp config or add --js-runtimes deno to commands.
\tFor more info: https://github.com/yt-dlp/yt-dlp/wiki/EJS"""
                        stderr_output += install_hint

            # Execution continues here only if we didn't hit an error above
            # (either original succeeded, or fallback succeeded)

            output_path = None
            for line in result.stdout.split('\n'):
                if "[download] Destination:" in line:
                    output_path = line.split("[download] Destination:")[1].strip()

            file_size_bytes = None
            if output_path and os.path.exists(output_path):
                file_size_bytes = os.path.getsize(output_path)

            logger.info(f"Successfully downloaded video to: {output_path}")

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
