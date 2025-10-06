#!/bin/bash

# Disable CUDA/NVDEC to prevent hardware decoder errors with PyAV
export CUDA_VISIBLE_DEVICES=""
export NVIDIA_VISIBLE_DEVICES=""
export DISABLE_HWACCEL="1"

echo "🔧 NVDEC/CUDA disabled for this session"
echo "🚀 Starting FastAPI server..."

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Start uvicorn
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

