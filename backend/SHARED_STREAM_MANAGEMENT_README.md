# Shared Stream Management Architecture

## Overview

The Haven Player now uses a **shared stream management architecture** that eliminates duplicate WebRTC connections and provides a clean separation of concerns between streaming and recording.

## Architecture Components

### 1. StreamManager (`stream_manager.py`)
**Central component that manages a single WebRTC connection for all services.**

```python
class StreamManager:
    """Shared stream manager for LiveKit connections."""
    
    async def start_stream(self, mint_id: str) -> Dict[str, Any]:
        """Start a new stream connection."""
        
    async def stop_stream(self, mint_id: str) -> Dict[str, Any]:
        """Stop a stream connection."""
        
    def register_video_frame_handler(self, mint_id: str, handler: Callable):
        """Register video frame handler for streaming."""
        
    def register_recording_handler(self, mint_id: str, handler: Callable):
        """Register recording handler."""
```

**Key Features:**
- ✅ **Single WebRTC connection** per stream
- ✅ **Shared frame distribution** to multiple handlers
- ✅ **Centralized connection management**
- ✅ **No duplicate connections**

### 2. LiveSessionService (`live_session_service_v2.py`)
**Handles WebSocket streaming using shared StreamManager.**

```python
class LiveSessionService:
    """Live streaming session service using shared StreamManager."""
    
    async def start_session(self, mint_id: str) -> Dict[str, Any]:
        """Start streaming session using shared stream."""
        
    async def _setup_streaming_handlers(self, mint_id: str):
        """Set up frame handlers for streaming."""
```

**Key Features:**
- ✅ **Uses shared StreamManager** (no separate WebRTC connection)
- ✅ **WebSocket streaming** to frontend
- ✅ **Frame conversion** (VideoFrame → JPEG, AudioFrame → base64)
- ✅ **No recording functionality**

### 3. AioRTCRecordingService (`aiortc_recording_service_v2.py`)
**Handles AV1 recording using shared StreamManager.**

```python
class AioRTCRecordingService:
    """aiortc-based recording service using shared StreamManager."""
    
    async def start_recording(self, mint_id: str, output_format: str = "av1") -> Dict[str, Any]:
        """Start recording using shared stream."""
        
    async def stop_recording(self, mint_id: str) -> Dict[str, Any]:
        """Stop recording."""
```

**Key Features:**
- ✅ **Uses shared StreamManager** (no separate WebRTC connection)
- ✅ **AV1 recording** with MediaRecorder
- ✅ **No mint_id dependency** - works with existing stream
- ✅ **Multiple format support** (AV1, H.264, VP9)

## API Endpoints

### Live Sessions (`/api/live-sessions`)
```bash
# Start streaming session
POST /api/live-sessions/start
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}

# Stop streaming session  
POST /api/live-sessions/stop
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}

# Get active sessions
GET /api/live-sessions/active

# WebSocket streaming
WS /api/live-sessions/stream/{mint_id}
```

### Recording (`/api/recording`)
```bash
# Start recording (requires active session)
POST /api/recording/start
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "output_format": "av1",
  "video_quality": "medium"
}

# Stop recording
POST /api/recording/stop
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}

# Get recording status
GET /api/recording/status/{mint_id}

# Get active recordings
GET /api/recording/active

# Get supported formats
GET /api/recording/formats
```

## Usage Flow

### 1. Start Streaming Session
```python
# Start live session (creates WebRTC connection)
response = requests.post("/api/live-sessions/start", json={
    "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
})
```

### 2. Start Recording (Uses Shared Stream)
```python
# Start recording (uses existing WebRTC connection)
response = requests.post("/api/recording/start", json={
    "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
    "output_format": "av1",
    "video_quality": "medium"
})
```

### 3. WebSocket Streaming
```javascript
// Connect to WebSocket for real-time streaming
const ws = new WebSocket('ws://localhost:8000/api/live-sessions/stream/V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'video_frame') {
        // Display video frame
        displayVideoFrame(data.data);
    } else if (data.type === 'audio_frame') {
        // Play audio frame
        playAudioFrame(data.data);
    }
};
```

## Key Benefits

### ✅ **No Duplicate WebRTC Connections**
- **Before**: LiveSessionService + AioRTCRecordingService = 2 connections
- **After**: StreamManager = 1 connection shared by both services

### ✅ **No mint_id Dependency in Recording**
- **Before**: Recording service needed `mint_id` to create its own connection
- **After**: Recording service uses existing stream from StreamManager

### ✅ **Clean Separation of Concerns**
- **StreamManager**: WebRTC connection management
- **LiveSessionService**: WebSocket streaming
- **AioRTCRecordingService**: AV1 recording

### ✅ **Better Performance**
- Single WebRTC connection reduces bandwidth
- Shared frame distribution reduces CPU usage
- No connection overhead for recording

### ✅ **Simplified Architecture**
- No duplicate connection logic
- No mint_id parameter passing
- Clear service boundaries

## File Structure

```
backend/app/services/
├── stream_manager.py              # Shared WebRTC connection management
├── live_session_service_v2.py    # WebSocket streaming (uses shared stream)
├── aiortc_recording_service_v2.py # AV1 recording (uses shared stream)
└── pumpfun_service.py            # Pump.fun API integration

backend/app/api/
├── live_sessions_v2.py           # Streaming API endpoints
├── recording_v2.py               # Recording API endpoints
└── main_v2.py                    # FastAPI app with shared management

backend/
├── test_shared_stream_management.py  # Test script
└── SHARED_STREAM_MANAGEMENT_README.md # This documentation
```

## Testing

Run the test script to verify the shared stream management:

```bash
cd backend
python test_shared_stream_management.py
```

The test will:
1. Start a live session
2. Start recording (using shared stream)
3. Check recording status
4. Get active sessions
5. Stop recording
6. Stop session

## Migration from Old Architecture

### Old Architecture Problems:
- ❌ Duplicate WebRTC connections
- ❌ Recording service needed `mint_id`
- ❌ Complex connection management
- ❌ Performance overhead

### New Architecture Solutions:
- ✅ Single WebRTC connection via StreamManager
- ✅ Recording service uses existing stream
- ✅ Simple, clean architecture
- ✅ Better performance

## Next Steps

1. **Replace old services** with new v2 services
2. **Update main.py** to use new endpoints
3. **Test thoroughly** with real pump.fun streams
4. **Deploy** the new architecture

The shared stream management architecture provides a **clean, efficient, and maintainable** solution for both streaming and recording pump.fun live streams.
