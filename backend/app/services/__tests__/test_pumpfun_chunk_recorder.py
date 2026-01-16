from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from app.services.pumpfun_chunk_recorder import PumpFunChunkRecorder
from app.services import pumpfun_chunk_recorder as recorder_module


@dataclass
class FakeFrameEvent:
    frame: object


@dataclass
class FakeParticipant:
    identity: str
    sid: str


@dataclass
class FakePublication:
    kind: object
    subscribed: bool = False
    calls: list[bool] = field(default_factory=list)

    def set_subscribed(self, value: bool) -> None:
        self.subscribed = value
        self.calls.append(value)


@dataclass
class FakeParticipantWithPublications:
    track_publications: dict[str, FakePublication]


class FakePublicationError(FakePublication):
    def set_subscribed(self, value: bool) -> None:
        raise RuntimeError("subscription failed")


class FakeVideoStream:
    def __init__(self, events: list[FakeFrameEvent]):
        self._events = events
        self._index = 0
        self.closed = False

    def __aiter__(self):
        return self

    async def __anext__(self) -> FakeFrameEvent:
        if self._index >= len(self._events):
            raise StopAsyncIteration
        event = self._events[self._index]
        self._index += 1
        return event

    async def aclose(self) -> None:
        self.closed = True


class DummyRoom:
    def __init__(self, remote_participants: dict[str, object] | None = None):
        self.remote_participants = remote_participants or {}


@pytest.mark.asyncio
async def test_capture_video_frames_sets_first_frame_event() -> None:
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )
    recorder._is_recording = True
    recorder._video_capture_stream = FakeVideoStream([FakeFrameEvent(frame=object())])

    await recorder._capture_video_frames()

    assert recorder._first_video_frame_event.is_set() is True
    assert recorder._video_queue.qsize() == 1
    assert recorder._stats["frames_captured"] == 1


@pytest.mark.asyncio
async def test_start_recording_waits_for_first_frame() -> None:
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=1.0,
    )

    recorder._find_participant = lambda identity: object()

    async def fake_subscribe(_: object) -> None:
        return None

    async def fake_start_frame_capture() -> None:
        async def set_event() -> None:
            await asyncio.sleep(0)
            recorder._first_video_frame_event.set()

        asyncio.create_task(set_event())

    async def fake_start_new_segment() -> Path:
        return Path("/tmp/fake.webm")

    async def fake_encoding_loop() -> None:
        return None

    recorder._subscribe_to_tracks = fake_subscribe
    recorder._start_frame_capture = fake_start_frame_capture
    recorder._start_new_segment = fake_start_new_segment
    recorder._encoding_loop = fake_encoding_loop

    result = await recorder.start_recording("participant")

    assert result["success"] is True
    assert recorder._stats["recording_start_time"] is not None


@pytest.mark.asyncio
async def test_wait_for_first_video_frame_timeout() -> None:
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.01,
    )

    with pytest.raises(TimeoutError):
        await recorder._wait_for_first_video_frame()


def test_find_participant_matches_identity_or_sid() -> None:
    participant = FakeParticipant(identity="identity", sid="sid")
    room = DummyRoom(remote_participants={"sid": participant})
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=room,
        output_dir=".",
        first_frame_timeout=0.1,
    )

    assert recorder._find_participant("identity") is participant
    assert recorder._find_participant("sid") is participant


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe_tracks(monkeypatch) -> None:
    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(recorder_module.asyncio, "sleep", no_sleep)

    publications = {
        "video": FakePublication(kind=recorder_module.rtc.TrackKind.KIND_VIDEO),
        "audio": FakePublication(kind=recorder_module.rtc.TrackKind.KIND_AUDIO),
    }
    participant = FakeParticipantWithPublications(track_publications=publications)
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    await recorder._subscribe_to_tracks(participant)

    assert publications["video"].subscribed is True
    assert publications["audio"].subscribed is True

    await recorder._unsubscribe_from_tracks(participant)

    assert publications["video"].subscribed is False
    assert publications["audio"].subscribed is False


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe_tracks_handles_errors(monkeypatch) -> None:
    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(recorder_module.asyncio, "sleep", no_sleep)

    publications = {
        "video": FakePublicationError(kind=recorder_module.rtc.TrackKind.KIND_VIDEO),
        "audio": FakePublicationError(kind=recorder_module.rtc.TrackKind.KIND_AUDIO),
    }
    participant = FakeParticipantWithPublications(track_publications=publications)
    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    await recorder._subscribe_to_tracks(participant)
    await recorder._unsubscribe_from_tracks(participant)


def test_get_plane_size_prefers_buffer_size() -> None:
    class Plane:
        buffer_size = 12

    assert PumpFunChunkRecorder._get_plane_size(Plane()) == 12


def test_get_plane_size_falls_back_to_nbytes() -> None:
    class Plane:
        nbytes = 16

    assert PumpFunChunkRecorder._get_plane_size(Plane()) == 16


def test_get_plane_size_falls_back_to_len() -> None:
    class Plane:
        def __len__(self) -> int:
            return 24

    assert PumpFunChunkRecorder._get_plane_size(Plane()) == 24


def test_detect_keyframe_prefers_is_keyframe() -> None:
    class Packet:
        is_keyframe = True

    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    assert recorder._detect_keyframe_in_packet(Packet()) is True


def test_detect_keyframe_falls_back_to_keyframe() -> None:
    class Packet:
        keyframe = False

    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    assert recorder._detect_keyframe_in_packet(Packet()) is False


def test_detect_keyframe_falls_back_to_flags() -> None:
    class Packet:
        flags = 0x0001

    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    assert recorder._detect_keyframe_in_packet(Packet()) is True


def test_detect_keyframe_defaults_false() -> None:
    class Packet:
        pass

    recorder = PumpFunChunkRecorder(
        mint_id="mint",
        room=DummyRoom(),
        output_dir=".",
        first_frame_timeout=0.1,
    )

    assert recorder._detect_keyframe_in_packet(Packet()) is False
