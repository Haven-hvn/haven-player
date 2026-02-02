"""
VLM Analysis Worker service.

This module provides a worker that processes VLM analysis queue entries.
It handles video analysis using VLM engine asynchronously.
"""
import logging
import random
from datetime import datetime, timezone
from typing import Optional
import asyncio
import httpx

from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video


logger = logging.getLogger(__name__)


class VLMAnalysisWorker:
    """
    Worker that processes VLM analysis queue.

    This worker:
    - Polls for pending VLM analysis jobs
    - Performs VLM analysis on videos
    - Updates status and error handling
    - Runs as background task
    """

    def __init__(self, api_base_url: str = "http://localhost:8000"):
        """
        Initialize VLMAnalysisWorker.

        Args:
            api_base_url: Base URL for the backend API
        """
        self.api_base_url = api_base_url
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        """Async context manager entry."""
        self.client = httpx.AsyncClient(timeout=300.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.client:
            await self.client.aclose()

    async def process_queue(self) -> int:
        """
        Process all pending VLM analysis jobs.

        Returns:
            Number of jobs processed
        """
        processed = 0

        try:
            while True:
                # Pop next VLM analysis job
                response = await self.client.get(f"{self.api_base_url}/api/upload-queue/vlm/pop")

                if response.status_code == 204:
                    # No pending jobs
                    logger.debug("No pending VLM analysis jobs (204)")
                    break
                elif response.status_code == 200:
                    queue_data = response.json()

                    # Check if queue_data is None (no jobs available)
                    if queue_data is None:
                        logger.debug("No pending VLM analysis jobs (null response)")
                        break

                    queue_id = queue_data['id']
                    logger.info(f"Processing VLM analysis job {queue_id}: {queue_data['video_path']}")

                    # Process the job
                    success = await self.process_vlm_analysis_job(queue_id)

                    if success:
                        processed += 1
                else:
                    logger.error(f"Failed to pop VLM analysis job: {response.status_code} {response.text}")
                    break

        except Exception as e:
            logger.error(f"Error processing VLM analysis queue: {e}", exc_info=True)

        return processed

    async def process_vlm_analysis_job(self, queue_id: int) -> bool:
        """
        Process a single VLM analysis job.

        Args:
            queue_id: Upload queue entry ID

        Returns:
            True if analysis was successful, False otherwise
        """
        db = next(get_db())
        try:
            # Refresh the queue entry from database
            db.expunge_all()
            queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

            if not queue_entry:
                logger.warning(f"VLM analysis job {queue_id} not found")
                return False

            # Check if job can proceed (not in failure sink)
            if not queue_entry.can_proceed():
                logger.warning(f"Skipping VLM analysis for {queue_entry.video_path} - job failed at earlier stage: {queue_entry.failed_stage}")
                await self.mark_vlm_analysis_skipped(
                    queue_id,
                    f"Job failed at earlier stage: {queue_entry.failed_stage} - {queue_entry.failure_reason}"
                )
                return True

            # Get video record
            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
            if not video:
                logger.error(f"Video not found: {queue_entry.video_path}")
                await self.mark_vlm_analysis_failed(queue_id, "Video not found in database")
                return False

            # Check if video has VLM analysis enabled
            if not video.enable_vlm_analysis:
                logger.info(f"VLM analysis disabled for video: {queue_entry.video_path}, skipping")
                await self.mark_vlm_analysis_skipped(queue_id, "VLM analysis disabled for this video")
                return True

            # Double-check file has video streams before processing (defensive check)
            # This catches any audio-only files that slipped through queue validation
            from app.utils.video.video_file_validator import is_video_content
            if not is_video_content(queue_entry.video_path):
                logger.warning(f"Skipping VLM analysis for non-video file: {queue_entry.video_path}")
                await self.mark_vlm_analysis_skipped(
                    queue_id,
                    "File contains audio-only content (no video streams)"
                )
                return True

            logger.info(f"Starting VLM analysis for {queue_entry.video_path}")

            # Perform VLM analysis via existing processor
            from app.services.vlm_processor import process_video_for_queue

            await process_video_for_queue(queue_id, queue_entry.video_path)

            # Update with success
            await self.mark_vlm_analysis_completed(queue_id)

            logger.info(f"✅ VLM analysis successful for {queue_entry.video_path}")
            return True

        except asyncio.TimeoutError as e:
            logger.error(f"VLM analysis timeout for {queue_id}: {e}")
            await self.mark_vlm_analysis_failed(
                queue_id,
                (
                    f"Processing timeout (VLM engine hung for >5 minutes).\n\n"
                    f"This is caused by synchronous HTTP blocking in the single-endpoint client, NOT Decord.\n"
                    f"Decord processes frames quickly; the synchronous requests.post() call blocks the Python\n"
                    f"interpreter for 1+ minutes during LLM API calls, making backend APIs unavailable.\n"
                    f"Enable multiplexer (VLM configuration) to use async httpx client instead.\n"
                    f"Technical details: {str(e)}"
                )
            )
            return False
        except Exception as e:
            # Import DECORDError if available
            from app.services.vlm_processor import DECORDError
            
            error_message = str(e)
            
            # Provide actionable guidance for common errors
            if isinstance(e, DECORDError) or "DECORDError" in error_message or ("decord" in error_message.lower() and "Error sending packet" in error_message):
                guidance = (
                    f"Decord decode error - video format incompatible with VLM engine.\n\n"
                    f"The video '{queue_entry.video_path}' uses a format or codec that the "
                    f"decord/FFmpeg decoder cannot process. Common causes:\n"
                    f"- Corrupt video file\n"
                    f"- Non-standard codec or container format\n"
                    f"- Video with multiple streams that confuse the decoder\n\n"
                    f"Solution: Transcode the video to a standard format:\n"
                    f"  ffmpeg -i \"{queue_entry.video_path}\" -c:v libx264 -c:a aac \"{queue_entry.video_path}_converted.mp4\"\n\n"
                    f"Technical details: {error_message}"
                )
                await self.mark_vlm_analysis_failed(queue_id, guidance)
            else:
                generic_error = (
                    f"VLM analysis failed: {error_message}\n\n"
                    f"If this persists, the video may be in an incompatible format or "
                    f"there may be an issue with the VLM engine configuration."
                )
                await self.mark_vlm_analysis_failed(queue_id, generic_error)
            
            logger.error(f"VLM analysis failed for {queue_id}: {e}", exc_info=True)
            return False
        finally:
            db.close()

    async def mark_vlm_analysis_completed(self, queue_id: int) -> None:
        """
        Mark VLM analysis as completed successfully.

        Args:
            queue_id: Upload queue entry ID
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/vlm-analysis",
                json={
                    "vlm_analysis_status": "completed"
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark VLM analysis as completed: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking VLM analysis as completed: {e}")

    async def mark_vlm_analysis_failed(self, queue_id: int, error_message: str) -> None:
        """
        Mark VLM analysis as failed.

        Args:
            queue_id: Upload queue entry ID
            error_message: Error message describing the failure
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/vlm-analysis",
                json={
                    "vlm_analysis_status": "failed",
                    "vlm_analysis_error": error_message
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark VLM analysis as failed: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking VLM analysis as failed: {e}")

    async def mark_vlm_analysis_skipped(self, queue_id: int, reason: str) -> None:
        """
        Mark VLM analysis as skipped.

        Args:
            queue_id: Upload queue entry ID
            reason: Reason for skipping the analysis
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/vlm-analysis",
                json={
                    "vlm_analysis_status": "skipped",
                    "vlm_analysis_error": reason
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark VLM analysis as skipped: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking VLM analysis as skipped: {e}")


async def run_vlm_analysis_worker(
    api_base_url: str = "http://localhost:8000"
) -> None:
    """
    Background task that continuously processes VLM analysis queue.

    Polls for pending analysis jobs and processes them one at a time.
    Uses random intervals (30s to 300s) to naturally stagger from other workers.

    Args:
        api_base_url: Base URL for the backend API
    """
    # Random startup delay (0-60s) to stagger from other workers
    startup_delay = random.uniform(0, 60)
    logger.info(f"🚀 Starting VLM analysis worker (staggered startup: {startup_delay:.1f}s)")
    await asyncio.sleep(startup_delay)

    async with VLMAnalysisWorker(api_base_url) as worker:
        while True:
            try:
                logger.debug("Checking for pending VLM analysis jobs...")
                processed = await worker.process_queue()

                if processed > 0:
                    logger.info(f"✅ Processed {processed} VLM analysis job(s)")

                # Random interval between 30s and 300s to naturally stagger workers
                polling_interval = random.uniform(30, 300)
                logger.debug(f"Next VLM analysis poll in {polling_interval:.1f}s")
                await asyncio.sleep(polling_interval)

            except Exception as e:
                logger.error(f"Error in VLM analysis worker: {e}", exc_info=True)
                await asyncio.sleep(60)  # Wait longer on error
