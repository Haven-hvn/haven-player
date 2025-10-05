"""
Shared stream management for LiveKit connections.
Manages single WebRTC connection for both streaming and recording.
"""

import asyncio
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass
from pathlib import Path

import livekit.rtc as rtc
from livekit import api

from app.services.pumpfun_service import PumpFunService
from app.models.config import AppConfig
from app.models.database import get_db


@dataclass
class StreamInfo:
    """Information about an active stream."""
    mint_id: str
    room_name: str
    participant_sid: str
    stream_url: str
    token: str
    stream_data: Dict[str, Any]


class StreamManager:
    """
    Shared stream manager for LiveKit connections.
    Manages single WebRTC connection for both streaming and recording.
    """
    
    def __init__(self):
        self.config: Optional[AppConfig] = None
        self.pumpfun_service = PumpFunService()
        
        # Active streams
        self.active_streams: Dict[str, StreamInfo] = {}
        self.room: Optional[rtc.Room] = None
        
        # Event handlers
        self.video_frame_handlers: Dict[str, Callable] = {}
        self.audio_frame_handlers: Dict[str, Callable] = {}
        
        # WebSocket connections for streaming
        self.active_websockets: Dict[str, set] = {}
        
    async def initialize(self) -> None:
        """Initialize the stream manager with configuration."""
        if self.config:
            return
            
        db = next(get_db())
        try:
            config = db.query(AppConfig).first()
            if not config:
                raise ValueError("No configuration found in database")
            self.config = config
            print(f"StreamManager initialized with config: {config.livekit_url}")
        finally:
            db.close()

    async def start_stream(self, mint_id: str) -> Dict[str, Any]:
        """
        Start a new stream connection for the given mint_id.
        Returns stream information for both streaming and recording.
        """
        if not self.config:
            await self.initialize()

        try:
            # Validate mint_id and get stream info
            stream_info = await self.pumpfun_service.get_stream_info(mint_id)
            if not stream_info:
                return {"success": False, "error": f"No stream found for mint_id: {mint_id}"}

            # Get LiveKit token
            token = await self.pumpfun_service.get_livestream_token(mint_id)
            if not token:
                return {"success": False, "error": "Failed to get LiveKit token"}

            # Create room if not exists
            if not self.room:
                self.room = rtc.Room()
                await self._setup_room_handlers()

            # Connect to room
            livekit_url = self.config.livekit_url
            connect_options = rtc.RoomOptions(auto_subscribe=True)
            
            await self.room.connect(livekit_url, token, connect_options)
            
            # Get participant SID
            participant_sid = None
            for participant in self.room.remote_participants.values():
                participant_sid = participant.sid
                break

            if not participant_sid:
                return {"success": False, "error": "No participants found in room"}

            # Store stream info
            stream_info_obj = StreamInfo(
                mint_id=mint_id,
                room_name=self.room.name,
                participant_sid=participant_sid,
                stream_url=livekit_url,
                token=token,
                stream_data=stream_info
            )
            
            self.active_streams[mint_id] = stream_info_obj
            self.active_websockets[mint_id] = set()

            return {
                "success": True,
                "mint_id": mint_id,
                "room_name": self.room.name,
                "participant_sid": participant_sid,
                "stream_info": self.pumpfun_service.format_stream_for_ui(stream_info)
            }

        except Exception as e:
            print(f"Error starting stream for {mint_id}: {e}")
            return {"success": False, "error": str(e)}

    async def stop_stream(self, mint_id: str) -> Dict[str, Any]:
        """Stop a stream connection."""
        try:
            if mint_id in self.active_streams:
                del self.active_streams[mint_id]
            
            if mint_id in self.active_websockets:
                del self.active_websockets[mint_id]
            
            # If no more streams, disconnect room
            if not self.active_streams and self.room:
                await self.room.disconnect()
                self.room = None
            
            return {"success": True, "mint_id": mint_id}
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_stream_info(self, mint_id: str) -> Optional[StreamInfo]:
        """Get stream information for a mint_id."""
        return self.active_streams.get(mint_id)

    def register_video_frame_handler(self, mint_id: str, handler: Callable) -> None:
        """Register a video frame handler for streaming."""
        self.video_frame_handlers[mint_id] = handler

    def register_audio_frame_handler(self, mint_id: str, handler: Callable) -> None:
        """Register an audio frame handler for streaming."""
        self.audio_frame_handlers[mint_id] = handler


    async def _setup_room_handlers(self) -> None:
        """Set up room-level event handlers."""
        
        @self.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            print(f"Participant connected: {participant.sid} ({participant.identity})")

        @self.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            print(f"Participant disconnected: {participant.sid} ({participant.identity})")

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.RemoteTrack, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            print(f"Track subscribed: {track.kind} from {participant.sid}")
            
            # Find mint_id for this participant
            mint_id = None
            for mid, stream_info in self.active_streams.items():
                if stream_info.participant_sid == participant.sid:
                    mint_id = mid
                    break
            
            if not mint_id:
                return

            # Set up track handlers
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                @track.on("frame_received")
                def on_video_frame(frame: rtc.VideoFrame):
                    if mint_id in self.video_frame_handlers:
                        self.video_frame_handlers[mint_id](frame)

            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                @track.on("frame_received")
                def on_audio_frame(frame: rtc.AudioFrame):
                    if mint_id in self.audio_frame_handlers:
                        self.audio_frame_handlers[mint_id](frame)

        @self.room.on("disconnected")
        def on_disconnected():
            print("Room disconnected")
            # Clean up all streams
            self.active_streams.clear()
            self.active_websockets.clear()
            self.video_frame_handlers.clear()
            self.audio_frame_handlers.clear()

    async def add_websocket(self, mint_id: str, websocket) -> None:
        """Add a WebSocket connection for streaming."""
        if mint_id not in self.active_websockets:
            self.active_websockets[mint_id] = set()
        self.active_websockets[mint_id].add(websocket)

    async def remove_websocket(self, mint_id: str, websocket) -> None:
        """Remove a WebSocket connection."""
        if mint_id in self.active_websockets:
            self.active_websockets[mint_id].discard(websocket)
            if not self.active_websockets[mint_id]:
                del self.active_websockets[mint_id]

    async def get_active_streams(self) -> Dict[str, Any]:
        """Get information about all active streams."""
        return {
            mint_id: {
                "mint_id": stream_info.mint_id,
                "room_name": stream_info.room_name,
                "participant_sid": stream_info.participant_sid,
                "stream_data": stream_info.stream_data
            }
            for mint_id, stream_info in self.active_streams.items()
        }
