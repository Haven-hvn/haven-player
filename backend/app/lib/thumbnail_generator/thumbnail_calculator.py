"""
Thumbnail generation utility for video files using ffmpeg.
"""
import os
import subprocess
import logging
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _wait_for_file_ready(file_path: str, max_retries: int = 5, initial_delay: float = 0.5) -> bool:
    """
    Wait for a file to be ready (exists, readable, and not locked).
    
    Args:
        file_path: Path to the file to check
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds before first retry
    
    Returns:
        True if file is ready, False otherwise
    """
    file_path_obj = Path(file_path)
    
    for attempt in range(max_retries):
        # Wait before checking (except first attempt)
        delay = 0.0
        if attempt > 0:
            delay = initial_delay * (2 ** (attempt - 1))  # Exponential backoff
            time.sleep(delay)
        
        # Check if file exists
        if not file_path_obj.exists():
            if attempt < max_retries - 1:
                next_delay = initial_delay * (2 ** attempt)  # Delay for next retry
                logger.debug(f"File not found, retrying in {next_delay}s: {file_path}")
                continue
            else:
                logger.warning(f"File does not exist after {max_retries} attempts: {file_path}")
                return False
        
        # Check if file is readable (not locked)
        try:
            with open(file_path, 'rb') as f:
                # Try to read a small chunk to verify file is accessible
                f.read(1)
            # File is ready
            if attempt > 0:
                logger.info(f"File ready after {attempt} retry attempts: {file_path}")
            return True
        except (PermissionError, IOError, OSError) as e:
            if attempt < max_retries - 1:
                logger.debug(f"File not ready (locked?), retrying: {file_path} - {e}")
                continue
            else:
                logger.warning(f"File not accessible after {max_retries} attempts: {file_path} - {e}")
                return False
    
    return False


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
        # Normalize path for cross-platform compatibility
        video_path_obj = Path(video_path)
        video_path = str(video_path_obj.resolve())
        
        # Wait for file to be ready (exists and not locked)
        # This handles cases where the file was just created/moved and may still be locked
        if not _wait_for_file_ready(video_path, max_retries=5, initial_delay=0.5):
            logger.warning(f"Video file not ready after retries: {video_path}")
            return None
        
        # Determine thumbnail directory
        if thumbnail_dir is None:
            # Use 'thumbnails' directory in the same directory as the video
            video_dir = video_path_obj.parent
            thumbnail_dir = str(video_dir / "thumbnails")
        else:
            thumbnail_dir = str(Path(thumbnail_dir).resolve())
        
        # Create thumbnail directory if it doesn't exist
        Path(thumbnail_dir).mkdir(parents=True, exist_ok=True)
        
        # Generate thumbnail filename
        video_name_without_ext = video_path_obj.stem
        thumbnail_path = str(Path(thumbnail_dir) / f"{video_name_without_ext}.jpg")
        
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

