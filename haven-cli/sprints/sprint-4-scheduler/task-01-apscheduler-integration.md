# Task 01: APScheduler Integration

## Assignee
Backend Developer

## Priority
Critical

## Estimated Effort
3 days

## Description
Integrate APScheduler for cron-based job scheduling. This provides the foundation for recurring automated jobs.

## Current State
- `haven_cli/scheduler/job_scheduler.py` has placeholder implementations:
  - `_create_scheduler()` - Returns None
  - `_add_to_apscheduler()` - No-op
  - `_remove_from_apscheduler()` - No-op
  - `_pause_in_apscheduler()` - No-op
  - `_resume_in_apscheduler()` - No-op
  - `_calculate_next_run()` - Returns 1 hour from now

## Requirements

### 1. Install APScheduler
```bash
pip install apscheduler
```

### 2. Initialize APScheduler
Replace placeholder with real implementation:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor

async def _create_scheduler(self) -> AsyncIOScheduler:
    """Create and configure APScheduler instance."""
    
    jobstores = {
        'default': MemoryJobStore()
    }
    
    executors = {
        'default': AsyncIOExecutor()
    }
    
    job_defaults = {
        'coalesce': True,  # Combine missed runs
        'max_instances': 1,  # One instance per job
        'misfire_grace_time': 60 * 5,  # 5 minutes grace
    }
    
    scheduler = AsyncIOScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
        timezone='UTC',
    )
    
    return scheduler
```

### 3. Add Jobs to APScheduler
Implement job registration:

```python
def _add_to_apscheduler(self, job: RecurringJob) -> None:
    """Add a job to APScheduler."""
    if not self._scheduler:
        return
    
    trigger = CronTrigger.from_crontab(job.schedule)
    
    self._scheduler.add_job(
        self._job_callback,
        trigger=trigger,
        id=str(job.job_id),
        name=job.name or f"Job {job.job_id}",
        args=[job.job_id],
        replace_existing=True,
    )
    
    # Update next run time
    apscheduler_job = self._scheduler.get_job(str(job.job_id))
    if apscheduler_job:
        job.next_run = apscheduler_job.next_run_time
```

### 4. Job Lifecycle Management
Implement pause/resume/remove:

```python
def _remove_from_apscheduler(self, job_id: UUID) -> None:
    """Remove a job from APScheduler."""
    if not self._scheduler:
        return
    
    try:
        self._scheduler.remove_job(str(job_id))
    except JobLookupError:
        pass

def _pause_in_apscheduler(self, job_id: UUID) -> None:
    """Pause a job in APScheduler."""
    if not self._scheduler:
        return
    
    try:
        self._scheduler.pause_job(str(job_id))
    except JobLookupError:
        pass

def _resume_in_apscheduler(self, job_id: UUID) -> None:
    """Resume a job in APScheduler."""
    if not self._scheduler:
        return
    
    try:
        self._scheduler.resume_job(str(job_id))
    except JobLookupError:
        pass
```

### 5. Cron Expression Parsing
Implement proper next run calculation:

```python
def _calculate_next_run(self, schedule: str) -> datetime:
    """Calculate next run time from cron expression."""
    from croniter import croniter
    
    cron = croniter(schedule, datetime.utcnow())
    return cron.get_next(datetime)
```

### 6. Scheduler Lifecycle
Implement start/stop:

```python
async def start(self) -> None:
    """Start the scheduler."""
    if self._running:
        return
    
    self._scheduler = await self._create_scheduler()
    
    # Add all enabled jobs
    for job in self.active_jobs:
        self._add_to_apscheduler(job)
    
    # Start the scheduler
    self._scheduler.start()
    self._running = True
    
    logger.info(f"Scheduler started with {len(self.active_jobs)} jobs")

async def stop(self) -> None:
    """Stop the scheduler."""
    if not self._running:
        return
    
    if self._scheduler:
        self._scheduler.shutdown(wait=True)
        self._scheduler = None
    
    self._running = False
    logger.info("Scheduler stopped")
```

### 7. Event Listeners
Add scheduler event handling:

```python
def _setup_listeners(self) -> None:
    """Set up APScheduler event listeners."""
    from apscheduler.events import (
        EVENT_JOB_EXECUTED, 
        EVENT_JOB_ERROR,
        EVENT_JOB_MISSED,
    )
    
    def on_job_executed(event):
        logger.info(f"Job {event.job_id} executed successfully")
    
    def on_job_error(event):
        logger.error(f"Job {event.job_id} failed: {event.exception}")
    
    def on_job_missed(event):
        logger.warning(f"Job {event.job_id} missed scheduled run")
    
    self._scheduler.add_listener(on_job_executed, EVENT_JOB_EXECUTED)
    self._scheduler.add_listener(on_job_error, EVENT_JOB_ERROR)
    self._scheduler.add_listener(on_job_missed, EVENT_JOB_MISSED)
```

## Files to Modify

### Modify
- `haven_cli/scheduler/job_scheduler.py` - Complete APScheduler integration
- `pyproject.toml` - Add apscheduler, croniter dependencies

## Acceptance Criteria
- [ ] APScheduler initializes correctly
- [ ] Jobs added with cron triggers
- [ ] Jobs execute at scheduled times
- [ ] Pause/resume works
- [ ] Job removal works
- [ ] Next run times calculated correctly
- [ ] Event listeners log job activity
- [ ] Unit tests with mocked time

## Technical Notes
- Use AsyncIOScheduler for async compatibility
- Consider SQLAlchemy jobstore for persistence (Task 04)
- Handle timezone correctly (UTC recommended)
- Cron expressions should be validated

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app backend has a **complete, production-tested APScheduler implementation**:

#### Source Files to Reference:
1. **`backend/app/services/job_scheduler.py`** - Complete JobScheduler (~600 lines)
   - APScheduler with SQLAlchemy jobstore
   - Cron trigger parsing (5 and 6-part formats)
   - Job lifecycle (create, delete, pause, resume, run_now)
   - Plugin integration for job execution
   - **Reuse Level: 90%** - Nearly direct port

2. **`backend/app/models/recurring_job.py`** - RecurringJob model
   - Complete job model with all fields
   - Statistics tracking (total_runs, successful_runs, failed_runs)
   - **Reuse Level: 95%** - Direct port

#### Key Code to Port:

```python
# From backend/app/services/job_scheduler.py - Scheduler setup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

class JobScheduler:
    def __init__(self, plugin_manager: PluginManager, db_url: str):
        jobstore = SQLAlchemyJobStore(url=db_url, tablename='apscheduler_jobs')
        self.scheduler = AsyncIOScheduler(
            jobstores={'default': jobstore},
            timezone='UTC'
        )

    async def schedule_job(self, job: RecurringJob) -> None:
        parts = job.schedule.split()
        if len(parts) == 6:
            second, minute, hour, day, month, weekday = parts
        elif len(parts) == 5:
            minute, hour, day, month, weekday = parts
            second = None
        
        trigger = CronTrigger(
            minute=minute, hour=hour, day=day,
            month=month, day_of_week=weekday,
            second=second, timezone='UTC'
        )
        
        self.scheduler.add_job(
            func=_execute_job_wrapper,  # Module-level function
            trigger=trigger,
            args=[job.id],
            id=f"job_{job.id}",
            replace_existing=True,
            max_instances=1
        )
```

```python
# From backend/app/services/job_scheduler.py - Job execution wrapper
_global_scheduler: Optional['JobScheduler'] = None

def _execute_job_wrapper(job_id: int) -> None:
    """Module-level wrapper to avoid pickling issues."""
    global _global_scheduler
    if _global_scheduler is None:
        return
    loop = asyncio.get_event_loop()
    loop.run_until_complete(_global_scheduler._execute_job(job_id))
```

### Implementation Strategy
1. **Copy** `backend/app/services/job_scheduler.py` → `haven_cli/scheduler/job_scheduler.py`
2. **Copy** `backend/app/models/recurring_job.py` → `haven_cli/database/models.py`
3. **Adapt** plugin_manager references for CLI plugin system
4. **Remove** upload_coordinator integration (CLI uses pipeline instead)

### What's NOT Reusable
- UploadCoordinator integration (CLI uses different approach)
- FastAPI-specific patterns

### What's NEW for CLI
- CLI-specific job execution (uses pipeline instead of upload coordinator)

## Dependencies
None

## Blocking
- Task 02: Job CLI commands
- Task 03: Job executor
