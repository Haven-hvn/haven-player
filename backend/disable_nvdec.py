"""
Disable NVDEC/CUDA for PyAV/FFmpeg.
Import this at the very beginning of your application before any other imports.
"""

import os

# Disable CUDA devices to prevent NVDEC initialization
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['NVIDIA_VISIBLE_DEVICES'] = ''
os.environ['DISABLE_HWACCEL'] = '1'

# Additional FFmpeg environment variables to force software decoding
os.environ['FFREPORT'] = 'level=0'  # Reduce FFmpeg logging

print("🔧 NVDEC/CUDA disabled for this process")

