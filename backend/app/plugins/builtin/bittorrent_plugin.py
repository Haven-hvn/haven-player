"""
BitTorrent archiver plugin for Haven Player.
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
from app.models.bittorrent_plugin import BitTorrentSubscription, BitTorrentTorrent
from app.models.video import Video
from app.lib.glitter_client import query_glitter_protocol
import libtorrent as lt

logger = logging.getLogger(__name__)


class BitTorrentPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """
    BitTorrent downloading plugin.
    """

    def __init__(self):
        self.config = {}
        self.initialized = False
        self.download_dir = "downloads/bittorrent"  # Default, will be overwritten by global config

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
        db = next(get_db_session())
        app_config = db.query(AppConfig).first()
        if app_config and app_config.download_directory:
            self.download_dir = app_config.download_directory
        else:
            self.download_dir = config.get("download_directory", "downloads/bittorrent")
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
        """Discover new torrents from all subscriptions."""
        if not self.initialized:
            logger.error("BitTorrentPlugin not initialized")
            return []
        
        db = next(get_db_session())
        try:
            stmt = select(BitTorrentSubscription)
            subscriptions = db.execute(stmt).scalars().all()
            if not subscriptions:
                logger.info("No BitTorrent subscriptions to poll.")
                return []

            logger.info(f"Polling {len(subscriptions)} BitTorrent subscriptions.")
            new_sources = []
            for sub in subscriptions:
                logger.info(f"Searching for '{sub.search_term}'")
                torrents = query_glitter_protocol(sub.search_term)
                logger.info(f"Found {len(torrents)} torrents for '{sub.search_term}'.")

                for torrent_data in torrents:
                    existing_stmt = select(BitTorrentTorrent).where(BitTorrentTorrent.infohash == torrent_data["infohash"])
                    existing_torrent = db.execute(existing_stmt).scalar_one_or_none()

                    if not existing_torrent:
                        new_torrent = BitTorrentTorrent(
                            subscription_id=sub.id,
                            infohash=torrent_data["infohash"],
                            name=torrent_data["name"],
                        )
                        db.add(new_torrent)
                        db.commit()
                        
                        source = MediaSource(
                            source_id=new_torrent.infohash,
                            media_type=MediaType.BITTORRENT,
                            uri=f"magnet:?xt=urn:btih:{new_torrent.infohash}",
                            metadata=torrent_data,
                        )
                        new_sources.append(source)
            
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
            stmt = select(BitTorrentTorrent).where(BitTorrentTorrent.infohash == infohash)
            torrent_record = db.execute(stmt).scalar_one_or_none()

            if not torrent_record:
                return ArchiveResult(success=False, error=f"Torrent {infohash} not found in database")

            if torrent_record.video_id:
                return ArchiveResult(success=True, output_path=torrent_record.video.path)

            ses = lt.session({'listen_interfaces': '0.0.0.0:6881'})
            params = {
                'save_path': self.download_dir,
            }
            handle = lt.add_magnet_uri(ses, source.uri, params)
            ses.start_dht()

            logger.info(f"Downloading torrent {torrent_record.name} to {self.download_dir}")

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
                title=torrent_record.name,
                duration=0,  # Or get from metadata if available
                file_size=torrent_info.total_size(),
                source_uri=source.uri
            )
            db.add(new_video)
            db.commit()
            db.refresh(new_video)

            torrent_record.video_id = new_video.id
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
        """Subscribe to a search term."""
        try:
            db = next(get_db_session())
            search_term = collection_uri
            existing_stmt = select(BitTorrentSubscription).where(BitTorrentSubscription.search_term == search_term)
            existing_result = db.execute(existing_stmt)
            existing_subscription = existing_result.scalar_one_or_none()

            if existing_subscription:
                return {
                    "success": False,
                    "error": "Already subscribed to this search term",
                    "collection_id": existing_subscription.id,
                }

            new_subscription = BitTorrentSubscription(
                search_term=search_term,
            )
            db.add(new_subscription)
            db.commit()
            db.refresh(new_subscription)

            logger.info(f"Subscribed to search term: {search_term}")

            return {
                "success": True,
                "collection_id": new_subscription.id,
                "collection_name": new_subscription.search_term,
            }
        except Exception as e:
            logger.error(f"Error subscribing: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """Unsubscribe from a search term."""
        try:
            db = next(get_db_session())
            stmt = select(BitTorrentSubscription).where(BitTorrentSubscription.id == int(collection_id))
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()

            if not subscription:
                return {"success": False, "error": "Subscription not found"}

            db.delete(subscription)
            db.commit()

            logger.info(f"Unsubscribed from search term: {subscription.search_term}")

            return {
                "success": True,
                "message": f"Unsubscribed from {subscription.search_term}",
            }
        except Exception as e:
            logger.error(f"Error unsubscribing: {e}")
            return {"success": False, "error": str(e)}
        finally:
            db.close()

    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """List all subscriptions."""
        try:
            db = next(get_db_session())
            stmt = select(BitTorrentSubscription).order_by(BitTorrentSubscription.search_term)
            result = db.execute(stmt)
            subscriptions = result.scalars().all()

            return [
                {
                    "collection_id": sub.id,
                    "collection_name": sub.search_term,
                }
                for sub in subscriptions
            ]
        except Exception as e:
            logger.error(f"Error listing subscriptions: {e}")
            return []
        finally:
            db.close()

    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        """Get subscription details."""
        try:
            db = next(get_db_session())
            stmt = select(BitTorrentSubscription).where(BitTorrentSubscription.id == int(collection_id))
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()

            if not subscription:
                return None

            return {
                "collection_id": subscription.id,
                "collection_name": subscription.search_term,
                "torrents": [
                    {
                        "infohash": t.infohash,
                        "name": t.name,
                    }
                    for t in subscription.torrents
                ],
            }
        except Exception as e:
            logger.error(f"Error getting subscription: {e}")
            return None
        finally:
            db.close()
