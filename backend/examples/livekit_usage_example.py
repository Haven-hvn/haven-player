"""
LiveKit Python SDK Usage Examples for Haven Player

This file demonstrates various LiveKit usage patterns that can be adapted
for the Haven Player implementation. These examples follow the official
LiveKit Python SDK documentation patterns.
"""

import asyncio
import logging
import os
from livekit import rtc, api

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("haven-player")


class LiveKitExample:
    """Example class showing LiveKit integration patterns."""

    def __init__(self):
        self.room = None

    async def basic_room_connection(self, room_name: str):
        """
        Basic room connection example following LiveKit documentation.
        """
        # Create room instance
        self.room = rtc.Room()

        # Register event handlers (following official pattern)
        @self.room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
            logger.info("participant connected: %s %s", participant.sid, participant.identity)

        @self.room.on("participant_disconnected")
        def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
            logger.info("participant disconnected: %s %s", participant.sid, participant.identity)

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            logger.info("track subscribed: %s from %s", track.kind, participant.identity)

            # Handle different track types
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                self._setup_video_handler(track, participant)
            elif track.kind == rtc.TrackKind.KIND_AUDIO:
                self._setup_audio_handler(track, participant)

        # Create access token (following official pattern)
        token = (
            api.AccessToken(os.getenv("LIVEKIT_API_KEY"), os.getenv("LIVEKIT_API_SECRET"))
            .with_identity("haven-player-client")
            .with_name("Haven Player")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=False,  # Viewer only
                    can_subscribe=True,
                )
            )
            .to_jwt()
        )

        # Connect to the room
        livekit_url = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
        await self.room.connect(livekit_url, token)
        logger.info("connected to room %s", self.room.name)

    def _setup_video_handler(self, track: rtc.Track, participant: rtc.RemoteParticipant):
        """Set up video frame handler."""
        @track.on("frame_received")
        def on_video_frame(frame: rtc.VideoFrame):
            # Process video frame (e.g., for streaming or recording)
            logger.debug("Received video frame: %dx%d", frame.width, frame.height)
            # In Haven Player: convert to JPEG and send over WebSocket

    def _setup_audio_handler(self, track: rtc.Track, participant: rtc.RemoteParticipant):
        """Set up audio frame handler."""
        @track.on("frame_received")
        def on_audio_frame(frame: rtc.AudioFrame):
            # Process audio frame
            logger.debug("Received audio frame: %d samples", len(frame.data))
            # In Haven Player: encode as base64 and send over WebSocket

    async def advanced_connection_example(self, room_name: str):
        """
        Advanced connection example with comprehensive event handling.
        """
        self.room = rtc.Room()

        # Set up comprehensive event handlers
        @self.room.on("connection_state_changed")
        def on_connection_state_changed(state: rtc.ConnectionState):
            logger.info("Connection state changed: %s", state)

        @self.room.on("connected")
        def on_connected():
            logger.info("Successfully connected to room")

        @self.room.on("disconnected")
        def on_disconnected():
            logger.info("Disconnected from room")

        @self.room.on("reconnecting")
        def on_reconnecting():
            logger.warning("Reconnecting to room...")

        @self.room.on("reconnected")
        def on_reconnected():
            logger.info("Successfully reconnected to room")

        # Connection options
        connect_options = rtc.ConnectOptions(
            auto_subscribe=True,
            # You can add more options here as needed
        )

        token = self._create_token(room_name)
        await self.room.connect(os.getenv("LIVEKIT_URL"), token, connect_options)

    def _create_token(self, room_name: str) -> str:
        """Create access token with proper grants."""
        return (
            api.AccessToken(os.getenv("LIVEKIT_API_KEY"), os.getenv("LIVEKIT_API_SECRET"))
            .with_identity("haven-player-client")
            .with_name("Haven Player Client")
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=False,
                    can_subscribe=True,
                )
            )
            .to_jwt()
        )

    async def cleanup(self):
        """Clean up resources."""
        if self.room:
            await self.room.disconnect()
            self.room = None


async def main():
    """Main function demonstrating usage."""
    example = LiveKitExample()

    try:
        # Basic connection example
        await example.basic_room_connection("test-room")

        # Wait a bit to see events
        await asyncio.sleep(10)

    except Exception as e:
        logger.error("Error in example: %s", e)
    finally:
        await example.cleanup()


if __name__ == "__main__":
    # Set up environment variables (in production, use proper config)
    os.environ.setdefault("LIVEKIT_URL", "ws://localhost:7880")
    os.environ.setdefault("LIVEKIT_API_KEY", "your-api-key")
    os.environ.setdefault("LIVEKIT_API_SECRET", "your-api-secret")

    asyncio.run(main())
