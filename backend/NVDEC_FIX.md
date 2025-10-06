# NVDEC Error Fix

## Problem
You're getting this error:
```
terminate called after throwing an instance of 'NVDECException'
  what():  HandleVideoSequence : cuvidGetDecoderCaps(&decodecaps) returned error 100
```

This happens because PyAV/FFmpeg is trying to initialize the NVIDIA NVDEC hardware decoder, but it's encountering an error.

## Solution

### Option 1: Use the Startup Script (Recommended)
```bash
cd backend
./START_SERVER.sh
```

This script sets the necessary environment variables before starting the server.

### Option 2: Set Environment Variables Manually
```bash
cd backend
export CUDA_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES=""
export DISABLE_HWACCEL="1"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Option 3: System-wide Environment Variables (macOS/Linux)
Add to your `~/.zshrc` or `~/.bashrc`:
```bash
export CUDA_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES=""
export DISABLE_HWACCEL="1"
```

Then reload your shell:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### Option 4: Use a .env File (Not Recommended for This Issue)
The environment variables need to be set BEFORE Python starts, so a .env file loaded by the app won't work.

## Why This Happens

1. Your system has NVIDIA GPU drivers installed
2. FFmpeg was compiled with NVDEC support
3. When PyAV imports FFmpeg, FFmpeg tries to detect available decoders
4. The NVDEC decoder query fails (error 100) and crashes the process

## What We're Doing

The environment variables tell FFmpeg/CUDA to:
- `CUDA_VISIBLE_DEVICES=""` - Hide all CUDA devices
- `NVIDIA_VISIBLE_DEVICES=""` - Hide all NVIDIA devices  
- `DISABLE_HWACCEL="1"` - Disable hardware acceleration

This forces software-only decoding/encoding, which:
- ✅ Always works (no hardware dependencies)
- ✅ More compatible across systems
- ✅ No driver version issues
- ❌ Slightly slower (but fine for recording)

## Verify It Works

After starting the server with the environment variables set, you should see:
```
INFO:     127.0.0.1:56868 - "POST /api/recording/start HTTP/1.1" 200 OK
```

Instead of the NVDEC error and 500 status.

## Performance Impact

Using software encoding (without NVDEC):
- **H.264**: Minimal impact, still real-time
- **AV1**: Already slow (expected), no difference
- **SVT-AV1**: Fast enough for real-time recording

The recording happens in the background, so even "slow" encoding is fine.

## Alternative: Rebuild FFmpeg Without NVDEC

If you want to permanently fix this, rebuild FFmpeg without NVDEC support:
```bash
# Install FFmpeg without NVDEC
brew uninstall ffmpeg
brew install ffmpeg --without-cuda

# Reinstall PyAV
pip uninstall av
pip install av --no-binary av
```

But this is overkill - just use the startup script! 🚀

