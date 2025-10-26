from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.services.pumpfun_service import PumpFunService

router = APIRouter()

# Initialize the pump.fun service
pumpfun_service = PumpFunService()


class StreamInfo(BaseModel):
    mint_id: str
    name: str
    symbol: str
    description: Optional[str] = None
    image_uri: Optional[str] = None
    thumbnail: Optional[str] = None
    creator: Optional[str] = None
    market_cap: Optional[float] = None
    usd_market_cap: Optional[float] = None
    num_participants: int = 0
    is_currently_live: bool = False
    created_timestamp: Optional[int] = None
    last_trade_timestamp: Optional[int] = None
    nsfw: bool = False
    website: Optional[str] = None
    twitter: Optional[str] = None
    telegram: Optional[str] = None


@router.get("/live", response_model=List[StreamInfo])
async def get_live_streams(
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(60, ge=1, le=100, description="Number of results to return"),
    include_nsfw: bool = Query(True, description="Whether to include NSFW streams")
):
    """
    Get currently live pump.fun streams.
    
    Returns a list of active live streams with their metadata.
    """
    try:
        streams = await pumpfun_service.get_currently_live_streams(
            offset=offset,
            limit=limit,
            include_nsfw=include_nsfw
        )
        
        # Format streams for response
        formatted_streams = [
            pumpfun_service.format_stream_for_ui(stream)
            for stream in streams
        ]
        
        return formatted_streams
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get live streams: {str(e)}")


@router.get("/popular", response_model=List[StreamInfo])
async def get_popular_streams(
    limit: int = Query(20, ge=1, le=50, description="Number of popular streams to return")
):
    """
    Get popular live streams sorted by participant count.
    
    Returns the most popular currently live streams.
    """
    try:
        streams = await pumpfun_service.get_popular_live_streams(limit=limit)
        
        # Format streams for response
        formatted_streams = [
            pumpfun_service.format_stream_for_ui(stream)
            for stream in streams
        ]
        
        return formatted_streams
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get popular streams: {str(e)}")


@router.get("/stream/{mint_id}", response_model=StreamInfo)
async def get_stream_info(mint_id: str):
    """
    Get detailed information about a specific stream by mint_id.
    
    - **mint_id**: The mint ID of the coin/stream
    """
    try:
        stream_info = await pumpfun_service.get_stream_info(mint_id)
        
        if not stream_info:
            raise HTTPException(status_code=404, detail=f"Stream not found for mint_id: {mint_id}")
        
        formatted_stream = pumpfun_service.format_stream_for_ui(stream_info)
        return formatted_stream
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stream info: {str(e)}")


@router.get("/validate/{mint_id}")
async def validate_stream(mint_id: str):
    """
    Validate if a mint_id corresponds to an active live stream.
    
    - **mint_id**: The mint ID to validate
    """
    try:
        is_valid = await pumpfun_service.validate_mint_id(mint_id)
        
        return {
            "mint_id": mint_id,
            "is_valid": is_valid,
            "is_live": is_valid  # If valid, it's also live
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to validate mint_id: {str(e)}")


@router.get("/token/{mint_id}")
async def get_stream_token(mint_id: str):
    """
    Get a LiveKit token for a specific mint_id stream.
    
    This is mainly for testing purposes. In normal operation,
    tokens are obtained automatically when starting a session.
    
    - **mint_id**: The mint ID of the coin/stream
    """
    try:
        # Validate the mint_id first
        is_valid = await pumpfun_service.validate_mint_id(mint_id)
        if not is_valid:
            raise HTTPException(status_code=404, detail=f"Stream not found or not live for mint_id: {mint_id}")
        
        # Get token
        token = await pumpfun_service.get_livestream_token(mint_id, role="viewer")
        
        if not token:
            raise HTTPException(status_code=500, detail=f"Failed to get token for mint_id: {mint_id}")
        
        return {
            "mint_id": mint_id,
            "token": token,
            "livekit_url": pumpfun_service.get_livekit_url(),
            "role": "viewer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get token: {str(e)}")


@router.get("/connection/{mint_id}")
async def get_stream_connection_details(mint_id: str):
    """
    Get complete LiveKit connection details for frontend recording.
    
    This endpoint leverages the StreamManager to provide all necessary
    connection information for browser-side recording using RecordRTC.js.
    
    - **mint_id**: The mint ID of the coin/stream
    """
    try:
        from app.services.stream_manager import StreamManager
        
        # Initialize StreamManager
        stream_manager = StreamManager()
        await stream_manager.initialize()
        
        # Start stream connection using StreamManager
        stream_result = await stream_manager.start_stream(mint_id)
        
        if not stream_result.get("success"):
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to connect to stream: {stream_result.get('error', 'Unknown error')}"
            )
        
        # Get LiveKit token for frontend connection
        token = await pumpfun_service.get_livestream_token(mint_id, role="viewer")
        
        if not token:
            raise HTTPException(status_code=500, detail=f"Failed to get token for mint_id: {mint_id}")
        
        # Get stream info from StreamManager
        stream_info = await stream_manager.get_stream_info(mint_id)
        
        if not stream_info:
            raise HTTPException(status_code=500, detail="Stream info not available")
        
        return {
            "success": True,
            "mint_id": mint_id,
            "room_name": stream_info.room_name,
            "participant_sid": stream_info.participant_sid,
            "livekit_url": stream_info.stream_url,
            "token": token,
            "role": "viewer",
            "stream_data": stream_info.stream_data,
            "connection_status": "active"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get connection details: {str(e)}")


@router.post("/disconnect/{mint_id}")
async def disconnect_stream(mint_id: str):
    """
    Disconnect from a LiveKit stream.
    
    This endpoint cleans up the StreamManager connection for the given mint_id.
    
    - **mint_id**: The mint ID of the coin/stream to disconnect
    """
    try:
        from app.services.stream_manager import StreamManager
        
        # Initialize StreamManager
        stream_manager = StreamManager()
        await stream_manager.initialize()
        
        # Stop stream connection
        result = await stream_manager.stop_stream(mint_id)
        
        if not result.get("success"):
            raise HTTPException(
                status_code=404, 
                detail=f"Failed to disconnect stream: {result.get('error', 'Unknown error')}"
            )
        
        return {
            "success": True,
            "mint_id": mint_id,
            "message": "Stream disconnected successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to disconnect stream: {str(e)}")


@router.get("/stats")
async def get_stream_stats():
    """
    Get general statistics about pump.fun live streams.
    """
    try:
        # Get current live streams
        streams = await pumpfun_service.get_currently_live_streams(limit=100)
        
        # Calculate stats
        total_streams = len(streams)
        total_participants = sum(stream.get("num_participants", 0) for stream in streams)
        nsfw_streams = sum(1 for stream in streams if stream.get("nsfw", False))
        
        # Get top stream by participants
        top_stream = None
        if streams:
            top_stream_data = max(streams, key=lambda x: x.get("num_participants", 0))
            top_stream = pumpfun_service.format_stream_for_ui(top_stream_data)
        
        return {
            "total_live_streams": total_streams,
            "total_participants": total_participants,
            "nsfw_streams": nsfw_streams,
            "sfw_streams": total_streams - nsfw_streams,
            "top_stream": top_stream
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stream stats: {str(e)}")
