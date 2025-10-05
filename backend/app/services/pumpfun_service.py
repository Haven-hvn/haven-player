import httpx
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta
import logging
from sqlalchemy.orm import Session
from app.models.database import SessionLocal
from app.models.pumpfun_coin import PumpFunCoin

logger = logging.getLogger(__name__)

class PumpFunService:
    """
    Service for interacting with pump.fun APIs to get live streams and tokens.
    """
    
    # Constants from pump.fun
    LIVEKIT_URL = "wss://pump-prod-tg2x8veh.livekit.cloud"
    JOIN_API_URL = "https://livestream-api.pump.fun/livestream/join"
    LIVE_STREAMS_API_URL = "https://frontend-api-v3.pump.fun/coins/currently-live"
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Origin": "https://pump.fun",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                "Content-Type": "application/json"
            }
        )

    async def get_livestream_token(self, mint_id: str, role: str = "viewer") -> Optional[str]:
        """
        Get LiveKit token for a specific mint_id from pump.fun.
        
        Args:
            mint_id: The mint ID of the coin/stream
            role: Role to join as (default: "viewer")
            
        Returns:
            LiveKit token string or None if failed
        """
        try:
            payload = {
                "mintId": mint_id,
                "role": role
            }
            
            logger.info(f"Requesting token for mint_id: {mint_id}")
            response = await self.http_client.post(
                self.JOIN_API_URL,
                json=payload
            )
            
            if response.status_code in [200, 201]:  # Both 200 and 201 are success
                data = response.json()
                token = data.get("token")
                if token:
                    logger.info(f"Successfully obtained token for {mint_id}")
                    return token
                else:
                    logger.error(f"No token in response for {mint_id}: {data}")
            else:
                logger.error(f"Failed to get token for {mint_id}: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"Error getting token for {mint_id}: {e}")
            
        return None

    async def get_currently_live_streams(
        self, 
        offset: int = 0, 
        limit: int = 60, 
        include_nsfw: bool = True,
        use_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Get currently live streams from pump.fun.
        
        Args:
            offset: Pagination offset
            limit: Number of results to return
            include_nsfw: Whether to include NSFW streams
            use_cache: Whether to cache/update coin data in database
            
        Returns:
            List of live stream data
        """
        try:
            params = {
                "offset": offset,
                "limit": limit,
                "sort": "currently_live",
                "order": "DESC",
                "includeNsfw": str(include_nsfw).lower()
            }
            
            logger.info(f"Fetching live streams with params: {params}")
            response = await self.http_client.get(
                self.LIVE_STREAMS_API_URL,
                params=params
            )
            
            if response.status_code == 200:
                streams = response.json()
                logger.info(f"Found {len(streams)} live streams")
                
                # Cache/update coin data if requested
                if use_cache:
                    await self._cache_coin_data(streams)
                
                return streams
            else:
                logger.error(f"Failed to get live streams: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"Error getting live streams: {e}")
            
        return []

    async def _cache_coin_data(self, streams: List[Dict[str, Any]]) -> None:
        """Cache or update coin data in the database."""
        db = SessionLocal()
        try:
            for stream_data in streams:
                mint_id = stream_data.get("mint")
                if not mint_id:
                    continue
                
                # Check if coin already exists
                existing_coin = db.query(PumpFunCoin).filter(
                    PumpFunCoin.mint_id == mint_id
                ).first()
                
                if existing_coin:
                    # Update existing coin
                    existing_coin.update_from_pumpfun_data(stream_data)
                else:
                    # Create new coin
                    new_coin = PumpFunCoin.from_pumpfun_data(stream_data)
                    db.add(new_coin)
                
            db.commit()
            logger.debug(f"Cached data for {len(streams)} coins")
            
        except Exception as e:
            logger.error(f"Error caching coin data: {e}")
            db.rollback()
        finally:
            db.close()

    async def get_cached_coin_data(self, mint_id: str) -> Optional[Dict[str, Any]]:
        """Get cached coin data from database."""
        db = SessionLocal()
        try:
            coin = db.query(PumpFunCoin).filter(
                PumpFunCoin.mint_id == mint_id
            ).first()
            
            if coin:
                return coin.to_dict()
            return None
            
        except Exception as e:
            logger.error(f"Error getting cached coin data for {mint_id}: {e}")
            return None
        finally:
            db.close()

    async def get_stream_info(self, mint_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific stream by mint_id.
        
        Args:
            mint_id: The mint ID to look for
            
        Returns:
            Stream info dict or None if not found
        """
        try:
            # Get all live streams and find the one with matching mint_id
            streams = await self.get_currently_live_streams(limit=100)
            
            for stream in streams:
                if stream.get("mint") == mint_id:
                    logger.info(f"Found stream info for {mint_id}: {stream['name']} ({stream['symbol']})")
                    return stream
                    
            logger.warning(f"Stream not found for mint_id: {mint_id}")
            
        except Exception as e:
            logger.error(f"Error getting stream info for {mint_id}: {e}")
            
        return None

    def get_livekit_url(self) -> str:
        """Get the constant LiveKit URL for pump.fun."""
        return self.LIVEKIT_URL

    async def validate_mint_id(self, mint_id: str) -> bool:
        """
        Validate if a mint_id corresponds to an active live stream.
        
        Args:
            mint_id: The mint ID to validate
            
        Returns:
            True if valid and live, False otherwise
        """
        try:
            stream_info = await self.get_stream_info(mint_id)
            return stream_info is not None and stream_info.get("is_currently_live", False)
        except Exception as e:
            logger.error(f"Error validating mint_id {mint_id}: {e}")
            return False

    async def get_popular_live_streams(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get popular live streams sorted by participant count.
        
        Args:
            limit: Maximum number of streams to return
            
        Returns:
            List of popular live streams
        """
        try:
            streams = await self.get_currently_live_streams(limit=limit * 2)  # Get more to filter
            
            # Filter only live streams and sort by participant count
            live_streams = [
                stream for stream in streams 
                if stream.get("is_currently_live", False)
            ]
            
            # Sort by participant count (descending)
            popular_streams = sorted(
                live_streams,
                key=lambda x: x.get("num_participants", 0),
                reverse=True
            )[:limit]
            
            logger.info(f"Found {len(popular_streams)} popular live streams")
            return popular_streams
            
        except Exception as e:
            logger.error(f"Error getting popular streams: {e}")
            return []

    async def close(self):
        """Close the HTTP client."""
        await self.http_client.aclose()

    def format_stream_for_ui(self, stream: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format stream data for frontend consumption.
        
        Args:
            stream: Raw stream data from pump.fun API
            
        Returns:
            Formatted stream data
        """
        return {
            "mint_id": stream.get("mint"),
            "name": stream.get("name"),
            "symbol": stream.get("symbol"),
            "description": stream.get("description"),
            "image_uri": stream.get("image_uri"),
            "thumbnail": stream.get("thumbnail"),
            "creator": stream.get("creator"),
            "market_cap": stream.get("market_cap"),
            "usd_market_cap": stream.get("usd_market_cap"),
            "num_participants": stream.get("num_participants", 0),
            "is_currently_live": stream.get("is_currently_live", False),
            "created_timestamp": stream.get("created_timestamp"),
            "last_trade_timestamp": stream.get("last_trade_timestamp"),
            "nsfw": stream.get("nsfw", False),
            "website": stream.get("website"),
            "twitter": stream.get("twitter"),
            "telegram": stream.get("telegram")
        }
