# Task 04: Perceptual Hash (pHash) Implementation

## Assignee
Media Developer

## Priority
High

## Estimated Effort
2 days

## Description
Implement perceptual hashing for video content to enable content-based deduplication. pHash allows identifying duplicate or near-duplicate videos regardless of encoding differences, resolution changes, or minor edits.

## Current State
- `haven_cli/pipeline/steps/ingest_step.py`:
  - `_calculate_phash()` - Uses SHA256 of first 1MB as placeholder, not actual pHash
  - `_check_duplicate()` - Always returns False, not implemented

## Requirements

### 1. Video pHash Calculation
Implement perceptual hashing using frame extraction:

```python
async def calculate_video_phash(
    video_path: Path,
    frame_count: int = 8,
    hash_size: int = 8
) -> str:
    """
    Calculate perceptual hash for video content.
    
    Algorithm:
    1. Extract N frames evenly distributed across video duration
    2. Calculate pHash for each frame using DCT-based algorithm
    3. Combine frame hashes into a single video hash
    
    Args:
        video_path: Path to video file
        frame_count: Number of frames to sample (default 8)
        hash_size: Size of hash in bits per dimension (default 8 = 64-bit hash)
    
    Returns:
        Hexadecimal string representing the video pHash
    """
```

### 2. Frame pHash Calculation
Use DCT (Discrete Cosine Transform) based perceptual hashing:

```python
def calculate_frame_phash(
    image: PIL.Image,
    hash_size: int = 8
) -> int:
    """
    Calculate perceptual hash for a single frame.
    
    Uses DCT-based algorithm:
    1. Resize to 32x32 grayscale
    2. Apply DCT
    3. Take top-left 8x8 (low frequencies)
    4. Calculate median and generate hash bits
    """
```

### 3. Duplicate Detection
Implement hamming distance comparison:

```python
def hamming_distance(hash1: str, hash2: str) -> int:
    """Calculate hamming distance between two pHash strings."""

async def find_similar_videos(
    phash: str,
    threshold: int = 10,
    database: VideoRepository
) -> List[Video]:
    """
    Find videos with similar pHash in database.
    
    Args:
        phash: pHash to compare
        threshold: Maximum hamming distance for match
        database: Video repository
        
    Returns:
        List of similar videos
    """

async def is_duplicate(phash: str, database: VideoRepository) -> bool:
    """Check if video with similar pHash exists."""
```

### 4. Frame Extraction Utility
Extract frames at specific timestamps:

```python
async def extract_frames(
    video_path: Path,
    timestamps: List[float],
    output_format: str = "RGB"
) -> List[PIL.Image]:
    """
    Extract frames at specified timestamps using ffmpeg.
    
    Args:
        video_path: Path to video file
        timestamps: List of timestamps in seconds
        output_format: PIL image mode
        
    Returns:
        List of PIL Image objects
    """
```

## Files to Create/Modify

### Create
- `haven_cli/media/phash.py` - pHash calculation functions
- `haven_cli/media/frames.py` - Frame extraction utilities

### Modify
- `haven_cli/pipeline/steps/ingest_step.py` - Use new pHash functions
- `haven_cli/database/repositories.py` - Add pHash-based queries
- `pyproject.toml` - Add Pillow, imagehash dependencies

## Acceptance Criteria
- [ ] Can calculate pHash for video files
- [ ] Same video with different encoding produces similar pHash (hamming distance < 5)
- [ ] Different videos produce different pHash (hamming distance > 20)
- [ ] Can find duplicates in database based on pHash
- [ ] Frame extraction works for all common formats
- [ ] Performance: pHash calculation < 10 seconds for typical video
- [ ] Unit tests with sample videos

## Technical Notes
- Use `imagehash` library for DCT-based pHash (or implement from scratch)
- Use `Pillow` (PIL) for image processing
- Use `ffmpeg` for frame extraction
- Consider using `videohash` library as alternative
- Store pHash as hex string in database for easy comparison
- Index pHash column for efficient duplicate lookups

## Algorithm Reference
The DCT-based pHash algorithm:
1. Reduce image to 32x32 grayscale
2. Compute DCT (Discrete Cosine Transform)
3. Reduce DCT to 8x8 (keep low-frequency components)
4. Compute mean of DCT values (excluding [0,0])
5. Generate 64-bit hash: 1 if DCT value > mean, else 0

## Code Reuse from Electron App

### HIGH REUSE - Complete Implementation Available
The electron app has a **complete, production-tested pHash implementation** that can be directly ported:

#### Source Files to Reference:
1. **`backend/app/utils/phash/phash_calculator.py`** - Complete pHash implementation
   - Frame extraction using cv2
   - Sprite creation (5x5 grid of 25 frames)
   - DCT-based pHash using `imagehash` library
   - **Reuse Level: 85%** - Can port directly, consider FFmpeg alternative for frame extraction

#### Complete Implementation to Port:

```python
# From backend/app/utils/phash/phash_calculator.py - COMPLETE IMPLEMENTATION

from PIL import Image
import imagehash

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
        List of PIL Image objects representing extracted frames.
    """
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
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ret, frame = cap.read()
        if not ret:
            continue
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame).resize((SPRITE_WIDTH, SPRITE_WIDTH))
        frames.append(image)
    cap.release()
    return frames

def create_sprite(frames: list[Image.Image]) -> Image.Image:
    """Create a sprite image from a list of frames."""
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
    
    Returns:
        Hex string representation of the hash, or None if calculation fails.
    """
    frames = extract_frames(video_path)
    if not frames:
        return None
    sprite = create_sprite(frames)
    phash = imagehash.phash(sprite)
    return str(phash)
```

### Implementation Strategy
1. **Copy** `backend/app/utils/phash/phash_calculator.py` → `haven_cli/media/phash.py`
2. **Option A**: Keep cv2 dependency (simpler, matches electron app)
3. **Option B**: Replace cv2 frame extraction with FFmpeg (broader compatibility)
4. **Add** hamming distance comparison (new code, simple)
5. **Add** database duplicate checking (new code, uses repository)

### FFmpeg Alternative for Frame Extraction
If you prefer FFmpeg over cv2 for frame extraction:

```python
import subprocess
import tempfile
from pathlib import Path

async def extract_frames_ffmpeg(video_path: Path, timestamps: list[float]) -> list[Image.Image]:
    """Extract frames using FFmpeg instead of cv2."""
    frames = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, ts in enumerate(timestamps):
            output = Path(tmpdir) / f"frame_{i:04d}.png"
            cmd = [
                'ffmpeg', '-ss', str(ts), '-i', str(video_path),
                '-vframes', '1', '-f', 'image2', str(output)
            ]
            subprocess.run(cmd, capture_output=True)
            if output.exists():
                frames.append(Image.open(output).copy())
    return frames
```

### What's NOT Reusable
- Nothing - the entire implementation is reusable

### What's NEW for CLI
- Hamming distance comparison function
- Database integration for duplicate checking
- Async wrappers (optional)

## Dependencies
- Task 01: Database setup (for duplicate checking)
- Task 03: Video metadata (for duration to calculate frame timestamps)
- FFmpeg must be installed

## Blocking
- Sprint 3: Ingest step deduplication
