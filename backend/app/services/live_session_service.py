"""
LiveKit live streaming session management using shared StreamManager.
Handles WebSocket streaming only - recording is handled by separate service.
"""

import asyncio
import json
import base64
from typing import Dict, Any, Optional, Set
from datetime import datetime, timezone

from fastapi import WebSocket
from livekit.rtc import VideoFrame, AudioFrame
from PIL import Image
import io

from app.services.stream_manager import StreamManager
from app.models.live_session import LiveSession
from app.models.database import get_db


class LiveSessionService:
    """
    Live streaming session service using shared StreamManager.
    Handles WebSocket streaming only - recording is handled by separate service.
    """

    _instance: Optional['LiveSessionService'] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self.stream_manager = StreamManager()
            self.active_websockets: Dict[str, Set[WebSocket]] = {}
            self._initialized = True

    async def start_session(self, mint_id: str) -> Dict[str, Any]:
        """
        Start a new live streaming session for the given pump.fun mint_id.
        Returns session information including participant SID.
        """
        try:
            # Start stream using shared StreamManager
            result = await self.stream_manager.start_stream(mint_id)
            
            if not result["success"]:
                return result

            # Store session in database
            db = next(get_db())
            try:
                # Check if session already exists
                existing_session = db.query(LiveSession).filter(
                    LiveSession.mint_id == mint_id,
                    LiveSession.status == "active"
                ).first()
                
                if existing_session:
                    return {
                        "success": False, 
                        "error": f"Active session already exists for mint_id: {mint_id}"
                    }

                # Create new session
                live_session = LiveSession(
                    mint_id=mint_id,
                    room_name=result["room_name"],
                    participant_sid=result["participant_sid"],
                    status="active",
                    created_at=datetime.now(timezone.utc)
                )
                
                db.add(live_session)
                db.commit()
                db.refresh(live_session)

                # Set up frame handlers for streaming
                await self._setup_streaming_handlers(mint_id)

                return {
                    "success": True,
                    "mint_id": mint_id,
                    "room_name": result["room_name"],
                    "participant_sid": result["participant_sid"],
                    "session_id": live_session.id,
                    "stream_info": result["stream_info"]
                }
            finally:
                db.close()

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"Error starting session for {mint_id}: {e}")
            print(f"Full traceback:\n{error_details}")
            return {"success": False, "error": str(e)}

    async def stop_session(self, mint_id: str) -> Dict[str, Any]:
        """Stop a live streaming session."""
        try:
            # Stop stream using shared StreamManager
            result = await self.stream_manager.stop_stream(mint_id)
            
            # Update database
            db = next(get_db())
            try:
                session = db.query(LiveSession).filter(
                    LiveSession.mint_id == mint_id,
                    LiveSession.status == "active"
                ).first()
                
                if session:
                    session.status = "stopped"
                    session.ended_at = datetime.now(timezone.utc)
                    db.commit()

                # Close WebSocket connections
                if mint_id in self.active_websockets:
                    for websocket in self.active_websockets[mint_id]:
                        try:
                            await websocket.close()
                        except:
                            pass
                    del self.active_websockets[mint_id]

                return {"success": True, "mint_id": mint_id}
            finally:
                db.close()

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _setup_streaming_handlers(self, mint_id: str) -> None:
        """Set up frame handlers for streaming."""
        
        def video_frame_handler(frame: VideoFrame):
            """Handle video frames for streaming."""
            asyncio.create_task(self._stream_video_frame(mint_id, frame))
        
        def audio_frame_handler(frame: AudioFrame):
            """Handle audio frames for streaming."""
            asyncio.create_task(self._stream_audio_frame(mint_id, frame))
        
        # Register handlers with StreamManager
        self.stream_manager.register_video_frame_handler(mint_id, video_frame_handler)
        self.stream_manager.register_audio_frame_handler(mint_id, audio_frame_handler)

    async def _stream_video_frame(self, mint_id: str, frame: VideoFrame) -> None:
        """Stream video frame to WebSocket clients."""
        if mint_id not in self.active_websockets or not self.active_websockets[mint_id]:
            return

        try:
            # Convert frame to JPEG
            img = Image.frombytes("RGB", (frame.width, frame.height), frame.data)
            img = img.convert("RGB")
            
            # Convert to JPEG bytes
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            jpeg_data = buffer.getvalue()
            
            # Encode as base64
            base64_data = base64.b64encode(jpeg_data).decode('utf-8')
            
            # Send to all WebSocket clients
            message = {
                "type": "video_frame",
                "mint_id": mint_id,
                "data": base64_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            # Send to all connected WebSockets
            disconnected_websockets = set()
            for websocket in self.active_websockets[mint_id]:
                try:
                    await websocket.send_text(json.dumps(message))
                except:
                    disconnected_websockets.add(websocket)
            
            # Remove disconnected WebSockets
            for websocket in disconnected_websockets:
                self.active_websockets[mint_id].discard(websocket)
                
        except Exception as e:
            print(f"Error streaming video frame for {mint_id}: {e}")

    async def _stream_audio_frame(self, mint_id: str, frame: AudioFrame) -> None:
        """Stream audio frame to WebSocket clients."""
        if mint_id not in self.active_websockets or not self.active_websockets[mint_id]:
            return

        try:
            # Convert audio frame to base64
            audio_data = frame.data
            base64_data = base64.b64encode(audio_data).decode('utf-8')
            
            # Send to all WebSocket clients
            message = {
                "type": "audio_frame",
                "mint_id": mint_id,
                "data": base64_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            # Send to all connected WebSockets
            disconnected_websockets = set()
            for websocket in self.active_websockets[mint_id]:
                try:
                    await websocket.send_text(json.dumps(message))
                except:
                    disconnected_websockets.add(websocket)
            
            # Remove disconnected WebSockets
            for websocket in disconnected_websockets:
                self.active_websockets[mint_id].discard(websocket)
                
        except Exception as e:
            print(f"Error streaming audio frame for {mint_id}: {e}")

    async def add_websocket(self, mint_id: str, websocket: WebSocket) -> None:
        """Add a WebSocket connection for streaming."""
        if mint_id not in self.active_websockets:
            self.active_websockets[mint_id] = set()
        self.active_websockets[mint_id].add(websocket)
        
        # Also register with StreamManager
        await self.stream_manager.add_websocket(mint_id, websocket)

    async def remove_websocket(self, mint_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if mint_id in self.active_websockets:
            self.active_websockets[mint_id].discard(websocket)
            if not self.active_websockets[mint_id]:
                del self.active_websockets[mint_id]
        
        # Also unregister from StreamManager
        await self.stream_manager.remove_websocket(mint_id, websocket)

    async def get_active_sessions(self) -> Dict[str, Any]:
        """Get information about all active sessions."""
        return await self.stream_manager.get_active_streams()