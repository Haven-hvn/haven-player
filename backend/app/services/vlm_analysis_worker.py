"""
VLM Analysis Worker service.

This module provides a worker that processes VLM analysis queue entries.
It handles video analysis using VLM engine asynchronously.
"""
import logging
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

            logger.info(f"Starting VLM analysis for {queue_entry.video_path}")

            # Perform VLM analysis via existing processor
            from app.services.vlm_processor import process_video_for_queue

            await process_video_for_queue(queue_id, queue_entry.video_path)

            # Update with success
            await self.mark_vlm_analysis_completed(queue_id)

            logger.info(f"✅ VLM analysis successful for {queue_entry.video_path}")
            return True

        except Exception as e:
            logger.error(f"VLM analysis failed for {queue_id}: {e}", exc_info=True)
            await self.mark_vlm_analysis_failed(queue_id, str(e))
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
    api_base_url: str = "http://localhost:8000",
    polling_interval: int = 60
) -> None:
    """
    Background task that continuously processes VLM analysis queue.

    Polls for pending analysis jobs and processes them one at a time.

    Args:
        api_base_url: Base URL for the backend API
        polling_interval: Seconds to wait between poll attempts
    """
    logger.info("🚀 Starting VLM analysis worker")

    async with VLMAnalysisWorker(api_base_url) as worker:
        while True:
            try:
                logger.debug("Checking for pending VLM analysis jobs...")
                processed = await worker.process_queue()

                if processed > 0:
                    logger.info(f"✅ Processed {processed} VLM analysis job(s)")

                await asyncio.sleep(polling_interval)

            except Exception as e:
                logger.error(f"Error in VLM analysis worker: {e}", exc_info=True)
                await asyncio.sleep(60)  # Wait longer on error
