"""Job scheduler for cron-like recurring job execution.

The JobScheduler manages recurring jobs that trigger plugin
discover_sources() calls at scheduled intervals. It integrates
with APScheduler for cron-like scheduling.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import Any, Callable, Dict, List, Optional
from uuid import UUID, uuid4


class JobStatus(Enum):
    """Status of a scheduled job."""
    
    ACTIVE = auto()       # Job is scheduled and will run
    PAUSED = auto()       # Job is paused, won't run until resumed
    DISABLED = auto()     # Job is disabled
    RUNNING = auto()      # Job is currently executing


class OnSuccessAction(Enum):
    """Action to take when job discovers sources successfully."""
    
    ARCHIVE_ALL = "archive_all"      # Archive all discovered sources
    ARCHIVE_NEW = "archive_new"      # Archive only new sources
    LOG_ONLY = "log_only"            # Just log, don't archive


@dataclass
class RecurringJob:
    """Definition of a recurring job.
    
    Attributes:
        job_id: Unique identifier for the job
        name: Human-readable job name
        plugin_name: Name of the plugin to execute
        schedule: Cron expression for scheduling
        on_success: Action to take on successful discovery
        enabled: Whether the job is enabled
        created_at: When the job was created
        last_run: When the job last ran
        next_run: When the job will next run
        run_count: Number of times the job has run
        error_count: Number of errors encountered
        metadata: Additional job metadata
    """
    
    job_id: UUID = field(default_factory=uuid4)
    name: str = ""
    plugin_name: str = ""
    schedule: str = "0 * * * *"  # Default: hourly
    on_success: OnSuccessAction = OnSuccessAction.ARCHIVE_NEW
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    error_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def status(self) -> JobStatus:
        """Get current job status."""
        if not self.enabled:
            return JobStatus.DISABLED
        return JobStatus.ACTIVE


@dataclass
class JobExecutionResult:
    """Result of a job execution.
    
    Attributes:
        job_id: ID of the job that ran
        started_at: When execution started
        completed_at: When execution completed
        success: Whether execution succeeded
        sources_found: Number of sources discovered
        sources_archived: Number of sources archived
        error: Error message if failed
    """
    
    job_id: UUID
    started_at: datetime
    completed_at: Optional[datetime] = None
    success: bool = False
    sources_found: int = 0
    sources_archived: int = 0
    error: Optional[str] = None


class JobScheduler:
    """Manages recurring job scheduling and execution.
    
    The JobScheduler coordinates with APScheduler to run jobs
    on cron-like schedules. Each job triggers a plugin's
    discover_sources() method and optionally archives the results.
    
    Example:
        scheduler = JobScheduler(pipeline_manager, config)
        
        # Add a job
        job = RecurringJob(
            name="YouTube Daily",
            plugin_name="YouTubePlugin",
            schedule="0 0 * * *",  # Daily at midnight
            on_success=OnSuccessAction.ARCHIVE_NEW,
        )
        scheduler.add_job(job)
        
        # Start the scheduler
        await scheduler.start()
    """
    
    def __init__(
        self,
        pipeline_manager: Optional[Any] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Initialize the job scheduler.
        
        Args:
            pipeline_manager: PipelineManager for processing archived content
            config: Scheduler configuration
        """
        self._pipeline_manager = pipeline_manager
        self._config = config or {}
        self._jobs: Dict[UUID, RecurringJob] = {}
        self._scheduler: Optional[Any] = None  # APScheduler instance
        self._running = False
        self._execution_history: List[JobExecutionResult] = []
        self._max_history = 1000
    
    @property
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._running
    
    @property
    def jobs(self) -> List[RecurringJob]:
        """Get all registered jobs."""
        return list(self._jobs.values())
    
    @property
    def active_jobs(self) -> List[RecurringJob]:
        """Get all active (enabled) jobs."""
        return [j for j in self._jobs.values() if j.enabled]
    
    def add_job(self, job: RecurringJob) -> RecurringJob:
        """Add a new job to the scheduler.
        
        Args:
            job: The job to add
            
        Returns:
            The added job with updated next_run time
        """
        # Calculate next run time
        job.next_run = self._calculate_next_run(job.schedule)
        
        # Store job
        self._jobs[job.job_id] = job
        
        # If scheduler is running, add to APScheduler
        if self._running and self._scheduler:
            self._add_to_apscheduler(job)
        
        return job
    
    def remove_job(self, job_id: UUID) -> bool:
        """Remove a job from the scheduler.
        
        Args:
            job_id: ID of the job to remove
            
        Returns:
            True if job was removed
        """
        if job_id not in self._jobs:
            return False
        
        # Remove from APScheduler if running
        if self._running and self._scheduler:
            self._remove_from_apscheduler(job_id)
        
        del self._jobs[job_id]
        return True
    
    def get_job(self, job_id: UUID) -> Optional[RecurringJob]:
        """Get a job by ID.
        
        Args:
            job_id: ID of the job
            
        Returns:
            The job or None if not found
        """
        return self._jobs.get(job_id)
    
    def pause_job(self, job_id: UUID) -> bool:
        """Pause a job.
        
        Args:
            job_id: ID of the job to pause
            
        Returns:
            True if job was paused
        """
        job = self._jobs.get(job_id)
        if not job:
            return False
        
        job.enabled = False
        
        if self._running and self._scheduler:
            self._pause_in_apscheduler(job_id)
        
        return True
    
    def resume_job(self, job_id: UUID) -> bool:
        """Resume a paused job.
        
        Args:
            job_id: ID of the job to resume
            
        Returns:
            True if job was resumed
        """
        job = self._jobs.get(job_id)
        if not job:
            return False
        
        job.enabled = True
        job.next_run = self._calculate_next_run(job.schedule)
        
        if self._running and self._scheduler:
            self._resume_in_apscheduler(job_id)
        
        return True
    
    async def run_job_now(self, job_id: UUID) -> JobExecutionResult:
        """Run a job immediately (outside of schedule).
        
        Args:
            job_id: ID of the job to run
            
        Returns:
            Execution result
        """
        job = self._jobs.get(job_id)
        if not job:
            return JobExecutionResult(
                job_id=job_id,
                started_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                success=False,
                error="Job not found",
            )
        
        return await self._execute_job(job)
    
    async def start(self) -> None:
        """Start the scheduler.
        
        Initializes APScheduler and begins executing jobs
        according to their schedules.
        """
        if self._running:
            return
        
        # Initialize APScheduler
        # TODO: Implement actual APScheduler integration
        self._scheduler = await self._create_scheduler()
        
        # Add all enabled jobs
        for job in self.active_jobs:
            self._add_to_apscheduler(job)
        
        # Start scheduler
        if self._scheduler:
            # self._scheduler.start()
            pass
        
        self._running = True
    
    async def stop(self) -> None:
        """Stop the scheduler.
        
        Gracefully shuts down APScheduler and stops all jobs.
        """
        if not self._running:
            return
        
        # Shutdown APScheduler
        if self._scheduler:
            # self._scheduler.shutdown()
            pass
        
        self._scheduler = None
        self._running = False
    
    async def _create_scheduler(self) -> Any:
        """Create and configure APScheduler instance.
        
        TODO: Implement actual APScheduler setup.
        """
        # Placeholder - return None until APScheduler is integrated
        # Real implementation would use:
        # from apscheduler.schedulers.asyncio import AsyncIOScheduler
        # scheduler = AsyncIOScheduler()
        return None
    
    def _add_to_apscheduler(self, job: RecurringJob) -> None:
        """Add a job to APScheduler.
        
        TODO: Implement actual APScheduler job addition.
        """
        if not self._scheduler:
            return
        
        # Real implementation would use:
        # self._scheduler.add_job(
        #     self._job_callback,
        #     CronTrigger.from_crontab(job.schedule),
        #     id=str(job.job_id),
        #     args=[job.job_id],
        # )
        pass
    
    def _remove_from_apscheduler(self, job_id: UUID) -> None:
        """Remove a job from APScheduler."""
        if not self._scheduler:
            return
        
        # self._scheduler.remove_job(str(job_id))
        pass
    
    def _pause_in_apscheduler(self, job_id: UUID) -> None:
        """Pause a job in APScheduler."""
        if not self._scheduler:
            return
        
        # self._scheduler.pause_job(str(job_id))
        pass
    
    def _resume_in_apscheduler(self, job_id: UUID) -> None:
        """Resume a job in APScheduler."""
        if not self._scheduler:
            return
        
        # self._scheduler.resume_job(str(job_id))
        pass
    
    def _calculate_next_run(self, schedule: str) -> datetime:
        """Calculate next run time from cron expression.
        
        TODO: Implement actual cron parsing.
        """
        # Placeholder - return 1 hour from now
        from datetime import timedelta
        return datetime.utcnow() + timedelta(hours=1)
    
    async def _job_callback(self, job_id: UUID) -> None:
        """Callback invoked by APScheduler when job should run."""
        job = self._jobs.get(job_id)
        if not job or not job.enabled:
            return
        
        result = await self._execute_job(job)
        self._record_execution(result)
    
    async def _execute_job(self, job: RecurringJob) -> JobExecutionResult:
        """Execute a job.
        
        Args:
            job: The job to execute
            
        Returns:
            Execution result
        """
        from haven_cli.scheduler.job_executor import JobExecutor
        
        started_at = datetime.utcnow()
        
        try:
            # Create executor
            executor = JobExecutor(
                pipeline_manager=self._pipeline_manager,
                config=self._config,
            )
            
            # Execute job
            result = await executor.execute(job)
            
            # Update job stats
            job.last_run = started_at
            job.run_count += 1
            job.next_run = self._calculate_next_run(job.schedule)
            
            if not result.success:
                job.error_count += 1
            
            return result
            
        except Exception as e:
            job.error_count += 1
            
            return JobExecutionResult(
                job_id=job.job_id,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                success=False,
                error=str(e),
            )
    
    def _record_execution(self, result: JobExecutionResult) -> None:
        """Record execution result in history."""
        self._execution_history.append(result)
        
        # Trim history if needed
        if len(self._execution_history) > self._max_history:
            self._execution_history = self._execution_history[-self._max_history:]
    
    def get_history(
        self,
        job_id: Optional[UUID] = None,
        limit: int = 10,
    ) -> List[JobExecutionResult]:
        """Get execution history.
        
        Args:
            job_id: Filter by job ID (optional)
            limit: Maximum number of results
            
        Returns:
            List of execution results
        """
        history = self._execution_history
        
        if job_id:
            history = [r for r in history if r.job_id == job_id]
        
        return history[-limit:]
