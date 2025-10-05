"""
Live session API endpoints using shared StreamManager.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.live_session_service import LiveSessionService

# Initialize the singleton service
live_session_service = LiveSessionService()

router = APIRouter()


class StartSessionRequest(BaseModel):
    mint_id: str
    # Recording is handled by separate /api/recording endpoints


class StopSessionRequest(BaseModel):
    mint_id: str


@router.post("/start")
async def start_live_session(request: StartSessionRequest):
    """
    Start a new live streaming session for a pump.fun stream.

    - **mint_id**: Pump.fun mint ID of the coin/stream to connect to
    
    Note: Recording is handled by separate /api/recording endpoints.
    """
    try:
        result = await live_session_service.start_session(
            mint_id=request.mint_id
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_live_session(request: StopSessionRequest):
    """
    Stop a live streaming session.

    - **mint_id**: Pump.fun mint ID of the session to stop
    """
    try:
        result = await live_session_service.stop_session(
            mint_id=request.mint_id
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
async def get_active_sessions():
    """
    Get information about all active live streaming sessions.
    """
    try:
        sessions = await live_session_service.get_active_sessions()
        return {"success": True, "sessions": sessions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/stream/{mint_id}")
async def websocket_stream(websocket: WebSocket, mint_id: str):
    """
    WebSocket endpoint for streaming video/audio frames.
    
    - **mint_id**: Pump.fun mint ID of the stream to connect to
    """
    await websocket.accept()
    
    try:
        # Add WebSocket to the session
        await live_session_service.add_websocket(mint_id, websocket)
        
        # Keep connection alive
        while True:
            try:
                # Wait for client messages (ping/pong)
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error for {mint_id}: {e}")
                break
                
    except Exception as e:
        print(f"WebSocket connection error for {mint_id}: {e}")
    finally:
        # Remove WebSocket from session
        await live_session_service.remove_websocket(mint_id, websocket)