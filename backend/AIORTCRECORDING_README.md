# aiortc Recording API - Haven Player

This document provides comprehensive information about the new aiortc-based recording system for Haven Player, including API endpoints, usage examples, and configuration options.

## Overview

The Haven Player now includes a complete aiortc-based recording system that provides:

- **AV1 Video Recording**: High-quality AV1 codec support
- **Multiple Formats**: AV1, MP4, WebM output formats
- **Quality Presets**: Low, medium, high quality options
- **Desktop Integration**: Works with existing frontend desktop app
- **Real-time Status**: Live recording status monitoring
- **Stream Discovery**: Integration with pump.fun stream discovery

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │────│   Backend API    │────│   aiortc        │
│   (Desktop)     │    │   (FastAPI)      │    │   Recording     │
│                 │    │                  │    │                 │
│ - Stream List   │    │ - Recording API  │    │ - AV1 Codec     │
│ - Record Button │    │ - Status API     │    │ - WebRTC        │
│ - Status Display│    │ - Config API     │    │ - MediaRecorder │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## API Endpoints

### Recording Management

#### Start Recording
**Endpoint:** `POST /api/recording/start`

**Request:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "output_format": "av1",
  "video_quality": "high",
  "audio_quality": "high",
  "output_directory": "/path/to/recordings"
}
```

**Response:**
```json
{
  "success": true,
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "recording_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "output_path": "/path/to/recordings/CoinName_12345678_20241201_143022.av1",
  "stream_info": {
    "name": "Example Coin",
    "symbol": "EXC",
    "num_participants": 150
  },
  "config": {
    "output_format": "av1",
    "video_quality": "high",
    "audio_quality": "high"
  }
}
```

#### Stop Recording
**Endpoint:** `POST /api/recording/stop`

**Request:**
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
  "final_path": "/path/to/recordings/CoinName_12345678_20241201_143022.av1",
  "duration_seconds": 120.5,
  "file_size_bytes": 15728640
}
```

#### Get Recording Status
**Endpoint:** `GET /api/recording/status/{mint_id}`

**Response:**
```json
{
  "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
  "is_recording": true,
  "start_time": "2024-12-01T14:30:22",
  "output_path": "/path/to/recordings/CoinName_12345678_20241201_143022.av1",
  "duration_seconds": 45.2,
  "video_codec": "libaom-av1",
  "audio_codec": "aac",
  "error": null
}
```

#### Get Active Recordings
**Endpoint:** `GET /api/recording/active`

**Response:**
```json
{
  "active_recordings": {
    "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump": {
      "mint_id": "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump",
      "is_recording": true,
      "start_time": "2024-12-01T14:30:22",
      "output_path": "/path/to/recordings/CoinName_12345678_20241201_143022.av1",
      "stream_info": {
        "name": "Example Coin",
        "symbol": "EXC"
      },
      "config": {
        "format": "av1",
        "video_codec": "libaom-av1",
        "audio_codec": "aac"
      }
    }
  },
  "count": 1
}
```

### Configuration Management

#### Get Output Directory
**Endpoint:** `GET /api/recording/output-directory`

**Response:**
```json
{
  "output_directory": "/Users/user/.haven-player/recordings",
  "exists": true,
  "writable": true
}
```

#### Set Output Directory
**Endpoint:** `POST /api/recording/set-output-directory`

**Request:**
```json
{
  "directory": "/custom/recording/path"
}
```

**Response:**
```json
{
  "success": true,
  "output_directory": "/custom/recording/path"
}
```

#### Get Supported Formats
**Endpoint:** `GET /api/recording/formats`

**Response:**
```json
{
  "supported_formats": {
    "formats": ["av1", "mp4", "webm"],
    "codecs": {
      "av1": {
        "video_codec": "libaom-av1",
        "audio_codec": "aac",
        "video_bitrate": "2M",
        "audio_bitrate": "128k",
        "extension": "av1"
      },
      "mp4": {
        "video_codec": "libx264",
        "audio_codec": "aac",
        "video_bitrate": "2M",
        "audio_bitrate": "128k",
        "extension": "mp4"
      },
      "webm": {
        "video_codec": "libvpx-vp9",
        "audio_codec": "libopus",
        "video_bitrate": "2M",
        "audio_bitrate": "128k",
        "extension": "webm"
      }
    },
    "quality_presets": {
      "low": {"video_bitrate": "500k", "audio_bitrate": "64k"},
      "medium": {"video_bitrate": "1M", "audio_bitrate": "96k"},
      "high": {"video_bitrate": "2M", "audio_bitrate": "128k"}
    }
  },
  "default_format": "av1",
  "recommended_formats": ["av1", "mp4"]
}
```

## Usage Examples

### Frontend Integration

#### JavaScript/TypeScript Example

```typescript
class HavenPlayerRecorder {
  private baseUrl = 'http://localhost:8000/api/recording';
  
  async startRecording(mintId: string, options: RecordingOptions = {}) {
    const response = await fetch(`${this.baseUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint_id: mintId,
        output_format: options.format || 'av1',
        video_quality: options.videoQuality || 'high',
        audio_quality: options.audioQuality || 'high',
        output_directory: options.outputDirectory
      })
    });
    
    return await response.json();
  }
  
  async stopRecording(mintId: string) {
    const response = await fetch(`${this.baseUrl}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mint_id: mintId })
    });
    
    return await response.json();
  }
  
  async getRecordingStatus(mintId: string) {
    const response = await fetch(`${this.baseUrl}/status/${mintId}`);
    return await response.json();
  }
  
  async getActiveRecordings() {
    const response = await fetch(`${this.baseUrl}/active`);
    return await response.json();
  }
}

// Usage
const recorder = new HavenPlayerRecorder();

// Start recording
const result = await recorder.startRecording('V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump', {
  format: 'av1',
  videoQuality: 'high',
  audioQuality: 'high'
});

console.log('Recording started:', result.output_path);

// Monitor recording status
const status = await recorder.getRecordingStatus('V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump');
console.log('Recording status:', status);

// Stop recording
const stopResult = await recorder.stopRecording('V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump');
console.log('Recording stopped:', stopResult.final_path);
```

### Python Example

```python
import asyncio
import aiohttp

async def test_recording_api():
    async with aiohttp.ClientSession() as session:
        # Start recording
        async with session.post('http://localhost:8000/api/recording/start', 
                              json={
                                  'mint_id': 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump',
                                  'output_format': 'av1',
                                  'video_quality': 'high',
                                  'audio_quality': 'high'
                              }) as response:
            result = await response.json()
            print(f"Recording started: {result}")
        
        # Monitor status
        async with session.get('http://localhost:8000/api/recording/status/V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump') as response:
            status = await response.json()
            print(f"Recording status: {status}")
        
        # Stop recording
        async with session.post('http://localhost:8000/api/recording/stop',
                               json={'mint_id': 'V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump'}) as response:
            result = await response.json()
            print(f"Recording stopped: {result}")

# Run the example
asyncio.run(test_recording_api())
```

## Configuration

### Supported Formats

| Format | Video Codec | Audio Codec | Extension | Use Case |
|--------|-------------|-------------|-----------|----------|
| AV1    | libaom-av1  | aac         | .av1      | Best compression, modern browsers |
| MP4    | libx264     | aac         | .mp4      | Universal compatibility |
| WebM   | libvpx-vp9  | libopus     | .webm     | Web-optimized |

### Quality Presets

| Quality | Video Bitrate | Audio Bitrate | File Size | Use Case |
|---------|---------------|---------------|-----------|----------|
| Low     | 500k          | 64k           | Small     | Quick previews, mobile |
| Medium  | 1M            | 96k           | Medium    | Standard quality |
| High    | 2M            | 128k          | Large     | Archive quality |

## Dependencies

### Required Packages

```bash
# Core aiortc dependencies
aiortc==1.6.0
aiofiles==23.2.1

# Existing Haven Player dependencies
fastapi==0.115.0
livekit==1.0.13
livekit-api==1.0.5
```

### System Requirements

- **FFmpeg**: Required for AV1 encoding
- **Python 3.8+**: Required for aiortc
- **WebRTC Support**: Built into aiortc

### FFmpeg Installation

#### macOS (Homebrew)
```bash
brew install ffmpeg
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### Windows
Download from https://ffmpeg.org/download.html

## Testing

### Run Tests
```bash
cd backend
python test_aiortc_recording.py
```

### Test Individual Components
```bash
# Test recording service
python -c "from app.services.aiortc_recording_service import AioRTCRecordingService; print('✅ Service imported')"

# Test API endpoints
python -c "from app.api.recording import router; print('✅ API router imported')"
```

## Error Handling

### Common Errors

1. **Stream Not Found**
   ```json
   {
     "success": false,
     "error": "Stream not found or not live for mint_id: xyz"
   }
   ```

2. **Recording Already Active**
   ```json
   {
     "success": false,
     "error": "Recording already active for xyz"
   }
   ```

3. **FFmpeg Not Found**
   ```json
   {
     "success": false,
     "error": "FFmpeg not found. Please install FFmpeg to create AV1 videos."
   }
   ```

4. **Invalid Output Directory**
   ```json
   {
     "success": false,
     "error": "Path is not a directory"
   }
   ```

## Performance Considerations

### Recording Performance
- **CPU Usage**: AV1 encoding is CPU-intensive
- **Memory Usage**: aiortc handles memory efficiently
- **Disk I/O**: High-quality recordings require fast storage

### Optimization Tips
1. **Use SSD storage** for output directory
2. **Monitor CPU usage** during recording
3. **Adjust quality presets** based on hardware
4. **Close unnecessary applications** during recording

## Troubleshooting

### Recording Issues
1. **Check FFmpeg installation**: `ffmpeg -version`
2. **Verify output directory permissions**
3. **Monitor system resources**
4. **Check logs for detailed error messages**

### API Issues
1. **Verify backend is running**: `curl http://localhost:8000/`
2. **Check CORS settings** for frontend integration
3. **Validate mint_id** with pump.fun API
4. **Monitor backend logs** for errors

## Next Steps

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Test the implementation**: `python test_aiortc_recording.py`
3. **Start the backend**: `uvicorn app.main:app --reload`
4. **Integrate with frontend**: Use the provided API endpoints
5. **Configure output directory**: Set your preferred recording location

The aiortc recording system is now ready for production use with your Haven Player desktop application!
