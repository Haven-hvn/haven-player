from __future__ import annotations

from pathlib import Path
import pytest

from app.services.openring_recording_manager import (
    OpenRingRecordingManager,
    OpenRingSubscription,
    online_device_ids,
)
from app.services.openring_service import RingDevice


class FakeRecorder:
    def __init__(
        self,
        service,
        device_id: int,
        session_id: str,
        output_dir: Path,
        segment_duration: int,
        on_segment_complete,
    ):
        self.device_id = device_id
        self.output_dir = output_dir
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True


class FakeService:
    pass


class FakeUploadCoordinator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def enqueue_video_after_download(self, video_path: str, plugin_name: str) -> None:
        self.calls.append((video_path, plugin_name))


class FailingRecorder(FakeRecorder):
    async def start(self) -> None:
        raise RuntimeError("start failed")


@pytest.mark.asyncio
async def test_start_and_stop_recording(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    started = await manager.start_recording(
        device_id=1,
        device_name="Front Door",
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert started is True
    assert 1 in manager.active_recordings

    stopped = await manager.stop_recording(1)
    assert stopped is True
    assert 1 not in manager.active_recordings


@pytest.mark.asyncio
async def test_start_recording_returns_false_for_duplicate(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    await manager.start_recording(
        device_id=2,
        device_name="Back Door",
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    started_again = await manager.start_recording(
        device_id=2,
        device_name="Back Door",
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert started_again is False


@pytest.mark.asyncio
async def test_start_recording_invalid_duration(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    started = await manager.start_recording(
        device_id=3,
        device_name="Garage",
        service=FakeService(),
        segment_duration=0,
        output_dir=tmp_path,
    )
    assert started is False


@pytest.mark.asyncio
async def test_start_recording_handles_start_failure(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FailingRecorder)

    started = await manager.start_recording(
        device_id=5,
        device_name="Fail",
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert started is False


@pytest.mark.asyncio
async def test_manage_subscriptions_busy(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)
    await manager._manage_lock.acquire()
    try:
        result = await manager.manage_subscriptions(
            subscriptions=[OpenRingSubscription(device_id=1, device_name="Front", enabled=True)],
            online_device_ids={1},
            service=FakeService(),
            segment_duration=30,
            output_dir=tmp_path,
        )
    finally:
        manager._manage_lock.release()

    assert result["status"] == "busy"


@pytest.mark.asyncio
async def test_manage_subscriptions_starts_and_stops(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    result_start = await manager.manage_subscriptions(
        subscriptions=[OpenRingSubscription(device_id=4, device_name="Door", enabled=True)],
        online_device_ids={4},
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert result_start["started"] == 1

    result_stop = await manager.manage_subscriptions(
        subscriptions=[OpenRingSubscription(device_id=4, device_name="Door", enabled=True)],
        online_device_ids=set(),
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert result_stop["stopped"] == 1


@pytest.mark.asyncio
async def test_manage_subscriptions_skips_disabled(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    result = await manager.manage_subscriptions(
        subscriptions=[OpenRingSubscription(device_id=6, device_name="Off", enabled=False)],
        online_device_ids={6},
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    assert result["started"] == 0


@pytest.mark.asyncio
async def test_handle_segment_complete_enqueues(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.upload_coordinator = FakeUploadCoordinator()

    await manager._handle_segment_complete(tmp_path / "segment.mp4")

    assert manager.upload_coordinator.calls == [(str(tmp_path / "segment.mp4"), "OpenRingPlugin")]


@pytest.mark.asyncio
async def test_stop_recording_missing_returns_false() -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    assert await manager.stop_recording(99) is False


@pytest.mark.asyncio
async def test_stop_all_stops_active(tmp_path: Path) -> None:
    manager = OpenRingRecordingManager()
    manager.active_recordings = {}
    manager.set_recorder_factory(FakeRecorder)

    await manager.start_recording(
        device_id=7,
        device_name="Door",
        service=FakeService(),
        segment_duration=30,
        output_dir=tmp_path,
    )
    await manager.stop_all()
    assert manager.active_recordings == {}


def test_online_device_ids_filters_offline() -> None:
    devices = [
        RingDevice(id=1, description="Front", device_id="1", kind="doorbell", location_id=None, alerts=None),
        RingDevice(
            id=2,
            description="Back",
            device_id="2",
            kind="camera",
            location_id=None,
            alerts=type("Alerts", (), {"connection": "offline"})(),
        ),
    ]
    assert online_device_ids(devices) == {1}
