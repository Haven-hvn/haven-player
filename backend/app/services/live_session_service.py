import asyncio
import json
import base64
import io
from typing import Dict, Optional, Set, Any
from datetime import datetime, timezone
from pathlib import Path

from fastapi import WebSocket
from livekit import rtc
from PIL import Image

from app.models.database import SessionLocal
from app.models.live_session import LiveSession
from app.models.config import AppConfig
from .recording_shim import RecordingShim
from .pumpfun_service import PumpFunService


class LiveSessionService:
    """
    Singleton service for managing LiveKit live streaming sessions.
    Handles room connections, WebSocket streaming, and optional recording.
    """

    _instance: Optional['LiveSessionService'] = None
    _initialized: bool = False

    def __new__(cls) -> 'LiveSessionService':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            # LiveKit components
            self.room: Optional[rtc.Room] = None
            self.room_connection_task: Optional[asyncio.Task] = None

            # WebSocket management
            self.active_websockets: Dict[str, Set[WebSocket]] = {}
            self.websocket_tasks: Dict[str, asyncio.Task] = {}

            # Recording management
            self.recording_shims: Dict[str, RecordingShim] = {}

            # Session management
            self.active_sessions: Dict[str, LiveSession] = {}

            # Configuration
            self.config: Optional[AppConfig] = None

            # Pump.fun service
            self.pumpfun_service = PumpFunService()

            self._initialized = True

    async def initialize(self) -> None:
        """Initialize the service with configuration."""
        db = SessionLocal()
        try:
            # Get configuration from database
            config = db.query(AppConfig).first()
            if not config:
                # Create default config if none exists
                config = AppConfig()
                db.add(config)
                db.commit()
                db.refresh(config)

            self.config = config
            print(f"LiveSessionService initialized with config: {config.livekit_url}")
        finally:
            db.close()

    async def start_session(self, mint_id: str, record_session: bool = False) -> Dict[str, Any]:
        """
        Start a new live streaming session for the given pump.fun mint_id.
        Returns session information including participant SID.
        """
        if not self.config:
            await self.initialize()

        try:
            # Validate mint_id and get stream info
            stream_info = await self.pumpfun_service.get_stream_info(mint_id)
            if not stream_info:
                return {
                    "success": False,
                    "error": f"Stream not found or not live for mint_id: {mint_id}"
                }

            # Get pump.fun token for this mint_id
            token = await self.pumpfun_service.get_livestream_token(mint_id, role="viewer")
            if not token:
                return {
                    "success": False,
                    "error": f"Failed to get livestream token for mint_id: {mint_id}"
                }

            # Create room instance
            self.room = rtc.Room()

            # Set up event handlers before connecting
            await self._setup_handlers(record_session)

            # Connect to room with options
            connect_options = rtc.ConnectOptions(
                auto_subscribe=True,
            )

            print(f"Connecting to pump.fun LiveKit room for mint_id: {mint_id}")
            print(f"Stream: {stream_info['name']} ({stream_info['symbol']})")

            # Use pump.fun's LiveKit URL
            livekit_url = self.pumpfun_service.get_livekit_url()
            await self.room.connect(livekit_url, token, connect_options)

            print(f"Successfully connected to room: {self.room.name}")

            # Get participant info
            participant = self.room.local_participant
            participant_sid = participant.sid
            print(f"Local participant: {participant.identity} ({participant_sid})")

            # Create database session record
            db = SessionLocal()
            try:
                live_session = LiveSession(
                    # Pump.fun fields
                    mint_id=mint_id,
                    coin_name=stream_info.get("name"),
                    coin_symbol=stream_info.get("symbol"),
                    coin_description=stream_info.get("description"),
                    image_uri=stream_info.get("image_uri"),
                    thumbnail=stream_info.get("thumbnail"),
                    creator=stream_info.get("creator"),
                    market_cap=stream_info.get("market_cap"),
                    usd_market_cap=stream_info.get("usd_market_cap"),
                    num_participants=stream_info.get("num_participants", 0),
                    nsfw=stream_info.get("nsfw", False),
                    website=stream_info.get("website"),
                    twitter=stream_info.get("twitter"),
                    telegram=stream_info.get("telegram"),
                    # LiveKit fields
                    room_name=self.room.name,
                    participant_sid=participant_sid,
                    status="active",
                    # Recording fields
                    record_session=record_session
                )
                db.add(live_session)
                db.commit()
                db.refresh(live_session)

                # Store in active sessions
                self.active_sessions[mint_id] = live_session

                print(f"Started live session for mint_id: {mint_id}, participant: {participant_sid}")

                return {
                    "success": True,
                    "mint_id": mint_id,
                    "room_name": self.room.name,
                    "participant_sid": participant_sid,
                    "session_id": live_session.id,
                    "record_session": record_session,
                    "stream_info": self.pumpfun_service.format_stream_for_ui(stream_info)
                }
            finally:
                db.close()

        except Exception as e:
            print(f"Failed to start session: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_session(self, mint_id: str) -> Dict[str, Any]:
        """Stop the live streaming session for the given mint_id."""
        try:
            # Update database session
            db = SessionLocal()
            try:
                session = db.query(LiveSession).filter(
                    LiveSession.mint_id == mint_id,
                    LiveSession.status == "active"
                ).first()

                if session:
                    session.status = "completed"
                    session.end_time = datetime.now(timezone.utc)
                    db.commit()

                    # Close recording if active
                    if mint_id in self.recording_shims:
                        recording_info = self.recording_shims[mint_id].close()
                        if recording_info["video_path"]:
                            session.recording_path = recording_info["video_path"]
                            db.commit()

                        del self.recording_shims[mint_id]

                # Remove from active sessions
                if mint_id in self.active_sessions:
                    del self.active_sessions[mint_id]

            finally:
                db.close()

            # Disconnect from room
            if self.room:
                await self.room.disconnect()
                self.room = None

            # Cancel connection task
            if self.room_connection_task:
                self.room_connection_task.cancel()
                self.room_connection_task = None

            print(f"Stopped live session for mint_id: {mint_id}")

            return {
                "success": True,
                "mint_id": mint_id
            }

        except Exception as e:
            print(f"Failed to stop session: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def connect_websocket(self, websocket: WebSocket, mint_id: str) -> None:
        """Connect a WebSocket for streaming video/audio to the frontend."""
        await websocket.accept()

        # Add to active websockets for this mint_id
        if mint_id not in self.active_websockets:
            self.active_websockets[mint_id] = set()
        self.active_websockets[mint_id].add(websocket)

        print(f"WebSocket connected for mint_id: {mint_id}")

        try:
            # Keep connection alive
            while True:
                # Wait for any message (though we mainly send from server to client)
                data = await websocket.receive_text()
                # Handle any client messages if needed
        except Exception as e:
            print(f"WebSocket error for mint_id {mint_id}: {e}")
        finally:
            # Remove from active websockets
            if mint_id in self.active_websockets:
                self.active_websockets[mint_id].discard(websocket)
                if not self.active_websockets[mint_id]:
                    del self.active_websockets[mint_id]

            print(f"WebSocket disconnected for mint_id: {mint_id}")

    async def _setup_handlers(self, record_session: bool) -> None:
        """Set up LiveKit event handlers for video/audio tracks."""

        # Set up room-level event handlers
        @self.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            print(f"Participant connected: {participant.sid} ({participant.identity})")

        @self.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            print(f"Participant disconnected: {participant.sid} ({participant.identity})")
            # Clean up recording shim if exists
            if participant.sid in self.recording_shims:
                self.recording_shims[participant.sid].close()
                del self.recording_shims[participant.sid]

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            print(f"Track subscribed: {track.kind} from {participant.identity}")

            if track.kind == rtc.TrackKind.KIND_VIDEO:
                if record_session:
                    # Initialize recording shim for this participant
                    recording_dir = self.config.recording_directory if self.config else "~/.haven-player/recordings"
                    shim = RecordingShim(recording_dir, participant.sid)
                    self.recording_shims[participant.sid] = shim

                # Set up video frame handler
                @track.on("frame_received")
                def on_video_frame(frame: rtc.VideoFrame):
                    asyncio.create_task(self._stream_video(frame, participant.sid))

            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                # Set up audio frame handler
                @track.on("frame_received")
                def on_audio_frame(frame: rtc.AudioFrame):
                    asyncio.create_task(self._stream_audio(frame, participant.sid))

        @self.room.on("track_unsubscribed")
        def on_track_unsubscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            print(f"Track unsubscribed: {track.kind} from {participant.identity}")

        @self.room.on("connection_state_changed")
        def on_connection_state_changed(connection_state: rtc.ConnectionState):
            print(f"Connection state changed: {connection_state}")

        @self.room.on("disconnected")
        def on_disconnected():
            print("Room disconnected")
            # Clean up all recording shims
            for shim in self.recording_shims.values():
                shim.close()
            self.recording_shims.clear()

    async def _stream_video(self, frame: rtc.VideoFrame, participant_sid: str) -> None:
        """Convert video frame to JPEG and stream over WebSocket."""
        try:
            # Convert to PIL Image for JPEG encoding
            frame_array = frame.buffer.to_ndarray(format="rgb24")
            image = Image.fromarray(frame_array)

            # Convert to JPEG with quality setting
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=85)
            jpeg_bytes = buffer.getvalue()

            # Record frame if recording is enabled
            if participant_sid in self.recording_shims:
                self.recording_shims[participant_sid].record_video_frame(frame)

            # Send to all connected websockets for this participant's mint_id
            # Note: We need to map participant_sid back to mint_id
            for mint_id, websockets in self.active_websockets.items():
                for websocket in websockets:
                    try:
                        await websocket.send_bytes(jpeg_bytes)
                    except Exception as e:
                        print(f"Failed to send video frame to websocket: {e}")

        except Exception as e:
            print(f"Error streaming video frame: {e}")

    async def _stream_audio(self, frame: rtc.AudioFrame, participant_sid: str) -> None:
        """Convert audio frame to base64 and stream over WebSocket."""
        try:
            # Convert audio data to base64
            audio_bytes = frame.data.tobytes()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

            # Record audio frame if recording is enabled
            if participant_sid in self.recording_shims:
                self.recording_shims[participant_sid].record_audio_frame(frame)

            # Send to all connected websockets for this participant's mint_id
            # Format: "audio:" + base64_data
            audio_message = f"audio:{audio_base64}"

            for mint_id, websockets in self.active_websockets.items():
                for websocket in websockets:
                    try:
                        await websocket.send_text(audio_message)
                    except Exception as e:
                        print(f"Failed to send audio frame to websocket: {e}")

        except Exception as e:
            print(f"Error streaming audio frame: {e}")

    def _generate_token(self, room_name: str) -> str:
        """Generate a LiveKit access token for room connection."""
        if not self.config:
            raise ValueError("Configuration not loaded")

        # Use LiveKit Python SDK for proper token generation
        try:
            from livekit import api
        except ImportError:
            print("Warning: livekit not installed. Using placeholder token.")
            print("Install with: pip install livekit==1.0.13")
            return f"token_for_{room_name}"

        token = api.AccessToken(self.config.livekit_api_key, self.config.livekit_api_secret)
        token.with_identity("haven-player")  # You can customize this
        token.with_name("Haven Player")      # Display name
        token.with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=False,  # We're only subscribing/viewing
            can_subscribe=True,
        ))

        return token.to_jwt()

    async def shutdown(self) -> None:
        """Gracefully shutdown all active sessions and connections."""
        print("Shutting down LiveSessionService...")

        # Stop all active sessions
        active_mint_ids = list(self.active_sessions.keys())
        for mint_id in active_mint_ids:
            await self.stop_session(mint_id)

        # Close all websockets
        for mint_id, websockets in self.active_websockets.items():
            for websocket in websockets:
                try:
                    await websocket.close()
                except Exception as e:
                    print(f"Error closing websocket: {e}")

        self.active_websockets.clear()
        self.websocket_tasks.clear()

        # Disconnect from room if still connected
        if self.room:
            await self.room.disconnect()
            self.room = None

        # Close pump.fun service
        await self.pumpfun_service.close()

        print("LiveSessionService shutdown complete")

    def get_active_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Get information about all active sessions."""
        return {
            mint_id: session.to_dict()
            for mint_id, session in self.active_sessions.items()
        }
