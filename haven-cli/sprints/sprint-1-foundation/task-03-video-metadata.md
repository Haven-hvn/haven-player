# Task 03: Video Metadata Extraction

## Assignee
Media Developer

## Priority
High

## Estimated Effort
2 days

## Description
Implement video metadata extraction including duration, codec information, resolution, and other technical properties. This is essential for the ingest pipeline step.

## Current State
- `haven_cli/pipeline/steps/ingest_step.py` has placeholders:
  - `_extract_duration()` - Returns 0.0, not implemented
  - `_detect_mime_type()` - Uses basic extension mapping, needs proper detection

## Requirements

### 1. Video Duration Extraction
Use `ffprobe` (from FFmpeg) to extract duration:

```python
async def extract_video_duration(video_path: Path) -> float:
    """
    Extract video duration in seconds using ffprobe.
    
    Args:
        video_path: Path to video file
        
    Returns:
        Duration in seconds (float)
        
    Raises:
        VideoMetadataError: If extraction fails
    """
```

### 2. Complete Metadata Extraction
Extract additional metadata:

```python
@dataclass
class VideoTechnicalMetadata:
    duration: float          # seconds
    width: int               # pixels
    height: int              # pixels
    fps: float               # frames per second
    codec: str               # e.g., "h264", "vp9"
    bitrate: int             # bits per second
    audio_codec: str         # e.g., "aac", "opus"
    audio_channels: int      # e.g., 2 for stereo
    container: str           # e.g., "mp4", "mkv"

async def extract_video_metadata(video_path: Path) -> VideoTechnicalMetadata:
    """Extract comprehensive video metadata."""
```

### 3. MIME Type Detection
Replace extension-based detection with proper detection:

```python
def detect_mime_type(video_path: Path) -> str:
    """
    Detect MIME type using python-magic or file signatures.
    
    Falls back to extension-based detection if magic unavailable.
    """
```

### 4. Thumbnail Generation (Optional)
Generate a thumbnail for preview:

```python
async def generate_thumbnail(
    video_path: Path,
    output_path: Path,
    timestamp: float = 0.0,
    size: tuple[int, int] = (320, 180)
) -> Path:
    """Generate a thumbnail image from video."""
```

## Files to Create/Modify

### Create
- `haven_cli/media/__init__.py`
- `haven_cli/media/metadata.py` - Metadata extraction functions
- `haven_cli/media/thumbnail.py` - Thumbnail generation (optional)
- `haven_cli/media/exceptions.py` - Custom exceptions

### Modify
- `haven_cli/pipeline/steps/ingest_step.py` - Use new metadata functions
- `haven_cli/pipeline/context.py` - Extend VideoMetadata dataclass
- `pyproject.toml` - Add python-magic dependency (optional)

## Acceptance Criteria
- [ ] Can extract duration from MP4, MKV, WebM, AVI files
- [ ] Can extract video resolution and codec
- [ ] Can extract audio codec information
- [ ] Proper MIME type detection (not just extension-based)
- [ ] Graceful handling of corrupted/invalid files
- [ ] FFprobe errors properly reported
- [ ] Unit tests with sample video files

## Technical Notes
- FFmpeg/ffprobe must be available on PATH
- Consider adding `ffmpeg-python` wrapper or use subprocess directly
- Cache ffprobe results to avoid re-extraction
- Handle videos without audio tracks

## Code Reuse from Electron App

### MEDIUM REUSE - Partial Port Available
The electron app has video utilities using OpenCV (cv2) instead of FFmpeg. The CLI should use FFmpeg for broader compatibility, but the patterns are reusable.

#### Source Files to Reference:
1. **`backend/app/utils/video/video_utils.py`** - Duration extraction
   - Uses OpenCV (`cv2.VideoCapture`) for duration calculation
   - Graceful error handling with fallbacks
   - **Reuse Level: 40%** - Logic patterns reusable, but CLI should use FFmpeg instead of cv2

2. **`backend/app/utils/video/video_file_validator.py`** - Video validation
   - Validates video files have actual video content
   - Uses cv2 to check for valid frames
   - **Reuse Level: 30%** - Validation concept reusable, implementation differs

#### Key Code Patterns to Adapt:

```python
# From backend/app/utils/video/video_utils.py - Error handling pattern
def get_video_duration(video_path: str) -> float:
    """
    Get video duration in seconds.
    Uses cv2 if available, otherwise returns 0.
    """
    try:
        # Check if file exists first
        if not os.path.exists(video_path):
            print(f"Warning: Video file does not exist: {video_path}")
            return 0
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Warning: Failed to open the video file: {video_path}")
            return 0
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        
        if fps <= 0 or frame_count <= 0:
            cap.release()
            return 0
        
        duration = frame_count / fps
        cap.release()
        return duration  # in seconds
    except Exception as e:
        print(f"Error getting video duration: {video_path} - {e}")
        return 0
```

### Recommended Implementation for CLI (FFmpeg-based)
Instead of cv2, use FFmpeg/ffprobe for better format support:

```python
import subprocess
import json

async def extract_video_metadata(video_path: Path) -> VideoTechnicalMetadata:
    """Extract metadata using ffprobe (more reliable than cv2)."""
    cmd = [
        'ffprobe', '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        str(video_path)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VideoMetadataError(f"ffprobe failed: {result.stderr}")
    
    data = json.loads(result.stdout)
    # Parse format and streams...
```

### What's NOT Reusable
- cv2-based implementation (CLI should use FFmpeg for broader compatibility)
- Thumbnail generation (electron app doesn't have this)

### What's NEW for CLI
- FFmpeg/ffprobe integration (new implementation needed)
- Thumbnail generation (new feature)
- Async subprocess handling

## Dependencies
- FFmpeg must be installed on the system

## Blocking
- Sprint 3: Ingest step needs complete metadata
