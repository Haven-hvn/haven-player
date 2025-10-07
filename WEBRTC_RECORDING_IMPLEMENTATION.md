# WebRTC Recording Implementation

## Overview

This document describes the new WebRTC-based recording implementation that follows pion/webrtc best practices and addresses the empty video file issue.

## Architecture

```
[ LiveKit Room (SFU) ] → [ Subscription Layer ] → [ Frame Reception Layer ] → [ Encoding Queue ] → [ Container Writer ]
```

### Key Components

1. **WebRTCRecordingService**: Main service managing multiple recordings
2. **WebRTCRecorder**: Individual recorder following WebRTC state machine
3. **MediaClock**: RTP timestamp to PTS mapping for A/V sync
4. **BoundedQueue**: Frame buffering with backpressure handling
5. **TrackContext**: Per-track state management

## State Machine

The implementation follows a strict WebRTC state machine:

```
DISCONNECTED → CONNECTING → CONNECTED → SUBSCRIBING → SUBSCRIBED → RECORDING → STOPPING → STOPPED
```

### State Transitions

- **DISCONNECTED → CONNECTING**: When recording start is requested
- **CONNECTING → CONNECTED**: When room connection is established
- **CONNECTED → SUBSCRIBING**: When track subscription begins
- **SUBSCRIBING → SUBSCRIBED**: When tracks are successfully subscribed
- **SUBSCRIBED → RECORDING**: When frame processing starts
- **RECORDING → STOPPING**: When stop is requested
- **STOPPING → STOPPED**: When cleanup is complete

## Key Features

### 1. Reliable Track Subscription

```python
# Explicit subscription with timeout
if not track_pub.subscribed:
    track_pub.set_subscribed(True)
    await asyncio.sleep(0.1)  # Brief wait for subscription

# Wait for subscription confirmation
timeout = self.timeouts['subscription']
while not track_pub.subscribed and (time.time() - start_time) < timeout:
    await asyncio.sleep(0.1)
```

### 2. Bounded Queue Frame Reception

```python
# Create bounded queues per track
queue = BoundedQueue(max_items, track_context.kind)

# Put frames with drop policy
success = queue.put(frame)
if not success:
    logger.warning("Failed to enqueue frame")
```

### 3. RTP Timestamp to PTS Mapping

```python
# Register track clock reference
self.media_clock.register_track(track_id, track_kind, first_rtp_timestamp, first_wall_time)

# Convert RTP to PTS
pts = self.media_clock.rtp_to_pts(track_id, rtp_timestamp)
```

### 4. Comprehensive Diagnostics

```python
# Track statistics
self.stats = {
    'video_frames': 0,
    'audio_frames': 0,
    'dropped_frames': 0,
    'pli_requests': 0,
    'track_subscriptions': 0,
    'connection_time': 0.0,
    'subscription_time': 0.0,
}
```

## Configuration

### Timeouts

```python
self.timeouts = {
    'connection': 20.0,      # T1: Network connection timeout
    'subscription': 10.0,   # T2: Track subscription timeout
    'keyframe': 2.0,        # T2b: Keyframe after PLI timeout
    'read_deadline': 5.0,   # RTP read deadline
    'encode_timeout': 1.0,  # Encoder timeout
}
```

### Queue Configuration

```python
self.queue_config = {
    'video_max_items': 60,   # ~2 seconds at 30fps
    'audio_max_items': 200,  # ~250ms at 48kHz
}
```

## Error Handling

### 1. Track Subscription Failures

- Explicit subscription with timeout
- Fallback polling for SDKs lacking events
- Clear error messages for subscription failures

### 2. Frame Processing Errors

- Bounded queues prevent memory exhaustion
- Drop oldest frames when encoder lags
- Continue processing other tracks if one fails

### 3. Network Interruptions

- Read deadlines detect stalled connections
- Graceful degradation when tracks are lost
- Proper cleanup on disconnection

## Diagnostic Checklist

The implementation provides comprehensive diagnostics:

- [ ] Room connected: `PeerConnectionState==connected`
- [ ] Publications discovered: target publications present
- [ ] Subscribed: publication `subscribed==True` and `OnTrack` fired
- [ ] First RTP seen: per-track read loop received packet
- [ ] Keyframe observed: video parser indicates keyframe before writing to MP4
- [ ] Frames flowing: queue enqueue rate > 0; stats packets received increases
- [ ] RTCP feedback: PLI count increases on request; NACK/RTX observed under loss

## Usage

### Starting a Recording

```python
# Start recording
result = await recording_service.start_recording(
    mint_id="stream-123",
    output_format="mp4",
    video_quality="medium"
)

if result["success"]:
    print(f"Recording started: {result['output_path']}")
```

### Stopping a Recording

```python
# Stop recording
result = await recording_service.stop_recording(mint_id="stream-123")

if result["success"]:
    print(f"Recording stopped: {result['stats']}")
```

### Getting Status

```python
# Get recording status
status = await recording_service.get_recording_status(mint_id="stream-123")

print(f"State: {status['state']}")
print(f"Frames: {status['stats']['video_frames']} video, {status['stats']['audio_frames']} audio")
print(f"File size: {status['file_size_mb']} MB")
```

## Testing

The implementation includes comprehensive unit tests:

```bash
# Run WebRTC recording tests
python -m pytest tests/test_webrtc_recording_service.py -v
```

### Test Coverage

- Service initialization and configuration
- Recording start/stop lifecycle
- Track subscription and frame processing
- Error handling and edge cases
- State machine transitions
- Media clock and queue operations

## Migration from Old Implementation

The new implementation replaces the old `LiveKitRecordingService`:

1. **Updated API**: `recording.py` now uses `WebRTCRecordingService`
2. **Same Interface**: API endpoints remain the same
3. **Enhanced Status**: More detailed status information
4. **Better Diagnostics**: Comprehensive logging and statistics

## Why This Works

### 1. WebRTC Fundamentals

- Follows pion/webrtc lifecycle where `OnTrack` fires after RTP payload type determination
- Ensures real packet flow before recording begins
- Uses RTCP PLI/NACK per default feedback negotiated by LiveKit

### 2. Reliability

- RTP-driven PTS mapping guarantees A/V sync independent of wall-clock drift
- Bounded queues with drop policies provide reliability under encoder backpressure
- Comprehensive diagnostics make empty-file outcomes impossible without clear error state

### 3. Performance

- Async frame processing prevents blocking
- Bounded memory usage prevents resource exhaustion
- Efficient frame conversion and encoding

## Troubleshooting

### Empty Files

If files are still empty, check:

1. **Track Subscription**: Look for "Track ready" logs
2. **Frame Processing**: Look for "First frame received" logs
3. **Queue Status**: Check queue sizes in status response
4. **Statistics**: Verify frame counts are increasing

### Performance Issues

If recording is slow or drops frames:

1. **Queue Sizes**: Increase `video_max_items` or `audio_max_items`
2. **Encoder Settings**: Use faster codec presets
3. **System Resources**: Check CPU and memory usage
4. **Network**: Verify stable connection to LiveKit

### Connection Issues

If connection fails:

1. **Timeouts**: Increase connection/subscription timeouts
2. **Network**: Check firewall and network connectivity
3. **LiveKit**: Verify server status and credentials
4. **Logs**: Check for specific error messages

## Future Enhancements

Potential improvements:

1. **Adaptive Bitrate**: Adjust quality based on network conditions
2. **Multiple Formats**: Support for more container formats
3. **Streaming**: Real-time streaming while recording
4. **Analytics**: More detailed performance metrics
5. **Recovery**: Automatic reconnection on network issues
