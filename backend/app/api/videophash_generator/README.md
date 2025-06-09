# Video Perceptual Hash (pHash) Generator

This project extracts perceptual hashes (pHash) from video files by sampling frames, creating a sprite, and generating a hash using the imageHash library. It is useful for video similarity detection, deduplication, and content-based search.

## Features

- Extracts frames from videos, skipping intros/outros.
- Creates a sprite image from sampled frames.
- Calculates a perceptual hash (pHash) for the video.
- Designed for easy integration with FastAPI and SQLAlchemy backends.

## Requirements

- Python 3.8+
- [opencv-python](https://pypi.org/project/opencv-python/)
- [Pillow](https://pypi.org/project/Pillow/)
- [imagehash](https://pypi.org/project/ImageHash/)
- [numpy](https://pypi.org/project/numpy/)


## Usage

```python
from phash_calculator import calculate_phash

file_path = "path/to/your/video.mp4"
phash = calculate_phash(file_path)
print("Perceptual Hash:", phash)
```

## Integration

You can call `calculate_phash(video_path)` in your backend (e.g., FastAPI) when adding a new video, and store the result in your database.

## License

MIT License
