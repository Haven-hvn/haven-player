# Pump.fun Integration Guide - Haven Player

This guide provides complete instructions for using Haven Player with pump.fun live streams. The integration automatically handles token management, stream discovery, and real-time video streaming.

## Overview

Haven Player now connects directly to pump.fun's LiveKit infrastructure to stream live crypto coin presentations. The system:

- **Discovers live streams** from pump.fun's API
- **Automatically gets tokens** for viewer access
- **Streams real-time video/audio** via WebSocket
- **Records streams locally** (optional)
- **Caches coin metadata** for performance

## Quick Start

### 1. Get Live Streams
```bash
curl http://localhost:8000/api/pumpfun/live?limit=20
```

### 2. Start Streaming
```bash
curl -X POST http://localhost:8000/api/live-sessions/start \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump", "record_session": false}'
```

### 3. Connect WebSocket
```javascript
const ws = new WebSocket(`ws://localhost:8000/api/live-sessions/ws/live/V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump`);
```

## API Endpoints

### Pump.fun Stream Discovery

#### Get Live Streams
**Endpoint:** `GET /api/pumpfun/live`

**Parameters:**
- `offset` (int, default: 0) - Pagination offset
- `limit` (int, default: 60, max: 100) - Number of results
- `include_nsfw` (bool, default: true) - Include NSFW streams

**Response:**
```json
[
  {
    "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
    "name": "KindnessCoin",
    "symbol": "KIND",
    "description": "Donating 100% of Creator Rewards To Small Streamers",
    "image_uri": "https://ipfs.io/ipfs/...",
    "thumbnail": "https://prod-livestream-thumbnails-841162682567.s3.us-east-1.amazonaws.com/...",
    "creator": "8PQxd6VmfGPMyg8WPnfkT9jUTmtE7UsnDmvBKXeAVP9z",
    "market_cap": 101778.36,
    "usd_market_cap": 23850740.42,
    "num_participants": 231,
    "is_currently_live": true,
    "nsfw": false,
    "website": "https://www.tiktok.com/@karvetv",
    "twitter": "https://x.com/ColeCaetano_"
  }
]
```

#### Get Popular Streams
**Endpoint:** `GET /api/pumpfun/popular`

**Parameters:**
- `limit` (int, default: 20, max: 50) - Number of popular streams

Returns streams sorted by participant count.

#### Get Stream Info
**Endpoint:** `GET /api/pumpfun/stream/{mint_id}`

Get detailed information about a specific stream.

#### Validate Stream
**Endpoint:** `GET /api/pumpfun/validate/{mint_id}`

**Response:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "is_valid": true,
  "is_live": true
}
```

#### Get Stream Statistics
**Endpoint:** `GET /api/pumpfun/stats`

**Response:**
```json
{
  "total_live_streams": 45,
  "total_participants": 1250,
  "nsfw_streams": 8,
  "sfw_streams": 37,
  "top_stream": {
    "mint_id": "...",
    "name": "TopCoin",
    "num_participants": 500
  }
}
```

### Live Session Management

#### Start Stream Session
**Endpoint:** `POST /api/live-sessions/start`

**Request:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "record_session": false
}
```

**Response:**
```json
{
  "success": true,
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "room_name": "actual-livekit-room-name",
  "participant_sid": "PA_xxx",
  "session_id": 1,
  "record_session": false,
  "stream_info": {
    "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
    "name": "KindnessCoin",
    "symbol": "KIND",
    "num_participants": 231,
    "market_cap": 101778.36
  }
}
```

#### Stop Stream Session
**Endpoint:** `POST /api/live-sessions/stop`

**Request:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}
```

#### WebSocket Streaming
**Endpoint:** `ws://localhost:8000/api/live-sessions/ws/live/{mint_id}`

Streams real-time video/audio data:
- **Video frames**: Binary JPEG data
- **Audio frames**: Text messages prefixed with `"audio:"`

## Frontend Integration

### Complete React Example

```javascript
import React, { useState, useEffect, useRef } from 'react';

class PumpFunStreamPlayer {
  constructor() {
    this.ws = null;
    this.canvas = null;
    this.ctx = null;
    this.audioContext = null;
    this.isPlaying = false;
  }

  // Get available live streams
  async getAvailableStreams(includeNsfw = false) {
    try {
      const response = await fetch(
        `/api/pumpfun/live?limit=50&include_nsfw=${includeNsfw}`
      );
      return await response.json();
    } catch (error) {
      console.error('Error fetching streams:', error);
      return [];
    }
  }

  // Get popular streams
  async getPopularStreams() {
    try {
      const response = await fetch('/api/pumpfun/popular?limit=20');
      return await response.json();
    } catch (error) {
      console.error('Error fetching popular streams:', error);
      return [];
    }
  }

  // Start streaming a specific mint_id
  async startStream(mintId, recordSession = false) {
    try {
      // Start the session
      const startResponse = await fetch('/api/live-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_id: mintId,
          record_session: recordSession
        })
      });

      const result = await startResponse.json();
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log('Stream started:', result.stream_info);

      // Connect WebSocket for video/audio
      this.connectWebSocket(mintId);
      this.isPlaying = true;

      return result;
    } catch (error) {
      console.error('Failed to start stream:', error);
      throw error;
    }
  }

  // Stop streaming
  async stopStream(mintId) {
    try {
      const response = await fetch('/api/live-sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint_id: mintId })
      });

      const result = await response.json();
      
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.isPlaying = false;
      return result;
    } catch (error) {
      console.error('Failed to stop stream:', error);
      throw error;
    }
  }

  // Connect WebSocket for real-time streaming
  connectWebSocket(mintId) {
    this.ws = new WebSocket(`ws://localhost:8000/api/live-sessions/ws/live/${mintId}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected for mint_id:', mintId);
    };

    this.ws.onmessage = (event) => {
      this.handleStreamData(event);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // Handle incoming stream data
  handleStreamData(event) {
    if (event.data instanceof Blob) {
      // Video frame (JPEG)
      this.displayVideoFrame(event.data);
    } else if (typeof event.data === 'string' && event.data.startsWith('audio:')) {
      // Audio frame
      const audioData = event.data.substring(6);
      this.playAudioFrame(audioData);
    }
  }

  // Display video frame on canvas
  displayVideoFrame(blob) {
    if (!this.canvas || !this.ctx) return;

    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      URL.revokeObjectURL(img.src); // Clean up
    };
    img.src = URL.createObjectURL(blob);
  }

  // Play audio frame
  playAudioFrame(base64Audio) {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 44100);
      const channelData = audioBuffer.getChannelData(0);

      // Convert 16-bit PCM to float
      for (let i = 0; i < bytes.length; i += 2) {
        const sample = (bytes[i] | (bytes[i + 1] << 8)) / 32768.0;
        channelData[i / 2] = Math.max(-1, Math.min(1, sample));
      }

      // Play audio
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  // Set canvas for video display
  setCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }
}

// React Component Example
const PumpFunViewer = () => {
  const [streams, setStreams] = useState([]);
  const [currentStream, setCurrentStream] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [player] = useState(() => new PumpFunStreamPlayer());
  const canvasRef = useRef(null);

  useEffect(() => {
    // Set canvas when component mounts
    if (canvasRef.current) {
      player.setCanvas(canvasRef.current);
    }

    // Load available streams
    loadStreams();
  }, []);

  const loadStreams = async () => {
    setIsLoading(true);
    try {
      const availableStreams = await player.getAvailableStreams(false); // No NSFW
      setStreams(availableStreams);
    } catch (error) {
      console.error('Error loading streams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartStream = async (stream) => {
    try {
      setIsLoading(true);
      await player.startStream(stream.mint_id, false);
      setCurrentStream(stream);
    } catch (error) {
      alert(`Failed to start stream: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopStream = async () => {
    if (!currentStream) return;
    
    try {
      await player.stopStream(currentStream.mint_id);
      setCurrentStream(null);
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
  };

  return (
    <div className="pump-fun-viewer">
      <h1>Pump.fun Live Streams</h1>
      
      {/* Video Player */}
      <div className="video-container">
        <canvas 
          ref={canvasRef}
          width="640" 
          height="480"
          style={{ border: '1px solid #ccc', background: '#000' }}
        />
        {currentStream && (
          <div className="stream-info">
            <h3>{currentStream.name} ({currentStream.symbol})</h3>
            <p>Market Cap: ${currentStream.usd_market_cap?.toLocaleString()}</p>
            <p>Participants: {currentStream.num_participants}</p>
            <button onClick={handleStopStream}>Stop Stream</button>
          </div>
        )}
      </div>

      {/* Stream List */}
      <div className="stream-list">
        <h2>Available Streams</h2>
        <button onClick={loadStreams} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
        
        <div className="streams">
          {streams.map((stream) => (
            <div key={stream.mint_id} className="stream-card">
              <img src={stream.thumbnail} alt={stream.name} width="100" />
              <div>
                <h4>{stream.name} ({stream.symbol})</h4>
                <p>{stream.description}</p>
                <p>Participants: {stream.num_participants}</p>
                <p>Market Cap: ${stream.usd_market_cap?.toLocaleString()}</p>
                <button 
                  onClick={() => handleStartStream(stream)}
                  disabled={isLoading || currentStream}
                >
                  {currentStream?.mint_id === stream.mint_id ? 'Playing' : 'Play'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PumpFunViewer;
```

## Key Features

### Automatic Token Management
- No manual token handling required
- Tokens are automatically fetched from pump.fun API
- Uses pump.fun's LiveKit server: `wss://pump-prod-tg2x8veh.livekit.cloud`

### Stream Discovery
- Real-time list of currently live streams
- Popular streams by participant count
- Market data and coin information
- NSFW filtering options

### Data Caching
- Coin metadata is cached in local database
- Reduces API calls and improves performance
- Historical tracking of coin data

### Real-Time Frame Capture
- **Video Frames**: Captured using LiveKit's `track.on("frame_received")` event handlers
- **Audio Frames**: Captured using LiveKit's `track.on("frame_received")` event handlers
- **WebSocket Streaming**: Frames are automatically streamed to connected frontend clients
- **Frame Processing**: Video frames converted to JPEG (85% quality), audio frames to base64
- **Participant Mapping**: Automatic mapping between participant SIDs and mint_ids for proper routing

### Recording Support
- Optional local recording to MP4/WAV files
- Automatic file management with timestamps
- Recording directory configurable
- **Frame-Based Recording**: Uses the same frame capture mechanism for recording
- **Synchronized Recording**: Video and audio frames are recorded simultaneously

## Error Handling

### Common Issues

1. **Stream Not Found**
   ```json
   {
     "success": false,
     "error": "Stream not found or not live for mint_id: xyz"
   }
   ```

2. **Token Generation Failed**
   ```json
   {
     "success": false,
     "error": "Failed to get livestream token for mint_id: xyz"
   }
   ```

3. **WebSocket Connection Issues**
   - Check if session was started successfully
   - Verify mint_id is correct
   - Check network connectivity

### Retry Logic

```javascript
const startStreamWithRetry = async (mintId, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await player.startStream(mintId);
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};
```

## Performance Considerations

1. **Video Quality**: JPEG quality set to 85% for balance
2. **Caching**: Coin data cached locally to reduce API calls
3. **WebSocket Buffering**: Handle high-frequency video frames appropriately
4. **Memory Management**: Clean up object URLs after use

## Database Schema

The system uses two main tables:

### `live_sessions`
Stores active/completed streaming sessions with full pump.fun metadata.

### `pumpfun_coins`
Caches coin information for performance and historical tracking.

## Frame Capture Implementation

### Technical Details

The frame capture system uses LiveKit's event-driven architecture:

```python
# Video frame handler
@track.on("frame_received")
def on_video_frame(frame: rtc.VideoFrame):
    print(f"Received video frame: {frame.width}x{frame.height}")
    # Stream frame to WebSocket and record if enabled
    asyncio.create_task(self._stream_video(frame, participant.sid))

# Audio frame handler  
@track.on("frame_received")
def on_audio_frame(frame: rtc.AudioFrame):
    print(f"Received audio frame: {len(frame.data)} samples")
    # Stream frame to WebSocket and record if enabled
    asyncio.create_task(self._stream_audio(frame, participant.sid))
```

### Frame Processing Pipeline

1. **Frame Reception**: LiveKit delivers frames via event handlers
2. **Format Conversion**: 
   - Video: `rtc.VideoFrame` → numpy array → PIL Image → JPEG bytes
   - Audio: `rtc.AudioFrame` → raw bytes → base64 string
3. **WebSocket Distribution**: Frames sent to all connected clients for the mint_id
4. **Recording**: Frames simultaneously written to MP4/WAV files if enabled

### Performance Considerations

- **Video Quality**: JPEG quality set to 85% for optimal balance of quality/size
- **Frame Rate**: Limited by source stream and network conditions
- **Memory Management**: Frames processed and released immediately
- **WebSocket Buffering**: High-frequency frames handled efficiently

## Development Tips

1. **Test with Popular Streams**: Use `/api/pumpfun/popular` to find active streams
2. **Monitor Participant Counts**: Higher participant streams are more stable
3. **Handle NSFW Content**: Use `include_nsfw=false` for family-friendly apps
4. **Cache Aggressively**: Coin data doesn't change frequently
5. **Error Recovery**: Implement retry logic for network issues
6. **Frame Debugging**: Monitor frame reception logs for troubleshooting
7. **WebSocket Testing**: Use browser dev tools to verify frame delivery

This integration provides a complete pump.fun streaming experience with minimal setup required!
