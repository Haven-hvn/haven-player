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

# Import decord for specific error handling
try:
    from decord._ffi.base import DECORDError
    DECORD_AVAILABLE = True
except ImportError:
    DECORD_AVAILABLE = False
    # Create a dummy exception for type checking
    class DECORDError(Exception):
        pass

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
        
    Raises:
        DECORDError: If decord encounters a decode error (corrupt/incompatible video)
        Exception: For other processing errors
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

        try:
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
        except DECORDError as e:
            error_msg = (
                f"Decord decode error for video {video_path}: {str(e)}. "
                f"This indicates the video file is corrupted, has an incompatible format, "
                f"or contains streams decord cannot decode properly. "
                f"Error originates in decord C++ extension, not Python code."
            )
            logger.error(error_msg, exc_info=True)
            # Re-raise with more context
            raise DECORDError(error_msg) from e
            
        logger.info(f"Completed VLM processing for video: {video_path}")
        return results
        
    except Exception as e:
        error_msg = f"Error processing video {video_path}"

        # Provide specific context for known error types
        if isinstance(e, DECORDError):
            # Already logged with context above
            pass
        else:
            logger.error(f"{error_msg}: {str(e)}", exc_info=True)

        raise
    finally:
        db.close()


async def process_video_async(job_id: int, video_path: str):
    """
    Process a video asynchronously using VLM engine.
    Updates job progress and saves results to database.
    
    Args:
        job_id: AnalysisJob ID
        video_path: Path to the video file
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
            
    except DECORDError as e:
        logger.error(f"Decord decode error for video {video_path}: {str(e)}", exc_info=True)
        db = SessionLocal()
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if job:
                job.status = 'failed'
                job.error = (
                    f"Video decode error: {str(e)}\n\n"
                    f"This video format is incompatible with the VLM engine. "
                    f"The video may need to be transcoded to a standard format (e.g., H.264 in MP4 container)."
                )
                db.commit()
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
        
    Raises:
        DECORDError: If decord encounters a decode error
        Exception: For other processing errors
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
            
    except DECORDError as e:
        error_msg = f"Decord decode error for video {video_path}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        # Re-raise with helpful context
        raise DECORDError(
            f"{error_msg}\n\nThis video format is incompatible with the VLM engine. "
            f"The video may need to be transcoded to a standard format (e.g., H.264 in MP4 container)."
        ) from e
    except Exception as e:
        error_msg = f"Error processing video {video_path} in queue: {str(e)}"
        logger.error(error_msg, exc_info=True)
        # Re-raise to let the caller handle status update
        raise


def save_results_to_db(video_path: str, results: Dict[str, Any], db: Session):
    """
    Save VLM processing results to database.
    
    Handles the actual VLM engine results structure:
    - json_result.timespans.{category}.{tag_name}: Array of {start, confidence}
    - video_tag_info.tag_timespans.{category}.{tag_name}: Array of {start, end, totalConfidence}
    
    Priority: tag_timespans (has end times) > timespans (no end times)
    """
    try:
        # Clear existing timestamps for this video
        db.query(Timestamp).filter(Timestamp.video_path == video_path).delete()
        
        timestamp_count = 0
        
        # Track which tags we've processed from tag_timespans to avoid duplicates
        processed_tags_from_tag_timespans: Dict[str, set] = {}
        
        # First, extract tags from video_tag_info.tag_timespans (has start, end, confidence)
        video_tag_info = results.get('video_tag_info', {})
        tag_timespans = video_tag_info.get('tag_timespans', {})
        
        for category, category_tags in tag_timespans.items():
            if category not in processed_tags_from_tag_timespans:
                processed_tags_from_tag_timespans[category] = set()
            
            for tag_name, time_frames in category_tags.items():
                if not isinstance(time_frames, list):
                    continue
                
                processed_tags_from_tag_timespans[category].add(tag_name)
                    
                for frame in time_frames:
                    if not isinstance(frame, dict):
                        continue
                        
                    timestamp = Timestamp(
                        video_path=video_path,
                        tag_name=tag_name,
                        start_time=float(frame.get('start', 0.0)),
                        end_time=float(frame.get('end')) if frame.get('end') is not None else None,
                        confidence=float(frame.get('totalConfidence', frame.get('confidence', 0.0)))
                    )
                    db.add(timestamp)
                    timestamp_count += 1
        
        # Then, extract tags from json_result.timespans (has start, confidence, but no end)
        # Only add tags that weren't already added from tag_timespans
        json_result = results.get('json_result', {})
        timespans = json_result.get('timespans', {})
        
        for category, category_tags in timespans.items():
            for tag_name, time_frames in category_tags.items():
                if not isinstance(time_frames, list):
                    continue
                
                # Skip if we already processed this tag from tag_timespans
                if (category in processed_tags_from_tag_timespans and 
                    tag_name in processed_tags_from_tag_timespans[category]):
                    continue
                
                # Add all timestamps from timespans (these don't have end times)
                for frame in time_frames:
                    if not isinstance(frame, dict):
                        continue
                        
                    timestamp = Timestamp(
                        video_path=video_path,
                        tag_name=tag_name,
                        start_time=float(frame.get('start', 0.0)),
                        end_time=None,  # No end time in timespans structure
                        confidence=float(frame.get('confidence', 0.0))
                    )
                    db.add(timestamp)
                    timestamp_count += 1
        
        db.commit()
        logger.info(f"Saved {timestamp_count} timestamps to database for video: {video_path}")
        
    except Exception as e:
        logger.error(f"Error saving results to database: {str(e)}", exc_info=True)
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