# Frontend Integration Guide - Live Streaming & Recording

This guide provides detailed instructions for integrating the Haven Player's live streaming and recording functionality into the Electron/React frontend.

## Overview

The backend provides real-time video streaming from LiveKit rooms with optional local recording. Communication uses:
- **HTTP POST requests** for session control (start/stop)
- **WebSocket connection** for real-time video/audio streaming

## API Endpoints

### Start Live Session
**Endpoint:** `POST /api/live-sessions/start`

**Request Body:**
```json
{
  "room_name": "your-room-name",
  "record_session": false
}
```

**Response:**
```json
{
  "success": true,
  "room_name": "your-room-name",
  "participant_sid": "PA_xxx",
  "session_id": 1,
  "record_session": false
}
```

**Usage:**
```javascript
const response = await fetch('/api/live-sessions/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room_name: 'my-live-room',
    record_session: true  // Set to true to enable recording
  })
});
const result = await response.json();
```

### Stop Live Session
**Endpoint:** `POST /api/live-sessions/stop`

**Request Body:**
```json
{
  "room_name": "your-room-name"
}
```

**Response:**
```json
{
  "success": true,
  "room_name": "your-room-name"
}
```

**Usage:**
```javascript
const response = await fetch('/api/live-sessions/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room_name: 'my-live-room'
  })
});
const result = await response.json();
```

### Get Active Sessions
**Endpoint:** `GET /api/live-sessions/active`

**Response:**
```json
{
  "active_sessions": {
    "room-name": {
      "id": 1,
      "room_name": "room-name",
      "participant_sid": "PA_xxx",
      "status": "active",
      "record_session": true,
      "recording_path": "/path/to/recording.mp4",
      "start_time": "2024-01-01T12:00:00Z",
      "end_time": null,
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": "2024-01-01T12:00:00Z"
    }
  },
  "count": 1
}
```

## WebSocket Streaming

### Connection
**Endpoint:** `ws://localhost:8000/api/live-sessions/ws/live/{room_name}`

**Connection Example:**
```javascript
const roomName = 'my-live-room';
const ws = new WebSocket(`ws://localhost:8000/api/live-sessions/ws/live/${roomName}`);
```

### Message Types

#### Video Frames (Binary)
- **Format:** Raw JPEG binary data
- **Usage:** Display directly on HTML5 Canvas

```javascript
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {
    // This is a video frame (JPEG)
    const blob = event.data;
    displayVideoFrame(blob);
  } else if (typeof event.data === 'string' && event.data.startsWith('audio:')) {
    // This is an audio frame
    const audioData = event.data.substring(6); // Remove 'audio:' prefix
    playAudioFrame(audioData);
  }
};
```

#### Audio Frames (Text)
- **Format:** `"audio:" + base64_encoded_audio_data`
- **Audio Format:** Raw PCM audio data (16-bit, sample rate depends on source)

```javascript
function playAudioFrame(base64Audio) {
  // Decode base64 to binary
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Create audio buffer and play
  const audioContext = new AudioContext();
  const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 44100); // Adjust sample rate as needed
  const channelData = audioBuffer.getChannelData(0);

  // Convert 16-bit PCM to float
  for (let i = 0; i < bytes.length; i += 2) {
    const sample = (bytes[i] | (bytes[i + 1] << 8)) / 32768.0;
    channelData[i / 2] = Math.max(-1, Math.min(1, sample));
  }

  // Play the audio
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}
```

## Video Rendering Implementation

### HTML5 Canvas Setup
```html
<canvas id="videoCanvas" width="640" height="480"></canvas>
```

### Video Frame Display
```javascript
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');

function displayVideoFrame(blob) {
  const img = new Image();

  img.onload = () => {
    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw new frame
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  // Create object URL from blob
  img.src = URL.createObjectURL(blob);
}
```

### Optimized Rendering Loop
```javascript
let animationId = null;

function startVideoRendering() {
  const ws = new WebSocket(`ws://localhost:8000/api/live-sessions/ws/live/${roomName}`);

  ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      displayVideoFrame(event.data);
    }
  };

  // Optional: Use requestAnimationFrame for smoother rendering
  function renderLoop() {
    // Additional rendering logic if needed
    animationId = requestAnimationFrame(renderLoop);
  }
  renderLoop();
}

function stopVideoRendering() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  ws.close();
}
```

## Complete Integration Example

```javascript
class LiveStreamPlayer {
  constructor(roomName) {
    this.roomName = roomName;
    this.ws = null;
    this.canvas = document.getElementById('videoCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audioContext = new AudioContext();
    this.isPlaying = false;
  }

  async startSession(recordSession = false) {
    try {
      // Start the session
      const startResponse = await fetch('/api/live-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: this.roomName,
          record_session: recordSession
        })
      });

      const startResult = await startResponse.json();
      if (!startResult.success) {
        throw new Error(startResult.error);
      }

      console.log('Session started:', startResult);

      // Connect WebSocket
      this.connectWebSocket();

      this.isPlaying = true;
      return startResult;
    } catch (error) {
      console.error('Failed to start session:', error);
      throw error;
    }
  }

  async stopSession() {
    try {
      // Stop the session
      const stopResponse = await fetch('/api/live-sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: this.roomName
        })
      });

      const stopResult = await stopResponse.json();
      if (!stopResult.success) {
        throw new Error(stopResult.error);
      }

      // Close WebSocket
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.isPlaying = false;
      console.log('Session stopped:', stopResult);
      return stopResult;
    } catch (error) {
      console.error('Failed to stop session:', error);
      throw error;
    }
  }

  connectWebSocket() {
    this.ws = new WebSocket(`ws://localhost:8000/api/live-sessions/ws/live/${this.roomName}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(event) {
    if (event.data instanceof Blob) {
      // Video frame
      this.displayVideoFrame(event.data);
    } else if (typeof event.data === 'string' && event.data.startsWith('audio:')) {
      // Audio frame
      const audioData = event.data.substring(6);
      this.playAudioFrame(audioData);
    }
  }

  displayVideoFrame(blob) {
    const img = new Image();

    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };

    img.src = URL.createObjectURL(blob);
  }

  playAudioFrame(base64Audio) {
    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create audio buffer (adjust sample rate as needed)
      const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 44100);
      const channelData = audioBuffer.getChannelData(0);

      // Convert 16-bit PCM to float
      for (let i = 0; i < bytes.length; i += 2) {
        const sample = (bytes[i] | (bytes[i + 1] << 8)) / 32768.0;
        channelData[i / 2] = Math.max(-1, Math.min(1, sample));
      }

      // Play the audio
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (error) {
      console.error('Error playing audio frame:', error);
    }
  }
}

// Usage
const player = new LiveStreamPlayer('my-room');

// Start streaming (with recording)
await player.startSession(true);

// Stop streaming
// await player.stopSession();
```

## Configuration

The LiveKit configuration is managed through the `/api/config` endpoint:

```javascript
// Get current configuration
const configResponse = await fetch('/api/config');
const config = await configResponse.json();

// Update LiveKit settings
await fetch('/api/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    livekit_url: 'ws://your-livekit-server:7880',
    livekit_api_key: 'your-api-key',
    livekit_api_secret: 'your-api-secret',
    recording_directory: '/path/to/recordings'
  })
});
```

## Error Handling

Always handle errors appropriately:

```javascript
try {
  await player.startSession();
} catch (error) {
  if (error.message.includes('connection')) {
    // Handle connection errors
    console.error('Failed to connect to LiveKit room');
  } else if (error.message.includes('websocket')) {
    // Handle WebSocket errors
    console.error('WebSocket connection failed');
  } else {
    // Handle other errors
    console.error('Unknown error:', error);
  }
}
```

## Performance Considerations

1. **Video Quality:** JPEG quality is set to 85% for balance between quality and latency
2. **Frame Rate:** Limited by source and network conditions
3. **Audio Sync:** Audio and video may have slight synchronization differences
4. **Memory Usage:** Clean up object URLs after use to prevent memory leaks
5. **WebSocket Buffering:** Handle high-frequency messages appropriately

## Recording

When `record_session` is set to `true`:
- Video is saved as MP4 file
- Audio is saved as WAV file
- Files are stored in the configured `recording_directory`
- Recording paths are available in the session information

The recording happens server-side and doesn't affect the streaming performance to the frontend.
