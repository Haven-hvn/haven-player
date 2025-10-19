# The Real Solution: Process Frames Faster Than They Arrive

## I Was Wrong About maxsize

**I apologize** - `maxsize` in VideoStream is for **resolution** (width, height), NOT queue size!

```python
# This sets RESOLUTION, not buffer size:
VideoStream(track, maxsize=(1280, 720))  # Max width=1280, height=720
```

## The Actual Problem & Solution

### The Root Cause

The memory growth happens because we **process frames slower than they arrive**:

```
Frames arrive:  30 fps (every 33ms)
Our processing: 50-100ms per frame

Result: Frames queue up in VideoStream's async iterator
```

### The Solution: Process Fast Enough

There's no "queue size limit" parameter in VideoStream. Instead, we need to:

1. **Process frames fast enough** (< 33ms per frame at 30fps)
2. **Drop frames when we can't keep up** (our semaphore does this)
3. **Optimize encoding speed** (ultrafast preset)

## What Actually Controls Memory

### VideoStream Iteration Speed

```python
async for event in rtc.VideoStream(self.video_track):
    # If this loop is SLOW (>33ms per iteration)
    # → Frames queue up in VideoStream
    # → Memory grows
    
    # If this loop is FAST (<33ms per iteration)  
    # → No queueing
    # → Memory stable
```

### Our Current Protections

#### 1. Semaphore (Drop Frames)
```python
if self.processing_semaphore.locked():
    self.frames_dropped_backpressure += 1
    continue  # Drop frame, don't process
```
**Purpose**: When we fall behind, drop frames instead of processing all

#### 2. Ultrafast Encoder
```python
encoder_options = {
    'preset': 'ultrafast',  # Fastest encoding
    'tune': 'zerolatency',  # No buffering
}
```
**Purpose**: Encode as fast as possible

#### 3. Buffered Disk Writes
```python
if self.bytes_since_last_flush >= 4MB:
    self.output_file.flush()
```
**Purpose**: Don't block on I/O for every frame

## Why Memory Still Grows to 9GB

### Your Logs Show the Problem

```
[mint_id] ⚠️  Long gap between frames: 13.77s
[mint_id] ⚠️  Long gap between frames: 31.25s
```

**This tells us**:
- Our loop is taking 13-31 **seconds** per iteration
- Frames arrive every 33 **milliseconds**
- During 30 second gap: **900 frames queue up**
- **900 frames × 3MB = 2.7GB** just from one gap

### Why Are We So Slow?

Something is **blocking our async loop for 13-31 seconds**. Possible causes:

1. **Disk I/O blocking**
   - Writing to slow HDD
   - File system full/slow

2. **CPU bottleneck**
   - H.264 encoding too slow
   - Color conversion taking too long

3. **Memory pressure**
   - System swapping to disk
   - GC pauses

4. **Async await blocking**
   - Some `await` call blocking for seconds
   - Not yielding control back to event loop

## The Real Fix: Find the Blocking Operation

### Add Timing Instrumentation

```python
async for event in rtc.VideoStream(self.video_track):
    iteration_start = time.time()
    
    if self.processing_semaphore.locked():
        continue
    
    async with self.processing_semaphore:
        # Time each operation
        t1 = time.time()
        await self._on_video_frame(frame)
        t2 = time.time()
        
        logger.info(f"Frame processing took {(t2-t1)*1000:.1f}ms")
        
        if (t2 - t1) > 0.1:  # More than 100ms
            logger.warning(f"⚠️ SLOW FRAME: {(t2-t1)*1000:.1f}ms")
```

### Profile the Encoder

```python
async def _on_video_frame(self, frame):
    t0 = time.time()
    
    # Normalize frame
    t1 = time.time()
    av_frame = self._normalize_video_frame(frame)
    t2 = time.time()
    logger.debug(f"Normalize: {(t2-t1)*1000:.1f}ms")
    
    # Calculate PTS
    t3 = time.time()
    pts, dts = self._calculate_video_pts_dts(frame, av_frame)
    t4 = time.time()
    logger.debug(f"PTS calc: {(t4-t3)*1000:.1f}ms")
    
    # Encode
    t5 = time.time()
    packets = self.video_stream.encode(av_frame)
    t6 = time.time()
    logger.debug(f"Encode: {(t6-t5)*1000:.1f}ms")
    
    # Write packets
    t7 = time.time()
    for packet in packets:
        self._write_packet_direct(packet)
    t8 = time.time()
    logger.debug(f"Write: {(t8-t7)*1000:.1f}ms")
    
    total = (t8 - t0) * 1000
    if total > 100:
        logger.warning(f"⚠️ SLOW FRAME: {total:.1f}ms total")
```

## Possible Solutions Based on Bottleneck

### If Encoding is Slow (>50ms)

#### Option 1: Use Hardware Encoding
```python
encoder_options = {
    'preset': 'p4',  # NVENC preset (GPU)
    'tune': 'ull',   # Ultra-low latency
}
```

#### Option 2: Lower Resolution
```python
# Resize before encoding
if frame.width > 1280:
    frame = frame.resize(1280, 720)
```

#### Option 3: Lower Frame Rate
```python
# Only encode every other frame (15fps instead of 30fps)
self.frame_counter += 1
if self.frame_counter % 2 == 0:
    continue  # Skip frame
```

### If Disk I/O is Slow

#### Option 1: Use SSD
- Move recordings to SSD instead of HDD

#### Option 2: Increase Flush Threshold
```python
self.flush_threshold = 8 * 1024 * 1024  # 8MB instead of 4MB
```

#### Option 3: Async File Writing
```python
# Write in background thread
await asyncio.to_thread(self._write_packet_direct, packet)
```

### If Memory Pressure

#### Option 1: Reduce Flush Threshold
```python
self.flush_threshold = 1 * 1024 * 1024  # 1MB (flush more often)
```

#### Option 2: Force GC More Often
```python
if self.frames_processed % 100 == 0:
    gc.collect()
```

## The Harsh Reality

**There's no magic buffer size limit in VideoStream**. The only way to prevent memory growth is:

1. **Process frames faster than they arrive** (<33ms at 30fps)
2. **Drop frames when we can't keep up** (our semaphore does this)
3. **Fix whatever is causing 13-31 second delays**

The 13-31 second gaps in your logs are **NOT NORMAL**. Something is seriously blocking the async loop.

## Diagnostic Steps

### Step 1: Add Timing Logs
Add the profiling code above to find the bottleneck

### Step 2: Check System Resources
```bash
# CPU usage
top -p $(pgrep -f python)

# Disk I/O
iostat -x 1

# Memory pressure
free -h
```

### Step 3: Check Disk Speed
```bash
# Test write speed
dd if=/dev/zero of=test.dat bs=1M count=1000
```

### Step 4: Check Async Loop
```python
# Log event loop lag
async def monitor_loop():
    while True:
        t1 = time.time()
        await asyncio.sleep(0.1)
        t2 = time.time()
        lag = (t2 - t1 - 0.1) * 1000
        if lag > 50:
            logger.warning(f"Event loop lag: {lag:.1f}ms")
```

## Summary

- ❌ `maxsize` doesn't limit queue - it's for resolution
- ❌ There's no queue size parameter for VideoStream
- ✅ We must process frames fast enough (<33ms)
- ✅ Our semaphore drops frames when we fall behind
- ⚠️ **13-31 second gaps are NOT NORMAL** - find the blocking operation

The memory growth will stop when we:
1. Find what's causing 13-31 second delays
2. Optimize that operation
3. Process frames in <33ms consistently

---

**Status**: ⚠️ ROOT CAUSE STILL UNKNOWN  
**Issue**: Something blocks async loop for 13-31 seconds  
**Next Step**: Add profiling to find the bottleneck  
**Apology**: Sorry for the confusion about maxsize!

