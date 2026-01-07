"""
Recurring job management API endpoints.

This module provides REST API endpoints for managing recurring plugin jobs
that run on a schedule (e.g., polling YouTube channels every hour).
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Global job scheduler instance (will be set in main.py)
job_scheduler = None


class RecurringJobCreate(BaseModel):
    """Request to create a new recurring job."""
    plugin_name: str
    job_name: str
    schedule: str  # Cron format: "minute hour day month weekday"
    method: str = "discover_sources"
    on_success: str = "log_only"  # "log_only", "archive_all", "archive_new"
    config: Dict[str, Any] = {}


class RecurringJobUpdate(BaseModel):
    """Request to update a recurring job."""
    enabled: Optional[bool] = None
    schedule: Optional[str] = None
    method: Optional[str] = None
    on_success: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


def get_job_scheduler():
    """Dependency to get job scheduler instance."""
    global job_scheduler
    if job_scheduler is None:
        raise HTTPException(status_code=500, detail="Job scheduler not initialized")
    return job_scheduler


@router.get("/jobs/recurring")
async def list_recurring_jobs(
    plugin_name: Optional[str] = None,
    scheduler = Depends(get_job_scheduler)
):
    """
    List all recurring jobs.
    
    Query Parameters:
        plugin_name: Optional filter by plugin name
    
    Returns:
        List of recurring jobs
    """
    try:
        jobs = await scheduler.get_jobs(plugin_name=plugin_name)
        return {"jobs": jobs, "count": len(jobs)}
    except Exception as e:
        logger.error(f"Error listing recurring jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/recurring/scheduler")
async def get_scheduler_status(scheduler = Depends(get_job_scheduler)):
    """
    Get scheduler status.
    
    Returns information about the scheduler including:
    - Whether it's running
    - Total number of scheduled jobs
    - Next run times for each job
    """
    try:
        status = await scheduler.get_job_status()
        return status
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/recurring")
async def create_recurring_job(
    job_data: RecurringJobCreate,
    scheduler = Depends(get_job_scheduler)
):
    """
    Create a new recurring job.
    
    Example:
        POST /api/jobs/recurring
        {
            "plugin_name": "YouTubePlugin",
            "job_name": "poll_channel",
            "schedule": "0 * * * *",  # Every hour
            "method": "discover_sources",
            "on_success": "archive_all",
            "config": {}
        }
    
    Schedule Format (Cron):
        minute hour day month weekday
        Examples:
        - "0 * * * *" - Every hour at minute 0
        - "*/30 * * * *" - Every 30 minutes
        - "0 0 * * *" - Every day at midnight
        - "0 12 * * 1" - Every Monday at noon
    """
    try:
        # Validate schedule format (5 parts)
        parts = job_data.schedule.split()
        if len(parts) != 5:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid schedule format: {job_data.schedule}. "
                      f"Expected 5 parts: minute hour day month weekday"
            )
        
        # Validate on_success value
        valid_actions = ["log_only", "archive_all", "archive_new"]
        if job_data.on_success not in valid_actions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid on_success value: {job_data.on_success}. "
                      f"Must be one of: {', '.join(valid_actions)}"
            )
        
        # Check if plugin is loaded
        from app.plugins.plugin_manager import PluginManager
        # Access through scheduler's plugin_manager reference
        plugin = scheduler.plugin_manager.get_plugin(job_data.plugin_name)
        if not plugin:
            raise HTTPException(
                status_code=400,
                detail=f"Plugin {job_data.plugin_name} is not loaded"
            )
        
        # Create job
        job = await scheduler.create_job(
            plugin_name=job_data.plugin_name,
            job_name=job_data.job_name,
            schedule=job_data.schedule,
            method=job_data.method,
            on_success=job_data.on_success,
            config=job_data.config
        )
        
        return {
            "message": f"Created recurring job: {job_data.job_name}",
            "job": job.to_dict()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating recurring job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/recurring/{job_id}")
async def get_recurring_job(
    job_id: int,
    scheduler = Depends(get_job_scheduler)
):
    """
    Get details of a specific recurring job.
    """
    try:
        jobs = await scheduler.get_jobs()
        job = next((j for j in jobs if j["id"] == job_id), None)
        
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return job
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting recurring job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/recurring/{job_id}")
async def delete_recurring_job(
    job_id: int,
    scheduler = Depends(get_job_scheduler)
):
    """
    Delete a recurring job.
    
    This will stop the job from running and remove it from the database.
    """
    try:
        success = await scheduler.delete_job(job_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return {"message": f"Deleted recurring job {job_id}"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting recurring job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/recurring/{job_id}/pause")
async def pause_recurring_job(
    job_id: int,
    scheduler = Depends(get_job_scheduler)
):
    """
    Pause a recurring job.
    
    The job will stop executing but remains in the database.
    Can be resumed later.
    """
    try:
        success = await scheduler.pause_job(job_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return {"message": f"Paused recurring job {job_id}"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing recurring job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/recurring/{job_id}/resume")
async def resume_recurring_job(
    job_id: int,
    scheduler = Depends(get_job_scheduler)
):
    """
    Resume a paused recurring job.
    
    The job will resume executing on its schedule.
    """
    try:
        success = await scheduler.resume_job(job_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return {"message": f"Resumed recurring job {job_id}"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming recurring job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/recurring/{job_id}/run")
async def run_job_now(
    job_id: int,
    scheduler = Depends(get_job_scheduler)
):
    """
    Manually trigger a job execution.
    
    This will run the job immediately, regardless of its schedule.
    The next scheduled run is not affected.
    """
    try:
        success = await scheduler.run_job_now(job_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return {"message": f"Triggered job {job_id} to run now"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))