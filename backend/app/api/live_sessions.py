from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.live_session_service import LiveSessionService

router = APIRouter()

# Initialize the singleton service
live_session_service = LiveSessionService()


class StartSessionRequest(BaseModel):
    mint_id: str
    record_session: Optional[bool] = False


class StopSessionRequest(BaseModel):
    mint_id: str


@router.post("/start")
async def start_live_session(request: StartSessionRequest):
    """
    Start a new live streaming session for a pump.fun stream.

    - **mint_id**: Pump.fun mint ID of the coin/stream to connect to
    - **record_session**: Whether to record the session (default: false)
    """
    try:
        result = await live_session_service.start_session(
            mint_id=request.mint_id,
            record_session=request.record_session
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(e)}")


@router.post("/stop")
async def stop_live_session(request: StopSessionRequest):
    """
    Stop a live streaming session.

    - **mint_id**: Pump.fun mint ID of the stream to disconnect from
    """
    try:
        result = await live_session_service.stop_session(request.mint_id)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop session: {str(e)}")


@router.websocket("/ws/live/{mint_id}")
async def live_stream_websocket(websocket: WebSocket, mint_id: str):
    """
    WebSocket endpoint for live video/audio streaming from pump.fun.

    Connects to the specified mint_id stream and streams:
    - Video frames as binary JPEG data
    - Audio frames as text messages prefixed with "audio:"
    """
    await live_session_service.connect_websocket(websocket, mint_id)


@router.get("/active")
async def get_active_sessions():
    """
    Get information about all currently active live streaming sessions.
    """
    try:
        sessions = live_session_service.get_active_sessions()
        return {
            "active_sessions": sessions,
            "count": len(sessions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get active sessions: {str(e)}")
