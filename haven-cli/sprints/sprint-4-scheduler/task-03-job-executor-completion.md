# Task 03: Job Executor Implementation

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
3 days

## Description
Complete the job executor to integrate with plugins for content discovery and archival, then enqueue results to the pipeline.

## Current State
- `haven_cli/scheduler/job_executor.py` has placeholder implementations:
  - `_get_plugin()` - Returns None
  - `_discover_sources()` - Returns empty list
  - `_archive_source()` - Returns failed result

## Requirements

### 1. Plugin Integration
Get plugin from manager:

```python
async def _get_plugin(self, plugin_name: str) -> Optional[ArchiverPlugin]:
    """Get a plugin instance by name."""
    from haven_cli.plugins.manager import get_plugin_manager
    
    manager = get_plugin_manager()
    
    plugin = manager.get_plugin(plugin_name)
    if not plugin:
        # Try to load from registry
        from haven_cli.plugins.registry import get_registry
        registry = get_registry()
        plugin_class = registry.load(plugin_name)
        if plugin_class:
            manager.register(plugin_class)
            plugin = manager.get_plugin(plugin_name)
    
    if plugin and not plugin._initialized:
        await plugin.initialize()
    
    return plugin
```

### 2. Source Discovery
Call plugin's discover_sources:

```python
async def _discover_sources(
    self,
    plugin: ArchiverPlugin,
    plugin_name: str,
) -> List[MediaSource]:
    """Call plugin's discover_sources method."""
    
    # Check plugin health first
    if not await plugin.health_check():
        raise RuntimeError(f"Plugin {plugin_name} health check failed")
    
    # Discover sources
    sources = await plugin.discover_sources()
    
    # Convert to our MediaSource type if needed
    return [
        MediaSource(
            source_id=s.source_id,
            media_type=s.media_type,
            uri=s.uri,
            priority=s.priority,
            metadata=s.metadata,
        )
        for s in sources
    ]
```

### 3. Archive Sources
Call plugin's archive method:

```python
async def _archive_source(
    self,
    plugin: ArchiverPlugin,
    source: MediaSource,
) -> ArchiveResult:
    """Archive a media source using the plugin."""
    
    try:
        result = await plugin.archive(source)
        
        return ArchiveResult(
            success=result.success,
            output_path=result.output_path,
            file_size=result.file_size,
            duration=result.duration,
            error=result.error,
            metadata=result.metadata,
        )
        
    except Exception as e:
        return ArchiveResult(
            success=False,
            error=str(e),
        )
```

### 4. Known Source Tracking
Persist known sources for "archive_new" action:

```python
class SourceTracker:
    """Track known sources for deduplication."""
    
    def __init__(self, data_dir: Path):
        self._data_dir = data_dir
        self._cache: Dict[str, Set[str]] = {}
    
    def load(self, plugin_name: str) -> Set[str]:
        """Load known sources for a plugin."""
        if plugin_name in self._cache:
            return self._cache[plugin_name]
        
        cache_file = self._data_dir / f"{plugin_name}_sources.json"
        if cache_file.exists():
            data = json.loads(cache_file.read_text())
            self._cache[plugin_name] = set(data.get("sources", []))
        else:
            self._cache[plugin_name] = set()
        
        return self._cache[plugin_name]
    
    def add(self, plugin_name: str, source_id: str) -> None:
        """Mark a source as known."""
        known = self.load(plugin_name)
        known.add(source_id)
        self._save(plugin_name)
    
    def _save(self, plugin_name: str) -> None:
        """Save known sources to disk."""
        cache_file = self._data_dir / f"{plugin_name}_sources.json"
        cache_file.write_text(json.dumps({
            "sources": list(self._cache.get(plugin_name, [])),
            "updated_at": datetime.utcnow().isoformat(),
        }))
```

### 5. Pipeline Enqueueing
Process archived content through pipeline:

```python
async def _enqueue_to_pipeline(
    self,
    output_path: str,
    job: RecurringJob,
    source: MediaSource,
) -> None:
    """Enqueue archived content to the pipeline."""
    if not self._pipeline_manager:
        logger.warning("No pipeline manager configured")
        return
    
    from haven_cli.pipeline.context import PipelineContext
    
    # Create pipeline context with source metadata
    context = PipelineContext(
        source_path=Path(output_path),
        options={
            "job_id": str(job.job_id),
            "plugin_name": job.plugin_name,
            "source_id": source.source_id,
            "source_uri": source.uri,
            **source.metadata,
            **job.metadata,
        },
    )
    
    # Process async - don't wait for completion
    asyncio.create_task(
        self._process_with_logging(context, job.job_id)
    )

async def _process_with_logging(
    self,
    context: PipelineContext,
    job_id: UUID,
) -> None:
    """Process pipeline with error logging."""
    try:
        result = await self._pipeline_manager.process(context)
        if result.success:
            logger.info(f"Pipeline completed for {context.source_path}")
        else:
            logger.error(f"Pipeline failed: {result.error}")
    except Exception as e:
        logger.error(f"Pipeline error for job {job_id}: {e}")
```

### 6. Enhanced Execute Method
Complete main execution logic:

```python
async def execute(self, job: RecurringJob) -> JobExecutionResult:
    """Execute a scheduled job."""
    started_at = datetime.utcnow()
    sources_found = 0
    sources_archived = 0
    
    try:
        # Get plugin
        plugin = await self._get_plugin(job.plugin_name)
        if not plugin:
            return JobExecutionResult(
                job_id=job.job_id,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                success=False,
                error=f"Plugin not found: {job.plugin_name}",
            )
        
        # Discover sources
        logger.info(f"Discovering sources with {job.plugin_name}")
        sources = await self._discover_sources(plugin, job.plugin_name)
        sources_found = len(sources)
        
        logger.info(f"Found {sources_found} sources")
        
        if not sources:
            return JobExecutionResult(
                job_id=job.job_id,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                success=True,
                sources_found=0,
                sources_archived=0,
            )
        
        # Filter based on on_success action
        sources_to_archive = self._filter_sources(
            sources, job.plugin_name, job.on_success
        )
        
        logger.info(f"Archiving {len(sources_to_archive)} sources")
        
        # Archive sources
        if job.on_success != OnSuccessAction.LOG_ONLY:
            for source in sources_to_archive:
                result = await self._archive_source(plugin, source)
                
                if result.success:
                    sources_archived += 1
                    self._mark_source_known(job.plugin_name, source.source_id)
                    await self._enqueue_to_pipeline(
                        result.output_path, job, source
                    )
                else:
                    logger.warning(f"Failed to archive {source.source_id}: {result.error}")
        
        # Save execution to database
        await self._save_execution(JobExecutionResult(
            job_id=job.job_id,
            started_at=started_at,
            completed_at=datetime.utcnow(),
            success=True,
            sources_found=sources_found,
            sources_archived=sources_archived,
        ))
        
        return JobExecutionResult(
            job_id=job.job_id,
            started_at=started_at,
            completed_at=datetime.utcnow(),
            success=True,
            sources_found=sources_found,
            sources_archived=sources_archived,
        )
        
    except Exception as e:
        logger.error(f"Job execution failed: {e}")
        return JobExecutionResult(
            job_id=job.job_id,
            started_at=started_at,
            completed_at=datetime.utcnow(),
            success=False,
            sources_found=sources_found,
            sources_archived=sources_archived,
            error=str(e),
        )
```

## Files to Modify

### Modify
- `haven_cli/scheduler/job_executor.py` - Complete implementation

### Create
- `haven_cli/scheduler/source_tracker.py` - Known source persistence

## Acceptance Criteria
- [ ] Can load and initialize plugins
- [ ] discover_sources() called successfully
- [ ] Sources archived via plugin
- [ ] Known sources persisted for "archive_new"
- [ ] Archived content enqueued to pipeline
- [ ] Execution results saved to database
- [ ] Errors logged and handled
- [ ] Unit tests with mocked plugins

## Technical Notes
- Handle plugin initialization errors
- Consider concurrent archiving with semaphore
- Log progress for long-running jobs
- Clean up temp files on failure

## Dependencies
- Task 01: APScheduler integration
- Sprint 3: Pipeline (for enqueueing)
- Sprint 5: Plugins (for actual plugin implementations)

## Blocking
- None
