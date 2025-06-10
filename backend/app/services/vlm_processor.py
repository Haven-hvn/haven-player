import asyncio
import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.database import SessionLocal
from app.models.video import Video, Timestamp
from app.models.analysis_job import AnalysisJob
from app.services.vlm_config import create_engine_config
from vlm_engine import VLMEngine

logger = logging.getLogger(__name__)

async def process_video_async(job_id: int, video_path: str):
    """
    Process a video asynchronously using VLM engine.
    Updates job progress and saves results to database.
    """
    db = SessionLocal()
    try:
        # Get job and update status
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return
            
        job.status = 'processing'
        job.started_at = datetime.now(timezone.utc)
        db.commit()
        
        # Load configuration from database
        config = create_engine_config()
        
        # Initialize VLM engine
        engine = VLMEngine(config=config)
        await engine.initialize()
        
        # Simulate progress updates (naive approach)
        # Start progress tracking task
        progress_task = asyncio.create_task(update_progress_naive(job_id, db))
        
        try:
            # Process video
            logger.info(f"Starting VLM processing for video: {video_path}")
            results = await engine.process_video(
                video_path,
                frame_interval=2.0,
                return_timestamps=True,
                return_confidence=True,
                threshold=0.5
            )
            
            # Cancel progress task
            progress_task.cancel()
            
            # Save results to database
            save_results_to_db(video_path, results, db)
            
            # Update job status
            job.status = 'completed'
            job.progress = 100
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            
            # Update video has_ai_data flag
            video = db.query(Video).filter(Video.path == video_path).first()
            if video:
                video.has_ai_data = True
                db.commit()
            
            # Save results to .AI.json file for compatibility
            save_results_to_file(video_path, results)
            
            logger.info(f"Successfully completed VLM processing for video: {video_path}")
            
        except asyncio.CancelledError:
            # Progress task was cancelled
            pass
            
    except Exception as e:
        logger.error(f"Error processing video {video_path}: {str(e)}", exc_info=True)
        if job:
            job.status = 'failed'
            job.error = str(e)
            db.commit()
    finally:
        db.close()

async def update_progress_naive(job_id: int, db: Session):
    """
    Naive progress update - increments progress over time.
    """
    try:
        progress = 0
        while progress < 90:  # Leave last 10% for actual completion
            await asyncio.sleep(2)  # Update every 2 seconds
            progress += 5
            
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job and job.status == 'processing':
                job.progress = progress
                db.commit()
            else:
                break
    except asyncio.CancelledError:
        # Task was cancelled, this is expected
        pass
    except Exception as e:
        logger.error(f"Error updating progress for job {job_id}: {str(e)}")

def save_results_to_db(video_path: str, results: Dict[str, Any], db: Session):
    """
    Save VLM processing results to database.
    """
    try:
        # Clear existing timestamps for this video
        db.query(Timestamp).filter(Timestamp.video_path == video_path).delete()
        
        # Extract tags from results
        tags = results.get('tags', {})
        
        for tag_name, tag_data in tags.items():
            time_frames = tag_data.get('time_frames', [])
            
            for frame in time_frames:
                timestamp = Timestamp(
                    video_path=video_path,
                    tag_name=tag_name,
                    start_time=frame.get('start', 0.0),
                    end_time=frame.get('end'),
                    confidence=frame.get('confidence', 0.0)
                )
                db.add(timestamp)
        
        db.commit()
        logger.info(f"Saved {len(tags)} tags to database for video: {video_path}")
        
    except Exception as e:
        logger.error(f"Error saving results to database: {str(e)}")
        db.rollback()
        raise

def save_results_to_file(video_path: str, results: Dict[str, Any]):
    """
    Save results to .AI.json file for compatibility with existing system.
    """
    try:
        ai_file_path = f"{video_path}.AI.json"
        with open(ai_file_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        logger.info(f"Saved results to file: {ai_file_path}")
    except Exception as e:
        logger.error(f"Error saving results to file: {str(e)}")
