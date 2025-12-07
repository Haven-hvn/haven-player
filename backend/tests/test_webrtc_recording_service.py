"""
Unit tests for Boombox-based WebRTCRecordingService.
"""

import sys
import types
from pathlib import Path
from typing import Iterator

import pytest

# Fake boombox module before importing the service
fake_boombox = types.SimpleNamespace()


class _FakePacket:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload


class _FakeVideoPacket(_FakePacket):
    pass


class _FakeAudioPacket(_FakePacket):
    pass


class _FakeBoombox:
    def __init__(self, input: object, output: object) -> None:
        self.input = input
        self.output = output
        self._closed = False
        self._written: list[_FakePacket] = []
        self._packets = [_FakeVideoPacket(b"v"), _FakeAudioPacket(b"a")]

    def read(self) -> Iterator[_FakePacket]:
        yield from self._packets

    def write(self, packet: _FakePacket) -> None:
        self._written.append(packet)

    def close(self, wait: bool = True) -> None:
        self._closed = True


fake_boombox.Array = lambda **_: object()
fake_boombox.VideoPacket = _FakeVideoPacket
fake_boombox.AudioPacket = _FakeAudioPacket
fake_boombox.Boombox = _FakeBoombox

sys.modules["boombox"] = fake_boombox

from app.services.stream_manager import StreamInfo
from app.services.webrtc_recording_service import RecordingState, WebRTCRecordingService


class _DummyDB:
    def __iter__(self):
        return iter([self])

    def __next__(self):
        return self

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None

    def add(self, _):
        return None

    def commit(self):
        return None

    def refresh(self, _):
        return None

    def close(self):
        return None


class _DummyStreamManager:
    def __init__(self, stream_info: StreamInfo):
        self._stream_info = stream_info

    async def get_stream_info(self, _mint_id: str) -> StreamInfo:
        return self._stream_info


@pytest.fixture(autouse=True)
def patch_db(monkeypatch):
    monkeypatch.setattr("app.services.webrtc_recording_service.get_db", lambda: iter([_DummyDB()]))
    monkeypatch.setattr("app.services.webrtc_recording_service.generate_video_thumbnail", lambda _p: "thumb.jpg")
    monkeypatch.setattr("app.services.webrtc_recording_service.get_video_duration", lambda _p: 5)


@pytest.fixture
def stream_info() -> StreamInfo:
    return StreamInfo(
        mint_id="mint123",
        room_name="room",
        participant_sid="sid",
        stream_url="wss://livekit",
        ingest_url="https://example.com/stream.m3u8",
        token="tok",
        stream_data={"ingest_url": "https://example.com/stream.m3u8"},
    )


@pytest.fixture
def service(tmp_path: Path, stream_info: StreamInfo, monkeypatch) -> WebRTCRecordingService:
    svc = WebRTCRecordingService(output_dir=str(tmp_path))
    monkeypatch.setattr(svc, "stream_manager", _DummyStreamManager(stream_info))
    monkeypatch.setattr(svc, "_start_watchdog_task", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "_start_refresh_task", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "_has_disk_space", lambda: True)
    monkeypatch.setattr(svc, "_wait_for_ingest_ready", lambda _url: True)
    return svc


class TestWebRTCRecordingService:
    def test_init_defaults(self, service: WebRTCRecordingService):
        assert service.output_dir.exists()
        assert service.default_config["format"] == "mp4"
        assert service.default_config["video_codec"] == "h264"
        assert service.default_config["audio_codec"] == "aac"
        assert "max_retries" in service.default_config

    @pytest.mark.asyncio
    async def test_get_all_recordings_empty(self, service: WebRTCRecordingService):
        result = await service.get_all_recordings()
        assert result["success"] is True
        assert result["count"] == 0

    @pytest.mark.asyncio
    async def test_start_and_stop_recording(self, service: WebRTCRecordingService):
        start_result = await service.start_recording("mint123")
        assert start_result["success"] is True
        assert "output_path" in start_result
        status = await service.get_recording_status("mint123")
        assert status["state"] in {RecordingState.CONNECTING.value, RecordingState.RECORDING.value}
        assert "retry_count" in status

        stop_result = await service.stop_recording("mint123")
        assert stop_result["success"] is True
        assert Path(stop_result["output_path"]).exists()
        inactive_status = await service.get_recording_status("mint123")
        assert inactive_status["success"] is False

    @pytest.mark.asyncio
    async def test_start_missing_ingest_url(self, service: WebRTCRecordingService, stream_info: StreamInfo, monkeypatch):
        broken = StreamInfo(
            mint_id=stream_info.mint_id,
            room_name=stream_info.room_name,
            participant_sid=stream_info.participant_sid,
            stream_url=stream_info.stream_url,
            ingest_url=None,
            token=stream_info.token,
            stream_data={},
        )
        monkeypatch.setattr(service, "stream_manager", _DummyStreamManager(broken))
        result = await service.start_recording("mint123")
        assert result["success"] is False
        assert "ingest" in result["error"]

    @pytest.mark.asyncio
    async def test_stop_when_not_found(self, service: WebRTCRecordingService):
        result = await service.stop_recording("missing")
        assert result["success"] is False
        assert "No active recording" in result["error"]

    @pytest.mark.asyncio
    async def test_start_fails_on_low_disk(self, service: WebRTCRecordingService, monkeypatch):
        monkeypatch.setattr(service, "_has_disk_space", lambda: False)
        result = await service.start_recording("mint123")
        assert result["success"] is False
        assert "disk space" in result["error"]

    @pytest.mark.asyncio
    async def test_start_fails_if_ingest_unreachable(self, service: WebRTCRecordingService, monkeypatch):
        monkeypatch.setattr(service, "_wait_for_ingest_ready", lambda _url: False)
        result = await service.start_recording("mint123")
        assert result["success"] is False
        assert "Ingest URL not reachable" in result["error"]

    @pytest.mark.asyncio
    async def test_ingest_url_fallback_from_stream_data(self, service: WebRTCRecordingService, stream_info: StreamInfo, monkeypatch):
        fallback = StreamInfo(
            mint_id=stream_info.mint_id,
            room_name=stream_info.room_name,
            participant_sid=stream_info.participant_sid,
            stream_url=stream_info.stream_url,
            ingest_url=None,
            token=stream_info.token,
            stream_data={"vod_playlist_url": "https://fallback.example/master.m3u8"},
        )
        monkeypatch.setattr(service, "stream_manager", _DummyStreamManager(fallback))
        result = await service.start_recording("mint123")
        assert result["success"] is True


class TestRecordingStateEnum:
    def test_states(self):
        assert RecordingState.DISCONNECTED.value == "disconnected"
        assert RecordingState.CONNECTING.value == "connecting"
        assert RecordingState.RECORDING.value == "recording"
        assert RecordingState.STOPPING.value == "stopping"
        assert RecordingState.STOPPED.value == "stopped"

