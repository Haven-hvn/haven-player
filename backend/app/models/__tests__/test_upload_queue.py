"""
Unit tests for UploadQueue model.

Tests all methods and properties of the UploadQueue model to ensure
correct behavior for upload queue management.
"""
import pytest
from datetime import datetime, timezone, timedelta
from app.models.upload_queue import UploadQueue
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def db_session():
    """Create a test database session."""
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_upload_queue_creation(db_session):
    """Test creating a new UploadQueue entry."""
    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        status='pending',
        priority=1,
        source='plugin',
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.id is not None
    assert entry.video_path == '/path/to/video.mp4'
    assert entry.status == 'pending'
    assert entry.priority == 1
    assert entry.source == 'plugin'
    assert entry.created_at is not None
    assert entry.attempts == 0
    assert entry.max_attempts == 3


def test_upload_queue_default_values(db_session):
    """Test that default values are set correctly."""
    entry = UploadQueue(video_path='/path/to/video.mp4')
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.status == 'pending'
    assert entry.priority == 0
    assert entry.attempts == 0
    assert entry.max_attempts == 3
    assert entry.source == 'plugin'


def test_upload_queue_to_dict(db_session):
    """Test converting UploadQueue to dictionary."""
    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        status='processing',
        priority=2,
        source='manual',
        error_message='Test error'
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    result = entry.to_dict()
    assert isinstance(result, dict)
    assert result['video_path'] == '/path/to/video.mp4'
    assert result['status'] == 'processing'
    assert result['priority'] == 2
    assert result['source'] == 'manual'
    assert result['error_message'] == 'Test error'
    assert 'created_at' in result


def test_can_retry(db_session):
    """Test the can_retry method."""
    # Entry with attempts less than max_attempts should be retryable
    entry1 = UploadQueue(
        video_path='/path/to/video1.mp4',
        attempts=2,
        max_attempts=3
    )
    db_session.add(entry1)
    db_session.commit()

    assert entry1.can_retry() is True

    # Entry with attempts equal to max_attempts should not be retryable
    entry2 = UploadQueue(
        video_path='/path/to/video2.mp4',
        attempts=3,
        max_attempts=3
    )
    db_session.add(entry2)

    # Entry with attempts greater than max_attempts should not be retryable
    entry3 = UploadQueue(
        video_path='/path/to/video3.mp4',
        attempts=4,
        max_attempts=3
    )
    db_session.add(entry3)
    db_session.commit()

    assert entry2.can_retry() is False
    assert entry3.can_retry() is False


def test_is_pending(db_session):
    """Test the is_pending method."""
    entry = UploadQueue(video_path='/path/to/video.mp4', status='pending')
    db_session.add(entry)
    db_session.commit()

    assert entry.is_pending() is True
    entry.status = 'processing'
    assert entry.is_pending() is False


def test_is_processing(db_session):
    """Test the is_processing method."""
    entry = UploadQueue(video_path='/path/to/video.mp4', status='processing')
    db_session.add(entry)
    db_session.commit()

    assert entry.is_processing() is True
    entry.status = 'completed'
    assert entry.is_processing() is False


def test_is_completed(db_session):
    """Test the is_completed method."""
    entry = UploadQueue(video_path='/path/to/video.mp4', status='completed')
    db_session.add(entry)
    db_session.commit()

    assert entry.is_completed() is True
    entry.status = 'failed'
    assert entry.is_completed() is False


def test_is_failed(db_session):
    """Test the is_failed method."""
    entry = UploadQueue(video_path='/path/to/video.mp4', status='failed')
    db_session.add(entry)
    db_session.commit()

    assert entry.is_failed() is True
    entry.status = 'completed'
    assert entry.is_failed() is False


def test_unique_video_path_constraint(db_session):
    """Test that video_path is unique."""
    entry1 = UploadQueue(video_path='/path/to/video.mp4', status='pending')
    db_session.add(entry1)
    db_session.commit()

    entry2 = UploadQueue(video_path='/path/to/video.mp4', status='pending')
    db_session.add(entry2)

    with pytest.raises(Exception):
        db_session.commit()


def test_timestamps_are_set(db_session):
    """Test that created_at is set and started_at is initially None."""
    entry = UploadQueue(video_path='/path/to/video.mp4')
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.created_at is not None
    assert isinstance(entry.created_at, datetime)
    assert entry.started_at is None
    assert entry.completed_at is None


def test_status_transitions(db_session):
    """Test status transitions through the lifecycle."""
    entry = UploadQueue(video_path='/path/to/video.mp4', status='pending')
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    # Start processing
    entry.status = 'processing'
    entry.started_at = datetime.now(timezone.utc)
    entry.attempts = 1
    db_session.commit()
    db_session.refresh(entry)

    assert entry.status == 'processing'
    assert entry.started_at is not None
    assert entry.attempts == 1

    # Complete
    entry.status = 'completed'
    entry.completed_at = datetime.now(timezone.utc)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.status == 'completed'
    assert entry.completed_at is not None


def test_all_valid_statuses(db_session):
    """Test that all valid status values can be set."""
    valid_statuses = ['pending', 'processing', 'completed', 'failed', 'cancelled']

    for status in valid_statuses:
        entry = UploadQueue(video_path=f'/path/to/video_{status}.mp4', status=status)
        db_session.add(entry)

    db_session.commit()

    entries = db_session.query(UploadQueue).all()
    assert len(entries) == len(valid_statuses)
    for entry in entries:
        assert entry.status in valid_statuses


def test_error_message(db_session):
    """Test error message storage and retrieval."""
    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        status='failed',
        error_message='Upload failed: Network timeout'
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.error_message == 'Upload failed: Network timeout'


def test_priority_ordering(db_session):
    """Test that entries can be ordered by priority."""
    entries = [
        UploadQueue(video_path='/path/to/video1.mp4', priority=1),
        UploadQueue(video_path='/path/to/video2.mp4', priority=3),
        UploadQueue(video_path='/path/to/video3.mp4', priority=0),
        UploadQueue(video_path='/path/to/video4.mp4', priority=2),
    ]

    for entry in entries:
        db_session.add(entry)
    db_session.commit()

    # Query ordered by priority descending
    result = db_session.query(UploadQueue).order_by(
        UploadQueue.priority.desc()
    ).all()

    assert result[0].priority == 3
    assert result[1].priority == 2
    assert result[2].priority == 1
    assert result[3].priority == 0


def test_source_validation(db_session):
    """Test that source field accepts valid values."""
    valid_sources = ['plugin', 'manual', 'depin']

    for source in valid_sources:
        entry = UploadQueue(video_path=f'/path/to/video_{source}.mp4', source=source)
        db_session.add(entry)

    db_session.commit()

    entries = db_session.query(UploadQueue).all()
    assert len(entries) == len(valid_sources)
    for entry in entries:
        assert entry.source in valid_sources


def test_arkiv_sync_state_transitions(db_session):
    """Test Arkiv sync status transitions through lifecycle."""
    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        arkiv_sync_status='pending'
    )
    db_session.add(entry)
    db_session.commit()

    # Initial state
    assert entry.needs_arkiv_sync() is True
    assert entry.is_arkiv_pending() is True
    assert entry.is_arkiv_syncing() is False
    assert entry.is_arkiv_completed() is False
    assert entry.is_arkiv_failed() is False

    # Transition to syncing
    entry.arkiv_sync_status = 'syncing'
    from datetime import datetime, timezone
    entry.arkiv_sync_started_at = datetime.now(timezone.utc)
    db_session.commit()
    assert entry.is_arkiv_pending() is False
    assert entry.is_arkiv_syncing() is True
    assert entry.is_arkiv_started_at is not None

    # Transition to completed
    entry.arkiv_sync_status = 'completed'
    entry.arkiv_sync_completed_at = datetime.now(timezone.utc)
    db_session.commit()
    assert entry.is_arkiv_syncing() is False
    assert entry.is_arkiv_completed() is True
    assert entry.arkiv_sync_completed_at is not None

    # Transition back to pending for another entry
    entry2 = UploadQueue(
        video_path='/path/to/video2.mp4',
        arkiv_sync_status='skipped'
    )
    db_session.add(entry2)
    db_session.commit()
    assert entry2.is_arkiv_pending() is False
    assert entry2.is_arkiv_syncing() is False
    assert entry2.is_arkiv_completed() is False


def test_arkiv_sync_all_valid_statuses(db_session):
    """Test that all valid Arkiv sync status values can be set."""
    valid_statuses = ['pending', 'syncing', 'completed', 'failed', 'skipped']

    for status in valid_statuses:
        entry = UploadQueue(video_path=f'/path/to/video_{status}.mp4', arkiv_sync_status=status)
        db_session.add(entry)

    db_session.commit()

    entries = db_session.query(UploadQueue).all()
    assert len(entries) == len(valid_statuses)
    for entry in entries:
        assert entry.arkiv_sync_status in valid_statuses


def test_arkiv_sync_helper_methods(db_session):
    """Test all Arkiv sync helper methods."""
    pending_entry = UploadQueue(video_path='/path/to/pending.mp4', arkiv_sync_status='pending')
    db_session.add(pending_entry)

    syncing_entry = UploadQueue(video_path='/path/to/syncing.mp4', arkiv_sync_status='syncing')
    db_session.add(syncing_entry)

    completed_entry = UploadQueue(video_path='/path/to/completed.mp4', arkiv_sync_status='completed')
    db_session.add(completed_entry)

    failed_entry = UploadQueue(video_path='/path/to/failed.mp4', arkiv_sync_status='failed', arkiv_sync_error='Network error')
    db_session.add(failed_entry)

    null_entry = UploadQueue(video_path='/path/to/null.mp4', arkiv_sync_status=None)
    db_session.add(null_entry)

    db_session.commit()

    # Test needs_arkiv_sync
    assert pending_entry.needs_arkiv_sync() is True
    assert syncing_entry.needs_arkiv_sync() is False
    assert null_entry.needs_arkiv_sync() is False

    # Test is_arkiv_pending
    assert pending_entry.is_arkiv_pending() is True
    assert syncing_entry.is_arkiv_pending() is False

    # Test is_arkiv_syncing
    assert syncing_entry.is_arkiv_syncing() is True
    assert pending_entry.is_arkiv_syncing() is False

    # Test is_arkiv_completed
    assert completed_entry.is_arkiv_completed() is True
    assert syncing_entry.is_arkiv_completed() is False

    # Test is_arkiv_failed
    assert failed_entry.is_arkiv_failed() is True
    assert completed_entry.is_arkiv_failed() is False

    # Test can_retry_arkiv_sync (currently always returns False)
    assert failed_entry.can_retry_arkiv_sync() is False
    assert pending_entry.can_retry_arkiv_sync() is False


def test_arkiv_sync_error_message(db_session):
    """Test Arkiv sync error message storage and retrieval."""
    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        arkiv_sync_status='failed',
        arkiv_sync_error='Insufficient gas for transaction'
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    assert entry.arkiv_sync_error == 'Insufficient gas for transaction'


def test_arkiv_sync_timestamps(db_session):
    """Test that Arkiv sync timestamps are set correctly."""
    from datetime import datetime, timezone

    entry = UploadQueue(video_path='/path/to/video.mp4')
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    # Initially all timestamps should be None
    assert entry.arkiv_sync_started_at is None
    assert entry.arkiv_sync_completed_at is None

    # Set started_at
    started_time = datetime.now(timezone.utc)
    entry.arkiv_sync_started_at = started_time
    db_session.commit()
    db_session.refresh(entry)

    assert entry.arkiv_sync_started_at is not None
    assert isinstance(entry.arkiv_sync_started_at, datetime)

    # Set completed_at
    completed_time = datetime.now(timezone.utc)
    entry.arkiv_sync_completed_at = completed_time
    db_session.commit()
    db_session.refresh(entry)

    assert entry.arkiv_sync_completed_at is not None
    assert isinstance(entry.arkiv_sync_completed_at, datetime)


def test_arkiv_sync_in_to_dict(db_session):
    """Test that Arkiv sync fields are included in to_dict()."""
    from datetime import datetime, timezone

    entry = UploadQueue(
        video_path='/path/to/video.mp4',
        status='completed',
        arkiv_sync_status='completed',
        arkiv_sync_started_at=datetime(2024, 1, 9, 12, 0, 0, tzinfo=timezone.utc),
        arkiv_sync_completed_at=datetime(2024, 1, 9, 12, 5, 0, tzinfo=timezone.utc),
        arkiv_sync_error=None
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)

    result = entry.to_dict()

    assert 'arkiv_sync_status' in result
    assert result['arkiv_sync_status'] == 'completed'
    assert 'arkiv_sync_started_at' in result
    assert result['arkiv_sync_started_at'] == '2024-01-09T12:00:00+00:00'
    assert 'arkiv_sync_completed_at' in result
    assert result['arkiv_sync_completed_at'] == '2024-01-09T12:05:00+00:00'
    assert 'arkiv_sync_error' in result
    assert result['arkiv_sync_error'] is None
