from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

import pytest

from app.services import pumpfun_recording_manager
from app.services.pumpfun_recording_manager import PumpFunRecordingManager
from app.services.stream_manager import StreamInfo


@dataclass
class FakeRoom:
    name: str = "room"


class FakeStreamManager:
    def __init__(self, stream_info_sequence: list[Optional[StreamInfo]]):
        self._stream_info_sequence = stream_info_sequence
        self._info_calls = 0
        self.start_stream_calls = 0
        self.last_livekit_url: Optional[str] = None
        self.room = FakeRoom()

    async def get_stream_info(self, mint_id: str) -> Optional[StreamInfo]:
        if self._info_calls < len(self._stream_info_sequence):
            result = self._stream_info_sequence[self._info_calls]
        elif self._stream_info_sequence:
            result = self._stream_info_sequence[-1]
        else:
            result = None
        self._info_calls += 1
        return result

    async def start_stream(
        self, mint_id: str, livekit_url: Optional[str] = None
    ) -> dict[str, object]:
        self.start_stream_calls += 1
        self.last_livekit_url = livekit_url
        return {"success": True, "mint_id": mint_id}

    def get_room(self, mint_id: str) -> FakeRoom:
        return self.room


class FakeStreamManagerWithError(FakeStreamManager):
    async def start_stream(
        self, mint_id: str, livekit_url: Optional[str] = None
    ) -> dict[str, object]:
        self.start_stream_calls += 1
        self.last_livekit_url = livekit_url
        raise RuntimeError("start stream failed")


class DummyRecorder:
    def __init__(self, *args: object, **kwargs: object):
        self.start_calls: list[str] = []

    async def start_recording(self, participant_identity: str) -> dict[str, object]:
        self.start_calls.append(participant_identity)
        return {"success": True}

    async def stop_recording(self) -> dict[str, object]:
        return {"success": True}


def _stream_info(mint_id: str) -> StreamInfo:
    return StreamInfo(
        mint_id=mint_id,
        room_name="room",
        participant_sid="participant",
        stream_url="wss://example.livekit",
        token="token",
        stream_data={},
    )


def _reset_manager(manager: PumpFunRecordingManager) -> None:
    manager.active_recordings = {}
    manager._manage_lock = asyncio.Lock()
    manager._livekit_url = None


@pytest.mark.asyncio
async def test_manage_subscriptions_busy_lock() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    manager.set_stream_manager(FakeStreamManager([]))
    await manager._manage_lock.acquire()
    try:
        result = await manager.manage_subscriptions(
            [{"stream_id": "mint", "enabled": True}]
        )
    finally:
        manager._manage_lock.release()

    assert result["status"] == "busy"
    assert result["active"] == 0


@pytest.mark.asyncio
async def test_manage_subscriptions_runs_with_lock() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    manager.set_stream_manager(FakeStreamManager([_stream_info("mint")]))
    manager._stream_wait_timeout_seconds = 0.1
    manager._stream_retry_interval_seconds = 0

    async def always_live(_: str) -> bool:
        return True

    async def start_recording(_: str) -> bool:
        return True

    manager._check_stream_live = always_live
    manager._start_recording = start_recording

    result = await manager.manage_subscriptions(
        [{"stream_id": "mint", "enabled": True}]
    )

    assert result["status"] == "ok"
    assert result["started"] == 1


@pytest.mark.asyncio
async def test_check_stream_live_retries_until_ready() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    stream_sequence = [None, None, _stream_info("mint")]
    manager.set_stream_manager(FakeStreamManager(stream_sequence))
    manager._stream_wait_timeout_seconds = 0.2
    manager._stream_retry_interval_seconds = 0

    is_live = await manager._check_stream_live("mint")

    assert is_live is True
    assert manager.stream_manager is not None
    assert manager.stream_manager.start_stream_calls >= 1


@pytest.mark.asyncio
async def test_check_stream_live_timeout_returns_false() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    manager.set_stream_manager(FakeStreamManager([None, None, None]))
    manager._stream_wait_timeout_seconds = 0.05
    manager._stream_retry_interval_seconds = 0

    is_live = await manager._check_stream_live("mint")

    assert is_live is False
    assert manager.stream_manager is not None
    assert manager.stream_manager.start_stream_calls >= 1


@pytest.mark.asyncio
async def test_start_recording_waits_for_stream(monkeypatch) -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    manager.set_stream_manager(FakeStreamManager([None, _stream_info("mint")]))
    manager._stream_wait_timeout_seconds = 0.2
    manager._stream_retry_interval_seconds = 0

    monkeypatch.setattr(
        pumpfun_recording_manager, "PumpFunChunkRecorder", DummyRecorder
    )

    success = await manager._start_recording("mint")

    assert success is True
    assert "mint" in manager.active_recordings


@pytest.mark.asyncio
async def test_check_stream_live_handles_start_stream_error() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    manager.set_stream_manager(FakeStreamManagerWithError([None, None]))
    manager._stream_wait_timeout_seconds = 0.05
    manager._stream_retry_interval_seconds = 0

    is_live = await manager._check_stream_live("mint")

    assert is_live is False
    assert manager.stream_manager is not None
    assert manager.stream_manager.start_stream_calls >= 1


@pytest.mark.asyncio
async def test_check_stream_live_uses_configured_livekit_url() -> None:
    manager = PumpFunRecordingManager()
    _reset_manager(manager)
    fake_stream_manager = FakeStreamManager([None, _stream_info("mint")])
    manager.set_stream_manager(fake_stream_manager)
    manager.set_livekit_url("wss://custom.livekit")
    manager._stream_wait_timeout_seconds = 0.2
    manager._stream_retry_interval_seconds = 0

    is_live = await manager._check_stream_live("mint")

    assert is_live is True
    assert fake_stream_manager.last_livekit_url == "wss://custom.livekit"
