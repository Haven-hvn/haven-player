"""
Thumbnail generation utility for video files using PyAV (av).
"""
import os
import logging
import time
from pathlib import Path
from typing import Optional

# Try importing av (PyAV) and PIL (Pillow)
try:
    import av
    import av.error
    AV_AVAILABLE = True
except ImportError:
    AV_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

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
            logger.debug(f"Waiting {delay}s before retry attempt {attempt + 1}/{max_retries}")
            time.sleep(delay)
        
        # Check if file exists
        try:
            exists = file_path_obj.exists()
        except Exception as e:
            logger.warning(f"Error checking if file exists: {file_path} - {e}")
            exists = False
        
        if not exists:
            if attempt < max_retries - 1:
                next_delay = initial_delay * (2 ** attempt)  # Delay for next retry
                logger.debug(f"File not found (attempt {attempt + 1}/{max_retries}), will retry in {next_delay}s: {file_path}")
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
            else:
                logger.debug(f"File ready on first attempt: {file_path}")
            return True
        except FileNotFoundError:
            # File was deleted between exists() check and open()
            if attempt < max_retries - 1:
                next_delay = initial_delay * (2 ** attempt)
                logger.debug(f"File disappeared (attempt {attempt + 1}/{max_retries}), will retry in {next_delay}s: {file_path}")
                continue
            else:
                logger.warning(f"File not found after {max_retries} attempts: {file_path}")
                return False
        except (PermissionError, IOError, OSError) as e:
            if attempt < max_retries - 1:
                next_delay = initial_delay * (2 ** attempt)
                logger.debug(f"File not ready (locked?), attempt {attempt + 1}/{max_retries}, will retry in {next_delay}s: {file_path} - {e}")
                continue
            else:
                logger.warning(f"File not accessible after {max_retries} attempts: {file_path} - {e}")
                return False
    
    return False


def generate_video_thumbnail(
    video_path: str,
    thumbnail_dir: Optional[str] = None,
    timestamp: Optional[float] = None,
    quality: int = 85
) -> Optional[str]:
    """
    Generate a thumbnail image from a video file using PyAV.
    
    Args:
        video_path: Path to the video file
        thumbnail_dir: Directory to save thumbnails (default: 'thumbnails' in same dir as video)
        timestamp: Time in seconds to extract frame from (default: 1 second or 10% of duration)
        quality: JPEG quality (1-100, default: 85)
    
    Returns:
        Path to the generated thumbnail file, or None if generation failed
    """
    if not AV_AVAILABLE:
        logger.error("❌ PyAV (av) not installed. Cannot generate thumbnail.")
        return None
        
    if not PIL_AVAILABLE:
        logger.error("❌ Pillow (PIL) not installed. Cannot save thumbnail image.")
        return None

    try:
        # Normalize path for cross-platform compatibility
        logger.debug(f"Generating thumbnail for: {video_path}")
        video_path_obj = Path(video_path)
        
        # Resolve path - this doesn't require the file to exist
        try:
            video_path = str(video_path_obj.resolve())
            logger.debug(f"Resolved path: {video_path}")
        except Exception as e:
            logger.warning(f"Could not resolve path {video_path}: {e}, using as-is")
            video_path = str(video_path_obj)
        
        # Wait for file to be ready (exists and not locked)
        logger.debug(f"Waiting for file to be ready: {video_path}")
        if not _wait_for_file_ready(video_path, max_retries=5, initial_delay=0.5):
            logger.warning(f"Video file not ready after retries: {video_path}")
            return None
        logger.debug(f"File is ready: {video_path}")
        
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
        
        # Open container
        with av.open(video_path) as container:
            if not container.streams.video:
                logger.warning(f"No video stream found in {video_path}")
                return None
            
            stream = container.streams.video[0]
            stream.thread_type = 'AUTO'  # Enable multithreading
            
            # Determine timestamp if not provided
            if timestamp is None:
                # Use 10% of duration or 1 second, whichever is smaller
                if stream.duration:
                    duration_sec = float(stream.duration * stream.time_base)
                    timestamp = min(duration_sec * 0.1, 1.0)
                else:
                    timestamp = 1.0
            
            # Seek to timestamp
            # Convert seconds to time_base units
            target_pts = int(timestamp / stream.time_base)
            container.seek(target_pts, stream=stream)
            
            # Decode frames
            for frame in container.decode(stream):
                # We only need one frame
                img = frame.to_image()
                
                # Convert to RGB if necessary (Pillow requires RGB for JPEG)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Save image
                img.save(thumbnail_path, quality=quality)
                logger.info(f"✅ Generated thumbnail: {thumbnail_path}")
                return thumbnail_path
                
            logger.warning(f"Could not extract any frames from {video_path}")
            return None
            
    except av.error.InvalidDataError:
        logger.warning(f"Invalid data in video file {video_path}")
        return None
    except FileNotFoundError:
        logger.warning(f"File not found during thumbnail generation: {video_path}")
        return None
    except Exception as e:
        logger.warning(f"⚠️ Error generating thumbnail for {video_path}: {e}")
        import traceback
        logger.debug(f"Thumbnail generation traceback: {traceback.format_exc()}")
        return None
