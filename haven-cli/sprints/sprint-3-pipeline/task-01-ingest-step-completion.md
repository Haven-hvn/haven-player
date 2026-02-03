# Task 01: Complete Ingest Step

## Assignee
Backend Developer

## Priority
Critical

## Estimated Effort
2 days

## Description
Complete the ingest pipeline step by integrating the database, metadata extraction, and pHash calculation implementations from Sprint 1.

## Current State
- `haven_cli/pipeline/steps/ingest_step.py` has placeholder implementations:
  - `_calculate_phash()` - Uses SHA256 placeholder
  - `_extract_duration()` - Returns 0.0
  - `_check_duplicate()` - Always returns False
  - `_save_to_database()` - No-op

## Requirements

### 1. Integrate pHash Calculation
Replace placeholder with real implementation:

```python
async def _calculate_phash(self, path: Path) -> str:
    """Calculate perceptual hash for the video."""
    from haven_cli.media.phash import calculate_video_phash
    return await calculate_video_phash(path)
```

### 2. Integrate Metadata Extraction
Use real metadata extraction:

```python
async def _extract_duration(self, path: Path) -> float:
    """Extract video duration in seconds."""
    from haven_cli.media.metadata import extract_video_metadata
    metadata = await extract_video_metadata(path)
    return metadata.duration
```

### 3. Implement Duplicate Detection
Check database for existing pHash:

```python
async def _check_duplicate(self, phash: str) -> bool:
    """Check if a video with this pHash already exists."""
    from haven_cli.database.repositories import VideoRepository
    from haven_cli.media.phash import find_similar_videos
    
    repo = VideoRepository()
    similar = await find_similar_videos(phash, threshold=10, database=repo)
    return len(similar) > 0
```

### 4. Implement Database Persistence
Save video metadata to database:

```python
async def _save_to_database(self, metadata: VideoMetadata) -> int:
    """Save video metadata to database.
    
    Returns:
        Database ID of the created video record
    """
    from haven_cli.database.repositories import VideoRepository
    from haven_cli.database.models import Video
    
    repo = VideoRepository()
    video = await repo.create(Video(
        phash=metadata.phash,
        source_path=metadata.path,
        title=metadata.title,
        duration=metadata.duration,
        file_size=metadata.file_size,
        mime_type=metadata.mime_type,
        source_uri=metadata.source_uri,
        creator_handle=metadata.creator_handle,
    ))
    
    return video.id
```

### 5. Enhanced MIME Type Detection
Use python-magic for accurate detection:

```python
def _detect_mime_type(self, path: Path) -> str:
    """Detect MIME type from file content."""
    from haven_cli.media.metadata import detect_mime_type
    return detect_mime_type(path)
```

### 6. Store Video ID in Context
Ensure video ID is available for later steps:

```python
# In process() method
video_id = await self._save_to_database(video_metadata)
context.set_step_data(self.name, "video_id", video_id)
context.video_id = video_id  # Add to context
```

## Files to Modify

### Modify
- `haven_cli/pipeline/steps/ingest_step.py` - Replace all placeholders
- `haven_cli/pipeline/context.py` - Add video_id field

## Acceptance Criteria
- [ ] pHash calculated using real algorithm
- [ ] Duration extracted from video files
- [ ] MIME type detected from content
- [ ] Duplicates detected via pHash comparison
- [ ] Video metadata saved to database
- [ ] Video ID stored in context for later steps
- [ ] Handles corrupted files gracefully
- [ ] Unit tests pass

## Technical Notes
- Video ID is needed for later steps (timestamps, etc.)
- Duplicate detection should be configurable (skip vs error)
- Consider adding `--force` flag to override duplicate check

## Dependencies
- Sprint 1 Task 01: Database setup
- Sprint 1 Task 03: Video metadata extraction
- Sprint 1 Task 04: pHash implementation

## Blocking
- Task 02: VLM analysis (needs video ID)
- Task 04: Upload (needs video metadata)
