"""
Upload Queue API endpoints.

This module provides REST API endpoints for managing the FileCoin upload queue,
including adding, listing, and updating upload jobs.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, field_serializer
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video
from app.models.segment_metadata import SegmentMetadata
from app.utils.video.video_file_validator import is_video_content

logger = logging.getLogger(__name__)
router = APIRouter()


class UploadQueueCreate(BaseModel):
    """Request to add video to upload queue."""
    video_path: str
    priority: Optional[int] = 0
    source: str = 'plugin'


class UploadQueueUpdate(BaseModel):
    """Request to update upload queue status."""
    status: str
    filecoin_metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ArkivSyncUpdate(BaseModel):
    """Request to update Arkiv sync status."""
    arkiv_sync_status: str
    arkiv_sync_error: Optional[str] = None
    entity_key: Optional[str] = None


class VLMAnalysisUpdate(BaseModel):
    """Request to update VLM analysis status."""
    vlm_analysis_status: str
    vlm_analysis_error: Optional[str] = None


class VLMJsonUploadUpdate(BaseModel):
    """Request to update VLM JSON upload status."""
    vlm_json_upload_status: str
    vlm_json_upload_error: Optional[str] = None
    vlm_json_cid: Optional[str] = None


class SegmentMetadataResponse(BaseModel):
    """Segment ordering metadata for Arkiv sync."""
    segment_index: int
    start_timestamp: datetime
    end_timestamp: Optional[datetime] = None
    mint_id: str
    recording_session_id: Optional[str] = None

    @field_serializer('start_timestamp', 'end_timestamp')
    @classmethod
    def serialize_datetime(cls, dt: Optional[datetime]) -> Optional[str]:
        return dt.isoformat() if dt else None


class UploadQueueResponse(BaseModel):
    """Response model for upload queue entry."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    video_path: str
    status: str
    priority: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    attempts: int
    max_attempts: int
    error_message: Optional[str] = None
    source: str
    arkiv_sync_status: Optional[str] = None
    arkiv_sync_started_at: Optional[datetime] = None
    arkiv_sync_completed_at: Optional[datetime] = None
    arkiv_sync_error: Optional[str] = None
    vlm_analysis_status: Optional[str] = None
    vlm_analysis_started_at: Optional[datetime] = None
    vlm_analysis_completed_at: Optional[datetime] = None
    vlm_analysis_error: Optional[str] = None
    
    # NEW: VLM JSON upload status
    vlm_json_upload_status: Optional[str] = None
    vlm_json_upload_started_at: Optional[datetime] = None
    vlm_json_upload_completed_at: Optional[datetime] = None
    vlm_json_upload_error: Optional[str] = None
    segment_metadata: Optional[SegmentMetadataResponse] = None

    @field_serializer('created_at', 'started_at', 'completed_at', 'arkiv_sync_started_at', 'arkiv_sync_completed_at', 'vlm_analysis_started_at', 'vlm_analysis_completed_at', 'vlm_json_upload_started_at', 'vlm_json_upload_completed_at')
    @classmethod
    def serialize_datetime(cls, dt: Optional[datetime]) -> Optional[str]:
        """Convert datetime to ISO format string."""
        return dt.isoformat() if dt else None


@router.post("/upload-queue", response_model=UploadQueueResponse, status_code=201)
async def add_to_upload_queue(
    queue_data: UploadQueueCreate,
    db: Session = Depends(get_db)
):
    """
    Add a video to the upload queue.

    This endpoint is called after a plugin successfully downloads a video.
    The video will be automatically uploaded to FileCoin when the UploadWorker
    processes the queue.

    Args:
        queue_data: Upload queue creation request
        db: Database session

    Returns:
        Created upload queue entry

    Raises:
        HTTPException: If video already in queue or database error occurs
    """
    try:
        # Check if video already in queue
        existing = db.query(UploadQueue).filter(
            UploadQueue.video_path == queue_data.video_path
        ).first()

        if existing:
            # Get video to check VLM preference
            video = db.query(Video).filter(Video.path == queue_data.video_path).first()

            if existing.is_completed():
                # Already uploaded, no need to queue again
                return UploadQueueResponse.model_validate(existing)
            elif existing.is_processing():
                raise HTTPException(
                    status_code=409,
                    detail=f"Video {queue_data.video_path} already being uploaded"
                )
            else:
                # Update existing failed/pending entry
                existing.status = 'pending'
                existing.priority = queue_data.priority
                existing.error_message = None
                existing.attempts = 0
                # Update VLM status based on video preference
                enable_vlm = video.enable_vlm_analysis if video else False
                existing.vlm_analysis_status = 'pending' if enable_vlm else 'skipped'

                # Check if file actually contains video streams before enabling VLM
                if enable_vlm:
                    logger.debug(f"Checking if {queue_data.video_path} contains video streams (re-queue)")
                    if not is_video_content(queue_data.video_path):
                        logger.info(f"File {queue_data.video_path} does not contain video streams, skipping VLM analysis (re-queue)")
                        existing.vlm_analysis_status = 'skipped'
                        existing.vlm_analysis_error = 'File contains audio-only content (no video streams)'

                db.commit()
                db.refresh(existing)
                logger.info(f"Re-queued video: {queue_data.video_path}")
                return UploadQueueResponse.model_validate(existing)

        # Get video to check VLM preference
        video = db.query(Video).filter(Video.path == queue_data.video_path).first()
        enable_vlm = video.enable_vlm_analysis if video else False

        # Create new queue entry
        queue_entry = UploadQueue(
            video_path=queue_data.video_path,
            priority=queue_data.priority,
            source=queue_data.source,
            status='pending',
            vlm_analysis_status='pending' if enable_vlm else 'skipped'
        )

        db.add(queue_entry)
        db.commit()
        db.refresh(queue_entry)

        # Check if file actually contains video streams before enabling VLM
        # This is a defensive check to prevent processing audio-only files
        if enable_vlm:
            logger.debug(f"Checking if {queue_data.video_path} contains video streams")
            if not is_video_content(queue_data.video_path):
                logger.info(f"File {queue_data.video_path} does not contain video streams, skipping VLM analysis")
                queue_entry.vlm_analysis_status = 'skipped'
                queue_entry.vlm_analysis_error = 'File contains audio-only content (no video streams)'
                db.commit()
                db.refresh(queue_entry)

        logger.info(f"Added video to upload queue: {queue_data.video_path} (priority={queue_data.priority})")
        return UploadQueueResponse.model_validate(queue_entry)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding to upload queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue", response_model=List[UploadQueueResponse])
async def list_upload_queue(
    status: Optional[str] = Query(None, description="Filter by status"),
    source: Optional[str] = Query(None, description="Filter by source"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    db: Session = Depends(get_db)
):
    """
    List videos in the upload queue.

    Args:
        status: Optional filter by status (pending, processing, completed, failed)
        source: Optional filter by source (plugin, manual, depin)
        limit: Maximum number of results to return
        db: Database session

    Returns:
        List of upload queue entries
    """
    try:
        query = db.query(UploadQueue)

        if status:
            query = query.filter(UploadQueue.status == status)

        if source:
            query = query.filter(UploadQueue.source == source)

        # Order by priority (desc) then created_at (asc)
        query = query.order_by(
            UploadQueue.priority.desc(),
            UploadQueue.created_at.asc()
        )

        queue_entries = query.limit(limit).all()
        return [UploadQueueResponse.model_validate(entry) for entry in queue_entries]

    except Exception as e:
        logger.error(f"Error listing upload queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue/pop", response_model=Optional[UploadQueueResponse])
async def get_next_pending_upload(db: Session = Depends(get_db)):
    """
    Get the next pending video to upload.

    This endpoint is called by the UploadWorker to get the next job to process.
    Returns a pending entry and updates its status to 'processing' atomically.

    Returns:
        Next pending upload queue entry, or null if no pending uploads

    Raises:
        HTTPException: If database error occurs
    """
    try:
        # Find next pending upload
        queue_entry = db.query(UploadQueue).filter(
            UploadQueue.status == 'pending',
            UploadQueue.attempts < UploadQueue.max_attempts
        ).order_by(
            UploadQueue.priority.desc(),
            UploadQueue.created_at.asc()
        ).first()

        if not queue_entry:
            # No pending uploads
            return None

        # Update status to processing atomically
        from datetime import datetime, timezone
        queue_entry.status = 'processing'
        queue_entry.started_at = queue_entry.started_at or datetime.now(timezone.utc)
        queue_entry.attempts += 1
        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Popped video for upload: {queue_entry.video_path} (attempt {queue_entry.attempts})")
        return UploadQueueResponse.model_validate(queue_entry)

    except Exception as e:
        db.rollback()
        logger.error(f"Error getting next pending upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue/arkiv-sync/pop", response_model=Optional[UploadQueueResponse])
async def pop_arkiv_sync_job(db: Session = Depends(get_db)):
    """
    Get next video for Arkiv sync processing.

    This endpoint is called by the ArkivSyncWorker to get the next Arkiv sync job to process.
    Returns a pending entry and updates its status to 'syncing' atomically.

    Returns:
        Next pending Arkiv sync queue entry, or null if no pending Arkiv sync jobs

    Raises:
        HTTPException: If database error occurs
    """
    try:
        # Find next pending Arkiv sync job
        queue_entry = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'pending',
            UploadQueue.arkiv_sync_started_at.is_(None)
        ).order_by(
            UploadQueue.created_at.asc()
        ).first()

        if not queue_entry:
            # No pending Arkiv sync jobs
            return None

        # Update status to syncing atomically
        from datetime import datetime, timezone
        queue_entry.arkiv_sync_status = 'syncing'
        queue_entry.arkiv_sync_started_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Popped video for Arkiv sync: {queue_entry.video_path}")
        response = UploadQueueResponse.model_validate(queue_entry)
        video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
        if video:
            segment = db.query(SegmentMetadata).filter(SegmentMetadata.video_id == video.id).first()
            if segment:
                response = response.model_copy(update={
                    "segment_metadata": SegmentMetadataResponse(
                        segment_index=segment.segment_index,
                        start_timestamp=segment.start_timestamp,
                        end_timestamp=segment.end_timestamp,
                        mint_id=segment.mint_id,
                        recording_session_id=segment.recording_session_id
                    )
                })
        return response

    except Exception as e:
        db.rollback()
        logger.error(f"Error getting next pending Arkiv sync job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/upload-queue/{queue_id}/arkiv-sync", response_model=UploadQueueResponse)
async def update_arkiv_sync_status(
    queue_id: int,
    update_data: ArkivSyncUpdate,
    db: Session = Depends(get_db)
):
    """
    Update Arkiv sync status after sync attempt.

    Called by the ArkivSyncWorker to update the status of an Arkiv sync job.

    Args:
        queue_id: Upload queue entry ID
        update_data: Update request with arkiv_sync_status, optional error and entity_key
        db: Database session

    Returns:
        Updated upload queue entry

    Raises:
        HTTPException: If queue entry not found or database error occurs
    """
    try:
        queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

        if not queue_entry:
            raise HTTPException(status_code=404, detail=f"Upload queue entry {queue_id} not found")

        # Validate status
        valid_statuses = ['pending', 'syncing', 'completed', 'failed', 'skipped']
        if update_data.arkiv_sync_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid arkiv_sync_status: {update_data.arkiv_sync_status}. Must be one of: {', '.join(valid_statuses)}"
            )

        # Update status
        queue_entry.arkiv_sync_status = update_data.arkiv_sync_status

        # Update timestamps for terminal states
        if update_data.arkiv_sync_status in ['completed', 'failed', 'skipped']:
            from datetime import datetime, timezone
            queue_entry.arkiv_sync_completed_at = datetime.now(timezone.utc)

        # Update error message if provided
        if update_data.arkiv_sync_error:
            queue_entry.arkiv_sync_error = update_data.arkiv_sync_error

        # If completed successfully, update video's arkiv_entity_key and arkiv_data_completeness
        if update_data.arkiv_sync_status == 'completed' and update_data.entity_key:
            from app.models.video import Video, Timestamp
            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
            if video:
                video.arkiv_entity_key = update_data.entity_key

                # Determine what data was synced to Arkiv
                has_filecoin = bool(video.filecoin_root_cid)
                has_timestamps = db.query(Timestamp).filter(
                    Timestamp.video_path == queue_entry.video_path
                ).count() > 0

                # Update arkiv_data_completeness
                if has_filecoin and has_timestamps:
                    video.arkiv_data_completeness = "filecoin_and_vlm"
                elif has_filecoin:
                    video.arkiv_data_completeness = "filecoin_only"
                elif has_timestamps:
                    video.arkiv_data_completeness = "vlm_only"
                else:
                    video.arkiv_data_completeness = "none"

                logger.info(f"Updated Arkiv entity_key for video: {queue_entry.video_path} (completeness: {video.arkiv_data_completeness})")

        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Updated Arkiv sync status for entry {queue_id} to: {update_data.arkiv_sync_status}")
        return UploadQueueResponse.model_validate(queue_entry)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating Arkiv sync status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue/vlm/pop", response_model=Optional[UploadQueueResponse])
async def pop_vlm_analysis_job(db: Session = Depends(get_db)):
    """
    Get next video for VLM analysis processing.

    This endpoint is called by the VLMAnalysisWorker to get the next VLM analysis job to process.
    Returns a pending entry and updates its status to 'processing' atomically.

    Returns:
        Next pending VLM analysis queue entry, or null if no pending VLM jobs

    Raises:
        HTTPException: If database error occurs
    """
    try:
        # Find next pending VLM analysis job
        queue_entry = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'pending',
            UploadQueue.vlm_analysis_started_at.is_(None)
        ).order_by(
            UploadQueue.created_at.asc()
        ).first()

        if not queue_entry:
            # No pending VLM analysis jobs
            return None

        # Update status to processing atomically
        from datetime import datetime, timezone
        queue_entry.vlm_analysis_status = 'processing'
        queue_entry.vlm_analysis_started_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Popped video for VLM analysis: {queue_entry.video_path}")
        return UploadQueueResponse.model_validate(queue_entry)

    except Exception as e:
        db.rollback()
        logger.error(f"Error getting next pending VLM analysis job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue/vlm-json/pop", response_model=Optional[UploadQueueResponse])
async def pop_vlm_json_upload_job(db: Session = Depends(get_db)):
    """
    Get next VLM JSON file for IPFS upload.
    
    Returns pending entries for JSON upload and marks them as processing.
    Uses same priority ordering as video uploads.
    """
    try:
        queue_entry = db.query(UploadQueue).filter(
            UploadQueue.vlm_json_upload_status == 'pending',
            UploadQueue.vlm_json_upload_started_at.is_(None)
        ).order_by(
            UploadQueue.priority.desc(),
            UploadQueue.created_at.asc()
        ).first()

        if not queue_entry:
            return None

        queue_entry.vlm_json_upload_status = 'processing'
        queue_entry.vlm_json_upload_started_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Popped video for VLM JSON upload: {queue_entry.video_path}")
        return UploadQueueResponse.model_validate(queue_entry)

    except Exception as e:
        db.rollback()
        logger.error(f"Error getting next pending VLM JSON upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/upload-queue/{queue_id}/vlm-analysis", response_model=UploadQueueResponse)
async def update_vlm_analysis_status(
    queue_id: int,
    update_data: VLMAnalysisUpdate,
    db: Session = Depends(get_db)
):
    """
    Update VLM analysis status after analysis attempt.

    Called by the VLMAnalysisWorker to update the status of a VLM analysis job.

    Args:
        queue_id: Upload queue entry ID
        update_data: Update request with vlm_analysis_status, optional error
        db: Database session

    Returns:
        Updated upload queue entry

    Raises:
        HTTPException: If queue entry not found or database error occurs
    """
    try:
        queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

        if not queue_entry:
            raise HTTPException(status_code=404, detail=f"Upload queue entry {queue_id} not found")

        # Validate status
        valid_statuses = ['pending', 'processing', 'completed', 'failed', 'skipped']
        if update_data.vlm_analysis_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid vlm_analysis_status: {update_data.vlm_analysis_status}. Must be one of: {', '.join(valid_statuses)}"
            )

        # Update status
        queue_entry.vlm_analysis_status = update_data.vlm_analysis_status

        # Update timestamps for terminal states
        if update_data.vlm_analysis_status in ['completed', 'failed', 'skipped']:
            from datetime import datetime, timezone
            queue_entry.vlm_analysis_completed_at = datetime.now(timezone.utc)

        # Update error message if provided
        if update_data.vlm_analysis_error:
            queue_entry.vlm_analysis_error = update_data.vlm_analysis_error

        # If VLM analysis completed, check if Arkiv sync should be queued
        if update_data.vlm_analysis_status == 'completed':
            from app.models.video import Video, Timestamp
            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()

            if video and video.share_to_arkiv:
                # Case 1: Arkiv entity exists but only has FileCoin data (not VLM) - incremental update
                if (video.arkiv_entity_key and
                    video.arkiv_data_completeness in ["filecoin_only", "none"] and
                    not queue_entry.arkiv_sync_status):

                    # Check if we now have timestamps to update
                    has_timestamps = db.query(Timestamp).filter(
                        Timestamp.video_path == queue_entry.video_path
                    ).count() > 0

                    if has_timestamps:
                        # Queue Arkiv sync as UPDATE operation
                        queue_entry.arkiv_sync_status = 'pending'
                        logger.info(f"VLM completed, queuing Arkiv UPDATE to add timestamps for {queue_entry.video_path}")

                # Case 2: Arkiv entity doesn't exist yet (original logic)
                elif (not video.arkiv_entity_key and
                      (not queue_entry.arkiv_sync_status or queue_entry.arkiv_sync_status == 'skipped')):

                    # Check if we should queue Arkiv sync
                    has_filecoin = bool(video.filecoin_root_cid)
                    has_timestamps = db.query(Timestamp).filter(
                        Timestamp.video_path == queue_entry.video_path
                    ).count() > 0

                    if has_filecoin or has_timestamps:
                        # Queue Arkiv sync as next step
                        queue_entry.arkiv_sync_status = 'pending'
                        logger.info(f"Queued Arkiv sync for {queue_entry.video_path} after VLM analysis")

                # NEW: Queue VLM JSON upload (this is the new primary method)
                if queue_entry.vlm_json_upload_status not in ['processing', 'completed']:
                    queue_entry.vlm_json_upload_status = 'pending'
                    logger.info(f"VLM analysis completed, queuing JSON upload for {queue_entry.video_path}")

        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Updated VLM analysis status for entry {queue_id} to: {update_data.vlm_analysis_status}")
        return UploadQueueResponse.model_validate(queue_entry)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating VLM analysis status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/upload-queue/{queue_id}/vlm-json-upload", response_model=UploadQueueResponse)
async def update_vlm_json_upload_status(
    queue_id: int,
    update_data: VLMJsonUploadUpdate,
    db: Session = Depends(get_db)
):
    """
    Update VLM JSON upload status and handle Arkiv sync triggers.
    
    When JSON upload completes successfully:
    1. Stores vlm_json_cid in Video model
    2. Updates arkiv_data_completeness if this is the first VLM data
    3. Queues Arkiv sync/update if needed
    """
    try:
        queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()
        
        if not queue_entry:
            raise HTTPException(status_code=404, detail=f"Upload queue entry {queue_id} not found")

        # Validate status
        valid_statuses = ['pending', 'processing', 'completed', 'failed']
        if update_data.vlm_json_upload_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid vlm_json_upload_status: {update_data.vlm_json_upload_status}. Must be one of: {', '.join(valid_statuses)}"
            )

        # Update status
        queue_entry.vlm_json_upload_status = update_data.vlm_json_upload_status

        # Update timestamps for terminal states
        if update_data.vlm_json_upload_status in ['completed', 'failed']:
            from datetime import datetime, timezone
            queue_entry.vlm_json_upload_completed_at = datetime.now(timezone.utc)

        # Update error message if provided
        if update_data.vlm_json_upload_error:
            queue_entry.vlm_json_upload_error = update_data.vlm_json_upload_error

        # If completed successfully, store CID and handle Arkiv sync
        if (update_data.vlm_json_upload_status == 'completed' and 
            update_data.vlm_json_cid):
            from app.models.video import Video
            
            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
            if video:
                # Store JSON CID
                video.vlm_json_cid = update_data.vlm_json_cid
                video.vlm_json_uploaded_at = datetime.now(timezone.utc)
                
                logger.info(f"Stored VLM JSON CID for {video.path}: {update_data.vlm_json_cid}")
                
                # Update arkiv_data_completeness to reflect VLM data is now available
                if video.share_to_arkiv:
                    has_filecoin = bool(video.filecoin_root_cid)
                    has_vlm_json = bool(video.vlm_json_cid)
                    
                    if has_filecoin and has_vlm_json:
                        video.arkiv_data_completeness = "filecoin_and_vlm"
                    elif has_filecoin:
                        video.arkiv_data_completeness = "filecoin_only"
                    elif has_vlm_json:
                        # This is new - we have VLM data via JSON
                        video.arkiv_data_completeness = "vlm_only"
                    else:
                        video.arkiv_data_completeness = "none"
                    
                    logger.info(f"Updated arkiv_data_completeness for {video.path}: {video.arkiv_data_completeness}")
                    
                    # Queue Arkiv sync if needed
                    if video.arkiv_entity_key:
                        # Entity exists, queue UPDATE to add JSON CID
                        if not queue_entry.arkiv_sync_status:
                            queue_entry.arkiv_sync_status = 'pending'
                            logger.info(f"VLM JSON ready, queuing Arkiv UPDATE for {video.path}")
                    else:
                        # No entity exists yet, queue initial sync if we have either FileCoin or VLM
                        has_filecoin = bool(video.filecoin_root_cid)
                        if has_filecoin or has_vlm_json:
                            if not queue_entry.arkiv_sync_status:
                                queue_entry.arkiv_sync_status = 'pending'
                                logger.info(f"VLM JSON ready, queuing initial Arkiv sync for {video.path}")

        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Updated VLM JSON upload status for entry {queue_id} to: {update_data.vlm_json_upload_status}")
        return UploadQueueResponse.model_validate(queue_entry)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating VLM JSON upload status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/upload-queue/{queue_id}/status", response_model=UploadQueueResponse)
async def update_upload_status(
    queue_id: int,
    update_data: UploadQueueUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the status of an upload queue entry.

    Called by the UploadWorker to update progress or mark as completed/failed.

    Args:
        queue_id: Upload queue entry ID
        update_data: Update request with status, optional metadata/error
        db: Database session

    Returns:
        Updated upload queue entry

    Raises:
        HTTPException: If queue entry not found or database error occurs
    """
    try:
        queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

        if not queue_entry:
            raise HTTPException(status_code=404, detail=f"Upload queue entry {queue_id} not found")

        # Validate status
        valid_statuses = ['pending', 'processing', 'completed', 'failed', 'cancelled']
        if update_data.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {update_data.status}. Must be one of: {', '.join(valid_statuses)}"
            )

        # Update status and timestamps
        queue_entry.status = update_data.status

        if update_data.status == 'processing':
            # Processing state
            from datetime import datetime, timezone
            if not queue_entry.started_at:
                queue_entry.started_at = datetime.now(timezone.utc)
            # Increment attempts
            queue_entry.attempts += 1

        elif update_data.status in ['completed', 'failed', 'cancelled']:
            # Terminal states
            from datetime import datetime, timezone
            queue_entry.completed_at = datetime.now(timezone.utc)

        # Update error message if provided
        if update_data.error:
            queue_entry.error_message = update_data.error

        # If completed and filecoin metadata provided, update video table
        if update_data.status == 'completed' and update_data.filecoin_metadata:
            from app.models.video import Video
            from datetime import datetime, timezone

            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
            if video:
                video.filecoin_root_cid = update_data.filecoin_metadata.get('root_cid')
                video.filecoin_piece_cid = update_data.filecoin_metadata.get('piece_cid')
                video.filecoin_piece_id = update_data.filecoin_metadata.get('piece_id')
                video.filecoin_data_set_id = update_data.filecoin_metadata.get('data_set_id')
                video.filecoin_uploaded_at = datetime.now(timezone.utc)
                video.is_encrypted = update_data.filecoin_metadata.get('is_encrypted', False)
                video.lit_encryption_metadata = update_data.filecoin_metadata.get('lit_encryption_metadata')
                video.encrypted_filecoin_cid = update_data.filecoin_metadata.get('encrypted_root_cid')
                video.cid_encryption_metadata = update_data.filecoin_metadata.get('cid_encryption_metadata')

                logger.info(f"Updated FileCoin metadata for video: {queue_entry.video_path}")

                # Check if video needs Arkiv sync
                if video.share_to_arkiv:
                    # Case 1: Arkiv entity exists but only has VLM data (not FileCoin) - incremental update
                    if (video.arkiv_entity_key and
                        video.arkiv_data_completeness == "vlm_only" and
                        not queue_entry.arkiv_sync_status):

                        # Queue Arkiv sync as UPDATE operation
                        queue_entry.arkiv_sync_status = 'pending'
                        logger.info(f"FileCoin completed, queuing Arkiv UPDATE to add CID for {queue_entry.video_path}")

                    # Case 2: Arkiv entity doesn't exist yet (original logic)
                    elif (not video.arkiv_entity_key and
                          (not queue_entry.arkiv_sync_status or queue_entry.arkiv_sync_status == 'skipped')):
                        # CRITICAL: Arkiv sync can proceed if FileCoin completes (parallel execution)
                        # regardless of VLM analysis status
                        queue_entry.arkiv_sync_status = 'pending'
                        logger.info(f"Queued Arkiv sync for {queue_entry.video_path} (FileCoin completed)")
                    else:
                        logger.debug(f"Arkiv sync already queued ({queue_entry.arkiv_sync_status}) for {queue_entry.video_path}")
                elif not video.share_to_arkiv:
                    # Arkiv sync disabled for this video
                    queue_entry.arkiv_sync_status = 'skipped'
                    logger.info(f"Skipping Arkiv sync for {queue_entry.video_path} (share_to_arkiv=False)")

        db.commit()
        db.refresh(queue_entry)

        logger.info(f"Updated upload queue entry {queue_id} to status: {update_data.status}")
        return UploadQueueResponse.model_validate(queue_entry)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating upload status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/upload-queue/{queue_id}", status_code=204)
async def remove_from_upload_queue(
    queue_id: int,
    db: Session = Depends(get_db)
):
    """
    Remove a video from the upload queue.

    Args:
        queue_id: Upload queue entry ID
        db: Database session

    Raises:
        HTTPException: If queue entry not found or database error occurs
    """
    try:
        queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

        if not queue_entry:
            raise HTTPException(status_code=404, detail=f"Upload queue entry {queue_id} not found")

        video_path = queue_entry.video_path
        db.delete(queue_entry)
        db.commit()

        logger.info(f"Removed video from upload queue: {video_path}")
        return Response(status_code=204)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing from upload queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload-queue/stats")
async def get_upload_queue_stats(db: Session = Depends(get_db)):
    """
    Get statistics about the upload queue.

    Returns:
        Dictionary with queue statistics (counts by status, totals)
    """
    try:
        # Get counts by status
        stats = {
            'total': 0,
            'pending': 0,
            'processing': 0,
            'completed': 0,
            'failed': 0,
            'cancelled': 0,
        }

        for status in ['pending', 'processing', 'completed', 'failed', 'cancelled']:
            count = db.query(UploadQueue).filter(UploadQueue.status == status).count()
            stats[status] = count
            stats['total'] += count

        # Get retryable failed uploads
        retryable = db.query(UploadQueue).filter(
            UploadQueue.status == 'failed',
            UploadQueue.attempts < UploadQueue.max_attempts
        ).count()
        stats['retryable'] = retryable

        # Get Arkiv sync stats
        stats['arkiv_sync_pending'] = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'pending'
        ).count()

        stats['arkiv_sync_syncing'] = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'syncing'
        ).count()

        stats['arkiv_sync_completed'] = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'completed'
        ).count()

        stats['arkiv_sync_failed'] = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'failed'
        ).count()

        stats['arkiv_sync_skipped'] = db.query(UploadQueue).filter(
            UploadQueue.arkiv_sync_status == 'skipped'
        ).count()

        # Get VLM analysis stats
        stats['vlm_analysis_pending'] = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'pending'
        ).count()

        stats['vlm_analysis_processing'] = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'processing'
        ).count()

        stats['vlm_analysis_completed'] = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'completed'
        ).count()

        stats['vlm_analysis_failed'] = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'failed'
        ).count()

        stats['vlm_analysis_skipped'] = db.query(UploadQueue).filter(
            UploadQueue.vlm_analysis_status == 'skipped'
        ).count()

        return stats

    except Exception as e:
        logger.error(f"Error getting upload queue stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
