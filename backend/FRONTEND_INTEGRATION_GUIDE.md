# Frontend Integration Guide - Shared Stream Management

This guide provides detailed instructions for integrating the Haven Player's live streaming and recording functionality using the new shared stream management architecture.

## Overview

The backend now uses a **shared stream management architecture** that eliminates duplicate WebRTC connections and provides clean separation between streaming and recording:

- **StreamManager**: Single WebRTC connection per stream
- **LiveSessionService**: WebSocket streaming using shared stream
- **AioRTCRecordingService**: AV1 recording using shared stream

Communication uses:
- **HTTP POST requests** for session control (start/stop)
- **WebSocket connection** for real-time video/audio streaming
- **Separate recording endpoints** for AV1 recording

## API Endpoints

### Start Live Session
**Endpoint:** `POST /api/live-sessions/start`

**Request Body:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}
```

**Response:**
```json
{
  "success": true,
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "room_name": "room-name",
  "participant_sid": "PA_xxx",
  "session_id": 1,
  "stream_info": {
    "coin_name": "PumpCoin",
    "telegram": "@pumpcoin"
  }
}
```

**Usage:**
```javascript
const response = await fetch('/api/live-sessions/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mint_id: 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump'
  })
});
const result = await response.json();
```

### Stop Live Session
**Endpoint:** `POST /api/live-sessions/stop`

**Request Body:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}
```

**Response:**
```json
{
  "success": true,
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}
```

**Usage:**
```javascript
const response = await fetch('/api/live-sessions/stop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mint_id: 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump'
  })
});
const result = await response.json();
```

### Get Active Sessions
**Endpoint:** `GET /api/live-sessions/active`

**Response:**
```json
{
  "success": true,
  "sessions": {
    "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump": {
      "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
      "room_name": "room-name",
      "participant_sid": "PA_xxx",
      "stream_data": {
        "coin_name": "PumpCoin",
        "telegram": "@pumpcoin"
      }
    }
  }
}
```

## Recording API Endpoints

### Start Recording
**Endpoint:** `POST /api/recording/start`

**Request Body:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "output_format": "av1",
  "video_quality": "medium"
}
```

**Response:**
```json
{
  "success": true,
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "output_path": "/path/to/recording.mp4",
  "config": {
    "video_codec": "libaom-av1",
    "audio_codec": "aac",
    "video_bitrate": "2000k",
    "audio_bitrate": "128k",
    "format": "mp4"
  }
}
```

**Usage:**
```javascript
const response = await fetch('/api/recording/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mint_id: 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump',
    output_format: 'av1',
    video_quality: 'medium'
  })
});
const result = await response.json();
```

### Stop Recording
**Endpoint:** `POST /api/recording/stop`

**Request Body:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
}
```

**Response:**
```json
{
  "success": true,
  "output_path": "/path/to/recording.mp4",
  "start_time": "2024-01-01T12:00:00Z",
  "end_time": "2024-01-01T12:05:00Z"
}
```

### Get Recording Status
**Endpoint:** `GET /api/recording/status/{mint_id}`

**Response:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "is_recording": true,
  "start_time": "2024-01-01T12:00:00Z",
  "output_path": "/path/to/recording.mp4",
  "config": {
    "video_codec": "libaom-av1",
    "format": "mp4"
  }
}
```

### Get Supported Formats
**Endpoint:** `GET /api/recording/formats`

**Response:**
```json
{
  "success": true,
  "formats": {
    "av1": {
      "description": "AV1 codec (recommended)",
      "codec": "libaom-av1",
      "container": "mp4"
    },
    "h264": {
      "description": "H.264 codec",
      "codec": "libx264",
      "container": "mp4"
    },
    "vp9": {
      "description": "VP9 codec",
      "codec": "libvpx-vp9",
      "container": "webm"
    }
  },
  "quality_presets": {
    "low": {
      "video_bitrate": "1000k",
      "audio_bitrate": "64k"
    },
    "medium": {
      "video_bitrate": "2000k",
      "audio_bitrate": "128k"
    },
    "high": {
      "video_bitrate": "4000k",
      "audio_bitrate": "192k"
    }
  }
}
```

## WebSocket Streaming

### Connection
**Endpoint:** `ws://localhost:8000/api/live-sessions/stream/{mint_id}`

**Connection Example:**
```javascript
const mintId = 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump';
const ws = new WebSocket(`ws://localhost:8000/api/live-sessions/stream/${mintId}`);
```

### Message Types

#### Video Frames (JSON with base64 data)
- **Format:** JSON with base64-encoded JPEG data
- **Usage:** Display on HTML5 Canvas

```javascript
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

#### Audio Frames (JSON with base64 data)
- **Format:** JSON with base64-encoded audio data
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

function displayVideoFrame(base64Data) {
  const img = new Image();

  img.onload = () => {
    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw new frame
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  // Set image source from base64 data
  img.src = `data:image/jpeg;base64,${base64Data}`;
}
```

## Complete Integration Example

```javascript
class LiveStreamPlayer {
  constructor(mintId) {
    this.mintId = mintId;
    this.ws = null;
    this.canvas = document.getElementById('videoCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audioContext = new AudioContext();
    this.isPlaying = false;
    this.isRecording = false;
  }

  async startSession() {
    try {
      // Start the session
      const startResponse = await fetch('/api/live-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_id: this.mintId
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

  async startRecording(outputFormat = 'av1', videoQuality = 'medium') {
    try {
      const response = await fetch('/api/recording/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_id: this.mintId,
          output_format: outputFormat,
          video_quality: videoQuality
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }

      this.isRecording = true;
      console.log('Recording started:', result);
      return result;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording() {
    try {
      const response = await fetch('/api/recording/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_id: this.mintId
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }

      this.isRecording = false;
      console.log('Recording stopped:', result);
      return result;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }

  async stopSession() {
    try {
      // Stop recording if active
      if (this.isRecording) {
        await this.stopRecording();
      }

      // Stop the session
      const stopResponse = await fetch('/api/live-sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint_id: this.mintId
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
    this.ws = new WebSocket(`ws://localhost:8000/api/live-sessions/stream/${this.mintId}`);

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
    const data = JSON.parse(event.data);
    
    if (data.type === 'video_frame') {
      this.displayVideoFrame(data.data);
    } else if (data.type === 'audio_frame') {
      this.playAudioFrame(data.data);
    }
  }

  displayVideoFrame(base64Data) {
    const img = new Image();

    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };

    img.src = `data:image/jpeg;base64,${base64Data}`;
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

  async getRecordingStatus() {
    try {
      const response = await fetch(`/api/recording/status/${this.mintId}`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to get recording status:', error);
      throw error;
    }
  }
}

// Usage
const player = new LiveStreamPlayer('V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump');

// Start streaming
await player.startSession();

// Start recording (optional)
await player.startRecording('av1', 'medium');

// Stop recording (optional)
// await player.stopRecording();

// Stop streaming
// await player.stopSession();
```

## Key Changes from Previous Architecture

### ✅ **Shared Stream Management**
- **Single WebRTC connection** per stream (no duplicates)
- **StreamManager** handles connection management
- **LiveSessionService** handles WebSocket streaming
- **AioRTCRecordingService** handles AV1 recording

### ✅ **Updated API Endpoints**
- **Live Sessions**: Use `mint_id` instead of `room_name`
- **Recording**: Separate endpoints with format/quality options
- **WebSocket**: Updated path to use `mint_id`

### ✅ **Better Performance**
- No duplicate WebRTC connections
- Shared frame distribution
- Clean separation of concerns

### ✅ **AV1 Recording Support**
- Multiple format support (AV1, H.264, VP9)
- Quality presets (low, medium, high)
- Proper WebRTC connection management

## Error Handling

Always handle errors appropriately:

```javascript
try {
  await player.startSession();
  await player.startRecording('av1', 'medium');
} catch (error) {
  if (error.message.includes('connection')) {
    console.error('Failed to connect to LiveKit room');
  } else if (error.message.includes('websocket')) {
    console.error('WebSocket connection failed');
  } else if (error.message.includes('recording')) {
    console.error('Recording failed');
  } else {
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
6. **Shared Stream:** Single WebRTC connection reduces bandwidth usage

## Recording

The new architecture provides:
- **AV1 recording** with proper WebRTC connection management
- **Multiple format support** (AV1, H.264, VP9)
- **Quality presets** for different use cases
- **Shared stream usage** (no duplicate connections)

Recording happens server-side using the shared WebRTC connection and doesn't affect streaming performance to the frontend.