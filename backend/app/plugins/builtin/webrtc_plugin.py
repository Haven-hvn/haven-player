"""
WebRTC recording plugin for Haven Player.

This plugin wraps the existing PumpFun and WebRTC recording services
to provide a plugin interface for archiving WebRTC streams from pump.fun.
"""

from typing import Dict, Any, List
import logging

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
)
from app.services.pumpfun_service import PumpFunService
from app.services.webrtc_recording_service import WebRTCRecordingService

logger = logging.getLogger(__name__)


class WebRTCPlugin(ArchiverPlugin):
    """
    WebRTC recording plugin (wraps existing services).
    
    This plugin provides archiving capabilities for WebRTC streams
    from pump.fun via LiveKit. It wraps the existing PumpFunService
    and WebRTCRecordingService to maintain backward compatibility.
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
            version="1.0.0",
            description="Archives WebRTC streams from pump.fun via LiveKit",
            media_types=[MediaType.WEBRTC],
            author="Haven Team",
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
