# Task 04: Job State Persistence

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Implement persistence for job definitions and execution history so that jobs survive daemon restarts and history is queryable.

## Current State
- Jobs stored in memory only (lost on restart)
- Execution history stored in memory (limited to 1000 entries)
- No database integration for scheduler state

## Requirements

### 1. Job Definition Persistence
Store jobs in database:

```python
# In haven_cli/database/models.py

class ScheduledJob(Base):
    """Scheduled job definition."""
    
    __tablename__ = "scheduled_jobs"
    
    id = Column(Integer, primary_key=True)
    job_id = Column(String(36), unique=True, nullable=False, index=True)
    name = Column(String(255))
    plugin_name = Column(String(255), nullable=False)
    schedule = Column(String(100), nullable=False)  # Cron expression
    on_success = Column(String(50), default="archive_new")
    enabled = Column(Boolean, default=True)
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    run_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
```

### 2. Job Repository
Create repository for job CRUD:

```python
# In haven_cli/database/repositories.py

class JobRepository:
    """Repository for scheduled job persistence."""
    
    async def create(self, job: RecurringJob) -> ScheduledJob:
        """Create a new job in database."""
        db_job = ScheduledJob(
            job_id=str(job.job_id),
            name=job.name,
            plugin_name=job.plugin_name,
            schedule=job.schedule,
            on_success=job.on_success.value,
            enabled=job.enabled,
            metadata=job.metadata,
            next_run=job.next_run,
        )
        
        async with self._session() as session:
            session.add(db_job)
            await session.commit()
            return db_job
    
    async def get_all(self) -> List[RecurringJob]:
        """Get all jobs from database."""
        async with self._session() as session:
            result = await session.execute(select(ScheduledJob))
            db_jobs = result.scalars().all()
            
            return [self._to_recurring_job(j) for j in db_jobs]
    
    async def update(self, job_id: UUID, **kwargs) -> Optional[ScheduledJob]:
        """Update a job."""
        async with self._session() as session:
            result = await session.execute(
                select(ScheduledJob).where(ScheduledJob.job_id == str(job_id))
            )
            db_job = result.scalar_one_or_none()
            
            if db_job:
                for key, value in kwargs.items():
                    setattr(db_job, key, value)
                await session.commit()
            
            return db_job
    
    async def delete(self, job_id: UUID) -> bool:
        """Delete a job."""
        async with self._session() as session:
            result = await session.execute(
                delete(ScheduledJob).where(ScheduledJob.job_id == str(job_id))
            )
            await session.commit()
            return result.rowcount > 0
    
    def _to_recurring_job(self, db_job: ScheduledJob) -> RecurringJob:
        """Convert database model to RecurringJob."""
        return RecurringJob(
            job_id=UUID(db_job.job_id),
            name=db_job.name,
            plugin_name=db_job.plugin_name,
            schedule=db_job.schedule,
            on_success=OnSuccessAction(db_job.on_success),
            enabled=db_job.enabled,
            metadata=db_job.metadata or {},
            created_at=db_job.created_at,
            last_run=db_job.last_run,
            next_run=db_job.next_run,
            run_count=db_job.run_count,
            error_count=db_job.error_count,
        )
```

### 3. Execution History Persistence
Store execution results:

```python
# In haven_cli/database/models.py

class JobExecution(Base):
    """Job execution history record."""
    
    __tablename__ = "job_executions"
    
    id = Column(Integer, primary_key=True)
    job_id = Column(String(36), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime)
    success = Column(Boolean, default=False)
    sources_found = Column(Integer, default=0)
    sources_archived = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    
    # Foreign key to job (optional, allows orphaned history)
    scheduled_job_id = Column(Integer, ForeignKey("scheduled_jobs.id"), nullable=True)
```

### 4. Execution Repository
```python
class JobExecutionRepository:
    """Repository for job execution history."""
    
    async def create(self, result: JobExecutionResult) -> JobExecution:
        """Record a job execution."""
        execution = JobExecution(
            job_id=str(result.job_id),
            started_at=result.started_at,
            completed_at=result.completed_at,
            success=result.success,
            sources_found=result.sources_found,
            sources_archived=result.sources_archived,
            error=result.error,
        )
        
        async with self._session() as session:
            session.add(execution)
            await session.commit()
            return execution
    
    async def get_history(
        self,
        job_id: Optional[UUID] = None,
        limit: int = 10,
    ) -> List[JobExecutionResult]:
        """Get execution history."""
        async with self._session() as session:
            query = select(JobExecution).order_by(JobExecution.started_at.desc())
            
            if job_id:
                query = query.where(JobExecution.job_id == str(job_id))
            
            query = query.limit(limit)
            
            result = await session.execute(query)
            executions = result.scalars().all()
            
            return [self._to_result(e) for e in executions]
```

### 5. Scheduler Integration
Load jobs on startup, persist changes:

```python
# In haven_cli/scheduler/job_scheduler.py

class JobScheduler:
    def __init__(self, ...):
        ...
        self._job_repo = JobRepository()
        self._execution_repo = JobExecutionRepository()
    
    async def start(self) -> None:
        """Start scheduler and load persisted jobs."""
        # Load jobs from database
        persisted_jobs = await self._job_repo.get_all()
        for job in persisted_jobs:
            self._jobs[job.job_id] = job
        
        # Create APScheduler
        self._scheduler = await self._create_scheduler()
        
        # Add jobs to APScheduler
        for job in self.active_jobs:
            self._add_to_apscheduler(job)
        
        self._scheduler.start()
        self._running = True
    
    def add_job(self, job: RecurringJob) -> RecurringJob:
        """Add job and persist to database."""
        job.next_run = self._calculate_next_run(job.schedule)
        self._jobs[job.job_id] = job
        
        # Persist to database
        asyncio.create_task(self._job_repo.create(job))
        
        if self._running and self._scheduler:
            self._add_to_apscheduler(job)
        
        return job
    
    def remove_job(self, job_id: UUID) -> bool:
        """Remove job and delete from database."""
        if job_id not in self._jobs:
            return False
        
        if self._running and self._scheduler:
            self._remove_from_apscheduler(job_id)
        
        del self._jobs[job_id]
        
        # Delete from database
        asyncio.create_task(self._job_repo.delete(job_id))
        
        return True
    
    def _record_execution(self, result: JobExecutionResult) -> None:
        """Record execution in memory and database."""
        self._execution_history.append(result)
        
        # Persist to database
        asyncio.create_task(self._execution_repo.create(result))
        
        # Update job stats
        asyncio.create_task(self._job_repo.update(
            result.job_id,
            last_run=result.started_at,
            run_count=ScheduledJob.run_count + 1,
            error_count=ScheduledJob.error_count + (0 if result.success else 1),
        ))
```

### 6. State File Backup
JSON backup for quick recovery:

```python
async def save_state(self) -> None:
    """Save scheduler state to file."""
    state = {
        "jobs": [
            {
                "job_id": str(j.job_id),
                "name": j.name,
                "plugin_name": j.plugin_name,
                "schedule": j.schedule,
                "on_success": j.on_success.value,
                "enabled": j.enabled,
            }
            for j in self._jobs.values()
        ],
        "saved_at": datetime.utcnow().isoformat(),
    }
    
    state_file = self._config.get("state_file", Path("scheduler_state.json"))
    state_file.write_text(json.dumps(state, indent=2))
```

## Files to Create/Modify

### Create
- `haven_cli/database/models.py` - Add ScheduledJob, JobExecution models

### Modify
- `haven_cli/database/repositories.py` - Add JobRepository, JobExecutionRepository
- `haven_cli/scheduler/job_scheduler.py` - Integrate persistence

## Acceptance Criteria
- [ ] Jobs persisted to database
- [ ] Jobs loaded on daemon restart
- [ ] Execution history persisted
- [ ] History queryable via CLI
- [ ] Job stats (run_count, error_count) tracked
- [ ] State file backup works
- [ ] Database migrations for new tables

## Technical Notes
- Use async database operations
- Handle database connection errors gracefully
- Consider periodic state file backup
- Clean up old execution history (retention policy)

## Dependencies
- Sprint 1 Task 01: Database setup
- Task 01: APScheduler integration

## Blocking
- None (completes Sprint 4)
