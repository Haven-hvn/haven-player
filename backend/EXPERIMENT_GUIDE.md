# How to Run the Encoder Buffer Starvation Fix Experiments

This guide provides step-by-step instructions for running the experiments to validate the encoder buffer starvation fix.

## Prerequisites

1. **Working LiveKit Setup**: Ensure LiveKit server is running and accessible
2. **Recording Service**: Have the updated `webrtc_recording_service.py` deployed
3. **Test Stream**: Have a reliable test stream source (real livestream or test generator)
4. **Monitoring Tools**: Install required tools for validation

```bash
# Install validation tools
brew install ffmpeg  # macOS
# or
apt-get install ffmpeg  # Linux

# Python requirements should already be installed
pip install psutil  # For memory monitoring
```

## Quick Start

### 1. Basic 30-Second Test

```bash
# Terminal 1: Start the recording service
cd /Users/david/Documents/GitHub/haven-player/backend
python -m app.main

# Terminal 2: Monitor file growth
watch -n 2 'ls -lh recordings/*.mp4'

# Terminal 3: Monitor memory
watch -n 2 'ps aux | grep python | grep recording'

# Start recording via API
curl -X POST http://localhost:8000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_mint_123"}'

# Wait 30 seconds...

# Stop recording
curl -X POST http://localhost:8000/api/recording/stop \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_mint_123"}'

# Get status and metrics
curl http://localhost:8000/api/recording/status/test_mint_123

# Validate the recording
cd recordings
ffprobe -v error -show_format -show_streams test_mint_123_*.mp4
ffprobe -show_packets test_mint_123_*.mp4 | grep pts_time | head -20
vlc test_mint_123_*.mp4  # Test playback
```

### Expected Output

**File Size**: Should be ~7-10MB for 30 seconds at 1080p@30fps  
**Memory**: Should be < 500MB  
**Packets**: Should see continuous packet generation in logs  
**Status**: `zero_packet_streak` should be 0

## Detailed Test Procedures

### Test 1: Basic Functionality (30 seconds)

1. **Setup**:
   ```bash
   # Clear old recordings
   rm -rf recordings/*
   
   # Start fresh
   python -m app.main
   ```

2. **Start monitoring** (in separate terminals):
   ```bash
   # File size monitor
   watch -n 2 'ls -lh recordings/*.mp4 | tail -1'
   
   # Memory monitor
   watch -n 2 'ps aux | grep -i recording | grep python | awk "{print \$6/1024 \" MB\"}"'
   
   # Log monitor
   tail -f logs/recording.log | grep -E "(PTS|packet|flush|memory)"
   ```

3. **Execute test**:
   ```bash
   # Start recording
   START_TIME=$(date +%s)
   curl -X POST http://localhost:8000/api/recording/start \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_basic"}'
   
   # Wait 30 seconds
   sleep 30
   
   # Stop recording
   curl -X POST http://localhost:8000/api/recording/stop \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_basic"}'
   END_TIME=$(date +%s)
   
   echo "Duration: $((END_TIME - START_TIME)) seconds"
   ```

4. **Collect metrics**:
   ```bash
   # Get final status
   curl http://localhost:8000/api/recording/status/test_basic | jq

   # File info
   ls -lh recordings/test_basic_*.mp4
   
   # Validate
   ffprobe -v error -show_format -show_streams recordings/test_basic_*.mp4
   
   # Check PTS
   ffprobe -show_packets recordings/test_basic_*.mp4 | \
     grep "pts_time=" | head -20
   ```

5. **Fill in EXPERIMENT_RESULTS.md** under "Test 1"

### Test 2: Long Duration (4+ hours)

1. **Setup long-running test**:
   ```bash
   # Create monitoring script
   cat > monitor_recording.sh << 'EOF'
   #!/bin/bash
   MINT_ID=$1
   DURATION=$2
   
   echo "Time,FileSize,Memory,Frames,Packets,Streak" > metrics.csv
   
   for i in $(seq 0 30 $DURATION); do
     SIZE=$(ls -l recordings/${MINT_ID}_*.mp4 2>/dev/null | awk '{print $5}')
     MEM=$(ps aux | grep recording | grep -v grep | awk '{print $6}')
     METRICS=$(curl -s http://localhost:8000/api/recording/status/${MINT_ID} | jq -r '.stats | "\(.video_frames_written),\(.packets_written),\(.zero_packet_streak)"')
     
     echo "${i},${SIZE:-0},${MEM:-0},${METRICS}" >> metrics.csv
     sleep 30
   done
   EOF
   
   chmod +x monitor_recording.sh
   ```

2. **Start long recording**:
   ```bash
   # Start recording
   curl -X POST http://localhost:8000/api/recording/start \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_long"}'
   
   # Start monitoring (run in background)
   ./monitor_recording.sh test_long 14400 &  # 4 hours = 14400 seconds
   
   # Let it run for 4+ hours...
   ```

3. **After completion**:
   ```bash
   # Stop recording
   curl -X POST http://localhost:8000/api/recording/stop \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_long"}'
   
   # Analyze metrics
   cat metrics.csv
   
   # Check file
   ls -lh recordings/test_long_*.mp4
   ffprobe recordings/test_long_*.mp4
   
   # Plot memory growth (optional, requires gnuplot)
   gnuplot << 'EOF'
   set datafile separator ","
   set xlabel "Time (seconds)"
   set ylabel "Memory (KB)"
   set title "Memory Usage Over Time"
   plot "metrics.csv" using 1:3 with lines
   pause -1
   EOF
   ```

4. **Fill in EXPERIMENT_RESULTS.md** under "Test 2"

### Test 3: Stress Test - Timestamp Gaps

1. **Simulate gaps** (requires modifying the stream or using a test utility):
   ```bash
   # This test requires injecting timestamp gaps
   # If you have a test harness, use it
   # Otherwise, manually pause/resume the stream source
   
   # Start recording
   curl -X POST http://localhost:8000/api/recording/start \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_gaps"}'
   
   # Monitor logs for gap detection
   tail -f logs/recording.log | grep -E "(gap|flush|timestamp)"
   
   # Pause stream for 100ms (via your streaming tool)
   # Resume
   # Wait 10 seconds
   
   # Pause for 500ms
   # Resume
   # Wait 10 seconds
   
   # Pause for 1000ms
   # Resume
   # Wait 10 seconds
   
   # Stop
   curl -X POST http://localhost:8000/api/recording/stop \
     -H "Content-Type: application/json" \
     -d '{"mint_id": "test_gaps"}'
   
   # Validate
   ffprobe recordings/test_gaps_*.mp4
   vlc recordings/test_gaps_*.mp4  # Look for glitches at gap points
   ```

2. **Fill in EXPERIMENT_RESULTS.md** under "Test 3"

### Test 4: Resolution Changes

```bash
# Start recording at 1080p
curl -X POST http://localhost:8000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_resolution"}'

# After 30s, change stream resolution to 720p (via streaming source)
sleep 30

# After another 30s, change back to 1080p
sleep 30

# Stop
curl -X POST http://localhost:8000/api/recording/stop \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_resolution"}'

# Check logs for resolution change detection
grep "resolution" logs/recording.log

# Validate file
ffprobe recordings/test_resolution_*.mp4
```

### Test 5: Audio Mute/Unmute

```bash
# Start recording with audio
curl -X POST http://localhost:8000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_audio"}'

# After 15s, mute audio (via streaming source)
sleep 15

# After 15s, unmute
sleep 15

# After 15s, stop
sleep 15
curl -X POST http://localhost:8000/api/recording/stop \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_audio"}'

# Check audio stream
ffprobe recordings/test_audio_*.mp4 | grep Audio
```

### Test 6: Rapid Start/Stop

```bash
# Create test script
cat > rapid_test.sh << 'EOF'
#!/bin/bash

for i in {1..10}; do
  echo "Cycle $i"
  
  # Start
  curl -s -X POST http://localhost:8000/api/recording/start \
    -H "Content-Type: application/json" \
    -d "{\"mint_id\": \"test_rapid_${i}\"}" | jq -r '.success'
  
  # Record for 5 seconds
  sleep 5
  
  # Stop
  curl -s -X POST http://localhost:8000/api/recording/stop \
    -H "Content-Type: application/json" \
    -d "{\"mint_id\": \"test_rapid_${i}\"}" | jq -r '.success'
  
  # Check memory
  MEM=$(ps aux | grep recording | grep -v grep | awk '{print $6/1024 " MB"}')
  echo "Memory: $MEM"
  
  # Brief pause
  sleep 2
done
EOF

chmod +x rapid_test.sh
./rapid_test.sh
```

## Data Collection Scripts

### Automated Metric Collection

```bash
# Save this as collect_metrics.sh
cat > collect_metrics.sh << 'EOF'
#!/bin/bash
MINT_ID=$1

if [ -z "$MINT_ID" ]; then
  echo "Usage: $0 <mint_id>"
  exit 1
fi

echo "Collecting metrics for $MINT_ID..."

# Get status
STATUS=$(curl -s http://localhost:8000/api/recording/status/${MINT_ID})

# Extract key metrics
echo "=== Recording Status ==="
echo "$STATUS" | jq -r '.state'

echo ""
echo "=== Frame Metrics ==="
echo "$STATUS" | jq -r '.stats | "Received: \(.video_frames_received)\nWritten: \(.video_frames_written)\nPackets: \(.packets_written)"'

echo ""
echo "=== Encoder Metrics ==="
echo "$STATUS" | jq -r '.stats | "Flush count: \(.encoder_flush_count)\nZero packet streak: \(.zero_packet_streak)\nPTS jitter avg: \(.pts_jitter_avg)\nPTS jitter max: \(.pts_jitter_max)"'

echo ""
echo "=== Backpressure Metrics ==="
echo "$STATUS" | jq -r '.stats | "Dropped frames: \(.frames_dropped_backpressure)\nAvg processing: \(.avg_frame_processing_ms)ms"'

echo ""
echo "=== File Info ==="
FILE=$(ls -1 recordings/${MINT_ID}_*.mp4 2>/dev/null | head -1)
if [ -n "$FILE" ]; then
  ls -lh "$FILE"
  ffprobe -v error -show_format "$FILE" | grep duration
else
  echo "No file found yet"
fi
EOF

chmod +x collect_metrics.sh
```

### Usage
```bash
# During recording
./collect_metrics.sh test_mint_123

# After recording
./collect_metrics.sh test_mint_123
```

## Troubleshooting

### Recording Not Starting
```bash
# Check logs
tail -f logs/recording.log

# Check service status
curl http://localhost:8000/health

# Verify LiveKit connection
curl http://localhost:8000/api/livestream/active
```

### File Not Growing
```bash
# Check zero packet streak
curl http://localhost:8000/api/recording/status/YOUR_MINT_ID | jq '.stats.zero_packet_streak'

# Check logs for encoder issues
grep "zero_packet_streak" logs/recording.log

# If streak > 10, there's an issue with the fix
```

### High Memory Usage
```bash
# Monitor memory continuously
watch -n 1 'ps aux | grep recording | grep -v grep | awk "{print \$6/1024 \" MB\"}"'

# Check for backpressure activation
curl http://localhost:8000/api/recording/status/YOUR_MINT_ID | \
  jq '.stats.frames_dropped_backpressure'
```

## Tips for Accurate Results

1. **Use a stable test stream**: Don't use production streams for testing
2. **Run each test at least twice**: Verify consistency
3. **Clear recordings between tests**: `rm -rf recordings/*`
4. **Monitor system resources**: Ensure no other processes are competing
5. **Save all logs**: You'll need them for analysis
6. **Take screenshots**: Of monitoring dashboards at key points
7. **Document everything**: Even "obvious" observations matter

## Next Steps

After completing all tests:
1. Fill in **EXPERIMENT_RESULTS.md** completely
2. Attach sample files (if file size permits)
3. Share metrics.csv and log excerpts
4. Provide your analysis and recommendations
5. Report back findings to the AI assistant for further analysis

## Questions?

If you encounter unexpected behavior:
1. Document it thoroughly (logs, metrics, screenshots)
2. Try to reproduce it
3. Check if it's a test setup issue vs a real bug
4. Report with full context

Good luck with testing! 🚀

