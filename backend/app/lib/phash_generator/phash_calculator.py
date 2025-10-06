# import cv2  # loads the video
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
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Failed to open the video file: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    duration = frame_count / fps
    cap.release()
    return duration  # in seconds

def extract_frames(video_path):
    duration = get_video_duration(video_path)
    cap = cv2.VideoCapture(video_path)

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
