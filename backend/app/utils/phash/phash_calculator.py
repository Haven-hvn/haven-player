try:
    import cv2  # loads the video
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("Warning: cv2 (OpenCV) not available. Perceptual hash will not be calculated.")

from PIL import Image  # PIL turns images to frames
import numpy as np  # Numpy is used for combining images(arrays)
import imagehash  # Gets the image phash
from app.utils.video import get_video_duration

# Constants
SPRITE_WIDTH = 160  # pixels
ROWS = 5
COLUMNS = 5
FRAME_COUNT = ROWS * COLUMNS  # 25 frames

def extract_frames(video_path: str) -> list[Image.Image]:
    """
    Extract frames from a video at regular intervals.

    Args:
        video_path: Path to the video file.

    Returns:
        List of PIL Image objects representing extracted frames, or empty list on failure.
    """
    if not CV2_AVAILABLE:
        return []
    
    try:
        duration = get_video_duration(video_path)
        if duration <= 0:
            return []
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []

        offset = 0.05 * duration  # skip first 5%
        step = (0.90 * duration) / FRAME_COUNT  # spread frames over 90% of video
        frames = []
        for i in range(FRAME_COUNT):
            timestamp = offset + i * step
            cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)  # milliseconds
            ret, frame = cap.read()
            if not ret:
                continue
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(frame).resize((SPRITE_WIDTH, SPRITE_WIDTH))
            frames.append(image)
        cap.release()
        return frames
    except Exception as e:
        print(f"Error extracting frames: {e}")
        return []

def create_sprite(frames: list[Image.Image]) -> Image.Image:
    """
    Create a sprite image from a list of frames.

    Args:
        frames: List of PIL Image objects.

    Returns:
        A new PIL Image representing the sprite.
    """
    sprite = Image.new('RGB', (SPRITE_WIDTH * COLUMNS, SPRITE_WIDTH * ROWS))
    for idx, frame in enumerate(frames):
        row = idx // COLUMNS
        col = idx % COLUMNS
        sprite.paste(frame, (col * SPRITE_WIDTH, row * SPRITE_WIDTH))
    return sprite

def calculate_phash(video_path: str) -> str | None:
    """
    Calculate perceptual hash for a video.

    This function extracts frames from the video, creates a sprite,
    and calculates a perceptual hash for duplicate detection.

    Args:
        video_path: Path to the video file.

    Returns:
        Hex string representation of the hash, or None if calculation fails.
    """
    if not CV2_AVAILABLE:
        print(f"Warning: cv2 not available, cannot calculate phash for {video_path}")
        return None
    
    try:
        frames = extract_frames(video_path)
        if not frames:
            print(f"No frames extracted from {video_path}")
            return None
        sprite = create_sprite(frames)
        phash = imagehash.phash(sprite)
        return str(phash)
    except Exception as e:
        print(f"Error calculating phash for {video_path}: {e}")
        return None
