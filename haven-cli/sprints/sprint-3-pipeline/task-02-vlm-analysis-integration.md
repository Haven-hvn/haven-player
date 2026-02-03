# Task 02: VLM Analysis Integration

## Assignee
AI Developer

## Priority
High

## Estimated Effort
4 days

## Description
Implement Visual Language Model (VLM) integration for video analysis. This step extracts semantic timestamps, content tags, and confidence scores from video content.

## Current State
- `haven_cli/pipeline/steps/analyze_step.py` has placeholder implementations:
  - `_get_vlm_engine()` - Returns None
  - `_extract_timestamps()` - Returns empty list
  - `_extract_tags()` - Returns empty dict
  - `_save_timestamps()` - No-op

## Requirements

### 1. VLM Engine Integration
Support configurable VLM backends (GPT-4V, Gemini, local models):

```python
class VLMEngine(ABC):
    """Abstract base for VLM engines."""
    
    @abstractmethod
    async def analyze_frames(
        self,
        frames: List[PIL.Image],
        prompt: str,
    ) -> dict:
        """Analyze frames and return structured response."""
        pass

class OpenAIVLMEngine(VLMEngine):
    """GPT-4 Vision engine."""
    
    def __init__(self, api_key: str, model: str = "gpt-4-vision-preview"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
    
    async def analyze_frames(self, frames: List[PIL.Image], prompt: str) -> dict:
        # Convert frames to base64
        images = [self._encode_frame(f) for f in frames]
        
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        *[{"type": "image_url", "image_url": {"url": img}} for img in images]
                    ]
                }
            ],
            max_tokens=4096,
        )
        
        return self._parse_response(response)
```

### 2. Frame Sampling Strategy
Extract representative frames for analysis:

```python
async def _sample_frames(
    self,
    video_path: str,
    strategy: str = "uniform",
    count: int = 10,
) -> List[Tuple[float, PIL.Image]]:
    """Sample frames from video for analysis.
    
    Strategies:
    - uniform: Evenly distributed frames
    - scene_change: Frames at scene boundaries
    - keyframe: I-frames only
    
    Returns:
        List of (timestamp, frame) tuples
    """
    from haven_cli.media.frames import extract_frames
    
    duration = await self._get_duration(video_path)
    
    if strategy == "uniform":
        timestamps = [duration * i / (count - 1) for i in range(count)]
    elif strategy == "scene_change":
        timestamps = await self._detect_scene_changes(video_path, max_scenes=count)
    else:
        timestamps = await self._extract_keyframe_timestamps(video_path, max_frames=count)
    
    return await extract_frames(video_path, timestamps)
```

### 3. Timestamp Extraction
Generate semantic timestamps from VLM analysis:

```python
async def _extract_timestamps(
    self,
    video_path: str,
    engine: VLMEngine,
) -> List[Dict[str, Any]]:
    """Extract semantic timestamps from video.
    
    Returns:
        List of timestamps with format:
        {
            "tag_name": "action_scene",
            "start_time": 10.5,
            "end_time": 25.3,
            "confidence": 0.85,
            "description": "Car chase sequence"
        }
    """
    # Sample frames with timestamps
    frames_with_ts = await self._sample_frames(video_path, count=20)
    
    # Build analysis prompt
    prompt = self._build_timestamp_prompt(frames_with_ts)
    
    # Analyze with VLM
    result = await engine.analyze_frames([f for _, f in frames_with_ts], prompt)
    
    # Parse and validate timestamps
    timestamps = self._parse_timestamps(result, frames_with_ts)
    
    return timestamps
```

### 4. Content Tag Extraction
Extract semantic tags for the video:

```python
async def _extract_tags(
    self,
    video_path: str,
    engine: VLMEngine,
) -> Dict[str, float]:
    """Extract content tags from video.
    
    Returns:
        Dictionary mapping tag names to confidence scores:
        {
            "sports": 0.95,
            "outdoor": 0.88,
            "action": 0.75,
        }
    """
    # Sample fewer frames for overall classification
    frames_with_ts = await self._sample_frames(video_path, count=5)
    
    prompt = """Analyze these video frames and provide content tags.
    Return as JSON: {"tags": [{"name": "tag", "confidence": 0.0-1.0}]}
    
    Consider: genre, setting, mood, content type, subjects, activities.
    """
    
    result = await engine.analyze_frames([f for _, f in frames_with_ts], prompt)
    
    return {tag["name"]: tag["confidence"] for tag in result.get("tags", [])}
```

### 5. Save Timestamps to Database
Persist analysis results:

```python
async def _save_timestamps(
    self,
    video_path: str,
    timestamps: List[Dict[str, Any]],
) -> None:
    """Save timestamps to database."""
    from haven_cli.database.repositories import TimestampRepository, VideoRepository
    
    video_repo = VideoRepository()
    timestamp_repo = TimestampRepository()
    
    # Get video ID
    video = await video_repo.get_by_path(video_path)
    if not video:
        raise ValueError(f"Video not found: {video_path}")
    
    # Bulk insert timestamps
    await timestamp_repo.create_bulk(video.id, timestamps)
    
    # Update video has_ai_data flag
    await video_repo.update(video.id, has_ai_data=True)
```

### 6. VLM Engine Factory
Create engines based on configuration:

```python
def create_vlm_engine(config: PipelineConfig) -> VLMEngine:
    """Create VLM engine based on configuration."""
    model = config.vlm_model
    
    if "gpt" in model.lower():
        return OpenAIVLMEngine(
            api_key=config.vlm_api_key,
            model=model,
        )
    elif "gemini" in model.lower():
        return GeminiVLMEngine(
            api_key=config.vlm_api_key,
            model=model,
        )
    elif "llava" in model.lower() or "local" in model.lower():
        return LocalVLMEngine(model_path=model)
    else:
        raise ValueError(f"Unknown VLM model: {model}")
```

## Files to Create/Modify

### Create
- `haven_cli/vlm/__init__.py`
- `haven_cli/vlm/engine.py` - VLM engine base and implementations
- `haven_cli/vlm/prompts.py` - Analysis prompts
- `haven_cli/vlm/parsing.py` - Response parsing utilities

### Modify
- `haven_cli/pipeline/steps/analyze_step.py` - Integrate VLM engines
- `pyproject.toml` - Add openai, google-generativeai dependencies

## Acceptance Criteria
- [ ] GPT-4V integration works
- [ ] Timestamps extracted with semantic labels
- [ ] Content tags generated with confidence scores
- [ ] Results saved to database
- [ ] Configurable VLM backend
- [ ] Handles API rate limits gracefully
- [ ] Fallback when VLM unavailable
- [ ] Unit tests with mocked VLM responses

## Technical Notes
- VLM API calls can be expensive - implement caching
- Consider batching frames to reduce API calls
- Implement timeout and retry logic
- Validate response format before parsing
- Support async API calls for performance

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app backend has a **complete VLM processing system** using the `vlm_engine` package:

#### Source Files to Reference:
1. **`backend/app/services/vlm_processor.py`** - Complete VLM processing service
   - Uses `vlm_engine` package (external library)
   - Progress tracking with callbacks
   - Database result saving
   - Error handling for decord decode errors
   - **Reuse Level: 85%** - Nearly direct port

2. **`backend/app/services/vlm_config.py`** - VLM configuration
   - Engine configuration from database
   - Processing parameters (frame_interval, threshold, etc.)
   - **Reuse Level: 80%** - Adapt for CLI config

#### Key Code to Port:

```python
# From backend/app/services/vlm_processor.py - Main processing function
from vlm_engine import VLMEngine

async def process_video_with_progress(
    video_path: str,
    job_id: Optional[int] = None,
    progress_callback: Optional[Callable[[int], None]] = None,
    frame_interval: Optional[float] = None,
    threshold: Optional[float] = None,
    return_timestamps: Optional[bool] = None,
    return_confidence: Optional[bool] = None
) -> Dict[str, Any]:
    """Process a video using VLM engine with progress tracking."""
    
    # Get processing parameters from database configuration
    processing_params = get_vlm_processing_params()
    
    # Use provided parameters or fall back to database defaults
    frame_interval_val = frame_interval or processing_params["frame_interval"]
    threshold_val = threshold or processing_params["threshold"]
    
    # Load configuration and initialize engine
    config = create_engine_config()
    engine = VLMEngine(config=config)
    await engine.initialize()
    
    # Process video with progress callback
    results = await engine.process_video(
        video_path,
        progress_callback=wrapped_progress_callback,
        frame_interval=frame_interval_val,
        threshold=threshold_val,
        return_timestamps=return_timestamps_val,
        return_confidence=return_confidence_val,
        vr_video=vr_video_val,
    )
    
    return results
```

```python
# From backend/app/services/vlm_processor.py - Save results to database
def save_results_to_db(video_path: str, results: Dict[str, Any], db: Session):
    """Save VLM processing results to database."""
    # Clear existing timestamps for this video
    db.query(Timestamp).filter(Timestamp.video_path == video_path).delete()
    
    # Extract tags from video_tag_info.tag_timespans (has start, end, confidence)
    video_tag_info = results.get('video_tag_info', {})
    tag_timespans = video_tag_info.get('tag_timespans', {})
    
    for category, category_tags in tag_timespans.items():
        for tag_name, time_frames in category_tags.items():
            for frame in time_frames:
                timestamp = Timestamp(
                    video_path=video_path,
                    tag_name=tag_name,
                    start_time=float(frame.get('start', 0.0)),
                    end_time=float(frame.get('end')) if frame.get('end') else None,
                    confidence=float(frame.get('totalConfidence', 0.0))
                )
                db.add(timestamp)
    
    db.commit()
```

```python
# From backend/app/services/vlm_processor.py - Save to .AI.json file
def save_results_to_file(video_path: str, results: Dict[str, Any]):
    """Save results to .AI.json file for compatibility."""
    ai_file_path = f"{video_path}.AI.json"
    with open(ai_file_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
```

### Implementation Strategy
1. **Use** `vlm_engine` package (same as electron app)
2. **Copy** `backend/app/services/vlm_processor.py` → `haven_cli/vlm/processor.py`
3. **Copy** `backend/app/services/vlm_config.py` → `haven_cli/vlm/config.py`
4. **Adapt** database access for CLI's repository pattern
5. **Keep** .AI.json file output for compatibility

### Key Insight: Use vlm_engine Package
The electron app uses an external `vlm_engine` package that handles:
- Frame extraction and sampling
- VLM API calls (supports multiple backends)
- Response parsing and timestamp generation
- Progress tracking

This significantly reduces implementation effort - just integrate the package.

### What's NOT Reusable
- FastAPI-specific job tracking
- Upload queue integration

### What's NEW for CLI
- CLI-specific configuration loading
- Integration with CLI pipeline context
- Progress reporting via CLI output

## Dependencies
- Sprint 1 Task 01: Database
- Sprint 1 Task 03: Video metadata (duration)
- Task 01: Ingest step (video ID)

## Blocking
- Task 05: Arkiv sync (sends analysis metadata)
