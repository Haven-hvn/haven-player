import asyncio
import logging
import json
from datetime import datetime, timezone
from typing import Dict, Any, Callable, Optional
from sqlalchemy.orm import Session
from app.models.database import SessionLocal
from app.models.video import Video, Timestamp
from app.models.analysis_job import AnalysisJob
from app.models.upload_queue import UploadQueue
from app.services.vlm_config import create_engine_config, get_vlm_processing_params
from vlm_engine import VLMEngine

logger = logging.getLogger(__name__)


async def process_video_with_progress(
    video_path: str,
    job_id: Optional[int] = None,
    queue_id: Optional[int] = None,
    progress_callback: Optional[Callable[[int], None]] = None,
    frame_interval: Optional[float] = None,
    threshold: Optional[float] = None,
    return_timestamps: Optional[bool] = None,
    return_confidence: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Process a video using VLM engine with proper async handling and progress tracking.
    
    Args:
        video_path: Path to video file
        job_id: Optional AnalysisJob ID for progress tracking
        queue_id: Optional UploadQueue ID for progress tracking
        progress_callback: Optional callback for progress updates
        frame_interval: Seconds between frame samples
        threshold: Confidence threshold for tag detection
        return_timestamps: Include timestamp information
        return_confidence: Include confidence scores
        
    Returns:
        Dictionary containing VLM analysis results
    """
    db = SessionLocal()
    try:
        # Update status if job_id provided
        if job_id:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.status = 'processing'
                job.started_at = datetime.now(timezone.utc)
                db.commit()
        
        # Update status if queue_id provided
        if queue_id:
            queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()
            if queue_entry:
                queue_entry.vlm_analysis_status = 'processing'
                queue_entry.vlm_analysis_started_at = datetime.now(timezone.utc)
                db.commit()
        
        # Get processing parameters from database configuration
        processing_params = get_vlm_processing_params()
        
        # Use provided parameters or fall back to database defaults
        frame_interval_val = frame_interval if frame_interval is not None else processing_params["frame_interval"]
        threshold_val = threshold if threshold is not None else processing_params["threshold"]
        return_timestamps_val = return_timestamps if return_timestamps is not None else processing_params["return_timestamps"]
        return_confidence_val = return_confidence if return_confidence is not None else processing_params["return_confidence"]
        vr_video_val = processing_params["vr_video"]
        
        # Create progress callback wrapper
        async def wrapped_progress_callback(progress: int) -> None:
            """Wrap progress callback to update database"""
            if progress_callback:
                progress_callback(progress)
            
            # Update database progress if job_id provided
            if job_id:
                job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
                if job:
                    job.progress = progress
                    db.commit()
                    db.refresh(job)
        
        # Load configuration and initialize engine
        config = create_engine_config()
        engine = VLMEngine(config=config)
        await engine.initialize()
        
        # Process video directly with progress callback
        logger.info(f"Starting VLM processing for video: {video_path}")
        results = await engine.process_video(
            video_path,
            progress_callback=wrapped_progress_callback,
            frame_interval=frame_interval_val,
            threshold=threshold_val,
            return_timestamps=return_timestamps_val,
            return_confidence=return_confidence_val,
            vr_video=vr_video_val,
            existing_json_data=None,
            skipped_categories=None
        )
        
        logger.info(f"Completed VLM processing for video: {video_path}")
        return results
        
    except Exception as e:
        logger.error(f"Error processing video {video_path}: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


async def process_video_async(job_id: int, video_path: str):
    """
    Process a video asynchronously using VLM engine.
    Updates job progress and saves results to database.
    """
    try:
        # Process video with progress tracking using default parameters
        results = await process_video_with_progress(
            video_path=video_path,
            job_id=job_id,
            frame_interval=None,  # Use database defaults
            threshold=None,      # Use database defaults
            return_timestamps=None,  # Use database defaults
            return_confidence=None   # Use database defaults
        )
        
        # Save results to database
        db = SessionLocal()
        try:
            save_results_to_db(video_path, results, db)
            
            # Update job status
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
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
            
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error processing video {video_path}: {str(e)}", exc_info=True)
        db = SessionLocal()
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.status = 'failed'
                job.error = str(e)
                db.commit()
        finally:
            db.close()


async def process_video_for_queue(queue_id: int, video_path: str):
    """
    Process video as part of upload queue pipeline.
    Similar to process_video_async but updates UploadQueue instead of AnalysisJob.
    
    Args:
        queue_id: Upload queue entry ID
        video_path: Path to the video file
    """
    try:
        # Process video without job progress tracking using default parameters
        results = await process_video_with_progress(
            video_path=video_path,
            queue_id=queue_id,
            frame_interval=None,  # Use database defaults
            threshold=None,      # Use database defaults
            return_timestamps=None,  # Use database defaults
            return_confidence=None   # Use database defaults
        )
        
        db = SessionLocal()
        try:
            # Save results to database
            save_results_to_db(video_path, results, db)
            
            # Save results to .AI.json file for compatibility
            save_results_to_file(video_path, results)
            
            # Update video has_ai_data flag
            video = db.query(Video).filter(Video.path == video_path).first()
            if video:
                video.has_ai_data = True
                db.commit()
            
            logger.info(f"✅ Successfully completed VLM processing for queue video: {video_path}")
            
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error processing video {video_path} in queue: {str(e)}", exc_info=True)
        # Note: Error status is updated by the worker, not here
        raise


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