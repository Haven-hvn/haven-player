"""
Initialize PumpFun automated recording job.

Creates a recurring job that runs every 30 seconds to:
- Check which subscribed streams are live
- Start/stop recordings automatically
- Manage segment rotation (happens in recorder)
"""

import logging
from typing import Optional

from app.services.job_scheduler import JobScheduler
from app.plugins.plugin_manager import PluginManager
from app.models.database import SessionLocal
from app.models.recurring_job import RecurringJob

logger = logging.getLogger(__name__)


async def initialize_pumpfun_automated_recording(
    job_scheduler: Optional[JobScheduler] = None,
    plugin_manager: Optional[PluginManager] = None
) -> None:
    """
    Initialize automated PumpFun recording job.
    
    Creates a recurring job that runs every 30 seconds to:
    - Check which subscribed streams are live
    - Start/stop recordings automatically
    - Manage segment rotation (happens in recorder)
    """
    
    try:
        # Get JobScheduler instance if not provided
        if not job_scheduler:
            from app.services.job_scheduler import JobScheduler as JobSchedulerClass
            # This assumes JobScheduler is a singleton with get_instance() method
            # If not, we need to check how it's initialized in main.py
            job_scheduler = JobSchedulerClass()
        
        # Get PluginManager instance if not provided
        if not plugin_manager:
            from app.plugins.plugin_manager import PluginManager
            plugin_manager = PluginManager()
        
        logger.info("Initializing PumpFun automated recording job...")
        
        # Check if job already exists
        db = SessionLocal()
        try:
            existing_job = db.query(RecurringJob).filter(
                RecurringJob.plugin_name == "PumpFunPlugin",
                RecurringJob.job_name == "auto_segmented_recordings"
            ).first()
            
            if existing_job:
                logger.info("PumpFun automated recording job already exists (id: %s)", existing_job.id)
                
                # Ensure job is scheduled
                if job_scheduler.scheduler:
                    # Check if job is scheduled
                    scheduled_job = job_scheduler.scheduler.get_job(f"job_{existing_job.id}")
                    if not scheduled_job:
                        logger.info("Rescheduling existing PumpFun recording job")
                        await job_scheduler.schedule_job(existing_job.id)
                return
            
            # Create new job entry
            new_job = RecurringJob(
                plugin_name="PumpFunPlugin",
                job_name="auto_segmented_recordings",
                schedule="*/30 * * * * *",  # Every 30 seconds (second-level cron)
                method="manage_recordings",
                on_success="log_only",
                config={},  # Empty config, plugin uses its own config
                enabled=True,
            )
            
            db.add(new_job)
            db.commit()
            
            logger.info("Created PumpFun automated recording job in database")
            
            # Schedule the job if scheduler is available
            if job_scheduler.scheduler:
                await job_scheduler.schedule_job(new_job.id)
                logger.info("Scheduled PumpFun automated recording job")
            else:
                logger.warning("Job scheduler not initialized, job created but not scheduled")
                
        except Exception as e:
            logger.error(f"Database error creating PumpFun recording job: {e}")
            db.rollback()
            raise
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Failed to initialize PumpFun automated recording job: {e}")
        raise