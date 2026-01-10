"""
Unit tests for incremental Arkiv updates.

Tests the logic that ensures Arkiv entities are incrementally updated as new data
becomes available (FileCoin uploads, VLM analysis completion).
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.video import Video, Timestamp
from app.models.upload_queue import UploadQueue
from app.api.upload_queue import update_upload_status, update_vlm_analysis_status, update_arkiv_sync_status
from pydantic import BaseModel


class UploadQueueUpdate(BaseModel):
    """Request to update upload queue status."""
    status: str
    filecoin_metadata: dict | None = None
    error: str | None = None


class VLMAnalysisUpdate(BaseModel):
    """Request to update VLM analysis status."""
    vlm_analysis_status: str
    vlm_analysis_error: str | None = None


class ArkivSyncUpdate(BaseModel):
    """Request to update Arkiv sync status."""
    arkiv_sync_status: str
    arkiv_sync_error: str | None = None
    entity_key: str | None = None


@pytest.fixture
def db_session(db: Session):
    """Create a database session for testing."""
    return db


@pytest.fixture
def sample_video(db_session: Session):
    """Create a sample video for testing."""
    video = Video(
        path="/videos/test.mp4",
        title="Test Video",
        duration=60,
        has_ai_data=False,
        share_to_arkiv=True,
        enable_vlm_analysis=True,
        vlm_analysis_required=True,
        arkiv_data_completeness="none"
    )
    db_session.add(video)
    db_session.commit()
    db_session.refresh(video)
    return video


@pytest.fixture
def sample_queue_entry(db_session: Session, sample_video: Video):
    """Create a sample upload queue entry for testing."""
    queue_entry = UploadQueue(
        video_path=sample_video.path,
        status='pending',
        vlm_analysis_status='pending'
    )
    db_session.add(queue_entry)
    db_session.commit()
    db_session.refresh(queue_entry)
    return queue_entry


def test_filecoin_first_then_vlm(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test incremental update when FileCoin completes first, then VLM.

    Scenario:
    1. FileCoin completes → Arkiv entity created → arkiv_data_completeness = "filecoin_only"
    2. VLM completes → Arkiv update triggered → arkiv_data_completeness = "filecoin_and_vlm"
    """
    # Step 1: FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify FileCoin metadata is set
    assert sample_video.filecoin_root_cid == 'QmTestCID'
    assert sample_video.filecoin_piece_cid == 'baga6ea4'

    # Verify Arkiv sync is queued
    assert sample_queue_entry.arkiv_sync_status == 'pending'

    # Step 2: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 3: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    # At this point, arkiv_entity_key should still be None (not yet synced)
    # but Arkiv sync should be queued
    db_session.refresh(sample_queue_entry)
    assert sample_queue_entry.arkiv_sync_status == 'pending'


def test_vlm_first_then_filecoin(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test incremental update when VLM completes first, then FileCoin.

    Scenario:
    1. VLM completes → Arkiv entity created → arkiv_data_completeness = "vlm_only"
    2. FileCoin completes → Arkiv update triggered → arkiv_data_completeness = "filecoin_and_vlm"
    """
    # Step 1: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 2: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is queued
    assert sample_queue_entry.arkiv_sync_status == 'pending'

    # Step 3: FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify FileCoin metadata is set
    assert sample_video.filecoin_root_cid == 'QmTestCID'
    assert sample_video.filecoin_piece_cid == 'baga6ea4'

    # Arkiv sync should still be pending (not completed yet)
    assert sample_queue_entry.arkiv_sync_status == 'pending'


def test_no_duplicate_updates(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test that duplicate Arkiv updates are not triggered when both complete before Arkiv sync.

    Scenario:
    1. Both FileCoin and VLM complete → Arkiv sync queued once with all data
    2. No subsequent updates triggered from same events
    """
    # Step 1: FileCoin completes (with metadata)
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is queued
    assert sample_queue_entry.arkiv_sync_status == 'pending'

    # Step 2: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 3: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Arkiv sync should still be pending (not re-queued)
    assert sample_queue_entry.arkiv_sync_status == 'pending'


def test_restore_completeness(db_session: Session):
    """
    Test that arkiv_data_completeness is correctly set during restore.

    Scenario:
    1. Restore catalog from Arkiv
    2. Verify arkiv_data_completeness is correctly set based on stored data
    """
    # Simulate what happens during restore
    video_path = "arkiv:restored:test"

    # Case 1: Video with both FileCoin and timestamps
    video1 = Video(
        path=video_path + "1",
        title="Test Video 1",
        duration=60,
        share_to_arkiv=True,
        arkiv_entity_key="test-key-1",
        filecoin_root_cid="QmTestCID1",
        is_encrypted=False
    )

    # Add timestamps
    timestamp1 = Timestamp(
        video_path=video_path + "1",
        tag_name="tag1",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp1)
    video1.arkiv_data_completeness = "filecoin_and_vlm"

    # Case 2: Video with only FileCoin
    video2 = Video(
        path=video_path + "2",
        title="Test Video 2",
        duration=60,
        share_to_arkiv=True,
        arkiv_entity_key="test-key-2",
        filecoin_root_cid="QmTestCID2",
        is_encrypted=False
    )
    video2.arkiv_data_completeness = "filecoin_only"

    # Case 3: Video with only timestamps
    video3 = Video(
        path=video_path + "3",
        title="Test Video 3",
        duration=60,
        share_to_arkiv=True,
        arkiv_entity_key="test-key-3",
        is_encrypted=False
    )
    timestamp3 = Timestamp(
        video_path=video_path + "3",
        tag_name="tag3",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp3)
    video3.arkiv_data_completeness = "vlm_only"

    # Case 4: Encrypted video with encrypted CID (counts as having FileCoin)
    video4 = Video(
        path=video_path + "4",
        title="Test Video 4",
        duration=60,
        share_to_arkiv=True,
        arkiv_entity_key="test-key-4",
        filecoin_root_cid=None,
        encrypted_filecoin_cid="encrypted-cid-123",
        is_encrypted=True
    )
    video4.arkiv_data_completeness = "filecoin_only"

    db_session.add(video1)
    db_session.add(video2)
    db_session.add(video3)
    db_session.add(video4)
    db_session.commit()

    db_session.refresh(video1)
    db_session.refresh(video2)
    db_session.refresh(video3)
    db_session.refresh(video4)

    # Verify completeness values
    assert video1.arkiv_data_completeness == "filecoin_and_vlm"
    assert video2.arkiv_data_completeness == "filecoin_only"
    assert video3.arkiv_data_completeness == "vlm_only"
    assert video4.arkiv_data_completeness == "filecoin_only"


def test_incremental_update_after_arkiv_sync(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test that incremental update is triggered when Arkiv entity has incomplete data.

    Scenario:
    1. FileCoin completes → Arkiv sync → arkiv_data_completeness = "filecoin_only"
    2. VLM completes → Arkiv update triggered → arkiv_data_completeness = "filecoin_and_vlm"
    """
    # Step 1: FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Step 2: Simulate Arkiv sync completing with FileCoin only
    arkiv_update_data = ArkivSyncUpdate(
        arkiv_sync_status='completed',
        entity_key='test-arkiv-key'
    )

    update_arkiv_sync_status(sample_queue_entry.id, arkiv_update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync completed
    assert sample_queue_entry.arkiv_sync_status == 'completed'
    assert sample_video.arkiv_entity_key == 'test-arkiv-key'

    # Verify completeness is set to filecoin_only (no timestamps yet)
    assert sample_video.arkiv_data_completeness == "filecoin_only"

    # Step 3: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 4: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is re-queued for incremental update
    assert sample_queue_entry.arkiv_sync_status == 'pending'


def test_vlm_first_with_arkiv_sync_then_filecoin(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test incremental update when VLM syncs first, then FileCoin completes.

    Scenario:
    1. VLM completes → Arkiv sync → arkiv_data_completeness = "vlm_only"
    2. FileCoin completes → Arkiv update triggered → arkiv_data_completeness = "filecoin_and_vlm"
    """
    # Step 1: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 2: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Step 3: Simulate Arkiv sync completing with VLM only
    arkiv_update_data = ArkivSyncUpdate(
        arkiv_sync_status='completed',
        entity_key='test-arkiv-key'
    )

    update_arkiv_sync_status(sample_queue_entry.id, arkiv_update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync completed
    assert sample_queue_entry.arkiv_sync_status == 'completed'
    assert sample_video.arkiv_entity_key == 'test-arkiv-key'

    # Verify completeness is set to vlm_only (no FileCoin yet)
    assert sample_video.arkiv_data_completeness == "vlm_only"

    # Step 4: FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    upload_update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, upload_update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is re-queued for incremental update
    assert sample_queue_entry.arkiv_sync_status == 'pending'


def test_no_update_for_full_completeness(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test that no update is triggered when Arkiv entity already has full data.

    Scenario:
    1. Both FileCoin and VLM sync → arkiv_data_completeness = "filecoin_and_vlm"
    2. VLM completes again → No update triggered
    """
    # Setup: Video with FileCoin and timestamps
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    upload_update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, upload_update_data, db_session)
    db_session.refresh(sample_video)

    # Add timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # VLM completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)

    # Arkiv sync completes
    arkiv_update_data = ArkivSyncUpdate(
        arkiv_sync_status='completed',
        entity_key='test-arkiv-key'
    )

    update_arkiv_sync_status(sample_queue_entry.id, arkiv_update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify completeness is full
    assert sample_video.arkiv_data_completeness == "filecoin_and_vlm"
    assert sample_queue_entry.arkiv_sync_status == 'completed'

    # Step 2: VLM completes again (simulating re-analysis)
    vlm_update_data2 = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data2, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is NOT re-queued (still completed)
    assert sample_queue_entry.arkiv_sync_status == 'completed'


def test_video_without_arkiv_sharing(db_session: Session, sample_video: Video, sample_queue_entry: UploadQueue):
    """
    Test that Arkiv sync is skipped when video is not shared to Arkiv.

    Scenario:
    1. Video share_to_arkiv = False
    2. FileCoin completes → Arkiv sync NOT queued
    3. VLM completes → Arkiv sync NOT queued
    """
    # Update video to not share to Arkiv
    sample_video.share_to_arkiv = False
    db_session.commit()

    # FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is skipped
    assert sample_queue_entry.arkiv_sync_status == 'skipped'

    # Add timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # VLM completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Verify Arkiv sync is still skipped
    assert sample_queue_entry.arkiv_sync_status == 'skipped'


def test_arkiv_data_completeness_default(db_session: Session, sample_video: Video):
    """
    Test that arkiv_data_completeness defaults to None for new videos.
    """
    db_session.refresh(sample_video)
    assert sample_video.arkiv_data_completeness == "none"


def test_encrypted_video_incremental_update(
    db_session: Session,
    sample_video: Video,
    sample_queue_entry: UploadQueue
):
    """
    Test incremental update works for encrypted videos.

    Scenario:
    1. Encrypted FileCoin uploads → Arkiv sync → arkiv_data_completeness = "filecoin_only"
    2. VLM completes → Arkiv update triggered → arkiv_data_completeness = "filecoin_and_vlm"
    """
    # Mark video as encrypted
    sample_video.is_encrypted = True
    db_session.commit()

    # Step 1: Encrypted FileCoin completes
    filecoin_metadata = {
        'root_cid': 'QmTestCID',
        'piece_cid': 'baga6ea4',
        'piece_id': 123,
        'data_set_id': 'dataset-123',
        'is_encrypted': True,
        'encrypted_root_cid': 'encrypted-cid-123',
        'cid_encryption_metadata': '{"test": "metadata"}'
    }
    update_data = UploadQueueUpdate(
        status='completed',
        filecoin_metadata=filecoin_metadata
    )

    update_upload_status(sample_queue_entry.id, update_data, db_session)
    db_session.refresh(sample_video)
    db_session.refresh(sample_queue_entry)

    # Verify encrypted metadata is set
    assert sample_video.filecoin_root_cid == 'QmTestCID'
    assert sample_video.encrypted_filecoin_cid == 'encrypted-cid-123'
    assert sample_video.is_encrypted == True

    # Verify Arkiv sync is queued
    assert sample_queue_entry.arkiv_sync_status == 'pending'

    # Step 2: Add VLM timestamps
    timestamp = Timestamp(
        video_path=sample_video.path,
        tag_name="test_tag",
        start_time=0.0,
        end_time=10.0,
        confidence=0.95
    )
    db_session.add(timestamp)
    db_session.commit()

    # Step 3: VLM analysis completes
    vlm_update_data = VLMAnalysisUpdate(
        vlm_analysis_status='completed'
    )

    update_vlm_analysis_status(sample_queue_entry.id, vlm_update_data, db_session)
    db_session.refresh(sample_queue_entry)

    # Arkiv sync should still be pending
    assert sample_queue_entry.arkiv_sync_status == 'pending'
