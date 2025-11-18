"""
Shared stream management for LiveKit connections.
Manages single WebRTC connection for both streaming and recording.
"""

import asyncio
import logging
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass
from pathlib import Path

import livekit.rtc as rtc
from app.services.pumpfun_service import PumpFunService
from app.models.config import AppConfig
from app.models.database import get_db

# Configure logging
logger = logging.getLogger(__name__)


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
    
    Singleton pattern ensures all services share the same StreamManager instance.
    """
    
    _instance: Optional['StreamManager'] = None
    _initialized: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Only initialize once (singleton pattern)
        if not self._initialized:
            self.config: Optional[AppConfig] = None
            self.pumpfun_service = PumpFunService()

            # Active streams
            self.active_streams: Dict[str, StreamInfo] = {}
            # Multiple rooms - one per mint_id
            self.rooms: Dict[str, rtc.Room] = {}

            # Event handlers
            self.video_frame_handlers: Dict[str, Callable] = {}
            self.audio_frame_handlers: Dict[str, Callable] = {}

            # WebSocket connections for streaming
            self.active_websockets: Dict[str, set] = {}

            StreamManager._initialized = True
            logger.info("✅ StreamManager singleton initialized")
        
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

            # Reuse existing room if it exists and is still connected
            if mint_id in self.rooms:
                existing_room = self.rooms[mint_id]
                # Check if room is still connected
                try:
                    # Try to check connection state - if room is still valid, reuse it
                    if existing_room and hasattr(existing_room, 'connection_state'):
                        # Room exists and might be connected - check if we can reuse
                        stream_info = self.active_streams.get(mint_id)
                        if stream_info:
                            # We already have stream info, return it without reconnecting
                            logger.info(f"Reusing existing connection for {mint_id}")
                            return {
                                "success": True,
                                "mint_id": mint_id,
                                "room_name": stream_info.room_name,
                                "participant_sid": stream_info.participant_sid,
                                "stream_info": self.pumpfun_service.format_stream_for_ui(stream_info.stream_data)
                            }
                except Exception as e:
                    logger.warning(f"Error checking existing room for {mint_id}: {e}")
                
                # If we get here, the existing room is invalid, disconnect it
                if existing_room:
                    try:
                        await existing_room.disconnect()
                    except Exception as e:
                        logger.warning(f"Error disconnecting existing room for {mint_id}: {e}")
                del self.rooms[mint_id]

            # Create new room for this mint_id
            room = rtc.Room()
            await self._setup_room_handlers(room)
            self.rooms[mint_id] = room

            # Connect to room with DISABLED auto-subscribe to prevent buffering
            # CRITICAL: auto_subscribe=True causes UNLIMITED buffering in rtc.Room → 9GB memory!
            # We'll manually subscribe with buffer limits after connection
            livekit_url = self.config.livekit_url
            connect_options = rtc.RoomOptions(
                auto_subscribe=False,  # DISABLED: Prevents unlimited internal buffering
            )

            # Connect with timeout (matching integration test pattern)
            try:
                await asyncio.wait_for(
                    room.connect(livekit_url, token, connect_options),
                    timeout=30.0  # 30 second timeout for connection
                )
            except asyncio.TimeoutError:
                error_msg = "Room connection timed out after 30 seconds"
                logger.error(f"❌ {error_msg}")
                if mint_id in self.rooms:
                    del self.rooms[mint_id]
                # Create ConnectError if not available
                try:
                    raise rtc.ConnectError(error_msg)
                except AttributeError:
                    # Fallback if ConnectError doesn't exist
                    raise ConnectionError(error_msg)
            
            logger.info(f"✅ Connected to room with auto_subscribe=False (manual subscribe for buffer control)")
            
            # Get participant SID - find the participant with published tracks (the streamer)
            # Use proper wait pattern matching integration test
            participant_sid = None
            participant_event = asyncio.Event()
            found_participant = None
            
            def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
                nonlocal found_participant, participant_sid
                # Find participant with tracks (the actual streamer, not viewers)
                if len(participant.track_publications) > 0:
                    found_participant = participant
                    participant_sid = participant.sid
                    if not participant_event.is_set():
                        participant_event.set()
            
            room.on("participant_connected", on_participant_connected)
            
            # Check if participant already exists
            for participant in room.remote_participants.values():
                if len(participant.track_publications) > 0:
                    found_participant = participant
                    participant_sid = participant.sid
                    participant_event.set()
                    break
            
            # Wait for participant if not already found (matching integration test pattern)
            if found_participant is None:
                try:
                    await asyncio.wait_for(participant_event.wait(), timeout=30.0)
                except asyncio.TimeoutError:
                    logger.warning("No participant with tracks found within 30 seconds")
                    # Continue to check one more time
                    await asyncio.sleep(2.0)
                    for participant in room.remote_participants.values():
                        if len(participant.track_publications) > 0:
                            found_participant = participant
                            participant_sid = participant.sid
                            break
            
            if not participant_sid or not found_participant:
                return {"success": False, "error": "No participants with published tracks found in room"}
            
            logger.info(f"Found streamer participant: {participant_sid} (identity: {found_participant.identity}) with {len(found_participant.track_publications)} tracks")
            
            # Wait a bit for tracks to be fully published (matching integration test)
            await asyncio.sleep(2.0)

            # Store stream info
            stream_info_obj = StreamInfo(
                mint_id=mint_id,
                room_name=room.name,
                participant_sid=participant_sid,
                stream_url=livekit_url,
                token=token,
                stream_data=stream_info
            )
            
            self.active_streams[mint_id] = stream_info_obj
            self.active_websockets[mint_id] = set()
            
            logger.info(f"✅ Stream stored in StreamManager: {mint_id}")
            logger.info(f"📊 Total active streams: {len(self.active_streams)}")
            logger.info(f"📋 Active stream keys: {list(self.active_streams.keys())}")

            return {
                "success": True,
                "mint_id": mint_id,
                "room_name": room.name,
                "participant_sid": participant_sid,
                "stream_info": self.pumpfun_service.format_stream_for_ui(stream_info)
            }

        except Exception as e:
            print(f"Error starting stream for {mint_id}: {e}")
            return {"success": False, "error": str(e)}

    async def stop_stream(self, mint_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Stop a stream connection.
        
        Args:
            mint_id: The mint ID to stop
            force: If True, force disconnect even if recording is active. 
                   If False, check for active recordings first.
        """
        try:
            # Check if there's an active recording (unless forcing)
            if not force:
                try:
                    from app.services.webrtc_recording_service import WebRTCRecordingService
                    recording_service = WebRTCRecordingService()
                    # Check if recording is active for this mint_id
                    if hasattr(recording_service, 'active_recordings') and mint_id in recording_service.active_recordings:
                        logger.warning(f"Cannot disconnect stream for {mint_id}: active recording in progress")
                        return {
                            "success": False, 
                            "error": f"Cannot disconnect: active recording in progress for {mint_id}. Stop recording first."
                        }
                except Exception as e:
                    logger.warning(f"Could not check for active recordings: {e}")
                    # Continue anyway if we can't check
            
            if mint_id in self.active_streams:
                del self.active_streams[mint_id]

            if mint_id in self.active_websockets:
                del self.active_websockets[mint_id]

            # Disconnect and remove the specific room for this mint_id
            # Note: If ParticipantRecorder was used, tracks are already unsubscribed automatically
            # by ParticipantRecorder.stop_recording(), so we can disconnect cleanly
            if mint_id in self.rooms:
                room = self.rooms[mint_id]
                if room:
                    try:
                        # Disconnect the room - this closes the underlying SDK connection
                        # Tracks should already be unsubscribed by ParticipantRecorder if it was used
                        logger.info(f"Disconnecting room for {mint_id}...")
                        await room.disconnect()
                        logger.info(f"✅ Room disconnected for {mint_id}")
                    except Exception as e:
                        # If disconnect fails, log but continue (room might already be disconnected)
                        logger.warning(f"Error disconnecting room for {mint_id}: {e}")
                        # Try to remove from dict anyway to prevent leaks
                del self.rooms[mint_id]
                logger.info(f"✅ Room removed from StreamManager for {mint_id}")

            return {"success": True, "mint_id": mint_id}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_stream_info(self, mint_id: str) -> Optional[StreamInfo]:
        """Get stream information for a mint_id."""
        logger.info(f"🔍 Looking up stream info for: {mint_id}")
        logger.info(f"📋 Available streams: {list(self.active_streams.keys())}")
        result = self.active_streams.get(mint_id)
        if result:
            logger.info(f"✅ Found stream info for {mint_id}")
        else:
            logger.error(f"❌ Stream info not found for {mint_id}")
        return result

    def register_video_frame_handler(self, mint_id: str, handler: Callable) -> None:
        """Register a video frame handler for streaming."""
        self.video_frame_handlers[mint_id] = handler

    def register_audio_frame_handler(self, mint_id: str, handler: Callable) -> None:
        """Register an audio frame handler for streaming."""
        self.audio_frame_handlers[mint_id] = handler

    def get_room(self, mint_id: str) -> Optional[rtc.Room]:
        """Get the room for a specific mint_id."""
        return self.rooms.get(mint_id)


    async def _setup_room_handlers(self, room: rtc.Room) -> None:
        """Set up room-level event handlers for a specific room."""

        @room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            print(f"Participant connected: {participant.sid} ({participant.identity})")

        @room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant):
            print(f"Participant disconnected: {participant.sid} ({participant.identity})")

        @room.on("track_subscribed")
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

            # Set up track handlers - LiveKit tracks don't support event decorators
            # Recording will work through MediaRecorder's direct track subscription
            # Frame handlers are optional and only needed for real-time streaming
            try:
                if track.kind == rtc.TrackKind.KIND_VIDEO:
                    logger.info(f"Video track subscribed for {mint_id}")
                    # Note: LiveKit RemoteVideoTrack doesn't support on() decorator
                    # MediaRecorder will handle track recording directly

                elif track.kind == rtc.TrackKind.KIND_AUDIO:
                    logger.info(f"Audio track subscribed for {mint_id}")
                    # Note: LiveKit RemoteAudioTrack doesn't support on() decorator
                    # MediaRecorder will handle track recording directly

            except Exception as e:
                print(f"Error setting up track handlers: {e}")
                # Continue without frame handlers - recording will still work

        @room.on("disconnected")
        def on_disconnected():
            print("Room disconnected")
            # Find which mint_id this room corresponds to and clean it up
            for mint_id, room_obj in list(self.rooms.items()):
                if room_obj == room:
                    # Clean up this specific stream
                    if mint_id in self.active_streams:
                        del self.active_streams[mint_id]
                    if mint_id in self.active_websockets:
                        del self.active_websockets[mint_id]
                    if mint_id in self.video_frame_handlers:
                        del self.video_frame_handlers[mint_id]
                    if mint_id in self.audio_frame_handlers:
                        del self.audio_frame_handlers[mint_id]
                    # Remove the room
                    del self.rooms[mint_id]
                    break

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
