"""
WebRTC recording plugin for Haven Player.

This plugin wraps the existing PumpFun and WebRTC recording services
to provide a plugin interface for archiving WebRTC streams from pump.fun.
"""

from typing import Dict, Any, List
import logging
import asyncio

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
)
from app.plugins.mixins import CollectionPluginMixin, ConfigurablePluginMixin
from app.models.database import get_db as get_db_session
from app.models.webrtc_plugin import WebRTCSubscription, WebRTCSession
from app.services.pumpfun_service import PumpFunService
from app.services.webrtc_recording_service import WebRTCRecordingService

logger = logging.getLogger(__name__)


class WebRTCPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """
    WebRTC recording plugin with subscription-based configuration.
    
    This plugin provides archiving capabilities for WebRTC streams with per-source 
    LiveKit server configuration, similar to YouTube plugin's channel subscriptions.
    \
    
    Plugins inherit from:
    - Core ArchiverPlugin interface: discover_sources, archive, health_check
    - CollectionPluginMixin: subscribe, unsubscribe, list_subscriptions, etc.
    - ConfigurablePluginMixin: get_config, update_config, get_default_config
    """
    
    def __init__(self):
        self.pumpfun_service = PumpFunService()
        self.recording_service = WebRTCRecordingService()
        self.config = {}
        self._initialized = False
    
    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        return PluginMetadata(
            name="WebRTCPlugin",
            version="1.1.0",
            description="Archives WebRTC streams from LiveKit with per-source configuration",
            media_types=[MediaType.WEBRTC],
            author="Haven Team",
            capabilities=[
                "discover_sources", "archive", "health_check", "stop_archiving", "get_archiving_status",
                "subscribe", "unsubscribe", "list_subscriptions", "get_subscription",
                "discover_from_subscription", "archive_from_subscription",
                "get_config", "update_config", "get_default_config"
            ],
        )
    
    async def initialize(self, config: Dict[str, Any]) -> bool:
        """Initialize plugin with configuration."""
        self.config = config
        self._initialized = True
        logger.info("WebRTCPlugin initialized")
        return True
    
    async def discover_sources(self) -> List[MediaSource]:
        """
        Discover popular live streams from PumpFun.
        
        Returns:
            List of MediaSource objects representing popular live streams
        """
        try:
            # Get popular streams from PumpFun
            popular_streams = await self.pumpfun_service.get_popular_live_streams(
                limit=self.config.get("discover_limit", 20)
            )
            
            sources = []
            for stream in popular_streams:
                mint_id = stream.get("mint")
                if not mint_id:
                    continue
                
                # Determine priority based on participant count
                num_participants = stream.get("num_participants", 0)
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
                        "name": stream.get("name", "Unknown"),
                        "symbol": stream.get("symbol", ""),
                        "participants": num_participants,
                        "market_cap": stream.get("market_cap"),
                        "image_uri": stream.get("image_uri"),
                        "thumbnail": stream.get("thumbnail"),
                        "creator": stream.get("creator"),
                        "is_currently_live": stream.get("is_currently_live", True),
                    },
                    priority=priority,
                )
                sources.append(source)
            
            logger.info(f"WebRTCPlugin discovered {len(sources)} sources")
            return sources
        
        except Exception as e:
            logger.error(f"Error discovering WebRTC sources: {e}")
            return []
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        """
        Archive a WebRTC stream.
        
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
            logger.info(f"Archiving WebRTC stream: {mint_id}")
            
            # Get recording config from source metadata or plugin config
            output_format = self.config.get("output_format", "webm")
            video_quality = self.config.get("video_quality", "best")
            
            # Start recording using existing service
            result = await self.recording_service.start_recording(
                mint_id=mint_id,
                output_format=output_format,
                video_quality=video_quality,
            )
            
            if result.get("success"):
                # Wait a moment for recording to start
                import asyncio
                await asyncio.sleep(2)
                
                # Get recording status
                status = await self.recording_service.get_recording_status(mint_id)
                
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
            streams = await self.pumpfun_service.get_popular_live_streams(limit=1)
            return True
        except Exception as e:
            logger.error(f"WebRTCPlugin health check failed: {e}")
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
            result = await self.recording_service.stop_recording(source_id)
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
            return await self.recording_service.get_recording_status(source_id)
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
            return await self.recording_service.get_all_recordings()
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
        Subscribe to a WebRTC stream with specific LiveKit URL configuration.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "WebRTCPlugin",
          "operation": "subscribe",
          "params": {
            "collection_uri": "wss://pump-prod-tg2x8veh.livekit.cloud",
            "config": {
              "stream_name": "My Stream",
              "stream_id": "my-stream-id",
              "auto_record": true,
              "livekit_api_key": "",
              "livekit_api_secret": ""
            }
          }
        }
        """
        try:
            db = next(get_db_session())
            
            # Extract configuration
            config = config or {}
            stream_id = config.get("stream_id", collection_uri)  # Default to collection_uri if no stream_id
            stream_name = config.get("stream_name", stream_id)
            livekit_url = collection_uri  # collection_uri is the LiveKit URL
            auto_record = config.get("auto_record", True)
            livekit_api_key = config.get("livekit_api_key", "")
            livekit_api_secret = config.get("livekit_api_secret", "")
            
            # Check if already subscribed
            existing_stmt = select(WebRTCSubscription).where(WebRTCSubscription.stream_id == stream_id)
            existing_result = db.execute(existing_stmt)
            existing_subscription = existing_result.scalar_one_or_none()
            
            if existing_subscription:
                return {
                    "success": False,
                    "error": "Already subscribed to this stream",
                    "stream_id": stream_id,
                    "stream_name": existing_subscription.stream_name,
                }
            
            # Create new subscription
            new_subscription = WebRTCSubscription(
                stream_id=stream_id,
                stream_name=stream_name,
                livekit_url=livekit_url,
                livekit_api_key=livekit_api_key,
                livekit_api_secret=livekit_api_secret,
                auto_record=auto_record,
                config=config
            )
            db.add(new_subscription)
            db.commit()
            db.refresh(new_subscription)
            
            logger.info(f"Subscribed to WebRTC stream: {new_subscription.stream_name}")
            
            return {
                "success": True,
                "stream_id": new_subscription.stream_id,
                "stream_name": new_subscription.stream_name,
                "livekit_url": new_subscription.livekit_url,
                "enabled": new_subscription.enabled,
                "auto_record": new_subscription.auto_record,
                "created_at": new_subscription.created_at.isoformat(),
            }
        
        except Exception as e:
            logger.error(f"Error subscribing to WebRTC stream: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()
    
    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a WebRTC stream.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "WebRTCPlugin",
          "operation": "unsubscribe",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        try:
            db = next(get_db_session())
            
            stmt = select(WebRTCSubscription).where(WebRTCSubscription.stream_id == collection_id)
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()
            
            if not subscription:
                return {
                    "success": False,
                    "error": "Stream subscription not found",
                }
            
            db.delete(subscription)
            db.commit()
            
            logger.info(f"Unsubscribed from WebRTC stream: {subscription.stream_name}")
            
            return {
                "success": True,
                "message": f"Unsubscribed from {subscription.stream_name}",
            }
        
        except Exception as e:
            logger.error(f"Error unsubscribing from stream: {e}")
            return {
                "success": False,
                "error": str(e),
            }
        finally:
            db.close()
    
    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all WebRTC stream subscriptions.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "WebRTCPlugin",
          "operation": "list_subscriptions",
          "params": {}
        }
        """
        try:
            db = next(get_db_session())
            
            stmt = select(WebRTCSubscription).order_by(WebRTCSubscription.stream_name)
            result = db.execute(stmt)
            subscriptions = result.scalars().all()
            
            subscription_list = []
            for sub in subscriptions:
                subscription_list.append({
                    "stream_id": sub.stream_id,
                    "stream_name": sub.stream_name,
                    "livekit_url": sub.livekit_url,
                    "enabled": sub.enabled,
                    "auto_record": sub.auto_record,
                    "created_at": sub.created_at.isoformat(),
                    "last_polled_at": sub.last_polled_at.isoformat() if sub.last_polled_at else None,
                    "session_count": len(sub.sessions)
                })
            
            return subscription_list
        
        except Exception as e:
            logger.error(f"Error listing WebRTC subscriptions: {e}")
            return []
        finally:
            db.close()
    
    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        """
        Get WebRTC subscription details.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "WebRTCPlugin",
          "operation": "get_subscription",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        try:
            db = next(get_db_session())
            
            stmt = select(WebRTCSubscription).where(WebRTCSubscription.stream_id == collection_id)
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()
            
            if not subscription:
                return None
            
            return {
                "stream_id": subscription.stream_id,
                "stream_name": subscription.stream_name,
                "livekit_url": subscription.livekit_url,
                "enabled": subscription.enabled,
                "auto_record": subscription.auto_record,
                "config": subscription.config,
                "created_at": subscription.created_at.isoformat(),
                "updated_at": subscription.updated_at.isoformat(),
                "last_polled_at": subscription.last_polled_at.isoformat() if subscription.last_polled_at else None,
                "session_count": len(subscription.sessions),
                "sessions": [
                    {
                        "session_id": s.session_id,
                        "stream_name": s.stream_name,
                        "recording_status": s.recording_status,
                        "recording_path": s.recording_path,
                        "started_at": s.started_at.isoformat() if s.started_at else None,
                        "ended_at": s.ended_at.isoformat() if s.ended_at else None
                    }
                    for s in subscription.sessions
                ]
            }
        
        except Exception as e:
            logger.error(f"Error getting WebRTC subscription: {e}")
            return None
        finally:
            db.close()
    
    async def discover_from_subscription(self, collection_id: str) -> List[MediaSource]:
        """
        Discover sessions from a specific WebRTC stream subscription.
        
        Called via: POST /api/plugins/execute
        {
          "plugin_name": "WebRTCPlugin",
          "operation": "discover_from_subscription",
          "params": {"collection_id": "my-stream-id"}
        }
        """
        try:
            db = next(get_db_session())
            
            stmt = select(WebRTCSubscription).where(WebRTCSubscription.stream_id == collection_id)
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()
            
            if not subscription:
                logger.error(f"WebRTC subscription {collection_id} not found")
                return []
            
            logger.info(f"Discovering sessions from subscription: {subscription.stream_name}")
            
            # Adapt to MediaSource format based on stream type  
            sources = []
            for i, session in enumerate(subscription.sessions):
                source = MediaSource(
                    source_id=f"{subscription.stream_id}_{session.session_id}",
                    media_type=MediaType.WEBRTC,
                    uri=f"webrtc://{subscription.stream_id}",
                    metadata={
                        "stream_name": subscription.stream_name,
                        "stream_id": subscription.stream_id,
                        "livekit_url": subscription.livekit_url,
                        "session_id": session.session_id,
                        "recording_status": session.recording_status,
                        "recording_path": session.recording_path,
                    },
                    priority="normal"
                )
                sources.append(source)
            
            db.commit()
            logger.info(f"Discovered {len(sources)} sources from {subscription.stream_name}")
            return sources
        
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
          "plugin_name": "WebRTCPlugin",
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
            "output_format": "webm",
            "video_quality": "best",
        }
