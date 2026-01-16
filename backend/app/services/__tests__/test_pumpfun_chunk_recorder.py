from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

import pytest

from app.services.pumpfun_chunk_recorder import PumpFunChunkRecorder


@dataclass
class FakeFrameEvent:
    frame: object


@dataclass
class FakeParticipant:
    identity: str
    sid: str


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
