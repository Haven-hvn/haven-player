"""
Transcript Summary Worker service.

This module provides a worker that processes transcript summarization queue entries.
It handles transcript summarization using LLM and queues summaries for Filecoin upload via existing upload queue system.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
import asyncio

from app.models.database import get_db
from app.models.video_transcript import VideoTranscript
from app.models.video import Video
from app.models.config import AppConfig
from app.services.transcript_summary_service import generate_transcript_summary


logger = logging.getLogger(__name__)


class TranscriptSummaryWorker:
    """
    Worker that processes transcript summarization queue.

    This worker:
    - Polls for transcripts that need summarization
    - Generates LLM summaries
    - Adds summaries to Filecoin upload queue
    - Updates VideoTranscript records with status
    - Runs as background task
    """

    def __init__(self, api_base_url: str = "http://localhost:8000"):
        """
        Initialize TranscriptSummaryWorker.

        Args:
            api_base_url: Base URL for the backend API
        """
        self.api_base_url = api_base_url

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        return

    async def process_queue(self) -> int:
        """
        Process all pending transcript summarization jobs.

        Returns:
            Number of jobs processed
        """
        processed = 0

        try:
            while True:
                # Find transcript without summary CID
                db = next(get_db())
                try:
                    transcript = db.query(VideoTranscript).filter(
                        VideoTranscript.summary_cid == None
                    ).order_by(VideoTranscript.created_at.asc()).first()

                    if not transcript:
                        # No pending transcripts
                        db.close()
                        logger.debug("No pending transcript summaries")
                        break

                    # Get associated video
                    video = db.query(Video).filter(
                        Video.id == transcript.video_id
                    ).first()

                    if not video:
                        logger.error(f"Video not found for transcript {transcript.id}")
                        # Mark as failed to skip
                        transcript.summary_cid = "failed"
                        db.commit()
                        db.close()
                        continue

                    db.close()

                    logger.info(
                        f"Processing transcript summary for video {video.id}: {video.title}"
                    )

                    # Process the transcript
                    success = await self.process_transcript_summary(
                        transcript_id=transcript.id,
                        video_id=video.id,
                        video_path=video.path
                    )

                    if success:
                        processed += 1

                    # Small delay between processing to avoid overwhelming LLM
                    await asyncio.sleep(2)

                except Exception as e:
                    logger.error(f"Error in transcript processing loop: {e}", exc_info=True)
                    db.close()
                    break

        except Exception as e:
            logger.error(f"Error processing transcript summary queue: {e}", exc_info=True)

        return processed

    async def process_transcript_summary(
        self,
        transcript_id: int,
        video_id: int,
        video_path: str
    ) -> bool:
        """
        Process a single transcript summarization job.

        Args:
            transcript_id: VideoTranscript record ID
            video_id: Video record ID
            video_path: Path to the video file

        Returns:
            True if processing was successful, False otherwise
        """
        try:
            # Step 1: Generate LLM summary
            summary_json = await generate_transcript_summary(
                transcript_id=transcript_id,
                video_id=video_id,
                video_path=video_path
            )

            if not summary_json:
                logger.error(f"Failed to generate summary for transcript {transcript_id}")
                # Mark as failed by setting CID to error marker
                await self._mark_transcript_failed(
                    transcript_id,
                    "Failed to generate LLM summary"
                )
                return False

            logger.info(f"✅ Generated summary for transcript {transcript_id}")

            # Step 2: Mark transcript summary as ready for upload
            # The frontend will handle uploading to IPFS via filecoin pin
            db = next(get_db())
            try:
                # Get upload queue entry for this video
                from app.models.upload_queue import UploadQueue
                upload_entry = db.query(UploadQueue).filter(
                    UploadQueue.video_path == video_path
                ).first()

                if not upload_entry:
                    # No upload queue entry exists yet
                    # This is fine - the frontend will handle upload
                    logger.info(f"No upload queue entry found for video {video_path}")
                    return False

                # Mark transcript summary status as ready (frontend will upload to IPFS)
                upload_entry.transcript_summary_status = "pending"
                upload_entry.transcript_summary_started_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(upload_entry)

                logger.info(
                    f"✅ Transcript summary ready for upload: {transcript_id} "
                    f"(frontend will upload via filecoin pin)"
                )
                return True

            except Exception as e:
                logger.error(f"Error marking transcript summary as ready: {e}", exc_info=True)
                await self._mark_transcript_failed(
                    transcript_id,
                    str(e)
                )
                return False
            finally:
                db.close()

    async def _mark_transcript_failed(
        self,
        transcript_id: int,
        error_message: str
    ) -> None:
        """
        Mark transcript as failed.

        Args:
            transcript_id: VideoTranscript record ID
            error_message: Error message describing the failure
        """
        try:
            db = next(get_db())
            transcript = db.query(VideoTranscript).filter(
                VideoTranscript.id == transcript_id
            ).first()

            if not transcript:
                db.close()
                return

            # Mark as failed by setting CID to error marker
            # For now, we mark as failed by setting CID to "failed"
            # The upload queue entry will also track the error
            transcript.summary_cid = "failed"
            db.commit()
            db.close()

            logger.error(f"Marked transcript {transcript_id} as failed: {error_message}")

        except Exception as e:
            logger.error(f"Error marking transcript as failed: {e}")
            db.close()


async def run_transcript_summary_worker(
    api_base_url: str = "http://localhost:8000",
    polling_interval: int = 120
) -> None:
    """
    Background task that continuously processes transcript summarization queue.

    Polls for transcripts that need summarization and processes them one at a time.

    Args:
        api_base_url: Base URL for the backend API
        polling_interval: Seconds to wait between poll attempts
    """
    logger.info("🚀 Starting transcript summary worker")

    async with TranscriptSummaryWorker(api_base_url) as worker:
        while True:
            try:
                logger.debug("Checking for pending transcript summaries...")
                processed = await worker.process_queue()

                if processed > 0:
                    logger.info(f"✅ Processed {processed} transcript summary job(s)")

                await asyncio.sleep(polling_interval)

            except Exception as e:
                logger.error(f"Error in transcript summary worker: {e}", exc_info=True)
                await asyncio.sleep(60)  # Wait longer on error
