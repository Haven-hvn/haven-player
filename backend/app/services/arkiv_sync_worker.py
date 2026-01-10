"""
Arkiv Sync Worker service.

This module provides a worker that processes Arkiv sync queue entries.
It handles the synchronization of video timestamps with the Arkiv blockchain.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
import asyncio
import httpx

from app.models.database import get_db
from app.models.upload_queue import UploadQueue
from app.models.video import Video, Timestamp

logger = logging.getLogger(__name__)


class ArkivSyncWorker:
    """
    Worker that processes Arkiv sync queue.

    This worker:
    - Polls for pending Arkiv sync jobs
    - Performs Arkiv sync operations
    - Updates status and retry counts
    - Runs as background task or scheduled job
    """

    def __init__(self, api_base_url: str = "http://localhost:8000"):
        """
        Initialize ArkivSyncWorker.

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
        Process all pending Arkiv sync jobs.

        Returns:
            Number of jobs processed
        """
        processed = 0

        try:
            while True:
                # Pop next Arkiv sync job
                response = await self.client.get(f"{self.api_base_url}/api/upload-queue/arkiv-sync/pop")

                if response.status_code == 204:
                    # No pending jobs
                    logger.debug("No pending Arkiv sync jobs (204)")
                    break
                elif response.status_code == 200:
                    queue_data = response.json()

                    # Check if queue_data is None (no jobs available)
                    if queue_data is None:
                        logger.debug("No pending Arkiv sync jobs (null response)")
                        break

                    queue_id = queue_data['id']
                    logger.info(f"Processing Arkiv sync job {queue_id}: {queue_data['video_path']}")

                    # Process the job
                    success = await self.process_arkiv_sync_job(queue_id)

                    if success:
                        processed += 1
                else:
                    logger.error(f"Failed to pop Arkiv sync job: {response.status_code} {response.text}")
                    break

        except Exception as e:
            logger.error(f"Error processing Arkiv sync queue: {e}", exc_info=True)

        return processed

    async def process_arkiv_sync_job(self, queue_id: int) -> bool:
        """
        Process a single Arkiv sync job.

        Args:
            queue_id: Upload queue entry ID

        Returns:
            True if sync was successful, False otherwise
        """
        db = next(get_db())
        try:
            # Refresh the queue entry from database
            db.expunge_all()
            queue_entry = db.query(UploadQueue).filter(UploadQueue.id == queue_id).first()

            if not queue_entry:
                logger.warning(f"Arkiv sync job {queue_id} not found")
                return False

            # Get video record
            video = db.query(Video).filter(Video.path == queue_entry.video_path).first()
            if not video:
                logger.error(f"Video not found: {queue_entry.video_path}")
                await self.mark_arkiv_sync_failed(queue_id, "Video not found in database")
                return False

            # CRITICAL: Arkiv sync can proceed if EITHER FileCoin uploaded OR timestamps exist
            # (supports parallel VLM + FileCoin execution)
            has_filecoin = bool(video.filecoin_root_cid)
            has_timestamps = db.query(Timestamp).filter(
                Timestamp.video_path == queue_entry.video_path
            ).count() > 0

            if not has_filecoin and not has_timestamps:
                logger.info(f"Skipping Arkiv sync for {queue_entry.video_path} (no FileCoin CID or timestamps)")
                await self.mark_arkiv_sync_skipped(queue_id, "No FileCoin CID or timestamps available")
                return False

            # Get timestamps (optional - we can sync without timestamps)
            timestamps = db.query(Timestamp).filter(
                Timestamp.video_path == queue_entry.video_path
            ).all()

            logger.info(f"Starting Arkiv sync for {queue_entry.video_path} (filecoin={has_filecoin}, timestamps={len(timestamps)})")

            # Perform Arkiv sync via existing service
            from app.services.arkiv_sync import ArkivSyncClient, build_arkiv_config

            client = ArkivSyncClient(build_arkiv_config())
            result = await client.sync_video_with_timestamps(video, timestamps)

            # Update with success
            await self.mark_arkiv_sync_completed(queue_id, result.entity_key)

            logger.info(f"✅ Arkiv sync successful for {queue_entry.video_path}: entity={result.entity_key}")
            return True

        except Exception as e:
            logger.error(f"Arkiv sync failed for {queue_id}: {e}", exc_info=True)
            await self.mark_arkiv_sync_failed(queue_id, str(e))
            return False
        finally:
            db.close()

    async def mark_arkiv_sync_completed(self, queue_id: int, entity_key: str) -> None:
        """
        Mark Arkiv sync as completed successfully.

        Args:
            queue_id: Upload queue entry ID
            entity_key: Arkiv entity key from blockchain
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/arkiv-sync",
                json={
                    "arkiv_sync_status": "completed",
                    "entity_key": entity_key
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark Arkiv sync as completed: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking Arkiv sync as completed: {e}")

    async def mark_arkiv_sync_failed(self, queue_id: int, error_message: str) -> None:
        """
        Mark Arkiv sync as failed.

        Args:
            queue_id: Upload queue entry ID
            error_message: Error message describing the failure
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/arkiv-sync",
                json={
                    "arkiv_sync_status": "failed",
                    "arkiv_sync_error": error_message
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark Arkiv sync as failed: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking Arkiv sync as failed: {e}")

    async def mark_arkiv_sync_skipped(self, queue_id: int, reason: str) -> None:
        """
        Mark Arkiv sync as skipped.

        Args:
            queue_id: Upload queue entry ID
            reason: Reason for skipping the sync
        """
        try:
            response = await self.client.put(
                f"{self.api_base_url}/api/upload-queue/{queue_id}/arkiv-sync",
                json={
                    "arkiv_sync_status": "skipped",
                    "arkiv_sync_error": reason
                }
            )

            if response.status_code != 200:
                logger.error(f"Failed to mark Arkiv sync as skipped: {response.status_code} {response.text}")

        except Exception as e:
            logger.error(f"Error marking Arkiv sync as skipped: {e}")


async def run_arkiv_sync_worker(
    api_base_url: str = "http://localhost:8000",
    polling_interval: int = 30
) -> None:
    """
    Background task that continuously processes Arkiv sync queue.

    Polls for pending sync jobs and processes them one at a time.

    Args:
        api_base_url: Base URL for the backend API
        polling_interval: Seconds to wait between poll attempts
    """
    logger.info("🚀 Starting Arkiv sync worker")

    async with ArkivSyncWorker(api_base_url) as worker:
        while True:
            try:
                logger.debug("Checking for pending Arkiv sync jobs...")
                processed = await worker.process_queue()

                if processed > 0:
                    logger.info(f"✅ Processed {processed} Arkiv sync job(s)")

                await asyncio.sleep(polling_interval)

            except Exception as e:
                logger.error(f"Error in Arkiv sync worker: {e}", exc_info=True)
                await asyncio.sleep(60)  # Wait longer on error
