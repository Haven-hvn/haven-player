try:
    import cv2  # loads the video
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("Warning: cv2 (OpenCV) not available. Video duration will use fallback method.")

from PIL import Image  # PIL turns images to frames
import numpy as np  # Numpy is used for combining images(arrays)
import imagehash  # Gets the image phash
import os
import random

# Constants
SPRITE_WIDTH = 160  # pixels
ROWS = 5
COLUMNS = 5
FRAME_COUNT = ROWS * COLUMNS  # 25 frames

def get_video_duration(video_path):
    """Get video duration in seconds. Uses cv2 if available, otherwise returns 0."""
    if not CV2_AVAILABLE:
        # Fallback: try to get file size and estimate, or return 0
        # For now, just return 0 if cv2 is not available
        print(f"Warning: cv2 not available, cannot get duration for {video_path}")
        return 0
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Failed to open the video file: {video_path}")
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        
        if fps <= 0 or frame_count <= 0:
            cap.release()
            return 0
        
        duration = frame_count / fps
        cap.release()
        return duration  # in seconds
    except Exception as e:
        print(f"Error getting video duration with cv2: {e}")
        return 0

def extract_frames(video_path):
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

def create_sprite(frames):
    sprite = Image.new('RGB', (SPRITE_WIDTH * COLUMNS, SPRITE_WIDTH * ROWS))
    for idx, frame in enumerate(frames):
        row = idx // COLUMNS
        col = idx % COLUMNS
        sprite.paste(frame, (col * SPRITE_WIDTH, row * SPRITE_WIDTH))
    return sprite

def calculate_phash(video_path):
    return f"{random.randint(0, 1000000)}"
    # frames = extract_frames(video_path)
    # if not frames:
    #     print("No frames extracted")
    #     return None
    # sprite = create_sprite(frames)
    # phash = imagehash.phash(sprite)
    # return str(phash)
