from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.live_session_service import LiveSessionService

router = APIRouter()

# Initialize the singleton service
live_session_service = LiveSessionService()


class StartSessionRequest(BaseModel):
    room_name: str
    record_session: Optional[bool] = False


class StopSessionRequest(BaseModel):
    room_name: str


@router.post("/start")
async def start_live_session(request: StartSessionRequest):
    """
    Start a new live streaming session.

    - **room_name**: Name of the LiveKit room to connect to
    - **record_session**: Whether to record the session (default: false)
    """
    try:
        result = await live_session_service.start_session(
            room_name=request.room_name,
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

    - **room_name**: Name of the room to disconnect from
    """
    try:
        result = await live_session_service.stop_session(request.room_name)

        if not result["success"]:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop session: {str(e)}")


@router.websocket("/ws/live/{room_name}")
async def live_stream_websocket(websocket: WebSocket, room_name: str):
    """
    WebSocket endpoint for live video/audio streaming.

    Connects to the specified room and streams:
    - Video frames as binary JPEG data
    - Audio frames as text messages prefixed with "audio:"
    """
    await live_session_service.connect_websocket(websocket, room_name)


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
