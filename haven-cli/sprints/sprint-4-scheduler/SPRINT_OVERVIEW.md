# Sprint 4: Scheduler & Job System

## Sprint Goal
Complete the job scheduler system for automated plugin-based content discovery and archival. This enables recurring jobs that find and archive new content automatically.

## Duration
2 weeks

## Dependencies
- Sprint 1: Database (job history storage)
- Sprint 3: Pipeline (for processing archived content)

## Sprint Deliverables
1. APScheduler integration for cron-based scheduling
2. Job CRUD operations via CLI
3. Job execution with plugin integration
4. Job history and monitoring
5. State persistence across restarts

## Definition of Done
- Jobs can be created with cron schedules
- Jobs execute plugins at scheduled times
- Archived content flows to pipeline
- Job history persisted and queryable
- State survives daemon restarts
- CLI commands fully functional
- Integration tests passing
- Code reviewed and merged to main branch

## Tasks in This Sprint
1. `task-01-apscheduler-integration.md` - APScheduler Integration (Backend Dev)
2. `task-02-job-crud-commands.md` - Job CLI Commands (Backend Dev)
3. `task-03-job-executor-completion.md` - Job Executor Implementation (Backend Dev)
4. `task-04-job-persistence.md` - Job State Persistence (Backend Dev)
