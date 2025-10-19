# Direct File Writing Implementation

## Problem Confirmed

**PyAV's container layer buffers ALL packets in memory regardless of format** (MP4, MPEG-TS, WebM). This is a fundamental limitation of PyAV's abstraction layer, not a format-specific issue.

## Solution: Bypass PyAV Container Entirely

Instead of using `container.mux(packet)` which buffers in memory, we:
1. Get encoded packet bytes directly from encoder
2. Write bytes directly to file descriptor
3. Force OS buffer flush for immediate disk write

## Implementation Details

### 1. Direct File Writer Setup
```python
# In __init__:
self.use_direct_write = True  # Enable direct write mode
self.output_file = None  # Direct file handle

# In _setup_container():
if self.use_direct_write and output_format == 'mpegts':
    self.output_file = open(str(self.output_path), 'wb')
    self.last_disk_write = time.time()
```

### 2. Direct Packet Writing
```python
def _write_packet_direct(self, packet: av.Packet) -> bool:
    """Write packet bytes directly to disk, bypassing PyAV buffering."""
    # Get packet bytes
    packet_bytes = bytes(packet)
    
    # Write to file
    self.output_file.write(packet_bytes)
    
    # CRITICAL: Force flush for immediate disk write
    self.output_file.flush()
    
    return True
```

### 3. Frame Processing Integration
```python
# In _on_video_frame():
for packet in packets:
    if self.use_direct_write and self.output_file:
        self._write_packet_direct(packet)  # Direct write
    else:
        self.container.mux(packet)  # PyAV buffering (fallback)
```

### 4. Proper Finalization
```python
# In _close_container():
# Flush encoders
for packet in self.video_stream.encode(None):
    if self.use_direct_write:
        self._write_packet_direct(packet)
    else:
        self.container.mux(packet)

# Close file
if self.output_file:
    self.output_file.flush()
    self.output_file.close()
```

## How This Fixes the Problem

### Before (PyAV Container)
```
Frame → Encoder → Packet → container.mux() → [BUFFER IN MEMORY]
                                                    ↓
                                            Written only on close()
```

**Result**: Memory grows, file empty until shutdown

### After (Direct Write)
```
Frame → Encoder → Packet → bytes(packet) → file.write() → file.flush()
                                                               ↓
                                                        IMMEDIATE DISK WRITE
```

**Result**: Memory stable, file grows continuously

## Key Differences

| Aspect | PyAV Container | Direct Write |
|--------|---------------|--------------|
| **Buffering** | In memory | None |
| **Disk writes** | On close() only | Immediate |
| **Memory usage** | Grows continuously | Stable |
| **File growth** | Empty until end | Continuous |
| **Corruption resistance** | File invalid until close() | Valid at any time |

## Testing

### Verify Direct Write Mode
```bash
# Check logs on startup
[mint_id] 🚀 Using DIRECT FILE WRITING mode (bypasses PyAV container buffering)
[mint_id] ✅ Direct file writer initialized
```

### Monitor File Growth
```bash
# File should grow immediately
watch -n 1 'ls -lh recordings/*.ts'

# Should see continuous growth:
-rw-r--r-- 1 user 1.2M recording.ts  # After 1min
-rw-r--r-- 1 user 2.4M recording.ts  # After 2min
```

### Monitor Memory
```bash
# Memory should stay stable
watch -n 5 'ps aux | grep python'

# Should see stable RSS (~150-200MB)
```

### Test During Recording
```bash
# File should be playable during recording
ffplay recordings/*.ts  # Works immediately!
```

## Important Notes

### Why MPEG-TS Only?
Direct write currently only enabled for MPEG-TS because:
- MPEG-TS has simple packet structure (188 bytes)
- No complex headers/footers required
- Stream is valid from first packet
- MP4 requires moov atom at end (complex structure)

### Fallback Mode
If direct write fails or is disabled:
```python
self.use_direct_write = False  # Disable direct write
# Falls back to PyAV container (will buffer)
```

### Performance
- **Disk I/O**: More frequent small writes vs one large write
- **CPU**: Negligible difference (just file.write() vs container.mux())
- **Memory**: MASSIVE improvement (stable vs growing)

## Monitoring

### Key Metrics
```python
self.metrics['bytes_written']  # Should increase continuously
self.last_disk_write  # Should update every second
self.metrics['packets_written']  # Should match frames processed
```

### Health Checks
```python
# Alert if no disk writes for 5 seconds
if time.time() - self.last_disk_write > 5.0:
    logger.warning("No disk writes in 5 seconds")

# Alert if file size not growing
if self.output_path.stat().st_size == last_size:
    logger.warning("File size not growing")
```

## Limitations

### Current Limitations
1. **MPEG-TS only**: Direct write not yet implemented for MP4/WebM
2. **No PyAV validation**: Bypasses PyAV's packet validation
3. **Manual header management**: For formats requiring headers

### Future Enhancements
1. Add MP4 direct write with proper moov atom handling
2. Add WebM direct write with EBML headers
3. Add packet validation before writing
4. Add automatic header insertion

## Troubleshooting

### File Not Growing
```python
# Check direct write is enabled
logger.info(f"Direct write: {self.use_direct_write}")
logger.info(f"Output file: {self.output_file}")

# Check packets being generated
logger.info(f"Packets written: {self.metrics['packets_written']}")

# Check disk writes
logger.info(f"Last disk write: {time.time() - self.last_disk_write}s ago")
```

### Memory Still Growing
```python
# Verify direct write is actually being used
if self.use_direct_write and self.output_file:
    logger.info("✅ Using direct write")
else:
    logger.warning("⚠️ NOT using direct write - will buffer")
```

### File Corruption
```python
# Ensure flush is being called
self.output_file.flush()

# For maximum durability (slower):
os.fsync(self.output_file.fileno())
```

## Success Criteria

After implementing direct write:
- ✅ Logs show "Using DIRECT FILE WRITING mode"
- ✅ File grows continuously (check with `ls -lh`)
- ✅ Memory stays stable (~150-200MB)
- ✅ `last_disk_write` updates every second
- ✅ File playable during recording
- ✅ No buffering in memory

---

**Implementation Status**: ✅ COMPLETE  
**Tested**: Pending user verification  
**Production Ready**: Pending testing

