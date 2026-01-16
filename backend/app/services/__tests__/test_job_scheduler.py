"""
Unit tests for the job scheduler service.
"""

import pytest
from unittest.mock import Mock, AsyncMock, MagicMock, patch
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services.job_scheduler import JobScheduler
from app.models.recurring_job import RecurringJob
from app.models.database import Base


@pytest.fixture
def in_memory_db():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    yield Session
    Base.metadata.drop_all(engine)


@pytest.fixture
def job_scheduler():
    """Create a job scheduler instance with a mock plugin manager."""
    from app.services.job_scheduler import JobScheduler

    mock_plugin_manager = Mock()
    # Clear the global _global_scheduler to avoid test interference
    import app.services.job_scheduler as job_scheduler_module
    job_scheduler_module._global_scheduler = None

    scheduler = JobScheduler(mock_plugin_manager)
    return scheduler


class TestJobSchedulerDeleteJobsForPlugin:
    """Test cases for delete_jobs_for_plugin method."""

    @pytest.mark.asyncio
    async def test_delete_jobs_for_plugin_with_multiple_jobs(self, job_scheduler, in_memory_db):
        """Test deleting multiple jobs for a plugin."""
        # Set up the scheduler to use our in-memory database
        job_scheduler.db_url = "sqlite:///:memory:"

        # Create jobs in the database
        Session = in_memory_db
        db = Session()
        try:
            job1 = RecurringJob(
                plugin_name="TestPlugin",
                job_name="job1",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True
            )
            job2 = RecurringJob(
                plugin_name="TestPlugin",
                job_name="job2",
                schedule="30 * * * *",
                method="discover_sources",
                enabled=True
            )
            job3 = RecurringJob(
                plugin_name="OtherPlugin",
                job_name="job3",
                schedule="0 0 * * *",
                method="discover_sources",
                enabled=True
            )
            db.add_all([job1, job2, job3])
            db.commit()

            # Verify jobs exist
            jobs_before = db.query(RecurringJob).filter(
                RecurringJob.plugin_name == "TestPlugin"
            ).count()
            assert jobs_before == 2

        finally:
            db.close()

        # Delete jobs for TestPlugin
        deleted_count = await job_scheduler.delete_jobs_for_plugin("TestPlugin")

        # Verify deletion
        db = Session()
        try:
            jobs_after = db.query(RecurringJob).filter(
                RecurringJob.plugin_name == "TestPlugin"
            ).count()
            assert jobs_after == 0
            assert deleted_count == 2

            # Verify other plugin's jobs weren't deleted
            other_jobs = db.query(RecurringJob).filter(
                RecurringJob.plugin_name == "OtherPlugin"
            ).count()
            assert other_jobs == 1
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_delete_jobs_for_plugin_no_jobs(self, job_scheduler, in_memory_db):
        """Test deleting jobs when plugin has no jobs."""
        job_scheduler.db_url = "sqlite:///:memory:"

        deleted_count = await job_scheduler.delete_jobs_for_plugin("NonExistentPlugin")
        assert deleted_count == 0

    @pytest.mark.asyncio
    async def test_delete_jobs_for_plugin_deletes_from_scheduler(self, job_scheduler, in_memory_db):
        """Test that jobs are removed from APScheduler."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock the scheduler to track job removals
        mock_scheduler = Mock(spec=AsyncIOScheduler)
        mock_scheduler.get_job = Mock(return_value=True)
        mock_scheduler.remove_job = Mock()
        job_scheduler.scheduler = mock_scheduler

        # Create a job in the database
        Session = in_memory_db
        db = Session()
        try:
            job = RecurringJob(
                plugin_name="TestPlugin",
                job_name="test_job",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True
            )
            db.add(job)
            db.commit()

            # Get the job ID
            job_id = job.id
        finally:
            db.close()

        # Delete the job
        deleted_count = await job_scheduler.delete_jobs_for_plugin("TestPlugin")

        # Verify it was removed from scheduler
        assert deleted_count == 1
        mock_scheduler.remove_job.assert_called_once_with(f"job_{job_id}")

    @pytest.mark.asyncio
    async def test_delete_jobs_for_plugin_handles_db_error(self, job_scheduler, in_memory_db):
        """Test that database errors are handled gracefully."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock the database session to raise an error
        with patch('app.services.job_scheduler.SessionLocal') as mock_session:
            mock_db = Mock()
            mock_db.query.return_value.filter.return_value.all = Mock(side_effect=Exception("DB error"))
            mock_db.rollback = Mock()
            mock_session.return_value = mock_db

            deleted_count = await job_scheduler.delete_jobs_for_plugin("TestPlugin")
            assert deleted_count == 0

    @pytest.mark.asyncio
    async def test_delete_jobs_for_plugin_partial_deletion(self, job_scheduler, in_memory_db):
        """Test that partial deletion continues and returns count of successfully deleted jobs."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock the scheduler to fail on the second job
        mock_scheduler = Mock(spec=AsyncIOScheduler)
        mock_scheduler.get_job = Mock(side_effect=[True, Exception("Scheduler error")])
        mock_scheduler.remove_job = Mock()
        job_scheduler.scheduler = mock_scheduler

        # Create jobs in the database
        Session = in_memory_db
        db = Session()
        try:
            job1 = RecurringJob(
                plugin_name="TestPlugin",
                job_name="job1",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True
            )
            job2 = RecurringJob(
                plugin_name="TestPlugin",
                job_name="job2",
                schedule="30 * * * *",
                method="discover_sources",
                enabled=True
            )
            db.add_all([job1, job2])
            db.commit()
        finally:
            db.close()

        # Delete jobs - should handle the error and delete successfully
        deleted_count = await job_scheduler.delete_jobs_for_plugin("TestPlugin")

        # Should still have deleted at least one job
        assert deleted_count >= 1


class TestJobSchedulerPluginAvailability:
    """Test cases for job scheduling with unloaded plugins."""

    @pytest.mark.asyncio
    async def test_load_jobs_from_db_skips_unloaded_plugins(self, job_scheduler, in_memory_db):
        """Test that jobs for unloaded plugins are skipped when loading from database."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock plugin manager to return None for unloaded plugin
        mock_plugin_manager = Mock()
        mock_plugin_manager.get_plugin = Mock(side_effect=lambda name: None if name == "UnloadedPlugin" else Mock())
        job_scheduler.plugin_manager = mock_plugin_manager

        # Mock scheduler to track scheduled jobs
        mock_scheduler = Mock(spec=AsyncIOScheduler)
        mock_scheduler.add_job = Mock()
        job_scheduler.scheduler = mock_scheduler

        # Create jobs in the database
        Session = in_memory_db
        db = Session()
        try:
            loaded_job = RecurringJob(
                plugin_name="LoadedPlugin",
                job_name="loaded_job",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True
            )
            unloaded_job = RecurringJob(
                plugin_name="UnloadedPlugin",
                job_name="unloaded_job",
                schedule="30 * * * *",
                method="discover_sources",
                enabled=True
            )
            db.add_all([loaded_job, unloaded_job])
            db.commit()
        finally:
            db.close()

        # Load jobs from database
        await job_scheduler._load_jobs_from_db()

        # Verify only the loaded plugin's job was scheduled
        assert mock_scheduler.add_job.call_count == 1
        # Verify the scheduled job is for LoadedPlugin
        call_args = mock_scheduler.add_job.call_args
        assert call_args[1]["name"] == "LoadedPlugin:loaded_job"

    @pytest.mark.asyncio
    async def test_load_jobs_from_db_schedules_loaded_plugins(self, job_scheduler, in_memory_db):
        """Test that jobs for loaded plugins are scheduled correctly."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock plugin manager to return plugin for loaded plugin
        mock_plugin = Mock()
        mock_plugin_manager = Mock()
        mock_plugin_manager.get_plugin = Mock(return_value=mock_plugin)
        job_scheduler.plugin_manager = mock_plugin_manager

        # Mock scheduler to track scheduled jobs
        mock_scheduler = Mock(spec=AsyncIOScheduler)
        mock_scheduler.add_job = Mock()
        job_scheduler.scheduler = mock_scheduler

        # Create job in the database
        Session = in_memory_db
        db = Session()
        try:
            job = RecurringJob(
                plugin_name="LoadedPlugin",
                job_name="test_job",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True
            )
            db.add(job)
            db.commit()
        finally:
            db.close()

        # Load jobs from database
        await job_scheduler._load_jobs_from_db()

        # Verify job was scheduled
        assert mock_scheduler.add_job.call_count == 1
        call_args = mock_scheduler.add_job.call_args
        assert call_args[1]["name"] == "LoadedPlugin:test_job"

    @pytest.mark.asyncio
    async def test_execute_job_skips_when_plugin_not_loaded(self, job_scheduler, in_memory_db):
        """Test that job execution is skipped when plugin is not loaded."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock plugin manager to return None (plugin not loaded)
        mock_plugin_manager = Mock()
        mock_plugin_manager.get_plugin = Mock(return_value=None)
        job_scheduler.plugin_manager = mock_plugin_manager

        # Create job in the database
        Session = in_memory_db
        db = Session()
        try:
            job = RecurringJob(
                plugin_name="UnloadedPlugin",
                job_name="test_job",
                schedule="0 * * * *",
                method="discover_sources",
                enabled=True,
                total_runs=0
            )
            db.add(job)
            db.commit()
            job_id = job.id
        finally:
            db.close()

        # Execute the job
        await job_scheduler._execute_job(job_id)

        # Verify job status was not updated (no execution occurred)
        db = Session()
        try:
            job_after = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            assert job_after.total_runs == 0
            assert job_after.is_running is False
        finally:
            db.close()

    @pytest.mark.asyncio
    async def test_execute_job_runs_when_plugin_loaded(self, job_scheduler, in_memory_db):
        """Test that job execution proceeds when plugin is loaded."""
        job_scheduler.db_url = "sqlite:///:memory:"

        # Mock plugin with discover_sources method
        mock_plugin = Mock()
        mock_plugin.discover_sources = AsyncMock(return_value=[])
        mock_plugin_manager = Mock()
        mock_plugin_manager.get_plugin = Mock(return_value=mock_plugin)
        job_scheduler.plugin_manager = mock_plugin_manager

        # Create job in the database
        Session = in_memory_db
        db = Session()
        try:
            job = RecurringJob(
                plugin_name="LoadedPlugin",
                job_name="test_job",
                schedule="0 * * * *",
                method="discover_sources",
                on_success="log_only",
                enabled=True,
                total_runs=0
            )
            db.add(job)
            db.commit()
            job_id = job.id
        finally:
            db.close()

        # Execute the job
        await job_scheduler._execute_job(job_id)

        # Verify job was executed
        db = Session()
        try:
            job_after = db.query(RecurringJob).filter(RecurringJob.id == job_id).first()
            assert job_after.total_runs == 1
            assert job_after.is_running is False
            assert job_after.last_run_at is not None
        finally:
            db.close()

        # Verify plugin method was called
        mock_plugin.discover_sources.assert_called_once()
