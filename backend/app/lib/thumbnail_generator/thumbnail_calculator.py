"""
Thumbnail generation utility for video files using ffmpeg.
"""
import os
import subprocess
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def generate_video_thumbnail(
    video_path: str,
    thumbnail_dir: Optional[str] = None,
    timestamp: Optional[float] = None,
    quality: int = 2
) -> Optional[str]:
    """
    Generate a thumbnail image from a video file using ffmpeg.
    
    Args:
        video_path: Path to the video file
        thumbnail_dir: Directory to save thumbnails (default: 'thumbnails' in same dir as video)
        timestamp: Time in seconds to extract frame from (default: 1 second or 10% of duration)
        quality: JPEG quality (2 = high quality, 31 = low quality)
    
    Returns:
        Path to the generated thumbnail file, or None if generation failed
    """
    try:
        # Check if video file exists
        if not os.path.exists(video_path):
            logger.warning(f"Video file does not exist: {video_path}")
            return None
        
        # Determine thumbnail directory
        if thumbnail_dir is None:
            # Use 'thumbnails' directory in the same directory as the video
            video_dir = os.path.dirname(os.path.abspath(video_path))
            thumbnail_dir = os.path.join(video_dir, "thumbnails")
        else:
            thumbnail_dir = os.path.abspath(thumbnail_dir)
        
        # Create thumbnail directory if it doesn't exist
        os.makedirs(thumbnail_dir, exist_ok=True)
        
        # Generate thumbnail filename
        video_basename = os.path.basename(video_path)
        video_name_without_ext = os.path.splitext(video_basename)[0]
        thumbnail_path = os.path.join(thumbnail_dir, f"{video_name_without_ext}.jpg")
        
        # Determine timestamp for frame extraction
        if timestamp is None:
            # Try to get video duration to use 10% or 1 second, whichever is smaller
            try:
                from app.lib.phash_generator.phash_calculator import get_video_duration
                duration = get_video_duration(video_path)
                if duration > 0:
                    # Use 10% of duration or 1 second, whichever is smaller
                    timestamp = min(duration * 0.1, 1.0)
                else:
                    # Fallback to 1 second if duration can't be determined
                    timestamp = 1.0
            except Exception as e:
                logger.warning(f"Could not get video duration, using 1 second: {e}")
                timestamp = 1.0
        
        # Build ffmpeg command
        # -ss: seek to timestamp
        # -i: input file
        # -vframes 1: extract only 1 frame
        # -q:v 2: high quality JPEG (2 = best quality, 31 = worst)
        # -y: overwrite output file if it exists
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output file
            '-ss', str(timestamp),  # Seek to timestamp
            '-i', video_path,  # Input video
            '-vframes', '1',  # Extract only 1 frame
            '-q:v', str(quality),  # JPEG quality
            thumbnail_path  # Output thumbnail
        ]
        
        # Run ffmpeg command
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30  # 30 second timeout
        )
        
        # Check if thumbnail was created successfully
        if result.returncode == 0 and os.path.exists(thumbnail_path):
            logger.info(f"✅ Generated thumbnail: {thumbnail_path}")
            return thumbnail_path
        else:
            error_msg = result.stderr.decode('utf-8', errors='ignore')
            logger.warning(f"⚠️ Failed to generate thumbnail for {video_path}: {error_msg}")
            return None
            
    except subprocess.TimeoutExpired:
        logger.warning(f"⚠️ Thumbnail generation timed out for {video_path}")
        return None
    except Exception as e:
        logger.warning(f"⚠️ Error generating thumbnail for {video_path}: {e}")
        return None

