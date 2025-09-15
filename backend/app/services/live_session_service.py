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

    async def start_session(self, room_name: str, record_session: bool = False) -> Dict[str, Any]:
        """
        Start a new live streaming session for the given room.
        Returns session information including participant SID.
        """
        if not self.config:
            await self.initialize()

        try:
            # Create room instance
            self.room = rtc.Room()

            # Set up event handlers before connecting
            await self._setup_handlers(record_session)

            # Connect to room with options
            connect_options = rtc.ConnectOptions(
                auto_subscribe=True,
            )

            print(f"Connecting to LiveKit room: {room_name}")

            token = self._generate_token(room_name)
            await self.room.connect(self.config.livekit_url, token, connect_options)

            print(f"Successfully connected to room: {self.room.name}")

            # Get participant info
            participant = self.room.local_participant
            participant_sid = participant.sid
            print(f"Local participant: {participant.identity} ({participant_sid})")

            # Create database session record
            db = SessionLocal()
            try:
                live_session = LiveSession(
                    room_name=room_name,
                    participant_sid=participant_sid,
                    record_session=record_session,
                    status="active"
                )
                db.add(live_session)
                db.commit()
                db.refresh(live_session)

                # Store in active sessions
                self.active_sessions[room_name] = live_session

                print(f"Started live session for room: {room_name}, participant: {participant_sid}")

                return {
                    "success": True,
                    "room_name": room_name,
                    "participant_sid": participant_sid,
                    "session_id": live_session.id,
                    "record_session": record_session
                }
            finally:
                db.close()

        except Exception as e:
            print(f"Failed to start session: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_session(self, room_name: str) -> Dict[str, Any]:
        """Stop the live streaming session for the given room."""
        try:
            # Update database session
            db = SessionLocal()
            try:
                session = db.query(LiveSession).filter(
                    LiveSession.room_name == room_name,
                    LiveSession.status == "active"
                ).first()

                if session:
                    session.status = "completed"
                    session.end_time = datetime.now(timezone.utc)
                    db.commit()

                    # Close recording if active
                    if room_name in self.recording_shims:
                        recording_info = self.recording_shims[room_name].close()
                        if recording_info["video_path"]:
                            session.recording_path = recording_info["video_path"]
                            db.commit()

                        del self.recording_shims[room_name]

                # Remove from active sessions
                if room_name in self.active_sessions:
                    del self.active_sessions[room_name]

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

            print(f"Stopped live session for room: {room_name}")

            return {
                "success": True,
                "room_name": room_name
            }

        except Exception as e:
            print(f"Failed to stop session: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def connect_websocket(self, websocket: WebSocket, room_name: str) -> None:
        """Connect a WebSocket for streaming video/audio to the frontend."""
        await websocket.accept()

        # Add to active websockets for this room
        if room_name not in self.active_websockets:
            self.active_websockets[room_name] = set()
        self.active_websockets[room_name].add(websocket)

        print(f"WebSocket connected for room: {room_name}")

        try:
            # Keep connection alive
            while True:
                # Wait for any message (though we mainly send from server to client)
                data = await websocket.receive_text()
                # Handle any client messages if needed
        except Exception as e:
            print(f"WebSocket error for room {room_name}: {e}")
        finally:
            # Remove from active websockets
            if room_name in self.active_websockets:
                self.active_websockets[room_name].discard(websocket)
                if not self.active_websockets[room_name]:
                    del self.active_websockets[room_name]

            print(f"WebSocket disconnected for room: {room_name}")

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

            # Send to all connected websockets for this participant's room
            # Note: We need to map participant_sid back to room_name
            for room_name, websockets in self.active_websockets.items():
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

            # Send to all connected websockets for this participant's room
            # Format: "audio:" + base64_data
            audio_message = f"audio:{audio_base64}"

            for room_name, websockets in self.active_websockets.items():
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

        # Use LiveKit Server SDK for proper token generation
        try:
            from livekit.api import AccessToken, VideoGrants
        except ImportError:
            print("Warning: livekit-server-sdk not installed. Using placeholder token.")
            print("Install with: pip install livekit-server-sdk")
            return f"token_for_{room_name}"

        token = AccessToken(self.config.livekit_api_key, self.config.livekit_api_secret)
        token.with_identity("haven-player")  # You can customize this
        token.with_name("Haven Player")      # Display name
        token.with_grants(VideoGrants(
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
        active_room_names = list(self.active_sessions.keys())
        for room_name in active_room_names:
            await self.stop_session(room_name)

        # Close all websockets
        for room_name, websockets in self.active_websockets.items():
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

        print("LiveSessionService shutdown complete")

    def get_active_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Get information about all active sessions."""
        return {
            room_name: session.to_dict()
            for room_name, session in self.active_sessions.items()
        }
