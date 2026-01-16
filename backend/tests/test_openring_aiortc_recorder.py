from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
import sys
import builtins
import types
import pytest

from app.services.openring_aiortc_recorder import (
    OpenRingAiortcRecorder,
    OpenRingRecorderDependencyError,
    _load_media_recorder_factory,
    _load_peer_connection_factory,
    _load_session_description_factory,
    _maybe_await,
)
from app.services.openring_service import LiveViewStartResponse


@dataclass
class FakeSessionDescription:
    sdp: str
    type: str


class FakeTrack:
    def __init__(self, kind: str):
        self.kind = kind


class FakePeerConnection:
    def __init__(self) -> None:
        self.transceivers: list[tuple[str, str]] = []
        self.local_description: FakeSessionDescription | None = None
        self.remote_description: FakeSessionDescription | None = None
        self._callbacks: dict[str, object] = {}
        self.closed = False

    def addTransceiver(self, kind: str, direction: str) -> None:
        self.transceivers.append((kind, direction))

    def on(self, event: str):
        def decorator(callback):
            self._callbacks[event] = callback
            return callback

        return decorator

    async def createOffer(self) -> FakeSessionDescription:
        return FakeSessionDescription(sdp="offer", type="offer")

    async def setLocalDescription(self, description: FakeSessionDescription) -> None:
        self.local_description = description

    async def setRemoteDescription(self, description: FakeSessionDescription) -> None:
        self.remote_description = description

    async def close(self) -> None:
        self.closed = True

    def emit_track(self, track: FakeTrack) -> None:
        callback = self._callbacks.get("track")
        if callback:
            callback(track)


class FakeMediaRecorder:
    def __init__(self, path: str):
        self.path = path
        self.tracks: list[FakeTrack] = []
        self.started = False
        self.stopped = False

    def addTrack(self, track: FakeTrack) -> None:
        self.tracks.append(track)

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True


class FakeService:
    def __init__(self) -> None:
        self.start_calls: list[tuple[int, str, str]] = []
        self.activate_calls: list[str] = []
        self.end_calls: list[str] = []

    async def start_live_view(self, device_id: int, session_id: str, offer_sdp: str) -> LiveViewStartResponse:
        self.start_calls.append((device_id, session_id, offer_sdp))
        return LiveViewStartResponse(session_id=session_id, answer_sdp="answer")

    async def activate_camera(self, session_id: str) -> None:
        self.activate_calls.append(session_id)

    async def end_live_view(self, session_id: str) -> None:
        self.end_calls.append(session_id)


@pytest.mark.asyncio
async def test_recorder_start_stop_creates_segments(tmp_path: Path) -> None:
    service = FakeService()
    peer_connection = FakePeerConnection()
    created_recorders: list[FakeMediaRecorder] = []

    def recorder_factory(path: str) -> FakeMediaRecorder:
        recorder = FakeMediaRecorder(path)
        created_recorders.append(recorder)
        return recorder

    recorder = OpenRingAiortcRecorder(
        service=service,
        device_id=1,
        session_id="session",
        output_dir=tmp_path,
        segment_duration=0.01,
        peer_connection_factory=lambda: peer_connection,
        session_description_factory=FakeSessionDescription,
        media_recorder_factory=recorder_factory,
        track_wait_timeout=0.05,
        time_provider=lambda: 0.0,
    )

    await recorder.start()
    peer_connection.emit_track(FakeTrack("video"))
    await asyncio.sleep(0.02)
    await recorder.stop()

    assert service.start_calls
    assert service.activate_calls == ["session"]
    assert service.end_calls == ["session"]
    assert created_recorders
    assert created_recorders[0].started is True
    assert created_recorders[0].stopped is True


@pytest.mark.asyncio
async def test_recorder_calls_segment_callback(tmp_path: Path) -> None:
    service = FakeService()
    peer_connection = FakePeerConnection()
    seen: list[Path] = []

    async def on_segment(path: Path) -> None:
        seen.append(path)

    recorder = OpenRingAiortcRecorder(
        service=service,
        device_id=3,
        session_id="session3",
        output_dir=tmp_path,
        segment_duration=1.0,
        peer_connection_factory=lambda: peer_connection,
        session_description_factory=FakeSessionDescription,
        media_recorder_factory=FakeMediaRecorder,
        track_wait_timeout=0.05,
        on_segment_complete=on_segment,
        time_provider=lambda: 0.0,
    )

    await recorder.start()
    peer_connection.emit_track(FakeTrack("video"))
    await asyncio.sleep(0.01)
    await recorder.stop()

    assert seen


@pytest.mark.asyncio
async def test_recorder_track_timeout_exits(tmp_path: Path) -> None:
    service = FakeService()
    peer_connection = FakePeerConnection()

    recorder = OpenRingAiortcRecorder(
        service=service,
        device_id=2,
        session_id="session2",
        output_dir=tmp_path,
        segment_duration=0.01,
        peer_connection_factory=lambda: peer_connection,
        session_description_factory=FakeSessionDescription,
        media_recorder_factory=FakeMediaRecorder,
        track_wait_timeout=0.01,
        time_provider=lambda: 0.0,
    )

    await recorder.start()
    await asyncio.sleep(0.02)
    await recorder.stop()

    assert recorder.is_running is False


@pytest.mark.asyncio
async def test_recorder_stop_without_start(tmp_path: Path) -> None:
    service = FakeService()
    recorder = OpenRingAiortcRecorder(
        service=service,
        device_id=4,
        session_id="session4",
        output_dir=tmp_path,
        segment_duration=1.0,
        peer_connection_factory=FakePeerConnection,
        session_description_factory=FakeSessionDescription,
        media_recorder_factory=FakeMediaRecorder,
    )

    await recorder.stop()
    assert recorder.is_running is False


@pytest.mark.asyncio
async def test_recorder_start_twice_raises(tmp_path: Path) -> None:
    service = FakeService()
    peer_connection = FakePeerConnection()
    recorder = OpenRingAiortcRecorder(
        service=service,
        device_id=5,
        session_id="session5",
        output_dir=tmp_path,
        segment_duration=0.01,
        peer_connection_factory=lambda: peer_connection,
        session_description_factory=FakeSessionDescription,
        media_recorder_factory=FakeMediaRecorder,
        track_wait_timeout=0.05,
        time_provider=lambda: 0.0,
    )

    await recorder.start()
    with pytest.raises(RuntimeError):
        await recorder.start()
    await recorder.stop()


def test_recorder_requires_positive_segment_duration(tmp_path: Path) -> None:
    service = FakeService()
    with pytest.raises(ValueError):
        OpenRingAiortcRecorder(
            service=service,
            device_id=1,
            session_id="session",
            output_dir=tmp_path,
            segment_duration=0,
            peer_connection_factory=FakePeerConnection,
            session_description_factory=FakeSessionDescription,
            media_recorder_factory=FakeMediaRecorder,
        )


@pytest.mark.asyncio
async def test_maybe_await_handles_sync_value() -> None:
    result = await _maybe_await("value")
    assert result == "value"


def test_dependency_loader_success_and_error(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_aiortc = types.SimpleNamespace(
        RTCPeerConnection=FakePeerConnection,
        RTCSessionDescription=FakeSessionDescription,
    )
    fake_media = types.SimpleNamespace(MediaRecorder=FakeMediaRecorder)

    monkeypatch.setitem(sys.modules, "aiortc", fake_aiortc)
    monkeypatch.setitem(sys.modules, "aiortc.contrib", types.SimpleNamespace(media=fake_media))
    monkeypatch.setitem(sys.modules, "aiortc.contrib.media", fake_media)

    assert _load_peer_connection_factory() is FakePeerConnection
    assert _load_session_description_factory() is FakeSessionDescription
    assert _load_media_recorder_factory() is FakeMediaRecorder

    original_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name.startswith("aiortc"):
            raise ImportError("missing")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    monkeypatch.delitem(sys.modules, "aiortc", raising=False)
    monkeypatch.delitem(sys.modules, "aiortc.contrib.media", raising=False)

    with pytest.raises(OpenRingRecorderDependencyError):
        _load_peer_connection_factory()
    with pytest.raises(OpenRingRecorderDependencyError):
        _load_session_description_factory()
    with pytest.raises(OpenRingRecorderDependencyError):
        _load_media_recorder_factory()
