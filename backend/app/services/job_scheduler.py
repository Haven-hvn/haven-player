"""
Job scheduler service for recurring plugin jobs.

This module provides a centralized scheduler for running recurring plugin jobs
on a schedule (cron-like syntax). Used for tasks like polling YouTube channels
every hour to find new videos.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from sqlalchemy.orm import Session
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

from app.models.database import SessionLocal
from app.models.recurring_job import RecurringJob
from app.models.plugin import Plugin as PluginModel
from app.plugins.plugin_manager import PluginManager
from app.services.upload_coordinator import UploadCoordinator


def sanitize_config_for_storage(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize job configuration to ensure it's JSON-serializable for storage.
    
    This converts complex objects (like AuthenticationString) to serializable strings.
    
    Args:
        config: Configuration dictionary to sanitize
        
    Returns:
        Sanitized configuration dictionary
    """
    sanitized = {}
    for key, value in config.items():
        # Convert complex types to strings
        if isinstance(value, (str, int, float, bool, type(None))):
            sanitized[key] = value
        elif isinstance(value, (list, tuple)):
            sanitized[key] = [str(item) for item in value]
        elif isinstance(value, dict):
            # Recursively sanitize nested dicts
            sanitized[key] = sanitize_config_for_storage(value)
        else:
            # Convert any other type to string
            try:
                # Try to serialize to JSON first
                json.dumps(value)
                sanitized[key] = value
            except (TypeError, ValueError):
                sanitized[key] = str(value)
                logging.warning(f"Converted non-serializable config key '{key}' to string")
    
    return sanitized

logger = logging.getLogger(__name__)

# Global reference for job execution function
# This allows APScheduler to pickle the job function without capturing the JobScheduler instance
_global_scheduler: Optional['JobScheduler'] = None

def _execute_job_wrapper(job_id: int) -> None:
    """
    Module-level wrapper function for job execution.

    This function is used by APScheduler instead of a bound method to avoid
    pickling the JobScheduler instance. It uses a global reference to the
    scheduler to execute jobs.

    Args:
        job_id: ID of the recurring job to execute
    """
    global _global_scheduler
    if _global_scheduler is None:
        logger.error("Job scheduler not initialized, cannot execute job")
        return

    # Import asyncio here since this is called by APScheduler in a thread
    import asyncio
    try:
        # Get or create event loop
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # Run the async _execute_job method
        loop.run_until_complete(_global_scheduler._execute_job(job_id))
    except Exception as e:
        logger.error(f"Error in job execution wrapper for job {job_id}: {e}")


class JobScheduler:
    """
    Centralized scheduler for recurring plugin jobs.
    
    This service manages scheduled jobs that call plugin methods on a schedule.
    Jobs are stored in the database and can be managed via API.
    
    Example usage:
        scheduler = JobScheduler(plugin_manager)
        await scheduler.start()
        
        # Create job
        await scheduler.create_job(
            plugin_name="YouTubePlugin",
            job_name="poll_channel",
            schedule="0 * * * *",  # Every hour
            method="discover_sources",
            on_success="archive_all"
        )
    """
    
    def __init__(self, plugin_manager: PluginManager, db_url: str = "sqlite:///haven_player.db"):
        """
        Initialize job scheduler.

        Args:
            plugin_manager: PluginManager instance
            db_url: Database URL for job store
        """
        self.plugin_manager = plugin_manager
        self.db_url = db_url

        # Initialize upload coordinator for auto-upload functionality
        self.upload_coordinator = UploadCoordinator()

        # Configure APScheduler with SQLAlchemy job store
        jobstore = SQLAlchemyJobStore(url=db_url, tablename='apscheduler_jobs')

        self.scheduler = AsyncIOScheduler(
            jobstores={'default': jobstore},
            timezone='UTC'
        )

        self.running = False
    
    async def start(self) -> None:
        """Start the scheduler and load jobs from database."""
        if self.running:
            logger.warning("Scheduler already running")
            return

        logger.info("Starting job scheduler...")

        # Set global reference for job execution wrapper
        global _global_scheduler
        _global_scheduler = self

        # Start the scheduler
        self.scheduler.start()
        self.running = True

        # Load all enabled jobs from database
        await self._load_jobs_from_db()

        logger.info(f"✅ Job scheduler started with {len(self.scheduler.get_jobs())} jobs")
    
    async def stop(self) -> None:
        """Stop the scheduler."""
        if not self.running:
            return

        logger.info("Stopping job scheduler...")
        self.scheduler.shutdown()
        self.running = False

        # Clear global reference
        global _global_scheduler
        _global_scheduler = None

        logger.info("✅ Job scheduler stopped")
    
    async def _load_jobs_from_db(self) -> None:
        """Load all enabled jobs from database and schedule them."""
        db = SessionLocal()
        try:
            jobs = db.query(RecurringJob).filter(
                RecurringJob.enabled == True
            ).all()
            
            for job in jobs:
                await self._schedule_job(job)
            
            logger.info(f"Loaded {len(jobs)} jobs from database")
        finally:
            db.close()
    
    async def _schedule_job(self, job: RecurringJob) -> None:
        """
        Schedule a job with APScheduler.
        
        Args:
            job: RecurringJob model instance
        """
        try:
            # Parse cron schedule
            parts = job.schedule.split()
            if len(parts) != 5:
                logger.error(f"Invalid cron schedule for job {job.job_name}: {job.schedule}")
                return
            
            minute, hour, day, month, weekday = parts
            
            # Create cron trigger
            trigger = CronTrigger(
                minute=minute,
                hour=hour,
                day=day,
                month=month,
                day_of_week=weekday,
                timezone='UTC'
            )
            
            # Schedule the job using module-level function to avoid pickling issues
            self.scheduler.add_job(
                func=_execute_job_wrapper,  # Use module-level function instead of bound method
                trigger=trigger,
                args=[job.id],
                id=f"job_{job.id}",
                name=f"{job.plugin_name}:{job.job_name}",
                replace_existing=True,
                max_instances=1  # Prevent overlapping runs
            )
            
            # Update next run time in database
            job.next_run_at = trigger.get_next_fire_time(None, datetime.utcnow())
            db = SessionLocal()
            try:
                db.commit()
            finally:
                db.close()
            
            logger.info(f"Scheduled job: {job.plugin_name}:{job.job_name} ({job.schedule})")
        
        except Exception as e:
            logger.error(f"Failed to schedule job {job.job_name}: {e}")
    
    async def _execute_job(self, job_id: int) -> None:
        """
        Execute a scheduled job.
        
        Args:
            job_id: ID of the recurring job to execute
        """
        db = SessionLocal()
        try:
            job = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            if not job:
                logger.error(f"Job {job_id} not found")
                return
            
            # Check if job is enabled
            if not job.enabled:
                logger.info(f"Job {job.job_name} is disabled, skipping")
                return
            
            # Update job status
            job.is_running = True
            job.total_runs += 1
            job.last_run_at = datetime.utcnow()
            db.commit()
            
            logger.info(f"Executing job: {job.plugin_name}:{job.job_name}")
            
            try:
                # Get plugin instance
                plugin = self.plugin_manager.get_plugin(job.plugin_name)
                if not plugin:
                    raise Exception(f"Plugin {job.plugin_name} not loaded")
                
                # Execute plugin method based on method type
                if job.method == "discover_sources":
                    result = await self._execute_discover_sources(job, plugin)
                elif job.method == "archive":
                    # archive() requires MediaSource, not config keys
                    # For scheduled jobs, archive doesn't make sense directly
                    # Use discover_sources with on_success="archive_all" instead
                    raise Exception(
                        f"Method 'archive' cannot be scheduled directly. "
                        f"Use method='discover_sources' with on_success='archive_all' "
                        f"to discover and archive sources automatically."
                    )
                elif hasattr(plugin, job.method):
                    # Call custom method if exists
                    method = getattr(plugin, job.method)
                    if callable(method):
                        result = await method(**job.config)
                    else:
                        raise Exception(f"Method {job.method} is not callable")
                else:
                    raise Exception(f"Method {job.method} not found on plugin")
                
                # Handle success
                job.successful_runs += 1
                job.last_error = None
                job.last_error_at = None
                
                logger.info(f"✅ Job {job.job_name} completed successfully")
            
            except Exception as e:
                # Handle failure
                job.failed_runs += 1
                job.last_error = str(e)
                job.last_error_at = datetime.utcnow()
                logger.error(f"❌ Job {job.job_name} failed: {e}")
            
            finally:
                job.is_running = False
                db.commit()
        
        except Exception as e:
            logger.error(f"Error executing job {job_id}: {e}")
        finally:
            db.close()
    
    async def _execute_discover_sources(self, job: RecurringJob, plugin) -> Dict[str, Any]:
        """
        Execute discover_sources method and handle results.

        Args:
            job: RecurringJob instance
            plugin: Plugin instance

        Returns:
            Execution results
        """
        logger.info(f"Job {job.job_name}: calling discover_sources() on {job.plugin_name}")

        # Discover sources
        sources = await plugin.discover_sources()

        logger.info(f"Job {job.job_name}: discovered {len(sources)} sources from {job.plugin_name}")
        if len(sources) > 0:
            logger.info(f"Job {job.job_name}: first few sources: {[s.source_id for s in sources[:3]]}")

        result = {
            "sources_found": len(sources),
            "sources": [s.to_dict() for s in sources]
        }
        
        # Handle based on on_success configuration
        if job.on_success == "archive_all":
            # Archive all discovered sources
            logger.info(f"Job {job.job_name}: on_success='archive_all', processing {len(sources)} sources")
            archived = 0
            enqueued = 0
            for i, source in enumerate(sources, 1):
                try:
                    logger.info(f"Archiving source {i}/{len(sources)}: {source.source_id}")
                    archive_result = await self.plugin_manager.archive_source(
                        job.plugin_name,
                        source
                    )
                    if archive_result.success:
                        archived += 1
                        logger.info(f"✅ Successfully archived {source.source_id}")
                        if archive_result.output_path:
                            logger.info(f"   → Saved to: {archive_result.output_path}")

                            # Enqueue for auto-upload
                            enqueued_result = await self.upload_coordinator.enqueue_video_after_download(
                                archive_result.output_path,
                                job.plugin_name
                            )
                            if enqueued_result:
                                enqueued += 1
                    else:
                        logger.warning(f"❌ Failed to archive {source.source_id}: {archive_result.error}")
                except Exception as e:
                    logger.error(f"❌ Error archiving {source.source_id}: {e}")

            result["archived"] = archived
            result["enqueued"] = enqueued
            logger.info(f"Job {job.job_name}: archived {archived}/{len(sources)} sources, enqueued {enqueued} for upload")

        elif job.on_success == "archive_new":
            # Archive all discovered sources (plugin should handle filtering of seen sources)
            # For YouTubePlugin, discover_sources() already filters out seen videos via _seen_videos
            logger.info(f"Job {job.job_name}: on_success='archive_new', processing {len(sources)} sources")
            archived = 0
            enqueued = 0
            for i, source in enumerate(sources, 1):
                try:
                    logger.info(f"Archiving source {i}/{len(sources)}: {source.source_id}")
                    archive_result = await self.plugin_manager.archive_source(
                        job.plugin_name,
                        source
                    )
                    if archive_result.success:
                        archived += 1
                        logger.info(f"✅ Successfully archived {source.source_id}")
                        if archive_result.output_path:
                            logger.info(f"   → Saved to: {archive_result.output_path}")

                            # Enqueue for auto-upload
                            enqueued_result = await self.upload_coordinator.enqueue_video_after_download(
                                archive_result.output_path,
                                job.plugin_name
                            )
                            if enqueued_result:
                                enqueued += 1
                    else:
                        logger.warning(f"❌ Failed to archive {source.source_id}: {archive_result.error}")
                except Exception as e:
                    logger.error(f"❌ Error archiving {source.source_id}: {e}")

            result["archived"] = archived
            result["enqueued"] = enqueued
            logger.info(f"Job {job.job_name}: archived {archived}/{len(sources)} sources, enqueued {enqueued} for upload")

        # log_only is default - just log results
        logger.info(f"Job {job.job_name}: discovered {len(sources)} sources")
        
        return result
    
    async def create_job(
        self,
        plugin_name: str,
        job_name: str,
        schedule: str,
        method: str = "discover_sources",
        on_success: str = "log_only",
        config: Optional[Dict[str, Any]] = None
    ) -> RecurringJob:
        """
        Create a new recurring job.
        
        Args:
            plugin_name: Name of the plugin
            job_name: Unique name for the job
            schedule: Cron-like schedule (e.g., "0 * * * *")
            method: Plugin method to call
            on_success: What to do with results ("log_only", "archive_all", "archive_new")
            config: Additional configuration for the job
            
        Returns:
            Created RecurringJob instance
        """
        db = SessionLocal()
        try:
            # Validate method
            if method == "archive":
                raise ValueError(
                    f"Method 'archive' cannot be scheduled directly. "
                    f"Use method='discover_sources' with on_success='archive_all' "
                    f"to discover and archive sources automatically."
                )
            
            # Sanitize config to ensure it's serializable
            sanitized_config = sanitize_config_for_storage(config or {})
            
            # Create job in database
            job = RecurringJob(
                plugin_name=plugin_name,
                job_name=job_name,
                schedule=schedule,
                method=method,
                on_success=on_success,
                config=sanitized_config
            )
            
            db.add(job)
            db.commit()
            db.refresh(job)
            
            # Schedule the job
            await self._schedule_job(job)
            
            logger.info(f"Created job: {plugin_name}:{job_name}")
            return job
        
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create job {job_name}: {e}")
            raise
        finally:
            db.close()
    
    async def delete_job(self, job_id: int) -> bool:
        """
        Delete a recurring job.
        
        Args:
            job_id: ID of the job to delete
            
        Returns:
            True if deleted successfully
        """
        db = SessionLocal()
        try:
            # Remove from scheduler
            job_key = f"job_{job_id}"
            if self.scheduler.get_job(job_key):
                self.scheduler.remove_job(job_key)
            
            # Remove from database
            job = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            if job:
                db.delete(job)
                db.commit()
                logger.info(f"Deleted job {job_id}")
                return True
            
            return False
        
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete job {job_id}: {e}")
            return False
        finally:
            db.close()
    
    async def pause_job(self, job_id: int) -> bool:
        """
        Pause a recurring job.
        
        Args:
            job_id: ID of the job to pause
            
        Returns:
            True if paused successfully
        """
        db = SessionLocal()
        try:
            job = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            if not job:
                return False
            
            job.enabled = False
            db.commit()
            
            # Remove from scheduler
            job_key = f"job_{job_id}"
            if self.scheduler.get_job(job_key):
                self.scheduler.pause_job(job_key)
            
            logger.info(f"Paused job {job_id}")
            return True
        
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to pause job {job_id}: {e}")
            return False
        finally:
            db.close()
    
    async def resume_job(self, job_id: int) -> bool:
        """
        Resume a paused recurring job.
        
        Args:
            job_id: ID of the job to resume
            
        Returns:
            True if resumed successfully
        """
        db = SessionLocal()
        try:
            job = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            if not job:
                return False
            
            job.enabled = True
            db.commit()
            
            # Reschedule in APScheduler
            await self._schedule_job(job)
            
            logger.info(f"Resumed job {job_id}")
            return True
        
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to resume job {job_id}: {e}")
            return False
        finally:
            db.close()
    
    async def get_jobs(self, plugin_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all recurring jobs.
        
        Args:
            plugin_name: Optional filter by plugin name
            
        Returns:
            List of job dictionaries
        """
        db = SessionLocal()
        try:
            query = db.query(RecurringJob)
            
            if plugin_name:
                query = query.filter(RecurringJob.plugin_name == plugin_name)
            
            jobs = query.order_by(RecurringJob.created_at.desc()).all()
            return [job.to_dict() for job in jobs]
        
        finally:
            db.close()
    
    async def get_job_status(self) -> Dict[str, Any]:
        """
        Get overall scheduler status.
        
        Returns:
            Dictionary with scheduler status
        """
        aps_jobs = self.scheduler.get_jobs()
        
        return {
            "running": self.running,
            "total_jobs": len(aps_jobs),
            "jobs": [
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None
                }
                for job in aps_jobs
            ]
        }
    
    async def run_job_now(self, job_id: int) -> bool:
        """
        Manually trigger a job execution.
        
        Args:
            job_id: ID of the job to run
            
        Returns:
            True if job was triggered successfully
        """
        try:
            await self._execute_job(job_id)
            return True
        except Exception as e:
            logger.error(f"Failed to run job {job_id}: {e}")
            return False