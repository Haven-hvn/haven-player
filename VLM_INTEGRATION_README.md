# VLM Engine Integration for Haven Player

This document describes the integration of the VLM (Vision-Language Model) engine into the Haven Player project for video analysis.

## Overview

The integration adds asynchronous video analysis capabilities using the `vlm-engine` package. The system processes videos in the background while keeping the UI responsive, with real-time progress tracking.

## Key Features

1. **Asynchronous Processing**: Long-running VLM analysis runs in background tasks
2. **Job Tracking**: Database-backed job management with status and progress tracking
3. **Progress Polling**: Frontend polls for job progress updates every second
4. **Database Safety**: Configuration is read once and passed to objects to avoid locking
5. **UI Integration**: Progress bars and status indicators in the video list

## Architecture

### Backend Components

#### 1. Database Schema (`backend/app/models/analysis_job.py`)
```python
class AnalysisJob:
    - id: Primary key
    - video_path: Foreign key to Video
    - status: pending/processing/completed/failed
    - progress: 0-100 percentage
    - created_at, started_at, completed_at: Timestamps
    - error: Error message if failed
```

#### 2. VLM Configuration (`backend/app/services/vlm_config.py`)
- Loads configuration from database (AppConfig table)
- Converts comma-separated tags to list format
- Merges with hardcoded pipeline configuration
- Creates VLM EngineConfig object

#### 3. Video Processor (`backend/app/services/vlm_processor.py`)
- Async function that runs VLM analysis
- Updates job progress naively (increments over time)
- Saves results to database and .AI.json file
- Handles errors and updates job status

#### 4. Job API Endpoints (`backend/app/api/jobs.py`)
- `POST /api/videos/{video_path}/analyze` - Start analysis job
- `GET /api/jobs/{job_id}` - Get job status and progress
- `GET /api/videos/{video_path}/jobs` - Get all jobs for a video
- `DELETE /api/jobs/{job_id}` - Cancel a job

### Frontend Components

#### 1. Job Progress Hook (`frontend/src/hooks/useJobProgress.ts`)
- Polls job status every second
- Returns progress percentage and status
- Automatically stops polling when job completes

#### 2. API Service Updates (`frontend/src/services/api.ts`)
- Added job-related API functions
- Type definitions for JobProgress and JobCreateResponse

#### 3. App Component Updates (`frontend/src/App.tsx`)
- Manages active jobs and progress state
- Starts job polling when analysis begins
- Updates UI when jobs complete or fail

#### 4. VideoAnalysisList Updates
- Displays progress bar during analysis
- Shows status icons (pending/processing/completed/failed)
- Progress bar shows actual percentage

## Configuration

The VLM engine uses configuration from the database:
- `analysis_tags`: Comma-separated list of tags to detect
- `llm_base_url`: Base URL for the VLM API endpoint
- `llm_model`: Model identifier (e.g., "HuggingFaceTB/SmolVLM-Instruct")
- `max_batch_size`: Maximum batch size for processing

## Usage

### Starting Analysis

1. User clicks the analyze button on a video
2. Frontend calls `POST /api/videos/{video_path}/analyze`
3. Backend creates job record and starts async processing
4. Frontend receives job ID and begins polling

### Progress Tracking

1. Frontend polls `GET /api/jobs/{job_id}` every second
2. Backend returns current progress percentage
3. UI updates progress bar in real-time
4. Polling stops when status is 'completed' or 'failed'

### Results

When analysis completes:
1. Results are saved to database (Timestamp records)
2. .AI.json file is created for compatibility
3. Video's `has_ai_data` flag is set to true
4. Frontend refreshes to show analysis results

## Testing

Run the test script to verify integration:

```bash
cd backend
python test_vlm_integration.py
```

This tests:
- Database connection and schema
- Configuration loading
- VLM engine initialization

## Error Handling

- Failed jobs show red X icon with retry option
- Error messages are stored in job record
- Frontend handles polling errors gracefully
- Backend logs detailed error information

## Performance Considerations

1. **Memory**: Video preprocessing loads entire video into RAM
2. **API Calls**: Frame interval affects number of VLM API calls
3. **Database**: Separate sessions avoid locking during long operations
4. **Progress**: Naive progress tracking (time-based, not actual)

## Future Improvements

1. Add actual progress callbacks from VLM engine
2. Implement job cancellation
3. Add batch processing for multiple videos
4. Store more detailed analysis metadata
5. Add progress estimation based on video duration
