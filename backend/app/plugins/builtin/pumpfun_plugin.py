"""
PumpFun livestream recording plugin for Haven Player.

This plugin provides subscription-based auto-recording of PumpFun livestreams.
Users subscribe to streams they want to monitor, and a recurring job automatically
records those streams when they go live.
"""

from typing import Dict, Any, List
import logging
import asyncio
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
    DefaultJobConfig,
)
from app.plugins.mixins import CollectionPluginMixin, ConfigurablePluginMixin
from app.models.database import get_db as get_db_session
from app.models.plugin import Plugin as PluginModel
from app.services.pumpfun_service import PumpFunService
from app.services.webrtc_recording_service import WebRTCRecordingService
from app.services.stream_manager import StreamManager

logger = logging.getLogger(__name__)


class PumpFunPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """
    PumpFun livestream recording plugin with subscription-based auto-recording.
    
    This plugin provides subscription-based auto-recording of PumpFun livestreams.
    Users subscribe to streams they want to monitor, and a recurring job automatically
    records those streams when they go live.
    
    Plugins inherit from:
    - Core ArchiverPlugin interface: discover_sources, archive, health_check
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, etc.
    - ConfigurablePluginMixin: get_config, update_config, get_default_config
    """
    
    def __init__(self):
        self.pumpfun_service = PumpFunService()
        self._recording_service = None  # Lazy-loaded recording service
        self._recording_service_lock = asyncio.Lock()  # Thread-safe lazy loading
        self.config = {}
        self._initialized = False
    
    async def _get_recording_service(self) -> WebRTCRecordingService:
        """Lazy-load the WebRTC recording service on demand."""
        if self._recording_service is None:
            async with self._recording_service_lock:
                if self._recording_service is None:  # Double-check after acquiring lock
                    self._recording_service = WebRTCRecordingService()
                    logger.info("WebRTCRecordingService lazy-loaded for PumpFunPlugin")
        return self._recording_service
    
    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="PumpFunPlugin",
            version="3.0.0",  # Bump version for segmented recording feature
            description="Automated 30-second chunk recording of PumpFun livestreams with keyframe-based segmentation",
            media_types=[MediaType.WEBRTC],
            author="Haven Team",
            capabilities=[
                "discover_sources", "archive", "health_check", "stop_archiving", "get_archiving_status",
                "subscribe", "unsubscribe", "list_subscriptions", "get_subscription",
                "discover_from_subscription", "archive_from_subscription",
                "get_config", "update_config", "get_default_config",
                "manage_recordings",  # ADD THIS for automated segmented recording
            ],
            default_jobs=[
                DefaultJobConfig(
                    job_name="auto_segmented_recordings",
                    schedule="*/30 * * * * *",  # Every 30 seconds
                    method="manage_recordings",
                    on_success="log_only",
                    config={},
                    enabled=True
                )
            ]
        )
    
    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration."""
        self.config = config
        self._initialized = True
        logger.info("PumpFunPlugin initialized")
        return True
    
    async def discover_sources(
        self,
        offset: int = 0,
        limit: int = 20,
        filter_options: Dict[str, Any] = None
    ) -> List[MediaSource]:
        """
        Discover live streams from PumpFun with pagination and filtering.
        
        If the plugin has subscribed streams in config, returns only currently live subscribed streams.
        Otherwise returns all available live streams with filtering.
        
        Args:
            offset: Pagination offset
            limit: Maximum number of streams to return
            filter_options: Filtering options (min_participants, max_participants, include_nsfw, etc.)
        
        Returns:
            List of MediaSource objects representing available live streams
        """
        try:
            filter_options = filter_options or {}
            min_participants = filter_options.get("min_participants", 0)
            max_participants = filter_options.get("max_participants", float("inf"))
            include_nsfw = filter_options.get("include_nsfw", False)
            
            # Get subscribed streams from plugin config
            db = next(get_db_session())
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            db.close()
            
            subscribed_streams = []
            if plugin and plugin.config:
                subscribed_streams = plugin.config.get("streams", [])
            
            # Get all available live streams
            all_streams = await self.pumpfun_service.get_currently_live_streams(limit=1000)
            
            # Filter based on whether we have subscribed streams
            if subscribed_streams:
                # Only check subscribed streams for live status
                subscribed_ids = [s.get("stream_id") for s in subscribed_streams if s.get("stream_id")]
                filtered_streams = []
                for stream in all_streams:
                    mint_id = stream.get("mint")
                    if not mint_id or mint_id not in subscribed_ids:
                        continue
                    
                    num_participants = stream.get("num_participants", 0)
                    nsfw = stream.get("nsfw", False)
                    
                    # Apply participant count filters
                    if num_participants < min_participants or num_participants > max_participants:
                        continue
                    
                    # Apply NSFW filter
                    if nsfw and not include_nsfw:
                        continue
                    
                    # Add to filtered list
                    filtered_streams.append(stream)
                logger.info(f"Checking {len(subscribed_ids)} subscribed streams, found {len(filtered_streams)} currently live")
            else:
                # No subscribed streams - return all streams with filters
                filtered_streams = []
                for stream in all_streams:
                    mint_id = stream.get("mint")
                    if not mint_id:
                        continue
                    
                    num_participants = stream.get("num_participants", 0)
                    nsfw = stream.get("nsfw", False)
                    
                    # Apply participant count filters
                    if num_participants < min_participants or num_participants > max_participants:
                        continue
                    
                    # Apply NSFW filter
                    if nsfw and not include_nsfw:
                        continue
                    
                    # Add to filtered list
                    filtered_streams.append(stream)
            
            # Sort by participant count (descending) for default view
            sorted_streams = sorted(
                filtered_streams,
                key=lambda x: x.get("num_participants", 0),
                reverse=True
            )
            
            # Apply pagination
            paginated_streams = sorted_streams[offset:offset + limit]
            
            sources = []
            for stream in paginated_streams:
                mint_id = stream.get("mint")
                num_participants = stream.get("num_participants", 0)
                
                # Determine priority based on participant count
                if num_participants > 100:
                    priority = "high"
                elif num_participants > 50:
                    priority = "normal"
                else:
                    priority = "low"
                
                # Create media source
                source = MediaSource(
                    source_id=mint_id,
                    media_type=MediaType.WEBRTC,
                    uri=f"webrtc://pumpfun/{mint_id}",
                    metadata={
                        "stream_id": mint_id,
                        "name": stream.get("name", "Unknown"),
                        "symbol": stream.get("symbol", ""),
                        "market_cap": stream.get("market_cap"),
                        "num_participants": num_participants,
                        "thumbnail": stream.get("thumbnail"),
                        "is_currently_live": stream.get("is_currently_live", True),
                        "creator": stream.get("creator"),
                        "image_uri": stream.get("image_uri"),
                        "nsfw": stream.get("nsfw", False),
                    },
                    priority=priority,
                )
                sources.append(source)
            
            logger.info(f"PumpFunPlugin discovered {len(sources)} sources (from {len(filtered_streams)} filtered, {len(all_streams)} total)")
            return sources
        
        except Exception as e:
            logger.error(f"Error discovering PumpFun sources: {e}")
            return []
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        """
        Archive a PumpFun stream.
        
        Streams are continuous live sessions - no duplicate checking needed.
        Simply starts recording the stream if it's live.
        
        Args:
            source: MediaSource to archive (must be WEBRTC type)
            
        Returns:
            ArchiveResult with success status and output information
        """
        if source.media_type != MediaType.WEBRTC:
            return ArchiveResult(
                success=False,
                error=f"Unsupported media type: {source.media_type}"
            )
        
        try:
            # Extract mint_id from URI
            mint_id = source.uri.split("/")[-1]
            logger.info(f"Archiving PumpFun stream: {mint_id}")
            
            # Get recording config from source metadata or plugin config
            output_format = self.config.get("output_format", "webm")
            video_quality = self.config.get("video_quality", "best")
            
            # Start recording using existing service
            recording_service = await self._get_recording_service()
            result = await recording_service.start_recording(
                mint_id=mint_id,
                output_format=output_format,
                video_quality=video_quality,
            )
            
            if result.get("success"):
                # Wait a moment for recording to start
                await asyncio.sleep(2)
                
                # Get recording status
                status = await recording_service.get_recording_status(mint_id)
                
                output_path = result.get("output_path")
                
                return ArchiveResult(
                    success=True,
                    output_path=output_path,
                    metadata={
                        "mint_id": mint_id,
                        "format": output_format,
                        "quality": video_quality,
                        "source_metadata": source.metadata,
                    },
                )
            else:
                return ArchiveResult(
                    success=False,
                    error=result.get("error", "Unknown error"),
                )
        
        except Exception as e:
            logger.error(f"Error archiving WebRTC source {source.source_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return ArchiveResult(
                success=False,
                error=str(e),
            )
    
    async def health_check(self) -> bool:
        """
        Check if plugin is healthy.
        
        Returns:
            True if plugin is healthy, False otherwise
        """
        # Check if PumpFun service is responsive
        try:
            streams = await self.pumpfun_service.get_currently_live_streams(limit=1)
            return True
        except Exception as e:
            logger.error(f"PumpFunPlugin health check failed: {e}")
            return False
    
    async def stop_archiving(self, source_id: str) -> Dict[str, Any]:
        """
        Stop archiving a specific source.
        
        This is a convenience method that wraps the recording service's
        stop_recording method.
        
        Args:
            source_id: The mint_id of the stream to stop recording
            
        Returns:
            Result dictionary from stop_recording
        """
        try:
            logger.info(f"Stopping archiving for {source_id}")
            recording_service = await self._get_recording_service()
            result = await recording_service.stop_recording(source_id)
            return result
        except Exception as e:
            logger.error(f"Error stopping archiving for {source_id}: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_archiving_status(self, source_id: str) -> Dict[str, Any]:
        """
        Get archiving status for a specific source.
        
        Args:
            source_id: The mint_id of the stream
            
        Returns:
            Status dictionary
        """
        try:
            recording_service = await self._get_recording_service()
            return await recording_service.get_recording_status(source_id)
        except Exception as e:
            logger.error(f"Error getting archiving status for {source_id}: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_all_archiving_status(self) -> Dict[str, Any]:
        """
        Get status of all active recordings.
        
        Returns:
            Dictionary with all active recordings
        """
        try:
            recording_service = await self._get_recording_service()
            return await recording_service.get_all_recordings()
        except Exception as e:
            logger.error(f"Error getting all archiving status: {e}")
            return {"success": False, "error": str(e)}
    
    # ========== CollectionPluginMixin Operations (Standardized) ==========
    
    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a PumpFun stream with priority .
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "subscribe",
          "params": {
            "collection_uri": "mint_id",
            "config": {
              "stream_name": "Stream Name",
              "priority": 5
            }
          }
        }
        """
        db = None
        try:
            db = next(get_db_session())
            
            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                error_msg = "PumpFun plugin not found in database"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            # Extract configuration
            config = config or {}
            stream_id = config.get("stream_id", collection_uri)  # Default to collection_uri if no stream_id
            stream_name = config.get("stream_name", stream_id)
            priority = config.get("priority", 5)
            
            # Get current streams list - handle None config
            if plugin.config is None:
                plugin.config = {}
            streams = plugin.config.get("streams", [])
            
            # Check if already subscribed
            for stream in streams:
                if stream.get("stream_id") == stream_id:
                    error_msg = f"Already subscribed to stream: {stream_id}"
                    logger.warning(error_msg)
                    raise ValueError(error_msg)
            
            # Add new stream subscription
            new_stream = {
                "stream_id": stream_id,
                "stream_name": stream_name,
                "enabled": True,
                "priority": priority,
                "created_at": datetime.utcnow().isoformat(),
            }
            
            streams.append(new_stream)
            
            # Update plugin config - ensure we create a new dict to trigger SQLAlchemy change detection
            config_copy = plugin.config.copy() if plugin.config else {}
            config_copy["streams"] = streams
            plugin.config = config_copy
            
            # Explicitly flag the config field as modified so SQLAlchemy detects the change
            flag_modified(plugin, "config")
            
            db.commit()
            db.refresh(plugin)  # Refresh to ensure we have the latest data
            
            logger.info(f"Successfully subscribed to PumpFun stream: {new_stream['stream_name']} (stream_id: {stream_id})")
            
            # Return subscription in format expected by frontend (PumpFunSubscription)
            return {
                "stream_id": new_stream["stream_id"],
                "stream_name": new_stream["stream_name"],
                "enabled": new_stream["enabled"],
                "priority": new_stream["priority"],
                "created_at": new_stream["created_at"],
                "is_currently_recording": False,
                "recording_status": "idle",
            }
        
        except Exception as e:
            logger.error(f"Error subscribing to PumpFun stream: {e}", exc_info=True)
            if db:
                db.rollback()
            # Re-raise the exception so the execute endpoint can handle it properly
            raise
        finally:
            if db:
                db.close()
    
    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a PumpFun stream.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "unsubscribe",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        db = None
        try:
            db = next(get_db_session())
            
            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                error_msg = "PumpFun plugin not found in database"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            # Get current streams list - handle None config
            if plugin.config is None:
                plugin.config = {}
            streams = plugin.config.get("streams", [])
            
            # Find and remove the stream
            original_count = len(streams)
            filtered_streams = [s for s in streams if s.get("stream_id") != collection_id]
            
            if len(filtered_streams) == original_count:
                error_msg = f"Stream subscription not found: {collection_id}"
                logger.warning(error_msg)
                raise ValueError(error_msg)
            
            # Update plugin config - ensure we create a new dict to trigger SQLAlchemy change detection
            config_copy = plugin.config.copy() if plugin.config else {}
            config_copy["streams"] = filtered_streams
            plugin.config = config_copy
            
            # Explicitly flag the config field as modified so SQLAlchemy detects the change
            flag_modified(plugin, "config")
            
            db.commit()
            db.refresh(plugin)  # Refresh to ensure we have the latest data
            
            logger.info(f"Successfully unsubscribed from PumpFun stream: {collection_id}")
            
            return {
                "message": f"Unsubscribed from {collection_id}",
            }
        
        except Exception as e:
            logger.error(f"Error unsubscribing from stream: {e}", exc_info=True)
            if db:
                db.rollback()
            # Re-raise the exception so the execute endpoint can handle it properly
            raise
        finally:
            if db:
                db.close()
    
    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all PumpFun stream subscriptions.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "list_subscriptions",
          "params": {}
        }
        """
        db = None
        try:
            db = next(get_db_session())
            
            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                logger.warning("PumpFun plugin not found in database")
                return []
            
            # Return streams list directly from config - handle None config
            if plugin.config is None:
                return []
            
            streams = plugin.config.get("streams", [])
            return streams
        
        except Exception as e:
            logger.error(f"Error listing PumpFun subscriptions: {e}", exc_info=True)
            return []
        finally:
            if db:
                db.close()
    
    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        """
        Get PumpFun subscription details.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "get_subscription",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        db = None
        try:
            db = next(get_db_session())
            
            # Get plugin
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin:
                logger.warning("PumpFun plugin not found in database")
                return None
            
            # Find stream in config - handle None config
            if plugin.config is None:
                return None
            
            streams = plugin.config.get("streams", [])
            for stream in streams:
                if stream.get("stream_id") == collection_id:
                    return stream
            
            return None
        
        except Exception as e:
            logger.error(f"Error getting PumpFun subscription: {e}", exc_info=True)
            return None
        finally:
            if db:
                db.close()
    
    async def discover_from_subscription(self, collection_id: str) -> List[MediaSource]:
        """
        Discover sessions from a specific PumpFun stream subscription.
        
        Checks if the subscribed stream is currently live via PumpFun API.
        Returns MediaSource if stream is live, empty list if not.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "discover_from_subscription",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        try:
            db = next(get_db_session())
            
            # Get plugin config to find stream details
            plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
            plugin_result = db.execute(plugin_stmt)
            plugin = plugin_result.scalar_one_or_none()
            
            if not plugin or not plugin.config:
                logger.error(f"PumpFun plugin config not found")
                return []
            
            # Find stream in config
            streams = plugin.config.get("streams", [])
            stream_info = None
            for stream in streams:
                if stream.get("stream_id") == collection_id:
                    stream_info = stream
                    break
            
            if not stream_info:
                logger.error(f"Stream subscription {collection_id} not found")
                return []
            
            logger.info(f"Checking if subscribed stream is live: {stream_info.get('stream_name', collection_id)}")
            
            # Check if stream is currently live via PumpFun API
            all_streams = await self.pumpfun_service.get_currently_live_streams(limit=1000)
            
            live_stream = None
            for stream in all_streams:
                if stream.get("mint") == collection_id:
                    live_stream = stream
                    break
            
            if not live_stream:
                logger.info(f"Stream {collection_id} is not currently live")
                return []
            
            # Stream is live - create MediaSource
            num_participants = live_stream.get("num_participants", 0)
            if num_participants > 100:
                priority = "high"
            elif num_participants > 50:
                priority = "normal"
            else:
                priority = "low"
            
            source = MediaSource(
                source_id=collection_id,
                media_type=MediaType.WEBRTC,
                uri=f"webrtc://pumpfun/{collection_id}",
                metadata={
                    "stream_id": collection_id,
                    "name": live_stream.get("name", stream_info.get("stream_name", "Unknown")),
                    "symbol": live_stream.get("symbol", ""),
                    "market_cap": live_stream.get("market_cap"),
                    "num_participants": num_participants,
                    "thumbnail": live_stream.get("thumbnail"),
                    "is_currently_live": True,
                    "creator": live_stream.get("creator"),
                    "image_uri": live_stream.get("image_uri"),
                    "nsfw": live_stream.get("nsfw", False),
                },
                priority=priority,
            )
            
            logger.info(f"Discovered live stream from subscription: {stream_info.get('stream_name', collection_id)}")
            return [source]
        
        except Exception as e:
            logger.error(f"Error discovering from subscription: {e}")
            return []
        finally:
            db.close()
    
    async def archive_from_subscription(self, collection_id: str) -> List[ArchiveResult]:
        """
        Archive all sessions from a WebRTC subscription.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "PumpFunPlugin",
          "operation": "archive_from_subscription",
          "params": {"collection_id": "my-stream-id"}
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
            "discover_limit": self.config.get("discover_limit", 20),
            "livekit_url": self.config.get("livekit_url", "wss://pump-prod-tg2x8veh.livekit.cloud"),
            "output_format": self.config.get("output_format", "webm"),
            "video_quality": self.config.get("video_quality", "best"),
            **self.config
        }
    
    async def update_config(self, config: Dict[str, Any]) -> bool:
        """Update plugin configuration."""
        self.config.update(config)
        return True
    
    def get_default_config(self) -> Dict[str, Any]:
        """Get default configuration."""
        return {
            "discover_limit": 20,
            "livekit_url": "wss://pump-prod-tg2x8veh.livekit.cloud",
            "output_format": "webm",
            "video_quality": "best",
            "auto_recording_enabled": False,
            "segment_duration": 30,
        }
    
    async def manage_recordings(self) -> Dict[str, Any]:
        """
        Manage automated segmented recording of subscribed streams.
        
        Called by JobScheduler every 30 seconds.
        
        This method:
        - Checks which subscribed streams are live
        - Starts segmented recordings for new live streams
        - Stops recordings for offline streams
        - Segments rotate automatically (every 30s on keyframe)
        - Completed segments auto-enqueued to UploadCoordinator
        
        Returns:
            Statistics about recording operations
        """
        from app.services.pumpfun_recording_manager import PumpFunRecordingManager
        
        try:
            # Get global recording manager (singleton)
            manager = PumpFunRecordingManager()
            
            # Inject stream manager
            from app.services.stream_manager import StreamManager
            manager.set_stream_manager(StreamManager())
            
            # Get plugin configuration
            db = next(get_db_session())
            try:
                plugin_stmt = select(PluginModel).where(PluginModel.name == "PumpFunPlugin")
                plugin_result = db.execute(plugin_stmt)
                plugin = plugin_result.scalar_one_or_none()
                
                if not plugin or not plugin.config:
                    logger.info("No plugin config found")
                    return {"status": "no_config", "message": "Plugin configuration not found"}
                
                # Get subscribed streams
                subscribed_streams = plugin.config.get("streams", [])
                enabled_streams = [s for s in subscribed_streams if s.get("enabled", False)]
                
                # Check if auto recording is enabled in config
                auto_recording_enabled = plugin.config.get("auto_recording_enabled", False)
                if not auto_recording_enabled:
                    logger.info("Auto recording is disabled in plugin config")
                    return {"status": "disabled", "message": "Auto recording is disabled"}
                
                livekit_url = plugin.config.get("livekit_url")
                if livekit_url:
                    manager.set_livekit_url(livekit_url)

                segment_duration = plugin.config.get("segment_duration", 30)
                logger.info(f"Managing recordings for {len(enabled_streams)} enabled streams, segment duration: {segment_duration}s")
                
                # Let manager handle all recording logic
                stats = await manager.manage_subscriptions(enabled_streams)
                
                result = {
                    "status": "success",
                    "total_subscribed": len(enabled_streams),
                    "active_recordings": stats.get("active", 0),
                    "started": stats.get("started", 0),
                    "stopped": stats.get("stopped", 0),
                    "errors": stats.get("errors", 0),
                    "segment_duration": segment_duration,
                }
                
                logger.info(f"Recording management completed: {result}")
                return result
                
            except Exception as e:
                logger.error(f"Error during recording management: {e}", exc_info=True)
                return {"status": "error", "error": str(e), "message": "Recording management failed"}
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error in manage_recordings: {e}", exc_info=True)
            return {"status": "error", "error": str(e)}
