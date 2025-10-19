# Performance Profiling Instrumentation Added

## What Was Added

Comprehensive timing instrumentation throughout the video frame processing pipeline to identify the cause of 13-31 second delays.

## Timing Points

### 1. Total Frame Time
```python
frame_start_time = time.time()
# ... all processing ...
frame_end_time = time.time()
frame_total_duration = (frame_end_time - frame_start_time) * 1000
```

**Logs**:
- `CRITICAL PERFORMANCE: Frame took XXXms` if >100ms
- `SLOW FRAME: XXXms` if >50ms

### 2. Initialization Check
```python
t_init_start = time.time()
if not self._container_initialized:
    await self._setup_container()
t_init_end = time.time()
```

**Logs**:
- `SLOW CONTAINER SETUP: XXXms` if setup >1000ms
- `SLOW INIT CHECK: XXXms` if check >100ms

### 3. Frame Normalization
```python
t_normalize_start = time.time()
av_frame = self._normalize_video_frame(frame)
t_normalize_end = time.time()
```

**Logs**:
- `SLOW NORMALIZE: XXXms` if >50ms

### 4. PTS Calculation
```python
t_pts_start = time.time()
pts, dts = self._calculate_video_pts_dts(frame, av_frame)
t_pts_end = time.time()
```

**Logs**:
- `SLOW PTS CALC: XXXms` if >10ms

### 5. Encoding
```python
t_encode_start = time.time()
packets = self.video_stream.encode(av_frame)
t_encode_end = time.time()
```

**Logs**:
- `SLOW ENCODE: XXXms` if >50ms

### 6. Packet Writing
```python
t_write_start = time.time()
for packet in packets:
    self._write_packet_direct(packet)
t_write_end = time.time()
```

**Logs**:
- `SLOW WRITE: XXXms` if >50ms

## Performance Summary Logs

### Every Frame (first 60 frames)
```
[TELEMETRY] Frame 45: 1 packet(s), 15234 bytes, 
timing: normalize=12.3ms, encode=45.6ms, write=3.2ms, TOTAL=61.1ms
```

### Every 30 Frames
```
📊 PERFORMANCE: Last frame took 61.1ms total
❌ CRITICAL: Frame processing >100ms will cause buffering!
```

## What to Look For

### Normal Performance (No Buffering)
```
Frame timing:
- normalize: 5-15ms
- encode: 15-40ms (with ultrafast)
- write: 1-5ms
- TOTAL: <33ms (for 30fps)
```

### Problem Indicators

#### Encoding Too Slow
```
⚠️ SLOW ENCODE: 150.5ms
❌ CRITICAL PERFORMANCE: Frame took 165.2ms
```
**Solution**: Use hardware encoding or lower resolution

#### Disk I/O Too Slow
```
⚠️ SLOW WRITE: 85.3ms
❌ CRITICAL PERFORMANCE: Frame took 102.1ms
```
**Solution**: Use SSD, increase flush threshold, or async writes

#### Normalization Too Slow
```
⚠️ SLOW NORMALIZE: 75.2ms
```
**Solution**: Optimize numpy array conversion

#### Container Setup Blocking
```
⚠️ SLOW CONTAINER SETUP: 2500.0ms
```
**Solution**: Pre-initialize container or make setup async

## How to Diagnose the 13-31 Second Delays

### Step 1: Watch the Logs
```bash
tail -f backend.log | grep -E "(SLOW|CRITICAL|TELEMETRY)"
```

Look for:
- Which operation is taking >1000ms?
- Is it consistent or intermittent?
- Does it happen on specific frames?

### Step 2: Calculate Missing Time

If logs show:
```
Frame 100: normalize=10ms, encode=40ms, write=5ms, TOTAL=55ms
⚠️  Long gap between frames: 15.3s
```

**This means**: 15.3s - 0.055s = **15.245 seconds missing**

The missing time is likely:
- **Async loop blocked** (not yielding)
- **VideoStream iterator blocked** (waiting for frame)
- **System issue** (CPU/disk/memory pressure)

### Step 3: Check System Resources

While recording:
```bash
# CPU usage
top -p $(pgrep -f python) -d 1

# Disk I/O wait
iostat -x 1

# Memory pressure
vmstat 1
```

## Expected Results

### Good Performance (No Memory Growth)
```
[TELEMETRY] Frame 1: normalize=8.2ms, encode=32.1ms, write=2.3ms, TOTAL=42.6ms
[TELEMETRY] Frame 2: normalize=7.9ms, encode=31.5ms, write=2.1ms, TOTAL=41.5ms
[TELEMETRY] Frame 3: normalize=8.3ms, encode=33.2ms, write=2.4ms, TOTAL=44.0ms
📊 PERFORMANCE: Last frame took 44.0ms total
```

Memory: **Stable at 150-240MB**

### Bad Performance (Will Cause Buffering)
```
[TELEMETRY] Frame 1: normalize=8.2ms, encode=125.3ms, write=2.3ms, TOTAL=135.8ms
❌ CRITICAL PERFORMANCE: Frame took 135.8ms (should be <33ms for 30fps)
⚠️  Long gap between frames: 4.2s
```

Memory: **Growing to 9GB**

### Mystery Delay (The Actual Problem)
```
[TELEMETRY] Frame 1: normalize=8.2ms, encode=32.1ms, write=2.3ms, TOTAL=42.6ms
📊 PERFORMANCE: Last frame took 42.6ms total
⚠️  Long gap between frames: 18.7s  ← WHERE DID 18.7 SECONDS GO?!
```

The 18.7 seconds is NOT in our code timing → **Something else is blocking**

## Possible Causes of Mystery Delays

### 1. VideoStream Iterator Blocking
The `async for event in rtc.VideoStream(track)` might be waiting for frames

**Test**: Add timing around the iterator
```python
last_yield = time.time()
async for event in rtc.VideoStream(self.video_track):
    yield_wait = (time.time() - last_yield) * 1000
    if yield_wait > 1000:
        logger.warning(f"VideoStream yielded after {yield_wait:.1f}ms wait")
    last_yield = time.time()
```

### 2. Lazy Container Initialization Blocking
First frame triggers container setup which might be slow

**Look for**: `SLOW CONTAINER SETUP: XXXms` in logs

### 3. GC Pauses
Python garbage collection might pause for seconds

**Test**: Disable GC temporarily
```python
import gc
gc.disable()  # At start of recording
```

### 4. System Swapping
System is swapping memory to disk

**Check**: `vmstat 1` - look for high `si` (swap in) / `so` (swap out)

### 5. Disk Full/Slow
Writing to full or very slow disk

**Check**: `df -h` (disk space), `iostat -x 1` (I/O wait)

## Next Steps

1. **Run recording with new instrumentation**
2. **Watch logs for timing breakdowns**
3. **Identify which operation is slow**:
   - If encode >50ms → hardware encoding or lower resolution
   - If write >50ms → SSD or async writes
   - If none are slow but total >100ms → mystery delay
4. **If mystery delay** → check system resources, GC, swap

---

**Status**: ✅ PROFILING INSTRUMENTATION COMPLETE  
**Purpose**: Find the 13-31 second delay causing 9GB memory growth  
**Next**: Test and review logs to identify bottleneck

