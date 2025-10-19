# Hotfix: Invalid movflags Option and MP4 Usage

## Issues Fixed

### 1. Invalid `flush_packets` in movflags ✅
**Error**: `Undefined constant or missing '(' in 'flush_packets'`

**Cause**: I incorrectly added `+flush_packets` to the movflags option, which is not a valid movflag.

**Fix**:
```python
# BEFORE (invalid)
'movflags': '+frag_keyframe+empty_moov+default_base_moof+flush_packets'

# AFTER (valid)
'movflags': 'frag_keyframe+empty_moov+default_base_moof'
```

### 2. Invalid Format Defaulting to MP4 ✅
**Issue**: When invalid format provided, code defaulted to MP4 instead of MPEG-TS

**Fix**:
```python
# BEFORE
logger.warning(f"Invalid format '{output_format}', defaulting to 'mp4'")
output_format = "mp4"

# AFTER
logger.warning(f"Invalid format '{output_format}', defaulting to 'mpegts'")
output_format = "mpegts"  # Default to MPEG-TS for real-time recording
```

## Why You Got MP4 Instead of MPEG-TS

Looking at your logs:
```
[mint_id] ⚠️  Using MP4 format - may buffer packets in memory.
```

**Possible reasons**:
1. Frontend is sending an explicit `output_format: "mp4"` in the request
2. There's a cached config somewhere overriding the default
3. An invalid format was passed and got defaulted to MP4 (now fixed to MPEG-TS)

## To Force MPEG-TS

### Option 1: Frontend Request (Recommended)
Ensure your frontend sends:
```javascript
// POST /api/recording/start
{
  "mint_id": "your_mint_id",
  "output_format": "mpegts",  // Explicitly specify
  "video_quality": "medium"
}
```

### Option 2: Don't Specify Format
If you omit `output_format`, it will use the default (now `mpegts`):
```javascript
// POST /api/recording/start
{
  "mint_id": "your_mint_id",
  "video_quality": "medium"
}
```

### Option 3: Check Frontend Code
Look for where the recording start API is called:
```bash
# Search frontend code
grep -r "recording/start" frontend/src/
grep -r "output_format" frontend/src/
```

## Verification

After restart, you should see:
```
[mint_id] ✅ Using MPEG-TS format for real-time streaming with immediate disk writes
```

Instead of:
```
[mint_id] ⚠️  Using MP4 format - may buffer packets in memory
```

## Testing

```bash
# 1. Stop the server (Ctrl+C)

# 2. Restart
uvicorn app.main:app --reload

# 3. Start a recording and check the log
curl -X POST http://localhost:8000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{"mint_id": "test_mint_123"}'

# 4. You should see:
# ✅ Using MPEG-TS format for real-time streaming with immediate disk writes
# NOT
# ⚠️ Using MP4 format - may buffer packets in memory

# 5. Check file extension
ls -lh recordings/
# Should see .ts files, not .mp4 files
```

## Summary

✅ **Fixed**: Invalid `flush_packets` movflag  
✅ **Fixed**: Invalid format now defaults to MPEG-TS (was MP4)  
🔍 **Action Needed**: Check why frontend/request is using MP4 instead of default MPEG-TS

The errors you saw were because:
1. MP4 format was being used (for some reason)
2. My invalid movflags option crashed container creation
3. Every frame processing attempt failed with the same error

Now MP4 will work (if explicitly requested), but MPEG-TS is the default and strongly recommended.

