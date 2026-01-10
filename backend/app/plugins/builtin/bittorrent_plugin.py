"""
BitTorrent archiver plugin for Haven Player.

This plugin uses the generic plugins.config JSON column for storing subscriptions,
following Haven Player's architecture principle that plugin systems should leverage generic
tables rather than creating their own dedicated tables.
"""

import asyncio
import json
import logging
import os
import subprocess
from typing import Dict, Any, List, Optional
from datetime import datetime

from sqlalchemy import select
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
from app.lib.glitter_client import query_glitter_protocol
import libtorrent as lt

logger = logging.getLogger(__name__)


class BitTorrentPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """
    BitTorrent downloading plugin.

    Subscriptions are stored in plugins.config JSON column (generic table approach).
    """

    def __init__(self):
        self.config = {}
        self.initialized = False
        self.download_dir = "downloads/bittorrent"  # Default, will be overwritten by global config
        self.glitter_endpoint = "https://gw.magnode.ru/v1/sql/query"  # Default Glitter endpoint

    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="BitTorrentPlugin",
            version="1.0.0",
            description="Archives torrents from the Glitter protocol.",
            media_types=[MediaType.BITTORRENT],
            author="Haven Team",
        )

    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration."""
        self.config = config

        # Download directory
        db = next(get_db_session())
        app_config = db.query(AppConfig).first()
        if app_config and app_config.download_directory:
            self.download_dir = app_config.download_directory
        else:
            self.download_dir = config.get("download_directory", "downloads/bittorrent")

        # Load glitter_endpoint from plugin config
        plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
        plugin_result = db.execute(plugin_stmt)
        plugin = plugin_result.scalar_one_or_none()

        if plugin and plugin.config:
            if "glitter_endpoint" in plugin.config:
                self.glitter_endpoint = plugin.config["glitter_endpoint"]
                logger.info(f"Loaded glitter_endpoint from plugin config: {self.glitter_endpoint}")

        db.close()
        os.makedirs(self.download_dir, exist_ok=True)

        try:
            import libtorrent as lt
            logger.info(f"libtorrent version: {lt.version}")
        except ImportError:
            logger.error("libtorrent not found. Please install it.")
            return False

        self.initialized = True
        logger.info("BitTorrentPlugin initialized")
        return True

    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover new torrents from all subscriptions.

        Subscriptions are read from plugins.config JSON column (generic table approach).
        """
        if not self.initialized:
            logger.error("BitTorrentPlugin not initialized")
            return []

        db = next(get_db_session())
        try:
            # Get plugin config with subscriptions
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                logger.info("No BitTorrent plugin config found")
                return []

            # Get enabled subscriptions from config
            all_subscriptions = plugin.config.get("subscriptions", [])
            enabled_subscriptions = [sub for sub in all_subscriptions if sub.get("enabled", True)]

            if not enabled_subscriptions:
                logger.info("No BitTorrent subscriptions to poll.")
                return []

            logger.info(f"Polling {len(enabled_subscriptions)} BitTorrent subscriptions.")
            new_sources = []

            # Get seen infohashes to avoid duplicates
            seen_infohashes = set(plugin.config.get("_seen_infohashes", []))

            for sub in enabled_subscriptions:
                search_term = sub.get("search_term", "")
                logger.info(f"Searching for '{search_term}'")
                torrents = query_glitter_protocol(search_term, self.glitter_endpoint)
                logger.info(f"Found {len(torrents)} torrents for '{search_term}'.")

                for torrent_data in torrents:
                    infohash = torrent_data["infohash"]

                    # Skip if already seen
                    if infohash in seen_infohashes:
                        continue

                    # Add to seen infohashes
                    seen_infohashes.add(infohash)

                    source = MediaSource(
                        source_id=infohash,
                        media_type=MediaType.BITTORRENT,
                        uri=f"magnet:?xt=urn:btih:{infohash}",
                        metadata=torrent_data,
                    )
                    new_sources.append(source)

            # Update seen infohashes in config
            config_copy = plugin.config.copy()
            config_copy["_seen_infohashes"] = list(seen_infohashes)
            plugin.config = config_copy

            db.commit()

            logger.info(f"Discovered {len(new_sources)} new torrents.")
            return new_sources
        except Exception as e:
            logger.error(f"Error discovering BitTorrent sources: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []
        finally:
            db.close()

    async def archive(self, source: MediaSource) -> ArchiveResult:
        """Archive a torrent."""
        if source.media_type != MediaType.BITTORRENT:
            return ArchiveResult(
                success=False, error=f"Unsupported media type: {source.media_type}"
            )
        if not self.initialized:
            return ArchiveResult(success=False, error="BitTorrentPlugin not initialized")

        infohash = source.source_id
        logger.info(f"Archiving torrent: {infohash}")

        db = next(get_db_session())
        try:
            # Check if already archived
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return ArchiveResult(success=False, error="BitTorrent plugin not found")

            archived_torrents = plugin.config.get("_archived_torrents", {})

            if infohash in archived_torrents:
                archived_info = archived_torrents[infohash]
                return ArchiveResult(
                    success=True,
                    output_path=archived_info.get("output_path"),
                    file_size_bytes=archived_info.get("file_size_bytes"),
                    metadata={"infohash": infohash}
                )

            ses = lt.session({'listen_interfaces': '0.0.0.0:6881'})
            params = {
                'save_path': self.download_dir,
            }
            handle = lt.add_magnet_uri(ses, source.uri, params)
            ses.start_dht()

            logger.info(f"Downloading torrent {infohash} to {self.download_dir}")

            # Wait for metadata to be available
            logger.info("Waiting for torrent metadata...")
            while not handle.has_metadata():
                await asyncio.sleep(1)

            logger.info("Metadata received. Analyzing files...")
            torrent_info = handle.get_torrent_info()
            files = torrent_info.files()

            # Find the largest video file
            video_extensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg']
            largest_video_index = -1
            largest_video_size = 0

            for i in range(files.num_files()):
                file_path = files.file_path(i)
                file_size = files.file_size(i)
                file_ext = os.path.splitext(file_path.lower())[1]

                if file_ext in video_extensions and file_size > largest_video_size:
                    largest_video_size = file_size
                    largest_video_index = i

            if largest_video_index == -1:
                # No video file found, download the largest file
                logger.warning("No video file found, downloading the largest file")
                largest_file_index = 0
                largest_file_size = 0
                for i in range(files.num_files()):
                    file_size = files.file_size(i)
                    if file_size > largest_file_size:
                        largest_file_size = file_size
                        largest_file_index = i
                largest_video_index = largest_file_index
                largest_video_size = largest_file_size

            # Set file priorities: 0 for unwanted files, 4 (normal) for the largest video
            logger.info(f"Selecting file: {files.file_path(largest_video_index)} ({largest_video_size} bytes)")
            for i in range(files.num_files()):
                if i == largest_video_index:
                    handle.file_priority(i, 4)  # Normal priority
                else:
                    handle.file_priority(i, 0)  # Don't download

            # Wait for download to complete (not seeding)
            logger.info("Downloading selected file...")
            while not handle.status().is_finished:
                status = handle.status()
                logger.info(f"Progress: {status.progress * 100:.2f}% - Download rate: {status.download_rate / 1000:.2f} KB/s")
                await asyncio.sleep(5)

            logger.info("Download complete. Stopping torrent to prevent seeding...")

            # Get the output path for the downloaded file
            output_path = os.path.join(self.download_dir, torrent_info.name(), files.file_path(largest_video_index))

            # Remove the torrent handle to stop seeding immediately
            ses.remove_torrent(handle)
            logger.info("Torrent stopped. Not seeding.")

            new_video = Video(
                path=output_path,
                title=source.metadata.get("name", "Unknown"),
                duration=0,  # Or get from metadata if available
                file_size=torrent_info.total_size(),
                source_uri=source.uri,
                # Plugin metadata fields - stores BitTorrent-specific data without dedicated tables
                plugin_name="BitTorrentPlugin",
                plugin_source_id=infohash,
                plugin_metadata={
                    "size": source.metadata.get("size"),
                    "seeders": source.metadata.get("seeders"),
                    "leechers": source.metadata.get("leechers"),
                },
                plugin_discovered_at=datetime.utcnow(),
                plugin_auto_downloaded=True,
                plugin_subscriptions=[source.metadata.get("search_term", "manual")],
            )
            db.add(new_video)
            db.commit()
            db.refresh(new_video)

            # Mark as archived in config
            _archived_torrents = plugin.config.get("_archived_torrents", {})
            _archived_torrents[infohash] = {
                "infohash": infohash,
                "name": source.metadata.get("name", "Unknown"),
                "output_path": output_path,
                "file_size_bytes": new_video.file_size,
                "video_id": new_video.id,
                "archived_at": datetime.utcnow().isoformat(),
            }

            config_copy = plugin.config.copy()
            config_copy["_archived_torrents"] = _archived_torrents
            plugin.config = config_copy

            db.commit()

            return ArchiveResult(
                success=True,
                output_path=output_path,
                file_size_bytes=new_video.file_size,
                metadata={"infohash": infohash, "video_id": new_video.id}
            )

        except Exception as e:
            logger.error(f"Error archiving torrent {infohash}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return ArchiveResult(success=False, error=str(e))
        finally:
            db.close()

    async def health_check(self) -> bool:
        """Check if plugin is healthy."""
        try:
            import libtorrent
        except ImportError:
            return False
        return os.path.exists(self.download_dir)

    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a search term (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "BitTorrentPlugin",
            "operation": "subscribe",
            "params": {
                "collection_uri": "search term",
                "config": {"enabled": true}
            }
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "BitTorrent plugin not found"
                }

            search_term = collection_uri

            # Get current subscriptions list
            subscriptions = plugin.config.get("subscriptions", [])

            # Check if already subscribed
            for sub in subscriptions:
                if sub.get("search_term") == search_term:
                    return {
                        "success": False,
                        "error": "Already subscribed to this search term",
                        "collection_id": search_term,
                        "collection_name": search_term,
                    }

            # Add new subscription
            new_subscription = {
                "search_term": search_term,
                "enabled": config.get("enabled", True) if config else True,
                "auto_download": config.get("auto_download", True) if config else True,
                "save_path": config.get("save_path"),
                "max_upload_speed": config.get("max_upload_speed"),
                "max_download_speed": config.get("max_download_speed"),
                "created_at": datetime.utcnow().isoformat(),
            }

            subscriptions.append(new_subscription)

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["subscriptions"] = subscriptions
            plugin.config = config_copy

            db.commit()

            logger.info(f"Subscribed to search term: {search_term}")

            return {
                "success": True,
                "collection_id": search_term,
                "collection_name": search_term,
                "created_at": new_subscription["created_at"],
            }
        except Exception as e:
            logger.error(f"Error subscribing: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a search term (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "BitTorrentPlugin",
            "operation": "unsubscribe",
            "params": {"collection_id": "search term"}
        }
        """
        try:
            db = next(get_db_session())

            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin:
                return {
                    "success": False,
                    "error": "BitTorrent plugin not found"
                }

            # Find and remove subscription
            subscriptions = plugin.config.get("subscriptions", [])
            found = False
            search_term = "Unknown"

            for i, sub in enumerate(subscriptions):
                if sub.get("search_term") == collection_id:
                    search_term = sub.get("search_term", "Unknown")
                    subscriptions.pop(i)
                    found = True
                    break

            if not found:
                return {
                    "success": False,
                    "error": "Subscription not found",
                }

            # Update plugin config
            config_copy = plugin.config.copy()
            config_copy["subscriptions"] = subscriptions
            plugin.config = config_copy

            db.commit()

            logger.info(f"Unsubscribed from search term: {search_term}")

            return {
                "success": True,
                "message": f"Unsubscribed from {search_term}",
            }
        except Exception as e:
            logger.error(f"Error unsubscribing: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all subscriptions (standardized operation).

        Called via: POST /api/plugins/execute
        {
            "plugin_name": "BitTorrentPlugin",
            "operation": "list_subscriptions",
            "params": {}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return []

            return plugin.config.get("subscriptions", [])
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
            "plugin_name": "BitTorrentPlugin",
            "operation": "get_subscription",
            "params": {"collection_id": "search term"}
        }
        """
        try:
            db = next(get_db_session())

            plugin_stmt = select(PluginModel).where(PluginModel.name == "BitTorrentPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()

            if not plugin or not plugin.config:
                return None

            subscriptions = plugin.config.get("subscriptions", [])

            for sub in subscriptions:
                if sub.get("search_term") == collection_id:
                    return sub

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
            "download_directory": self.download_dir,
            "glitter_endpoint": self.glitter_endpoint,
            **self.config
        }

    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)

        if "glitter_endpoint" in config:
            self.glitter_endpoint = config["glitter_endpoint"]
            logger.info(f"Updated glitter_endpoint to: {self.glitter_endpoint}")

        if "download_directory" in config:
            self.download_dir = config["download_directory"]
            os.makedirs(self.download_dir, exist_ok=True)

        # Update the Plugin model in database
        db = next(get_db_session())
        try:
            plugin_record = db.query(PluginModel).filter(PluginModel.name == "BitTorrentPlugin").first()
            if plugin_record:
                if not plugin_record.config:
                    plugin_record.config = {}
                plugin_record.config.update({"glitter_endpoint": self.glitter_endpoint})
                db.commit()
                logger.info("Updated plugin config in database")
            else:
                # Create plugin record if it doesn't exist
                new_plugin = PluginModel(
                    name="BitTorrentPlugin",
                    enabled=True,
                    config={"glitter_endpoint": self.glitter_endpoint},
                    priority=0
                )
                db.add(new_plugin)
                db.commit()
                logger.info("Created plugin record in database")
        except Exception as e:
            logger.error(f"Failed to update plugin config in database: {e}")
            db.rollback()
        finally:
            db.close()

        logger.info(f"Configuration updated: {config}")
        return True

    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "subscriptions": [],
            "glitter_endpoint": "https://gw.magnode.ru/v1/sql/query",
            "download_directory": "downloads/bittorrent",
        }

    # ========== Additional Mixin Methods ==========

    async def discover_from_subscription(self, collection_id: str) -> List[MediaSource]:
        """
        Discover torrents from a specific subscription.

        This is a stub implementation required by CollectionPluginMixin.
        """
        # Torrent discovery is handled in discover_sources() which reads all enabled subscriptions
        return []

    async def archive_from_subscription(
        self, collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all torrents from a subscription.

        This is a stub implementation required by CollectionPluginMixin.
        """
        return []

    async def list_sources(self) -> List[Dict[str, Any]]:
        """
        List all known torrents.

        This is a stub implementation required by ConfigurablePluginMixin.
        """
        try:
            db = next(get_db_session())

            videos = db.query(Video).where(
                Video.plugin_name == "BitTorrentPlugin"
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
            logger.error(f"Error listing BitTorrent sources: {e}")
            return []
        finally:
            db.close()

    async def get_source_status(self, source_id: str) -> Dict[str, Any]:
        """
        Get status of a specific torrent.

        This is a stub implementation required by ConfigurablePluginMixin.
        """
        try:
            db = next(get_db_session())

            video = db.query(Video).where(
                Video.plugin_name == "BitTorrentPlugin",
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

