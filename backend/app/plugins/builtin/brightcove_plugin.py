"""
Brightcove archiver plugin for Haven Player.

This plugin provides video archiving functionality for Brightcove-powered
streaming sites. It uses the Brightcove Beacon API for playlist discovery
and the Edge Playback API for stream URL resolution.

Default configuration targets The Den (watchentertheden.com) skateboard content.

Features:
- Configurable for any Brightcove-powered site
- Default preset for The Den
- Playlist pagination support
- Asset ID to video ID resolution
- HLS stream downloading via yt-dlp
- Deduplication via seen videos tracking
- Rate limiting and retry logic
"""

import asyncio
import json
import logging
import os
import subprocess
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

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
from app.plugins.builtin.brightcove_config import (
    BrightcoveSourceConfig,
    BrightcovePluginConfig,
    get_default_config,
    get_the_den_config,
)
from app.plugins.builtin.brightcove_api_client import (
    BrightcoveAPIClient,
    AssetInfo,
)

from app.models.config import AppConfig
from app.models.database import get_db as get_db_session
from app.models.plugin import Plugin as PluginModel
from app.models.video import Video
from app.models.analysis_job import AnalysisJob
from app.utils.video import get_video_duration
from app.utils.video.video_file_validator import is_video_content


logger = logging.getLogger(__name__)


class BrightcovePlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin, RetryableMixin):
    """
    Brightcove video archiver plugin.
    
    Supports any Brightcove-powered streaming site through configuration.
    Default config targets The Den (watchentertheden.com).
    
    Uses yt-dlp for HLS stream downloading and follows Haven Player's
    plugin architecture with subscription-based source management.
    """
    
    def __init__(self):
        """Initialize the Brightcove plugin."""
        # Initialize RetryableMixin
        super().__init__()
        
        self.config: Dict[str, Any] = {}
        self.initialized = False
        self.download_dir: Optional[str] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._api_clients: Dict[str, BrightcoveAPIClient] = {}
    
    # ========== Core ArchiverPlugin Interface ==========
    
    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="BrightcovePlugin",
            version="1.0.0",
            description="Archives videos from Brightcove-powered streaming sites (default: The Den)",
            media_types=[MediaType.HTTP],
            author="Haven Team",
            default_jobs=[
                DefaultJobConfig(
                    job_name="poll_brightcove_sources",
                    schedule="0 */6 * * *",  # Every 6 hours
                    method="discover_sources",
                    on_success="archive_all",
                    config={},
                    enabled=True
                )
            ]
        )
    
    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration.
        
        Args:
            config: Plugin configuration dictionary
            
        Returns:
            True if initialization succeeded, False otherwise
        """
        self.config = config or get_default_config()
        
        # Set download directory from global config
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
        
        # Verify yt-dlp is available
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
        
        # Create HTTP session for API requests
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=60),
            headers={
                "User-Agent": "HavenPlayer-BrightcovePlugin/1.0",
                "Accept": "application/json",
            }
        )
        
        # Configure retry behavior
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
                "Video not found",
                "Invalid URL",
            ]
        )
        
        # Initialize API clients for each source
        await self._init_api_clients()
        
        self.initialized = True
        logger.info("BrightcovePlugin initialized successfully")
        return True
    
    async def _init_api_clients(self) -> None:
        """Initialize API clients for all configured sources."""
        sources = self.config.get("sources", [])
        for source_dict in sources:
            try:
                config = BrightcoveSourceConfig(**source_dict)
                client = BrightcoveAPIClient(config, self._session)
                self._api_clients[config.name] = client
                logger.info(f"Initialized API client for source: {config.name}")
            except Exception as e:
                logger.error(f"Failed to initialize API client for source: {e}")
    
    async def discover_sources(self) -> List[MediaSource]:
        """Discover new videos from all enabled sources.
        
        This method polls all enabled Brightcove sources and returns
        new videos that haven't been seen before.
        
        Returns:
            List of MediaSource objects representing new videos
        """
        if not self.initialized:
            logger.error("BrightcovePlugin not initialized")
            return []
        
        if not self._session:
            logger.error("HTTP session not initialized")
            return []
        
        try:
            db = next(get_db_session())
            
            # Get plugin config
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin or not plugin.config:
                logger.info("No Brightcove plugin config found")
                return []
            
            # Get enabled sources
            all_sources = plugin.config.get("sources", [])
            enabled_sources = [
                s for s in all_sources if s.get("enabled", True)
            ]
            
            if not enabled_sources:
                logger.info("No enabled Brightcove sources to poll")
                return []
            
            logger.info(f"Polling {len(enabled_sources)} Brightcove sources")
            
            new_sources = []
            
            for source_dict in enabled_sources:
                try:
                    source_name = source_dict.get("name", "unknown")
                    logger.info(f"Discovering from source: {source_name}")
                    
                    source_media = await self._discover_from_source(
                        source_dict, plugin.config, db
                    )
                    new_sources.extend(source_media)
                    
                except Exception as e:
                    logger.error(f"Error polling source {source_dict.get('name')}: {e}")
                    continue
            
            db.commit()
            logger.info(f"Discovered {len(new_sources)} new videos")
            return new_sources
            
        except Exception as e:
            logger.error(f"Error discovering sources: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
        finally:
            db.close()
    
    async def _discover_from_source(
        self,
        source_dict: Dict[str, Any],
        plugin_config: Dict[str, Any],
        db: Session
    ) -> List[MediaSource]:
        """Discover videos from a single source.
        
        Args:
            source_dict: Source configuration dictionary
            plugin_config: Full plugin configuration
            db: Database session
            
        Returns:
            List of MediaSource objects for this source
        """
        source_name = source_dict.get("name", "unknown")
        
        # Get seen videos
        seen_videos = plugin_config.get("_seen_videos", {}).get(source_name, [])
        
        # Create config and client
        try:
            config = BrightcoveSourceConfig(**source_dict)
        except Exception as e:
            logger.error(f"Invalid config for source {source_name}: {e}")
            return []
        
        client = BrightcoveAPIClient(config, self._session)
        
        # Get all assets from playlist
        assets = await client.get_all_assets()
        logger.info(f"Found {len(assets)} assets from source {source_name}")
        
        new_sources = []
        
        for asset in assets:
            # Skip if already seen
            if asset.asset_id in seen_videos:
                continue
            
            # Add to seen videos
            seen_videos.append(asset.asset_id)
            
            # Resolve asset to get video ID and stream URL
            await client.resolve_asset(asset)
            
            if not asset.stream_url:
                logger.warning(f"No stream URL for asset {asset.asset_id}")
                continue
            
            # Create media source
            media_source = MediaSource(
                source_id=f"{source_name}:{asset.asset_id}",
                media_type=MediaType.HTTP,
                uri=asset.stream_url,
                metadata={
                    "asset_id": asset.asset_id,
                    "video_id": asset.video_id,
                    "title": asset.title,
                    "description": asset.description,
                    "duration_seconds": asset.duration_seconds,
                    "thumbnail_url": asset.thumbnail_url,
                    "source_name": source_name,
                    "source_display_name": config.display_name,
                    "video_format": config.output_format,
                    "video_quality": config.quality_preference,
                    "raw_metadata": asset.metadata,
                },
                priority="normal",
                estimated_duration_seconds=asset.duration_seconds,
            )
            new_sources.append(media_source)
        
        # Update seen videos in config
        plugin_config_copy = plugin_config.copy()
        if "_seen_videos" not in plugin_config_copy:
            plugin_config_copy["_seen_videos"] = {}
        plugin_config_copy["_seen_videos"][source_name] = seen_videos
        
        # Update source last polled timestamp
        for i, s in enumerate(plugin_config_copy.get("sources", [])):
            if s.get("name") == source_name:
                plugin_config_copy["sources"][i]["last_polled_at"] = datetime.now(timezone.utc).isoformat()
                break
        
        # Update plugin config
        plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
        plugin_result = db.execute(plugin_stmt)
        plugin_model = plugin_result.scalar_one_or_none()
        if plugin_model:
            plugin_model.config = plugin_config_copy
        
        return new_sources
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        """Archive a video using yt-dlp.
        
        Args:
            source: MediaSource to archive
            
        Returns:
            ArchiveResult with success status and file information
        """
        if source.media_type != MediaType.HTTP:
            return ArchiveResult(
                success=False,
                error=f"Unsupported media type: {source.media_type}"
            )
        
        if not self.initialized:
            return ArchiveResult(
                success=False,
                error="BrightcovePlugin not initialized"
            )
        
        video_id = source.source_id
        asset_id = source.metadata.get("asset_id", video_id)
        logger.info(f"Archiving video: {asset_id}")
        
        try:
            db = next(get_db_session())
            
            # Get plugin config to check if already archived
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                return ArchiveResult(
                    success=False,
                    error="Brightcove plugin not found"
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
                    metadata={"video_id": video_id, "already_archived": True},
                )
            
            # Download video
            download_result = await self._download_video(source)
            
            if download_result["success"]:
                file_path = download_result["output_path"]
                
                # Validate downloaded file
                logger.info(f"Validating downloaded file: {file_path}")
                if not is_video_content(file_path):
                    logger.error(f"Downloaded file {file_path} does not contain valid video frames")
                    
                    # Clean up invalid file
                    try:
                        if os.path.exists(file_path):
                            os.remove(file_path)
                    except Exception as cleanup_error:
                        logger.error(f"Error cleaning up file: {cleanup_error}")
                    
                    # Record failure
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
                        error="Downloaded file does not contain valid video frames"
                    )
                
                logger.info(f"✓ Video validation successful: {file_path}")
                
                # Mark as archived
                file_size = download_result.get("file_size_bytes")
                _archived_videos = plugin.config.get("_archived_videos", {})
                _archived_videos[video_id] = {
                    "video_id": video_id,
                    "asset_id": asset_id,
                    "title": source.metadata.get("title"),
                    "output_path": file_path,
                    "file_size_bytes": file_size,
                    "archived_at": datetime.now(timezone.utc).isoformat(),
                }
                
                config_copy = plugin.config.copy()
                config_copy["_archived_videos"] = _archived_videos
                plugin.config = config_copy
                db.commit()
                
                # Create Video table entry
                file_extension = os.path.splitext(file_path)[1].lstrip('.') if file_path else None
                video_duration = source.estimated_duration_seconds
                if not video_duration or video_duration == 0:
                    video_duration = get_video_duration(file_path)
                
                new_video = Video(
                    path=file_path,
                    title=source.metadata.get("title"),
                    duration=video_duration or 0,
                    thumbnail_path=source.metadata.get("thumbnail_url"),
                    file_size=file_size,
                    file_extension=file_extension,
                    mime_type=f"video/{file_extension}" if file_extension else None,
                    creator_handle=source.metadata.get("source_display_name"),
                    source_uri=source.uri,
                    plugin_name="BrightcovePlugin",
                    plugin_source_id=video_id,
                    plugin_metadata={
                        "asset_id": asset_id,
                        "video_id": source.metadata.get("video_id"),
                        "source_name": source.metadata.get("source_name"),
                        "video_format": source.metadata.get("video_format"),
                        "video_quality": source.metadata.get("video_quality"),
                    },
                    plugin_discovered_at=datetime.now(timezone.utc),
                    plugin_auto_downloaded=True,
                    plugin_subscriptions=[source.metadata.get("source_name")],
                )
                db.add(new_video)
                db.commit()
                db.refresh(new_video)
                
                logger.info(f"Created Video entry: {new_video.id}")
                
                return ArchiveResult(
                    success=True,
                    output_path=file_path,
                    file_size_bytes=file_size,
                    duration_seconds=video_duration or 0,
                    metadata={
                        "video_id": video_id,
                        "asset_id": asset_id,
                        "title": source.metadata.get("title"),
                        "source": source.metadata.get("source_name"),
                        "main_video_id": new_video.id
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
    
    async def _download_video(self, source: MediaSource) -> Dict[str, Any]:
        """Download a video using yt-dlp.
        
        Args:
            source: MediaSource to download
            
        Returns:
            Dict with success status, output_path, and file_size_bytes
        """
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
            
            # Create source-specific directory
            source_name = source.metadata.get("source_name", "brightcove")
            source_dir = os.path.join(current_download_dir, "brightcove", source_name)
            os.makedirs(source_dir, exist_ok=True)
            
            # Create safe filename
            safe_title = "".join(
                c for c in source.metadata.get("title", "video")
                if c.isalnum() or c in (' ', '-', '_')
            ).strip()[:50]
            
            asset_id = source.metadata.get("asset_id", source.source_id)
            file_extension = source.metadata.get("video_format", "mp4")
            output_path = os.path.join(
                source_dir,
                f"{safe_title}_{asset_id}.{file_extension}"
            )
            
            # Check if file already exists
            if os.path.exists(output_path):
                logger.info(f"File already exists: {output_path}")
                file_size = os.path.getsize(output_path)
                return {
                    "success": True,
                    "output_path": output_path,
                    "file_size_bytes": file_size,
                }
            
            stream_url = source.uri
            logger.info(f"Downloading video from: {stream_url}")
            
            # Build yt-dlp command
            quality = source.metadata.get("video_quality", "best")
            fmt = source.metadata.get("video_format", "mp4")
            
            if quality == "best":
                format_str = f"best[ext={fmt}]/best"
            else:
                height = quality.replace("p", "")
                format_str = f"best[height<={height}][ext={fmt}]/best[height<={height}]/best"
            
            cmd = [
                "yt-dlp",
                "--format", format_str,
                "--output", output_path,
                "--no-playlist",
                "--newline",
                stream_url
            ]
            
            logger.info(f"Running: {' '.join(cmd)}")
            
            # Execute download with retry logic
            result = await self.execute_with_retry(
                operation=lambda: (cmd, {}),
                operation_name="brightcove video download"
            )
            
            if result["success"]:
                # Get actual file size
                if os.path.exists(output_path):
                    file_size = os.path.getsize(output_path)
                    return {
                        "success": True,
                        "output_path": output_path,
                        "file_size_bytes": file_size,
                    }
                else:
                    # File might have different extension
                    base_path = output_path.rsplit(".", 1)[0] if "." in output_path else output_path
                    for ext in ["mp4", "mkv", "webm", "avi", "mov"]:
                        potential_path = f"{base_path}.{ext}"
                        if os.path.exists(potential_path):
                            file_size = os.path.getsize(potential_path)
                            return {
                                "success": True,
                                "output_path": potential_path,
                                "file_size_bytes": file_size,
                            }
                    
                    return {
                        "success": False,
                        "error": "Download completed but file not found"
                    }
            else:
                return {
                    "success": False,
                    "error": result.get("error", "Download failed")
                }
                
        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e),
            }
    
    async def health_check(self) -> bool:
        """Check if plugin is healthy.
        
        Returns:
            True if plugin is operational
        """
        try:
            # Check download directory
            if not self.download_dir:
                logger.error("Health check failed: download directory not configured")
                return False
            
            if not os.path.exists(self.download_dir):
                logger.error(f"Health check failed: download directory does not exist")
                return False
            
            # Check yt-dlp availability
            try:
                result = subprocess.run(
                    ["yt-dlp", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode != 0:
                    logger.error("Health check failed: yt-dlp not available")
                    return False
            except Exception as e:
                logger.error(f"Health check failed: yt-dlp error: {e}")
                return False
            
            # Check HTTP session
            if not self._session:
                logger.error("Health check failed: HTTP session not initialized")
                return False
            
            logger.info("Health check: BrightcovePlugin is healthy")
            return True
            
        except Exception as e:
            logger.error(f"BrightcovePlugin health check failed: {e}")
            return False
    
    # ========== CollectionPluginMixin Operations ==========
    
    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Subscribe to a Brightcove source.
        
        Args:
            collection_uri: URI format: "brightcove:source_name" or full config JSON
            config: Optional configuration for the source
            
        Returns:
            Dict with subscription info
        """
        try:
            db = next(get_db_session())
            
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                return {
                    "success": False,
                    "error": "Brightcove plugin not found"
                }
            
            # Parse collection_uri
            # Format 1: "brightcove:preset_name" (e.g., "brightcove:the_den")
            # Format 2: Full URL or custom config
            
            if collection_uri.startswith("brightcove:"):
                preset_name = collection_uri.split(":", 1)[1]
                
                if preset_name == "the_den":
                    new_source = get_the_den_config()
                else:
                    return {
                        "success": False,
                        "error": f"Unknown preset: {preset_name}"
                    }
            else:
                # Custom source configuration
                if not config:
                    return {
                        "success": False,
                        "error": "Configuration required for custom source"
                    }
                
                try:
                    new_source = BrightcoveSourceConfig(**config)
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"Invalid configuration: {e}"
                    }
            
            # Check if source already exists
            sources = plugin.config.get("sources", [])
            for s in sources:
                if s.get("name") == new_source.name:
                    return {
                        "success": False,
                        "error": f"Source '{new_source.name}' already exists",
                        "collection_id": new_source.name,
                    }
            
            # Add new source
            sources.append(new_source.model_dump())
            
            config_copy = plugin.config.copy()
            config_copy["sources"] = sources
            plugin.config = config_copy
            
            db.commit()
            
            logger.info(f"Subscribed to Brightcove source: {new_source.name}")
            
            return {
                "success": True,
                "collection_id": new_source.name,
                "collection_name": new_source.display_name,
                "collection_uri": f"brightcove:{new_source.name}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            
        except Exception as e:
            logger.error(f"Error subscribing to source: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()
    
    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """Unsubscribe from a Brightcove source.
        
        Args:
            collection_id: Source name to unsubscribe from
            
        Returns:
            Dict with result
        """
        try:
            db = next(get_db_session())
            
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                return {
                    "success": False,
                    "error": "Brightcove plugin not found"
                }
            
            sources = plugin.config.get("sources", [])
            found = False
            source_name = "Unknown"
            
            for i, s in enumerate(sources):
                if s.get("name") == collection_id:
                    source_name = s.get("display_name", collection_id)
                    sources.pop(i)
                    found = True
                    break
            
            if not found:
                return {
                    "success": False,
                    "error": "Source not found"
                }
            
            config_copy = plugin.config.copy()
            config_copy["sources"] = sources
            plugin.config = config_copy
            
            db.commit()
            
            logger.info(f"Unsubscribed from Brightcove source: {source_name}")
            
            return {
                "success": True,
                "message": f"Unsubscribed from {source_name}",
            }
            
        except Exception as e:
            logger.error(f"Error unsubscribing from source: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()
    
    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """List all Brightcove source subscriptions.
        
        Returns:
            List of source configuration dictionaries
        """
        try:
            db = next(get_db_session())
            
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin or not plugin.config:
                return []
            
            return plugin.config.get("sources", [])
            
        except Exception as e:
            logger.error(f"Error listing subscriptions: {e}")
            return []
        finally:
            db.close()
    
    async def get_subscription(self, collection_id: str) -> Optional[Dict[str, Any]]:
        """Get subscription details.
        
        Args:
            collection_id: Source name
            
        Returns:
            Source configuration dictionary or None
        """
        try:
            db = next(get_db_session())
            
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin or not plugin.config:
                return None
            
            sources = plugin.config.get("sources", [])
            for s in sources:
                if s.get("name") == collection_id:
                    return s
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting subscription: {e}")
            return None
        finally:
            db.close()
    
    async def discover_from_subscription(
        self,
        collection_id: str
    ) -> List[MediaSource]:
        """Discover videos from a specific subscription.
        
        Args:
            collection_id: Source name to discover from
            
        Returns:
            List of MediaSource objects
        """
        # Implementation is handled by discover_sources with source filtering
        # This method is required by CollectionPluginMixin
        return []
    
    async def archive_from_subscription(
        self,
        collection_id: str
    ) -> List[ArchiveResult]:
        """Archive all videos from a subscription.
        
        Args:
            collection_id: Source name to archive from
            
        Returns:
            List of ArchiveResult objects
        """
        # Implementation is handled by discover_sources + archive
        # This method is required by CollectionPluginMixin
        return []
    
    # ========== ConfigurablePluginMixin Operations ==========
    
    def get_config(self) -> Dict[str, Any]:
        """Get current plugin configuration."""
        config_dict = {
            **self.config
        }
        logger.info(f"Plugin config (download_dir uses global): {self.download_dir}")
        return config_dict
    
    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)
        
        # Ignore download_directory override
        if "download_directory" in config:
            logger.warning("Ignoring download_directory - uses global AppConfig only")
            del config["download_directory"]
        
        logger.info(f"Configuration updated: {config}")
        return True
    
    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return get_default_config()
    
    # ========== Additional Mixin Methods ==========
    
    async def list_sources(self) -> List[Dict[str, Any]]:
        """List all known videos archived by this plugin.
        
        Returns:
            List of video dictionaries
        """
        try:
            db = next(get_db_session())
            
            videos = db.query(Video).where(
                Video.plugin_name == "BrightcovePlugin"
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
            logger.error(f"Error listing sources: {e}")
            return []
        finally:
            db.close()
    
    async def get_source_status(self, source_id: str) -> Dict[str, Any]:
        """Get status of a specific source.
        
        Args:
            source_id: Source ID to check
            
        Returns:
            Source status dictionary
        """
        try:
            db = next(get_db_session())
            
            video = db.query(Video).where(
                Video.plugin_source_id == source_id,
                Video.plugin_name == "BrightcovePlugin"
            ).first()
            
            if video:
                return {
                    "source_id": source_id,
                    "status": "archived",
                    "output_path": video.path,
                    "file_size_bytes": video.file_size,
                    "archived_at": video.plugin_discovered_at.isoformat() if video.plugin_discovered_at else None,
                }
            
            # Check if in archived_videos config
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BrightcovePlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if plugin and plugin.config:
                archived = plugin.config.get("_archived_videos", {})
                if source_id in archived:
                    info = archived[source_id]
                    return {
                        "source_id": source_id,
                        "status": "archived",
                        **info
                    }
            
            return {
                "source_id": source_id,
                "status": "unknown",
            }
            
        except Exception as e:
            logger.error(f"Error getting source status: {e}")
            return {
                "source_id": source_id,
                "status": "error",
                "error": str(e),
            }
        finally:
            db.close()
