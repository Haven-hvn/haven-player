# Test Instructions: Find the Bottleneck

## ✅ Profiling Instrumentation Complete!

Comprehensive timing has been added to every step of frame processing.

## What to Do Now

### 1. Start Recording

```bash
# Terminal 1: Start backend
cd backend
uvicorn app.main:app --reload

# Terminal 2: Watch logs in real-time
tail -f backend.log | grep -E "(TELEMETRY|PERFORMANCE|SLOW|CRITICAL)"
```

### 2. Start a Recording

Use your frontend to start recording a stream.

### 3. Watch the Logs

Look for these key indicators:

#### ✅ Normal Performance (Good!)
```
[TELEMETRY] Frame 1: 1 packet(s), 15234 bytes, timing: normalize=8.2ms, encode=32.1ms, write=2.3ms, TOTAL=42.6ms
[TELEMETRY] Frame 2: 1 packet(s), 15156 bytes, timing: normalize=7.9ms, encode=31.5ms, write=2.1ms, TOTAL=41.5ms
📊 PERFORMANCE: Last frame took 41.5ms total
```

**This is perfect!** < 50ms per frame = no buffering

#### ⚠️ Slow but Acceptable
```
[TELEMETRY] Frame 1: timing: normalize=12ms, encode=45ms, write=5ms, TOTAL=62ms
⚠️ SLOW FRAME: 62.0ms
```

**Acceptable** but watch for memory growth

#### ❌ Problem: Encoding Too Slow
```
⚠️ SLOW ENCODE: 125.3ms
❌ CRITICAL PERFORMANCE: Frame took 135.8ms (should be <33ms for 30fps)
```

**This will cause buffering!** Solution: Hardware encoding or lower resolution

#### ❌ Problem: Disk Write Too Slow
```
⚠️ SLOW WRITE: 85.3ms
❌ CRITICAL PERFORMANCE: Frame took 102.1ms
```

**This will cause buffering!** Solution: Use SSD or async writes

#### ❌ Problem: Mystery Delay (THE BIG ONE!)
```
[TELEMETRY] Frame 1: timing: normalize=8ms, encode=32ms, write=2ms, TOTAL=42ms
📊 PERFORMANCE: Last frame took 42.ms total
⚠️  Long gap between frames: 18.7s  ← WHERE DID 18.7 SECONDS GO?!
```

**This is the 9GB problem!** The 18.7 seconds is NOT in our timing → Something external is blocking

### 4. Identify the Bottleneck

Based on the logs, you'll know:

| Log Pattern | Problem | Solution |
|-------------|---------|----------|
| `SLOW ENCODE: >100ms` | CPU encoding too slow | Hardware encoding (NVENC) or lower resolution |
| `SLOW WRITE: >50ms` | Disk I/O too slow | Use SSD, increase flush threshold, or async writes |
| `SLOW NORMALIZE: >50ms` | Frame conversion slow | Optimize numpy conversion |
| `SLOW CONTAINER SETUP: >1000ms` | Lazy init blocking | Pre-initialize or make async |
| `SLOW INIT CHECK: >100ms` | Init check slow | Optimize check logic |
| `SLOW PTS CALC: >10ms` | PTS calculation slow | Simplify calculation |
| **Mystery: Total fast but gaps large** | **External blocking** | Check GC, system swap, disk full |

### 5. Check for Mystery Delays

If all operations are fast (<50ms) but you still see "Long gap between frames: XXs", check:

#### System Resources
```bash
# CPU usage
top -p $(pgrep -f python)

# Disk I/O
iostat -x 1

# Memory/swap
vmstat 1

# Disk space
df -h
```

#### GC Pauses
```bash
# In Python, temporarily disable GC to test
# (Add to recording start)
import gc
gc.disable()
logger.info("GC disabled for testing")
```

#### VideoStream Waiting
The gap might be in the VideoStream iterator itself, waiting for frames from LiveKit.

## What the Logs Will Tell You

### Scenario 1: Encoding is the Problem
```
Frame 1: normalize=8ms, encode=125ms, write=3ms, TOTAL=136ms
Frame 2: normalize=8ms, encode=130ms, write=3ms, TOTAL=141ms
Frame 3: normalize=8ms, encode=128ms, write=3ms, TOTAL=139ms
```

**Solution**: Use GPU encoding
```python
encoder_options = {
    'preset': 'p4',  # NVENC
    'tune': 'ull',   # Ultra-low latency
}
```

### Scenario 2: Disk is the Problem
```
Frame 1: normalize=8ms, encode=32ms, write=85ms, TOTAL=125ms
Frame 2: normalize=8ms, encode=31ms, write=88ms, TOTAL=127ms
```

**Solution**: Async writes
```python
# Write in background thread
await asyncio.to_thread(self._write_packet_direct, packet)
```

### Scenario 3: Mystery Delay (The Real Problem)
```
Frame 1: normalize=8ms, encode=32ms, write=2ms, TOTAL=42ms
⚠️  Long gap between frames: 15.3s
Frame 2: normalize=8ms, encode=31ms, write=2ms, TOTAL=41ms
⚠️  Long gap between frames: 22.1s
```

**Analysis**:
- Frame processing is FAST (42ms)
- But gaps are HUGE (15-22 seconds)
- **15.3s - 0.042s = 15.258 seconds missing**
- The missing time is NOT in our code!

**Possible causes**:
1. VideoStream iterator waiting for frames
2. GC pauses
3. System swapping
4. Async event loop blocked
5. LiveKit connection issues

## Expected Memory Behavior

### If Bottleneck is Fixed
```
Time    Memory    Frames/sec
0s      150MB     30fps
30s     150MB     30fps  ← Stable!
60s     150MB     30fps
```

### If Bottleneck Remains
```
Time    Memory    Frames/sec
0s      150MB     30fps
30s     1.5GB     Processing slower
60s     3.0GB     Falling behind
90s     5.0GB     Buffering heavily
120s    9.0GB     OOM!
```

## Next Steps After Testing

1. **Run recording for 2-3 minutes**
2. **Capture all logs**
3. **Share the timing breakdowns**
4. **We'll identify the exact bottleneck**
5. **Apply the specific fix**

The instrumentation will tell us EXACTLY where the problem is!

---

**Status**: ✅ READY FOR TESTING  
**Instrumentation**: COMPLETE  
**Purpose**: Find the 13-31 second delay  
**Next**: Start recording and watch logs

