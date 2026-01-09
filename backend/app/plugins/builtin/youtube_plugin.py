"""
YouTube archiver plugin for Haven Player (Refactored).

This plugin uses standardized operations from CollectionPluginMixin.
All operations are now accessible via the generic /api/plugins/execute endpoint.
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
from app.models.youtube_plugin import YouTubeChannel, YouTubeVideo
from app.models.video import Video # Import Video model
from app.models.base import get_db


logger = logging.getLogger(__name__)


class YouTubePlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """
    YouTube recording plugin with standardized operations.
    
    Implements:
    - Core ArchiverPlugin interface: discover_sources, archive, health_check
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, etc.
    - ConfigurablePluginMixin: get_config, update_config
    
    All operations accessible via POST /api/plugins/execute
    """
    
    def __init__(self):
        self.config = {}
        self.initialized = False
        self.download_dir = "downloads/youtube" # Default, will be overwritten by global config
        self._max_concurrent_downloads = 3
        self._active_downloads = {}  # video_id -> task
    
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
        
        # Set max concurrent downloads
        self._max_concurrent_downloads = config.get("max_concurrent_downloads", 3)
        
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
        """
        if not self.initialized:
            logger.error("YouTubePlugin not initialized")
            return []
        
        try:
            db = next(get_db_session())
            
            # Get all enabled channels
            stmt = select(YouTubeChannel).where(YouTubeChannel.enabled == True)
            result = db.execute(stmt)
            channels = result.scalars().all()
            
            if not channels:
                logger.info("No enabled channels to poll")
                return []
            
            logger.info(f"Polling {len(channels)} channels for new videos")
            
            new_sources = []
            
            for channel in channels:
                try:
                    # Get channel videos using yt-dlp
                    videos = await self._get_channel_videos(channel)
                    
                    logger.info(f"Found {len(videos)} videos for channel {channel.channel_name}")
                    
                    # Update channel metadata
                    channel.last_polled_at = datetime.utcnow()
                    channel.last_video_count = len(videos)
                    
                    # Process each video
                    for video in videos:
                        # Check if video already exists
                        existing_stmt = select(YouTubeVideo).where(YouTubeVideo.video_id == video["id"])
                        existing_result = db.execute(existing_stmt)
                        existing_video = existing_result.scalar_one_or_none()
                        
                        if not existing_video:
                            # Create new video record
                            new_video = YouTubeVideo(
                                video_id=video["id"],
                                channel_id=channel.id,
                                title=video.get("title"),
                                video_url=video["url"],
                                thumbnail_url=video.get("thumbnail"),
                                duration_seconds=video.get("duration"),
                                upload_date=self._parse_upload_date(video.get("upload_date")),
                                video_metadata=video,
                                download_status="pending",
                            )
                            db.add(new_video)
                            
                            # Create media source
                            source = MediaSource(
                                source_id=video["id"],
                                media_type=MediaType.YOUTUBE,
                                uri=video["url"],
                                metadata={
                                    "title": video.get("title"),
                                    "channel_name": channel.channel_name,
                                    "channel_id": channel.channel_id,
                                    "duration": video.get("duration"),
                                    "thumbnail": video.get("thumbnail"),
                                    "upload_date": video.get("upload_date"),
                                },
                                priority="normal",
                                estimated_size_bytes=video.get("filesize"),
                                estimated_duration_seconds=video.get("duration"),
                            )
                            new_sources.append(source)
                    
                    db.commit()
                    
                except Exception as e:
                    logger.error(f"Error polling channel {channel.channel_name}: {e}")
                    db.rollback()
                    continue
            
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
            
            stmt = select(YouTubeVideo).where(YouTubeVideo.video_id == video_id)
            result = db.execute(stmt)
            video = result.scalar_one_or_none()
            
            if not video:
                return ArchiveResult(
                    success=False,
                    error=f"Video {video_id} not found in database"
                )
            
            # Check if already downloaded
            if video.download_status == "completed":
                logger.info(f"Video {video_id} already downloaded")
                return ArchiveResult(
                    success=True,
                    output_path=video.output_path,
                    file_size_bytes=video.file_size_bytes,
                    duration_seconds=video.duration_seconds,
                    metadata={"video_id": video_id},
                )
            
            # Update status to downloading
            video.download_status = "downloading"
            video.download_started_at = datetime.utcnow()
            db.commit()
            
            # Get channel for configuration
            channel = video.channel
            
            # Download video
            download_result = await self._download_video(source, channel)
            
            if download_result["success"]:
                video.download_status = "completed"
                video.download_completed_at = datetime.utcnow()
                video.output_path = download_result["output_path"]
                video.file_size_bytes = download_result.get("file_size_bytes")
                db.commit()

                # Create an entry in the main Video table
                file_path = download_result["output_path"]
                file_size = download_result.get("file_size_bytes")
                file_extension = os.path.splitext(file_path)[1].lstrip('.') if file_path else None

                new_video_entry = Video(
                    path=file_path,
                    title=video.title,
                    duration=video.duration_seconds,
                    thumbnail_path=video.thumbnail_url,
                    file_size=file_size,
                    file_extension=file_extension,
                    mime_type=f"video/{file_extension}" if file_extension else None,  # Simple inference
                    creator_handle=channel.channel_name,
                    source_uri=video.video_url,
                )
                db.add(new_video_entry)
                db.commit()
                db.refresh(new_video_entry)  # Refresh to get auto-generated fields like ID

                logger.info(f"Created main Video entry for YouTube video: {new_video_entry.id} - {new_video_entry.title}")

                return ArchiveResult(
                    success=True,
                    output_path=download_result["output_path"],
                    file_size_bytes=download_result.get("file_size_bytes"),
                    duration_seconds=video.duration_seconds,
                    metadata={
                        "video_id": video_id,
                        "title": video.title,
                        "channel": channel.channel_name,
                        "main_video_id": new_video_entry.id # Add main video ID to result
                    },
                )
            else:
                video.download_status = "failed"
                video.error_message = download_result.get("error", "Unknown error")
                db.commit()
                
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
            # Extract channel ID from URL
            channel_id = await self._extract_channel_id(collection_uri)
            if not channel_id:
                return {
                    "success": False,
                    "error": "Could not extract channel ID from URL"
                }
            
            # Get channel name if not provided in config
            channel_name = config.get("channel_name") if config else None
            if not channel_name:
                channel_name = await self._get_channel_name(collection_uri)
            
            # Create channel record
            db = next(get_db_session())
            
            # Check if already subscribed
            existing_stmt = select(YouTubeChannel).where(YouTubeChannel.channel_id == channel_id)
            existing_result = db.execute(existing_stmt)
            existing_channel = existing_result.scalar_one_or_none()
            
            if existing_channel:
                return {
                    "success": False,
                    "error": "Already subscribed to this channel",
                    "collection_id": channel_id,
                    "collection_name": existing_channel.channel_name,
                }
            
            new_channel = YouTubeChannel(
                channel_id=channel_id,
                channel_name=channel_name or channel_id,
                channel_url=collection_uri,
                enabled=True,
                download_videos=True,
                video_format=config.get("video_format", "best") if config else "best",
                download_subtitles=config.get("download_subtitles", False) if config else False,
                auto_archive=config.get("auto_archive", True) if config else True,
                config=config or {},
            )
            db.add(new_channel)
            db.commit()
            db.refresh(new_channel)
            
            logger.info(f"Subscribed to channel: {new_channel.channel_name}")
            
            return {
                "success": True,
                "collection_id": channel_id,
                "collection_name": new_channel.channel_name,
                "collection_uri": collection_uri,
                "config": config or {},
                "created_at": new_channel.created_at.isoformat(),
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
            
            stmt = select(YouTubeChannel).where(YouTubeChannel.channel_id == collection_id)
            result = db.execute(stmt)
            channel = result.scalar_one_or_none()
            
            if not channel:
                return {
                    "success": False,
                    "error": "Channel not found",
                }
            
            db.delete(channel)
            db.commit()
            
            logger.info(f"Unsubscribed from channel: {channel.channel_name}")
            
            return {
                "success": True,
                "message": f"Unsubscribed from {channel.channel_name}",
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
            
            stmt = select(YouTubeChannel).order_by(YouTubeChannel.channel_name)
            result = db.execute(stmt)
            channels = result.scalars().all()
            
            subscriptions = []
            for channel in channels:
                subscriptions.append({
                    "collection_id": channel.channel_id,
                    "collection_name": channel.channel_name,
                    "collection_uri": channel.channel_url,
                    "enabled": channel.enabled,
                    "download_videos": channel.download_videos,
                    "video_format": channel.video_format,
                    "download_subtitles": channel.download_subtitles,
                    "auto_archive": channel.auto_archive,
                    "created_at": channel.created_at.isoformat(),
                    "last_polled_at": channel.last_polled_at.isoformat() if channel.last_polled_at else None,
                    "last_video_count": channel.last_video_count,
                    "source_count": len(channel.videos),
                })
            
            return subscriptions
        
        except Exception as e:
            logger.error(f"Error listing subscriptions: {e}")
            return []
        finally:
            db.close()
    
    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
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
            
            stmt = select(YouTubeChannel).where(YouTubeChannel.channel_id == collection_id)
            result = db.execute(stmt)
            channel = result.scalar_one_or_none()
            
            if not channel:
                return None
            
            return {
                "collection_id": channel.channel_id,
                "collection_name": channel.channel_name,
                "collection_uri": channel.channel_url,
                "enabled": channel.enabled,
                "download_videos": channel.download_videos,
                "video_format": channel.video_format,
                "download_subtitles": channel.download_subtitles,
                "auto_archive": channel.auto_archive,
                "config": channel.config,
                "created_at": channel.created_at.isoformat(),
                "updated_at": channel.updated_at.isoformat(),
                "last_polled_at": channel.last_polled_at.isoformat() if channel.last_polled_at else None,
                "last_video_count": channel.last_video_count,
                "video_count": len(channel.videos),
                "videos": [
                    {
                        "video_id": v.video_id,
                        "title": v.title,
                        "download_status": v.download_status,
                        "upload_date": v.upload_date.isoformat() if v.upload_date else None,
                    }
                    for v in channel.videos
                ]
            }
        
        except Exception as e:
            logger.error(f"Error getting subscription: {e}")
            return None
        finally:
            db.close()
    
    async def discover_from_subscription(
        self,
        collection_id: str
    ) -> List[MediaSource]:
        """
        Discover videos from a specific channel (standardized operation).
        
        Called via: POST /api/plugins/execute
        {
            "plugin_name": "YouTubePlugin",
            "operation": "discover_from_subscription",
            "params": {"collection_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw"}
        }
        """
        try:
            db = next(get_db_session())
            
            stmt = select(YouTubeChannel).where(YouTubeChannel.channel_id == collection_id)
            result = db.execute(stmt)
            channel = result.scalar_one_or_none()
            
            if not channel:
                logger.error(f"Channel {collection_id} not found")
                return []
            
            logger.info(f"Polling specific channel: {channel.channel_name}")
            
            # Get channel videos
            videos = await self._get_channel_videos(channel)
            
            # Update channel metadata
            channel.last_polled_at = datetime.utcnow()
            channel.last_video_count = len(videos)
            
            # Create media sources
            sources = []
            for video in videos:
                source = MediaSource(
                    source_id=video["id"],
                    media_type=MediaType.YOUTUBE,
                    uri=video["url"],
                    metadata={
                        "title": video.get("title"),
                        "channel_name": channel.channel_name,
                        "channel_id": channel.channel_id,
                        "duration": video.get("duration"),
                        "thumbnail": video.get("thumbnail"),
                        "upload_date": video.get("upload_date"),
                    },
                    priority="normal",
                    estimated_size_bytes=video.get("filesize"),
                    estimated_duration_seconds=video.get("duration"),
                )
                sources.append(source)
            
            db.commit()
            logger.info(f"Discovered {len(sources)} sources from {channel.channel_name}")
            return sources
        
        except Exception as e:
            logger.error(f"Error discovering from subscription: {e}")
            return []
        finally:
            db.close()
    
    async def archive_from_subscription(
        self,
        collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all videos from a channel (standardized operation).
        
        Called via: POST /api/plugins/execute
        {
            "plugin_name": "YouTubePlugin",
            "operation": "archive_from_subscription",
            "params": {"collection_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw"}
        }
        """
        sources = await self.discover_from_subscription(collection_id)
        results = []
        
        for source in sources:
            try:
                result = await self.archive(source)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to archive {source.source_id}: {e}")
                results.append(ArchiveResult(success=False, error=str(e)))
        
        return results
    
    # ========== ConfigurablePluginMixin Operations ==========
    
    def get_config(self) -> Dict[str, Any]:
        """Get current plugin configuration."""
        return {
            "download_dir": self.download_dir,
            "max_concurrent_downloads": self._max_concurrent_downloads,
            **self.config
        }
    
    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)
        
        if "download_dir" in config:
            self.download_dir = config["download_dir"]
            os.makedirs(self.download_dir, exist_ok=True)
        
        if "max_concurrent_downloads" in config:
            self._max_concurrent_downloads = config["max_concurrent_downloads"]
        
        logger.info(f"Configuration updated: {config}")
        return True
    
    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "download_dir": "downloads/youtube",
            "max_concurrent_downloads": 3,
            "max_videos_per_channel": 50,
        }
    
    # ========== Private Helper Methods ==========
    
    async def _get_channel_videos(self, channel: YouTubeChannel) -> List[Dict[str, Any]]:
        """Get videos from a YouTube channel using yt-dlp."""
        try:
            cmd = [
                "yt-dlp",
                "--flat-playlist",
                "--dump-json",
                "--skip-download",
                f"{channel.channel_url}"
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
                logger.error(f"yt-dlp error for channel {channel.channel_name}: {result.stderr}")
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
            logger.error(f"Timeout getting videos for channel {channel.channel_name}")
            return []
        except Exception as e:
            logger.error(f"Error getting channel videos: {e}")
            return []
    
    async def _download_video(self, source: MediaSource, channel: YouTubeChannel) -> Dict[str, Any]:
        """Download a YouTube video using yt-dlp."""
        try:
            channel_dir = os.path.join(self.download_dir, channel.channel_name)
            os.makedirs(channel_dir, exist_ok=True)
            
            safe_title = "".join(c for c in source.metadata.get("title", "video") if c.isalnum() or c in (' ', '-', '_'))
            output_template = os.path.join(channel_dir, f"{safe_title}.%(ext)s")
            
            cmd = [
                "yt-dlp",
                "--format", channel.video_format if channel.video_format != "best" else "bestvideo+bestaudio/best",
                "--merge-output-format", "mp4",
                "--output", output_template,
                source.uri
            ]
            
            if channel.download_subtitles:
                cmd.extend(["--write-subs", "--write-auto-subs", "--sub-lang", "en"])
            
            logger.info(f"Downloading video: {source.uri}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=3600
            )
            
            if result.returncode != 0:
                logger.error(f"yt-dlp download error: {result.stderr}")
                return {
                    "success": False,
                    "error": result.stderr,
                }
            
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
    
    def _parse_upload_date(self, upload_date_str: Optional[str]) -> Optional[datetime]:
        """Parse upload date from yt-dlp format (YYYYMMDD)."""
        if not upload_date_str or len(upload_date_str) != 8:
            return None
        
        try:
            year = int(upload_date_str[:4])
            month = int(upload_date_str[4:6])
            day = int(upload_date_str[6:8])
            return datetime(year, month, day)
        except:
            return None
    
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
