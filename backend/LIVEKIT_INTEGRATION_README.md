# LiveKit Integration for Haven Player

This document provides comprehensive information about the LiveKit integration in Haven Player, including usage patterns, examples, and best practices.

## Overview

Haven Player uses the LiveKit Python SDK to enable real-time video streaming and recording capabilities. The integration follows official LiveKit patterns and provides a seamless streaming experience.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │────│   Backend API    │────│   LiveKit Room  │
│   (React)       │    │   (FastAPI)      │    │   (WebRTC)      │
│                 │    │                  │    │                 │
│ - Canvas        │    │ - LiveSession    │    │ - Participants  │
│ - WebSocket     │    │   Service        │    │ - Video/Audio   │
│ - Controls      │    │ - Token Gen      │    │   Streams       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. LiveSessionService (Singleton)

**Location:** `backend/app/services/live_session_service.py`

**Purpose:** Manages LiveKit room connections and streaming sessions.

**Key Features:**
- Singleton pattern for state management
- Automatic token generation
- WebSocket streaming to frontend
- Optional recording with OpenCV
- Graceful shutdown handling

**Usage Example:**
```python
service = LiveSessionService()
await service.initialize()

# Start streaming session
result = await service.start_session("my-room", record_session=True)

# Stop session
await service.stop_session("my-room")
```

### 2. AioRTCRecordingService

**Location:** `backend/app/services/aiortc_recording_service.py`

**Purpose:** Handles AV1 video/audio recording using aiortc.

**Features:**
- AV1 video recording with aiortc
- Multiple format support (AV1, MP4, WebM)
- Quality presets (low, medium, high)
- Automatic file management
- Real-time recording status

### 3. API Endpoints

**Location:** `backend/app/api/live_sessions.py`

**Endpoints:**
- `POST /api/live-sessions/start` - Start streaming session
- `POST /api/live-sessions/stop` - Stop streaming session
- `GET /api/live-sessions/active` - Get active sessions
- `WebSocket /api/live-sessions/ws/live/{room_name}` - Real-time streaming

**Recording Endpoints:**
- `POST /api/recording/start` - Start AV1 recording
- `POST /api/recording/stop` - Stop recording
- `GET /api/recording/status/{mint_id}` - Get recording status
- `GET /api/recording/active` - Get active recordings

## Usage Patterns

### Basic Room Connection

Following the official LiveKit documentation pattern:

```python
from livekit import rtc

# Create room instance
room = rtc.Room()

# Register event handlers
@room.on("participant_connected")
def on_participant_connected(participant: rtc.RemoteParticipant):
    print(f"Participant connected: {participant.identity}")

# Create access token
token = self._generate_token(room_name)

# Connect to room
await room.connect(livekit_url, token)
```

### Event Handling

The service sets up comprehensive event handlers:

```python
@room.on("participant_connected")
def on_participant_connected(participant: rtc.RemoteParticipant):
    # Handle new participant

@room.on("track_subscribed")
def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
    # Handle new video/audio track
    if track.kind == rtc.TrackKind.KIND_VIDEO:
        @track.on("frame_received")
        def on_video_frame(frame: rtc.VideoFrame):
            # Process video frames for streaming and recording
            asyncio.create_task(self._stream_video(frame, participant.sid))
    
    elif track.kind == rtc.TrackKind.KIND_AUDIO:
        @track.on("frame_received")
        def on_audio_frame(frame: rtc.AudioFrame):
            # Process audio frames for streaming and recording
            asyncio.create_task(self._stream_audio(frame, participant.sid))

@room.on("connection_state_changed")
def on_connection_state_changed(state: rtc.ConnectionState):
    # Handle connection state changes
```

### Token Generation

Uses LiveKit Server SDK for secure token generation:

```python
from livekit.api import AccessToken, VideoGrants

token = AccessToken(api_key, api_secret)
token.with_identity("haven-player")
token.with_name("Haven Player")
token.with_grants(VideoGrants(
    room_join=True,
    room=room_name,
    can_publish=False,  # Viewer only
    can_subscribe=True,
))
jwt_token = token.to_jwt()
```

## Configuration

### Environment Variables

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

### Database Configuration

Update via API:
```bash
curl -X PUT http://localhost:8000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "livekit_url": "wss://your-project.livekit.cloud",
    "livekit_api_key": "your-key",
    "livekit_api_secret": "your-secret",
    "recording_directory": "~/.haven-player/recordings"
  }'
```

## Examples

### Complete Integration Example

See `examples/livekit_usage_example.py` for comprehensive usage examples including:

- Basic room connection
- Event handling patterns
- Advanced connection options
- Error handling
- Cleanup procedures

### Frontend Integration

See `FRONTEND_INTEGRATION_GUIDE.md` for complete frontend integration instructions including:

- WebSocket protocol
- Video rendering on canvas
- Audio playback with Web Audio API
- Complete working examples

## Frame Capture Implementation

### Real-Time Frame Processing

The Haven Player implements real-time frame capture using LiveKit's event-driven architecture:

```python
# Video frame capture
@track.on("frame_received")
def on_video_frame(frame: rtc.VideoFrame):
    # Convert to JPEG and stream to WebSocket
    frame_array = frame.buffer.to_ndarray(format="rgb24")
    image = Image.fromarray(frame_array)
    # ... JPEG conversion and WebSocket streaming

# Audio frame capture  
@track.on("frame_received")
def on_audio_frame(frame: rtc.AudioFrame):
    # Convert to base64 and stream to WebSocket
    audio_bytes = frame.data.tobytes()
    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
    # ... WebSocket streaming
```

### Frame Processing Pipeline

1. **Frame Reception**: LiveKit delivers frames via `track.on("frame_received")` events
2. **Format Conversion**: 
   - Video: `rtc.VideoFrame` → numpy array → PIL Image → JPEG (85% quality)
   - Audio: `rtc.AudioFrame` → raw bytes → base64 string
3. **WebSocket Distribution**: Frames sent to connected frontend clients
4. **Recording**: Simultaneous recording to MP4/WAV files if enabled

### Performance Optimization

- **Asynchronous Processing**: Frame handlers use `asyncio.create_task()` for non-blocking processing
- **Memory Management**: Frames processed and released immediately
- **Quality Settings**: JPEG quality optimized for streaming (85%)
- **Participant Mapping**: Efficient routing between participant SIDs and mint_ids

## Best Practices

### 1. Event Handler Setup

Always set up event handlers **before** connecting to the room:

```python
room = rtc.Room()
await setup_handlers(room)  # Set up handlers first
await room.connect(url, token)  # Then connect
```

### 2. Error Handling

Implement comprehensive error handling:

```python
try:
    await room.connect(url, token)
except rtc.ConnectError as e:
    logger.error(f"Connection failed: {e}")
    # Handle reconnection logic
```

### 3. Resource Cleanup

Always clean up resources properly:

```python
# In shutdown/disconnect handlers
for shim in recording_shims.values():
    shim.close()
recording_shims.clear()

await room.disconnect()
```

### 4. Connection State Management

Monitor connection state for better UX:

```python
@room.on("connection_state_changed")
def on_connection_state_changed(state: rtc.ConnectionState):
    if state == rtc.ConnectionState.CONN_CONNECTED:
        # Connection successful
    elif state == rtc.ConnectionState.CONN_DISCONNECTED:
        # Handle disconnection
```

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check LiveKit URL and credentials
   - Verify network connectivity
   - Check LiveKit server status

2. **No Video/Audio**
   - Ensure room has active participants
   - Check track subscription status
   - Verify WebSocket connection

3. **Recording Issues**
   - Check recording directory permissions
   - Verify OpenCV installation
   - Check available disk space

### Debug Logging

Enable debug logging for troubleshooting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Dependencies

Required packages (already included in `requirements.txt`):

```
livekit==1.0.13              # LiveKit Python SDK
livekit-api==1.0.5           # Token generation
opencv-python==4.10.0.84    # Video recording
av==15.1.0                   # Video processing
websockets==13.1             # WebSocket support
PIL (Pillow)                 # Image processing for JPEG conversion
```

## Next Steps

1. **Set up LiveKit server** (cloud or self-hosted)
2. **Configure credentials** in your environment
3. **Test the integration** with the provided examples
4. **Implement frontend** using the integration guide
5. **Add error handling** and monitoring as needed

## Support

For LiveKit-specific issues:
- [LiveKit Documentation](https://docs.livekit.io)
- [LiveKit Python SDK](https://github.com/livekit/python-sdks)
- [LiveKit Community](https://github.com/livekit/livekit/discussions)

For Haven Player specific issues, refer to the main project documentation.
