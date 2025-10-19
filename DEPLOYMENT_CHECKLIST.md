# Deployment Checklist: MPEG-TS Real-Time Recording Fix

## Files Changed

### Backend
1. ✅ **`backend/app/services/webrtc_recording_service.py`**
   - Line 1465: Fixed Fraction formatting TypeError
   - Line 1185: Removed invalid `flush_packets` from movflags
   - Line 1189-1195: Added MPEG-TS specific options
   - Line 1749: Changed default format to `mpegts`
   - Line 1900: Invalid format now defaults to `mpegts` (was `mp4`)

### Frontend
2. ✅ **`frontend/src/hooks/useRecording.ts`**
   - Line 73: Changed `output_format` from `'mp4'` to `'mpegts'`
   - Updated comment to explain MPEG-TS benefits

3. ✅ **`frontend/src/main.ts`**
   - Line 58: Added `'ts'` to video file extensions for file picker

## Changes Summary

### What Was Wrong
1. **Frontend explicitly requested MP4 format** in `useRecording.ts`
2. **MP4 muxer buffers packets in memory** until `container.close()`
3. **Invalid `flush_packets` movflag** caused container creation to fail
4. **File picker didn't support .ts files**

### What's Fixed Now
1. **Frontend requests MPEG-TS format** by default
2. **MPEG-TS writes packets immediately** to disk (no buffering)
3. **Valid movflags** for MP4 (if explicitly requested)
4. **File picker supports .ts files** for playback

## Deployment Steps

### 1. Stop Backend
```bash
# Ctrl+C in terminal running uvicorn
```

### 2. Pull/Apply Changes
```bash
cd /path/to/haven-player
git pull  # or apply the changes manually
```

### 3. Restart Backend
```bash
cd backend
uvicorn app.main:app --reload
```

### 4. Rebuild Frontend (if using Electron)
```bash
cd frontend
npm run build
```

### 5. Restart Electron App
```bash
npm start
```

## Verification

### Backend Verification
```bash
# 1. Check logs show MPEG-TS format
# Should see:
[mint_id] ✅ Using MPEG-TS format for real-time streaming with immediate disk writes

# NOT:
[mint_id] ⚠️  Using MP4 format - may buffer packets in memory
```

### Recording Verification
```bash
# 1. Start a recording from the UI

# 2. Check file extension
ls -lh recordings/
# Should show .ts files, not .mp4 files

# 3. Monitor file growth
watch -n 1 'ls -lh recordings/*.ts'
# File should grow continuously (~2MB/minute at default settings)

# 4. Monitor memory
watch -n 5 'ps aux | grep python | grep -v grep'
# Memory should stay stable at ~150-200MB, not grow continuously

# 5. Test playback during recording
ffplay recordings/*.ts
# Should play successfully even while recording is active
```

### Frontend Verification
```bash
# 1. Open file picker
# Should show .ts files in the file list

# 2. Select a recorded .ts file
# Should load and play successfully
```

## Expected Behavior After Fix

### Memory Usage
- **Before**: Grows from 100MB → 1GB+
- **After**: Stable at ~150-200MB ✅

### File Growth
- **Before**: 0 bytes until shutdown
- **After**: Continuous growth (~2MB/minute) ✅

### Disk Writes
- **Before**: Single massive write at shutdown
- **After**: Continuous small writes ✅

### Crash Resistance
- **Before**: File empty/corrupted on crash
- **After**: File valid up to crash point ✅

### Playback
- **Before**: Cannot play until recording finishes
- **After**: Can play during recording ✅

## Rollback Plan (If Needed)

If MPEG-TS causes any issues, you can rollback to MP4:

### Option 1: Frontend Override
```typescript
// In frontend/src/hooks/useRecording.ts line 73:
output_format: 'mp4',  // Rollback to MP4
```

### Option 2: Backend Default
```python
# In backend/app/services/webrtc_recording_service.py line 1749:
"format": "mp4",  # Rollback to MP4
```

### Option 3: Per-Request
```bash
# In API request
curl -X POST http://localhost:8000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{
    "mint_id": "your_mint_id",
    "output_format": "mp4",
    "video_quality": "medium"
  }'
```

## Known Tradeoffs

### MPEG-TS Advantages (Why We Use It)
- ✅ Writes immediately to disk
- ✅ No memory buffering
- ✅ Corruption resistant
- ✅ Valid at any point in time
- ✅ Designed for streaming

### MPEG-TS Disadvantages
- ⚠️ ~10% larger file size than MP4
- ⚠️ Slower seeking (not optimized for random access)
- ⚠️ Not native in iOS Safari (requires HLS or video.js)

### When to Use MP4 Instead
- Post-production editing (not real-time)
- Maximum compatibility needed (iOS Safari)
- File size is critical concern
- Recording duration < 5 minutes (memory not an issue)

## Monitoring Metrics

### Critical Metrics
```python
# Monitor these in production:
recording.memory_usage_mb < 500  # Alert if exceeded
recording.file_size_bytes > 0 within 10s  # Alert if 0
recording.zero_packet_streak == 0  # Alert if > 10
recording.packets_written > 0  # Alert if 0
```

### Dashboard Queries
```
# Memory stable
avg(recording_memory_usage_mb) over 5m < 300

# File growing
rate(recording_file_size_bytes[1m]) > 0

# No encoder stalls
max(recording_zero_packet_streak) == 0

# Packets being written
rate(recording_packets_written[1m]) > 10
```

## Support

### If Memory Still Growing
1. Check backend logs for format being used
2. Verify frontend is sending `mpegts` not `mp4`
3. Check for other memory leaks (unrelated to muxer)

### If File Not Growing
1. Check encoder is producing packets (`zero_packet_streak`)
2. Verify MPEG-TS options applied correctly
3. Check disk space available
4. Check file permissions

### If Playback Fails
1. Install VLC or ffplay for .ts playback
2. Use video.js in browser for .ts playback
3. Convert to MP4 after recording: `ffmpeg -i recording.ts -c copy recording.mp4`

## Documentation Updated
- ✅ `CRITICAL_ISSUE_ANALYSIS.md` - Technical analysis
- ✅ `URGENT_FIX_SUMMARY.md` - Quick reference
- ✅ `HOTFIX_NOTES.md` - Hotfix details
- ✅ `IMPLEMENTATION_SUMMARY.md` - Implementation guide
- ✅ `DEPLOYMENT_CHECKLIST.md` - This file

## Testing Checklist

Before deploying to production:

- [ ] Backend starts without errors
- [ ] Frontend builds without errors
- [ ] Can start a recording
- [ ] Logs show "Using MPEG-TS format"
- [ ] File extension is .ts (not .mp4)
- [ ] File grows continuously during recording
- [ ] Memory stays stable (~150-200MB)
- [ ] Can play .ts file during recording (with VLC/ffplay)
- [ ] Can select .ts files in file picker
- [ ] Recording stops cleanly (Ctrl+C)
- [ ] Final file is playable and complete
- [ ] No "flush_packets" errors in logs
- [ ] No "Fraction.__format__" errors in logs

## Success Criteria

After deployment, verify:
✅ Memory usage stable (not growing)
✅ File grows immediately (not empty)
✅ No packet buffering (immediate writes)
✅ Files valid at any point (corruption resistant)
✅ Backend logs show MPEG-TS format
✅ Frontend requests MPEG-TS format
✅ File picker shows .ts files

---

**Deployment Date**: _____________________
**Deployed By**: _____________________
**Verified By**: _____________________
**Status**: ⬜ Pending | ⬜ In Progress | ⬜ Complete | ⬜ Rolled Back

