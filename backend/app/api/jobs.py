from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.video import Video
from app.models.analysis_job import AnalysisJob
from app.services.vlm_processor import process_video_with_progress
from pydantic import BaseModel, ConfigDict
from datetime import datetime
import asyncio

router = APIRouter()

class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    video_path: str
    status: str
    progress: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]

class JobCreateRequest(BaseModel):
    """Request parameters for video analysis job."""
    frame_interval: Optional[float] = None
    threshold: Optional[float] = None
    return_timestamps: Optional[bool] = None
    return_confidence: Optional[bool] = None

class JobCreateResponse(BaseModel):
    job_id: int
    status: str

@router.post("/videos/{video_path:path}/analyze", response_model=JobCreateResponse)
def start_analysis_job(
    video_path: str,
    job_params: Optional[JobCreateRequest] = None,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> dict:
    """Start a new analysis job for the specified video."""
    # Normalize path - add leading slash if missing (frontend strips it to avoid double slashes)
    normalized_path = video_path if video_path.startswith('/') else f'/{video_path}'
    
    # Check if video exists
    video = db.query(Video).filter(Video.path == normalized_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check if there's already an active job for this video
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.video_path == normalized_path,
        AnalysisJob.status.in_(['pending', 'processing'])
    ).first()
    
    if existing_job:
        raise HTTPException(
            status_code=400, 
            detail=f"Analysis already in progress for this video (job_id: {existing_job.id})"
        )
    
    # Create new job
    job = AnalysisJob(video_path=normalized_path)
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Extract processing parameters
    params = job_params.dict(exclude_none=True) if job_params else {}
    
    # Start async processing with parameters
    async def process_with_params():
        await process_video_with_progress(
            video_path=normalized_path,
            job_id=job.id,
            frame_interval=params.get('frame_interval'),
            threshold=params.get('threshold'),
            return_timestamps=params.get('return_timestamps'),
            return_confidence=params.get('return_confidence')
        )
    
    background_tasks.add_task(
        lambda: asyncio.run(process_with_params())
    )
    
    return {"job_id": job.id, "status": "started"}

@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)) -> AnalysisJob:
    """Get job details by ID."""
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/videos/{video_path:path}/jobs", response_model=List[JobResponse])
def get_video_jobs(
    video_path: str,
    db: Session = Depends(get_db)
) -> List[AnalysisJob]:
    """Get all jobs for a specific video."""
    # Normalize path - add leading slash if missing (frontend strips it to avoid double slashes)
    normalized_path = video_path if video_path.startswith('/') else f'/{video_path}'
    
    video = db.query(Video).filter(Video.path == normalized_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    jobs = db.query(AnalysisJob).filter(
        AnalysisJob.video_path == normalized_path
    ).order_by(AnalysisJob.created_at.desc()).all()
    
    return jobs

@router.get("/jobs/", response_model=List[JobResponse])
def get_all_jobs(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> List[AnalysisJob]:
    """Get all jobs, optionally filtered by status."""
    query = db.query(AnalysisJob)
    
    if status:
        query = query.filter(AnalysisJob.status == status)
    
    jobs = query.order_by(
        AnalysisJob.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    return jobs

@router.delete("/jobs/{job_id}")
def cancel_job(job_id: int, db: Session = Depends(get_db)) -> dict:
    """Cancel a pending or processing job."""
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status not in ['pending', 'processing']:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot cancel job with status: {job.status}"
        )
    
    job.status = 'failed'
    job.error = 'Job cancelled by user'
    db.commit()
    
    return {"message": "Job cancelled successfully"}
