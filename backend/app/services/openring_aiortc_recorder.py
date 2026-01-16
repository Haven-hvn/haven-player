"""
aiortc-based recorder for Ring live view sessions.

Establishes a WebRTC connection, records segmented media files, and invokes
callbacks when segments complete.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import inspect
import time
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional, Protocol

from app.services.openring_service import OpenRingService

logger = logging.getLogger(__name__)


class OpenRingRecorderDependencyError(RuntimeError):
    """Raised when aiortc dependencies are missing."""


class MediaStreamTrackProtocol(Protocol):
    kind: str


class SessionDescriptionProtocol(Protocol):
    sdp: str
    type: str


class MediaRecorderProtocol(Protocol):
    def addTrack(self, track: MediaStreamTrackProtocol) -> None: ...

    def start(self) -> Awaitable[None] | None: ...

    def stop(self) -> Awaitable[None] | None: ...


class PeerConnectionProtocol(Protocol):
    def addTransceiver(self, kind: str, direction: str) -> None: ...

    def on(
        self, event: str
    ) -> Callable[[Callable[[MediaStreamTrackProtocol], None]], Callable[[MediaStreamTrackProtocol], None]]: ...

    def createOffer(self) -> Awaitable[SessionDescriptionProtocol] | SessionDescriptionProtocol: ...

    def setLocalDescription(
        self, description: SessionDescriptionProtocol
    ) -> Awaitable[None] | None: ...

    def setRemoteDescription(
        self, description: SessionDescriptionProtocol
    ) -> Awaitable[None] | None: ...

    def close(self) -> Awaitable[None] | None: ...


SessionDescriptionFactory = Callable[[str, str], SessionDescriptionProtocol]
PeerConnectionFactory = Callable[[], PeerConnectionProtocol]
MediaRecorderFactory = Callable[[str], MediaRecorderProtocol]
SegmentCallback = Callable[[Path], Awaitable[None] | None]


@dataclass(frozen=True)
class RecorderSegment:
    path: Path
    started_at: datetime


class OpenRingAiortcRecorder:
    """Record Ring live view sessions into fixed-length segments."""

    def __init__(
        self,
        service: OpenRingService,
        device_id: int,
        session_id: str,
        output_dir: Path,
        segment_duration: float,
        on_segment_complete: Optional[SegmentCallback] = None,
        peer_connection_factory: Optional[PeerConnectionFactory] = None,
        session_description_factory: Optional[SessionDescriptionFactory] = None,
        media_recorder_factory: Optional[MediaRecorderFactory] = None,
        track_wait_timeout: float = 15.0,
        time_provider: Optional[Callable[[], float]] = None,
    ):
        if segment_duration <= 0:
            raise ValueError("segment_duration must be positive")
        self._service = service
        self._device_id = device_id
        self._session_id = session_id
        self._output_dir = output_dir
        self._segment_duration = segment_duration
        self._on_segment_complete = on_segment_complete
        self._track_wait_timeout = track_wait_timeout
        self._time_provider = time_provider or time.time

        self._peer_connection_factory = peer_connection_factory or _load_peer_connection_factory()
        self._session_description_factory = (
            session_description_factory or _load_session_description_factory()
        )
        self._media_recorder_factory = media_recorder_factory or _load_media_recorder_factory()

        self._peer_connection: Optional[PeerConnectionProtocol] = None
        self._segment_task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._track_ready = asyncio.Event()
        self._remote_tracks: list[MediaStreamTrackProtocol] = []
        self._segment_index = 0
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    async def start(self) -> None:
        if self._running:
            raise RuntimeError("Recorder already running")

        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._peer_connection = self._peer_connection_factory()
        self._peer_connection.on("track")(self._handle_track)
        self._peer_connection.addTransceiver("audio", direction="recvonly")
        self._peer_connection.addTransceiver("video", direction="recvonly")

        offer = await _maybe_await(self._peer_connection.createOffer())
        await _maybe_await(self._peer_connection.setLocalDescription(offer))

        response = await self._service.start_live_view(
            device_id=self._device_id,
            session_id=self._session_id,
            offer_sdp=offer.sdp,
        )
        remote_description = self._session_description_factory(response.answer_sdp, "answer")
        await _maybe_await(self._peer_connection.setRemoteDescription(remote_description))
        await self._service.activate_camera(self._session_id)

        self._segment_task = asyncio.create_task(self._segment_loop())
        self._running = True

    async def stop(self) -> None:
        if not self._running:
            return
        self._stop_event.set()
        if self._segment_task:
            await self._segment_task
        if self._peer_connection:
            await _maybe_await(self._peer_connection.close())
        await self._service.end_live_view(self._session_id)
        self._running = False

    def _handle_track(self, track: MediaStreamTrackProtocol) -> None:
        self._remote_tracks.append(track)
        self._track_ready.set()

    async def _segment_loop(self) -> None:
        try:
            await asyncio.wait_for(self._track_ready.wait(), timeout=self._track_wait_timeout)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for remote tracks")
            return

        while not self._stop_event.is_set():
            segment = self._next_segment()
            recorder = self._media_recorder_factory(str(segment.path))
            for track in list(self._remote_tracks):
                recorder.addTrack(track)

            await _maybe_await(recorder.start())
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._segment_duration)
            except asyncio.TimeoutError:
                pass
            await _maybe_await(recorder.stop())

            if self._on_segment_complete:
                await _maybe_await(self._on_segment_complete(segment.path))

    def _next_segment(self) -> RecorderSegment:
        timestamp = datetime.fromtimestamp(self._time_provider(), tz=timezone.utc)
        filename = (
            f"ring_{self._device_id}_{timestamp.strftime('%Y%m%dT%H%M%SZ')}_{self._segment_index}.mp4"
        )
        self._segment_index += 1
        return RecorderSegment(path=self._output_dir / filename, started_at=timestamp)


async def _maybe_await(value: Awaitable[None] | None | object) -> object:
    if inspect.isawaitable(value):
        return await value
    return value


def _load_peer_connection_factory() -> PeerConnectionFactory:
    try:
        from aiortc import RTCPeerConnection
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return RTCPeerConnection


def _load_session_description_factory() -> SessionDescriptionFactory:
    try:
        from aiortc import RTCSessionDescription
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return RTCSessionDescription


def _load_media_recorder_factory() -> MediaRecorderFactory:
    try:
        from aiortc.contrib.media import MediaRecorder
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return MediaRecorder
