"""Job executor for running scheduled jobs.

The JobExecutor handles the actual execution of a scheduled job,
including plugin discovery, archiving, and pipeline processing.
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from haven_cli.scheduler.job_scheduler import (
    JobExecutionResult,
    OnSuccessAction,
    RecurringJob,
)


@dataclass
class MediaSource:
    """A media source discovered by a plugin.
    
    Aligned with MediaSource type from HavenPlayer.p specification.
    
    Attributes:
        source_id: Unique identifier for the source
        media_type: Type of media (youtube, bittorrent, webrtc, etc.)
        uri: URI to the media source
        priority: Priority level (high, medium, low)
        metadata: Additional source metadata
    """
    
    source_id: str
    media_type: str
    uri: str
    priority: str = "medium"
    metadata: Dict[str, Any] = None
    
    def __post_init__(self) -> None:
        if self.metadata is None:
            self.metadata = {}


@dataclass
class ArchiveResult:
    """Result of archiving a media source.
    
    Aligned with ArchiveResult type from HavenPlayer.p specification.
    """
    
    success: bool
    output_path: str = ""
    file_size: int = 0
    duration: int = 0
    error: str = ""


class JobExecutor:
    """Executes scheduled jobs by coordinating plugins and pipeline.
    
    The JobExecutor is responsible for:
    1. Calling plugin.discover_sources() to find new media
    2. Filtering sources based on on_success action
    3. Calling plugin.archive() for each source
    4. Enqueuing archived content to the pipeline
    
    Example:
        executor = JobExecutor(pipeline_manager, config)
        result = await executor.execute(job)
    """
    
    def __init__(
        self,
        pipeline_manager: Optional[Any] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Initialize the job executor.
        
        Args:
            pipeline_manager: PipelineManager for processing archived content
            config: Executor configuration
        """
        self._pipeline_manager = pipeline_manager
        self._config = config or {}
        self._known_sources: Dict[str, set] = {}  # plugin_name -> set of source_ids
    
    async def execute(self, job: RecurringJob) -> JobExecutionResult:
        """Execute a scheduled job.
        
        Args:
            job: The job to execute
            
        Returns:
            Execution result with statistics
        """
        started_at = datetime.utcnow()
        sources_found = 0
        sources_archived = 0
        
        try:
            # Get the plugin
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
            sources = await self._discover_sources(plugin, job.plugin_name)
            sources_found = len(sources)
            
            if not sources:
                return JobExecutionResult(
                    job_id=job.job_id,
                    started_at=started_at,
                    completed_at=datetime.utcnow(),
                    success=True,
                    sources_found=0,
                    sources_archived=0,
                )
            
            # Filter sources based on on_success action
            sources_to_archive = self._filter_sources(
                sources,
                job.plugin_name,
                job.on_success,
            )
            
            # Archive sources
            if job.on_success != OnSuccessAction.LOG_ONLY:
                for source in sources_to_archive:
                    result = await self._archive_source(plugin, source)
                    
                    if result.success:
                        sources_archived += 1
                        
                        # Mark source as known
                        self._mark_source_known(job.plugin_name, source.source_id)
                        
                        # Enqueue to pipeline
                        await self._enqueue_to_pipeline(result.output_path, job)
            
            return JobExecutionResult(
                job_id=job.job_id,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                success=True,
                sources_found=sources_found,
                sources_archived=sources_archived,
            )
            
        except Exception as e:
            return JobExecutionResult(
                job_id=job.job_id,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                success=False,
                sources_found=sources_found,
                sources_archived=sources_archived,
                error=str(e),
            )
    
    async def _get_plugin(self, plugin_name: str) -> Optional[Any]:
        """Get a plugin instance by name.
        
        TODO: Implement actual plugin loading via PluginManager.
        """
        from haven_cli.plugins.manager import PluginManager
        
        # Placeholder - return None until plugin system is implemented
        return None
    
    async def _discover_sources(
        self,
        plugin: Any,
        plugin_name: str,
    ) -> List[MediaSource]:
        """Call plugin's discover_sources method.
        
        TODO: Implement actual plugin discovery call.
        """
        # Placeholder - return empty list
        # Real implementation would call:
        # sources = await plugin.discover_sources()
        return []
    
    def _filter_sources(
        self,
        sources: List[MediaSource],
        plugin_name: str,
        action: OnSuccessAction,
    ) -> List[MediaSource]:
        """Filter sources based on on_success action.
        
        Args:
            sources: All discovered sources
            plugin_name: Name of the plugin
            action: Action determining which sources to archive
            
        Returns:
            Filtered list of sources to archive
        """
        if action == OnSuccessAction.LOG_ONLY:
            return []
        
        if action == OnSuccessAction.ARCHIVE_ALL:
            return sources
        
        if action == OnSuccessAction.ARCHIVE_NEW:
            # Filter to only new sources
            known = self._known_sources.get(plugin_name, set())
            return [s for s in sources if s.source_id not in known]
        
        return sources
    
    def _mark_source_known(self, plugin_name: str, source_id: str) -> None:
        """Mark a source as known (already archived)."""
        if plugin_name not in self._known_sources:
            self._known_sources[plugin_name] = set()
        self._known_sources[plugin_name].add(source_id)
    
    async def _archive_source(
        self,
        plugin: Any,
        source: MediaSource,
    ) -> ArchiveResult:
        """Archive a media source using the plugin.
        
        TODO: Implement actual plugin archive call.
        """
        # Placeholder - return failed result
        # Real implementation would call:
        # result = await plugin.archive(source)
        return ArchiveResult(
            success=False,
            error="Archive not implemented",
        )
    
    async def _enqueue_to_pipeline(
        self,
        output_path: str,
        job: RecurringJob,
    ) -> None:
        """Enqueue archived content to the pipeline for processing.
        
        Args:
            output_path: Path to the archived file
            job: The job that triggered the archive
        """
        if not self._pipeline_manager:
            return
        
        from haven_cli.pipeline.context import PipelineContext
        
        # Create pipeline context
        context = PipelineContext(
            source_path=Path(output_path),
            options={
                "job_id": str(job.job_id),
                "plugin_name": job.plugin_name,
                **job.metadata,
            },
        )
        
        # Process through pipeline
        # This runs asynchronously - we don't wait for completion
        # The pipeline manager handles parallel execution
        await self._pipeline_manager.process(context)


class BatchJobExecutor:
    """Executes multiple jobs in parallel with concurrency control.
    
    Useful for running multiple jobs simultaneously while
    respecting resource limits.
    """
    
    def __init__(
        self,
        pipeline_manager: Optional[Any] = None,
        config: Optional[Dict[str, Any]] = None,
        max_concurrent: int = 4,
    ) -> None:
        """Initialize the batch executor.
        
        Args:
            pipeline_manager: PipelineManager for processing
            config: Executor configuration
            max_concurrent: Maximum concurrent job executions
        """
        self._pipeline_manager = pipeline_manager
        self._config = config or {}
        self._max_concurrent = max_concurrent
    
    async def execute_batch(
        self,
        jobs: List[RecurringJob],
    ) -> List[JobExecutionResult]:
        """Execute multiple jobs with concurrency control.
        
        Args:
            jobs: List of jobs to execute
            
        Returns:
            List of execution results
        """
        import asyncio
        
        semaphore = asyncio.Semaphore(self._max_concurrent)
        
        async def execute_with_semaphore(job: RecurringJob) -> JobExecutionResult:
            async with semaphore:
                executor = JobExecutor(
                    pipeline_manager=self._pipeline_manager,
                    config=self._config,
                )
                return await executor.execute(job)
        
        results = await asyncio.gather(
            *[execute_with_semaphore(job) for job in jobs],
            return_exceptions=True,
        )
        
        # Convert exceptions to failed results
        processed_results: List[JobExecutionResult] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append(JobExecutionResult(
                    job_id=jobs[i].job_id,
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                    success=False,
                    error=str(result),
                ))
            else:
                processed_results.append(result)
        
        return processed_results
