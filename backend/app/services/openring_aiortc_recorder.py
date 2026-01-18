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


class MediaRelayProtocol(Protocol):
    def subscribe(
        self, track: MediaStreamTrackProtocol, buffered: bool = True
    ) -> MediaStreamTrackProtocol: ...


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

    @property
    def localDescription(self) -> SessionDescriptionProtocol | None: ...

    @property
    def iceGatheringState(self) -> str: ...

    @property
    def connectionState(self) -> str: ...

    @property
    def iceConnectionState(self) -> str: ...

    def close(self) -> Awaitable[None] | None: ...


SessionDescriptionFactory = Callable[[str, str], SessionDescriptionProtocol]
PeerConnectionFactory = Callable[[], PeerConnectionProtocol]
MediaRecorderFactory = Callable[[str], MediaRecorderProtocol]
MediaRelayFactory = Callable[[], MediaRelayProtocol]
SegmentCallback = Callable[[Path], Awaitable[None] | None]


@dataclass(frozen=True)
class RecorderSegment:
    path: Path
    started_at: datetime


class DiagnosticTrackWrapper:
    """Wrapper that logs frame reception for debugging."""
    
    def __init__(
        self,
        track: MediaStreamTrackProtocol,
        device_id: int,
        session_id: str,
    ):
        self._track = track
        self._device_id = device_id
        self._session_id = session_id
        self._frame_count = 0
        self._first_frame_logged = False
    
    @property
    def kind(self) -> str:
        return self._track.kind
    
    @property
    def readyState(self) -> str:
        return getattr(self._track, 'readyState', 'unknown')
    
    @property
    def id(self) -> str:
        return getattr(self._track, 'id', 'unknown')
    
    async def recv(self) -> object:
        """Receive a frame and log it for debugging."""
        frame = await self._track.recv()  # type: ignore[attr-defined]
        self._frame_count += 1
        if not self._first_frame_logged:
            self._first_frame_logged = True
            logger.info(
                "First frame received: device_id=%s session_id=%s track_kind=%s frame_type=%s",
                self._device_id, self._session_id, self.kind, type(frame).__name__
            )
        elif self._frame_count % 100 == 0:
            logger.debug(
                "Frame progress: device_id=%s session_id=%s track_kind=%s frame_count=%s",
                self._device_id, self._session_id, self.kind, self._frame_count
            )
        return frame


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
        media_relay_factory: Optional[MediaRelayFactory] = None,
        track_wait_timeout: float = 15.0,
        ice_gathering_timeout: float = 5.0,
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
        self._ice_gathering_timeout = ice_gathering_timeout
        self._time_provider = time_provider or time.time

        self._peer_connection_factory = peer_connection_factory or _load_peer_connection_factory()
        self._session_description_factory = (
            session_description_factory or _load_session_description_factory()
        )
        self._media_recorder_factory = media_recorder_factory or _load_media_recorder_factory()
        self._media_relay_factory = media_relay_factory or _load_media_relay_factory()

        self._peer_connection: Optional[PeerConnectionProtocol] = None
        self._media_relay: Optional[MediaRelayProtocol] = None
        self._segment_task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._track_ready = asyncio.Event()
        self._connection_ready = asyncio.Event()
        self._remote_tracks: list[MediaStreamTrackProtocol] = []
        self._segment_index = 0
        self._running = False
        self._connection_timeout = 30.0

    @property
    def is_running(self) -> bool:
        return self._running

    async def start(self) -> None:
        if self._running:
            raise RuntimeError("Recorder already running")

        logger.info(
            "Starting OpenRing recorder: device_id=%s session_id=%s output_dir=%s segment_duration=%s",
            self._device_id,
            self._session_id,
            self._output_dir,
            self._segment_duration,
        )
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._media_relay = self._media_relay_factory()
        self._peer_connection = self._peer_connection_factory()
        self._peer_connection.on("track")(self._handle_track)
        self._peer_connection.on("connectionstatechange")(self._handle_connection_state_change)
        self._peer_connection.on("iceconnectionstatechange")(self._handle_ice_connection_state_change)
        self._peer_connection.addTransceiver("audio", direction="recvonly")
        self._peer_connection.addTransceiver("video", direction="recvonly")

        offer = await _maybe_await(self._peer_connection.createOffer())
        await _maybe_await(self._peer_connection.setLocalDescription(offer))
        await _wait_for_ice_gathering_complete(self._peer_connection, self._ice_gathering_timeout)
        local_description = self._peer_connection.localDescription
        offer_sdp = local_description.sdp if local_description else offer.sdp

        logger.debug("Starting live view session for device_id=%s", self._device_id)
        response = await self._service.start_live_view(
            device_id=self._device_id,
            session_id=self._session_id,
            offer_sdp=offer_sdp,
        )
        remote_description = self._session_description_factory(response.answer_sdp, "answer")
        await _maybe_await(self._peer_connection.setRemoteDescription(remote_description))
        
        # Wait for WebRTC connection to be fully established (ICE + DTLS)
        logger.info(
            "Waiting for WebRTC connection: device_id=%s session_id=%s timeout=%s",
            self._device_id, self._session_id, self._connection_timeout
        )
        try:
            await asyncio.wait_for(self._connection_ready.wait(), timeout=self._connection_timeout)
            logger.info(
                "WebRTC connection established: device_id=%s session_id=%s connection_state=%s ice_state=%s",
                self._device_id, self._session_id,
                getattr(self._peer_connection, 'connectionState', 'unknown'),
                getattr(self._peer_connection, 'iceConnectionState', 'unknown'),
            )
        except asyncio.TimeoutError:
            conn_state = getattr(self._peer_connection, 'connectionState', 'unknown')
            ice_state = getattr(self._peer_connection, 'iceConnectionState', 'unknown')
            logger.warning(
                "WebRTC connection timeout: device_id=%s session_id=%s connection_state=%s ice_state=%s",
                self._device_id, self._session_id, conn_state, ice_state
            )
            # Continue anyway - sometimes media flows even if state isn't "connected"
        
        await self._service.activate_camera(self._session_id)
        logger.info("Live view session established for device_id=%s session_id=%s", self._device_id, self._session_id)

        self._segment_task = asyncio.create_task(self._segment_loop())
        self._running = True

    async def stop(self) -> None:
        if not self._running:
            return
        logger.info("Stopping OpenRing recorder: device_id=%s session_id=%s segments_created=%s", 
                   self._device_id, self._session_id, self._segment_index)
        self._stop_event.set()
        if self._segment_task:
            await self._segment_task
        if self._peer_connection:
            await _maybe_await(self._peer_connection.close())
        await self._service.end_live_view(self._session_id)
        self._running = False
        logger.info("OpenRing recorder stopped: device_id=%s", self._device_id)

    def _handle_track(self, track: MediaStreamTrackProtocol) -> None:
        # Log track state details for debugging
        track_state = getattr(track, 'readyState', 'unknown')
        track_id = getattr(track, 'id', 'unknown')
        logger.info(
            "Received remote track: device_id=%s session_id=%s track_kind=%s track_id=%s "
            "track_state=%s total_tracks=%s",
            self._device_id, self._session_id, track.kind, track_id,
            track_state, len(self._remote_tracks) + 1
        )
        self._remote_tracks.append(track)
        self._track_ready.set()

    def _handle_connection_state_change(self, *args: object) -> None:
        state = getattr(self._peer_connection, 'connectionState', 'unknown')
        logger.info(
            "WebRTC connection state changed: device_id=%s session_id=%s state=%s",
            self._device_id, self._session_id, state
        )
        if state == "connected":
            self._connection_ready.set()
        elif state in ("failed", "closed", "disconnected"):
            logger.warning(
                "WebRTC connection lost: device_id=%s session_id=%s state=%s",
                self._device_id, self._session_id, state
            )

    def _handle_ice_connection_state_change(self, *args: object) -> None:
        state = getattr(self._peer_connection, 'iceConnectionState', 'unknown')
        logger.info(
            "ICE connection state changed: device_id=%s session_id=%s state=%s",
            self._device_id, self._session_id, state
        )
        # Also trigger connection ready on ICE connected (backup for connectionState)
        if state == "connected" or state == "completed":
            self._connection_ready.set()

    async def _segment_loop(self) -> None:
        logger.info("Segment loop starting: device_id=%s session_id=%s waiting_for_tracks timeout=%s",
                   self._device_id, self._session_id, self._track_wait_timeout)
        try:
            await asyncio.wait_for(self._track_ready.wait(), timeout=self._track_wait_timeout)
            logger.info("Tracks received: device_id=%s session_id=%s track_count=%s",
                       self._device_id, self._session_id, len(self._remote_tracks))
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for remote tracks: device_id=%s session_id=%s timeout=%s",
                          self._device_id, self._session_id, self._track_wait_timeout)
            return
        
        # Log track details for debugging
        for track in self._remote_tracks:
            track_state = getattr(track, 'readyState', 'unknown')
            track_id = getattr(track, 'id', 'unknown')
            track_enabled = getattr(track, 'enabled', 'unknown')
            logger.info(
                "Track details: device_id=%s track_kind=%s track_id=%s state=%s enabled=%s",
                self._device_id, track.kind, track_id, track_state, track_enabled
            )
        
        # Probe for frames before starting recording
        await self._probe_for_frames()

        while not self._stop_event.is_set():
            segment = self._next_segment()
            logger.info("Creating segment: device_id=%s session_id=%s segment_index=%s path=%s",
                       self._device_id, self._session_id, self._segment_index - 1, segment.path)
            recorder = self._media_recorder_factory(str(segment.path))
            # Use MediaRelay to subscribe to tracks for each segment
            # This allows multiple segments to receive frames from the same source tracks
            for track in list(self._remote_tracks):
                track_state = getattr(track, 'readyState', 'unknown')
                logger.debug(
                    "Adding track to segment: device_id=%s track_kind=%s track_state=%s segment_index=%s",
                    self._device_id, track.kind, track_state, self._segment_index - 1
                )
                if self._media_relay:
                    relayed_track = self._media_relay.subscribe(track, buffered=False)
                    recorder.addTrack(relayed_track)
                else:
                    recorder.addTrack(track)

            logger.info(
                "Starting segment recording: device_id=%s segment_path=%s track_count=%s "
                "connection_state=%s ice_state=%s",
                self._device_id, segment.path, len(self._remote_tracks),
                getattr(self._peer_connection, 'connectionState', 'unknown') if self._peer_connection else 'none',
                getattr(self._peer_connection, 'iceConnectionState', 'unknown') if self._peer_connection else 'none',
            )
            try:
                await _maybe_await(recorder.start())
                logger.info(
                    "Segment recording started, waiting for frames: device_id=%s segment_path=%s duration=%s",
                    self._device_id, segment.path, self._segment_duration
                )
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self._segment_duration)
                except asyncio.TimeoutError:
                    pass
                
                # Log connection state before stopping
                logger.info(
                    "Stopping segment recording: device_id=%s connection_state=%s ice_state=%s",
                    self._device_id,
                    getattr(self._peer_connection, 'connectionState', 'unknown') if self._peer_connection else 'none',
                    getattr(self._peer_connection, 'iceConnectionState', 'unknown') if self._peer_connection else 'none',
                )
                await _maybe_await(recorder.stop())
                file_exists = segment.path.exists()
                file_size = segment.path.stat().st_size if file_exists else None
                logger.info("Segment recording completed: device_id=%s segment_path=%s segment_index=%s",
                           self._device_id, segment.path, self._segment_index - 1)
                logger.info(
                    "Segment file status: device_id=%s path=%s exists=%s size=%s",
                    self._device_id,
                    segment.path,
                    file_exists,
                    file_size,
                )
                
                # If file doesn't exist or is empty, log diagnostic info
                if not file_exists or (file_size is not None and file_size == 0):
                    logger.error(
                        "RECORDING FAILED - No media data received: device_id=%s path=%s. "
                        "This usually means the WebRTC connection is not receiving media from Ring. "
                        "Check firewall settings and ensure UDP traffic is allowed.",
                        self._device_id, segment.path
                    )

                if self._on_segment_complete:
                    logger.debug("Invoking segment complete callback: device_id=%s segment_path=%s",
                                self._device_id, segment.path)
                    await _maybe_await(self._on_segment_complete(segment.path))
                    logger.debug("Segment callback completed: device_id=%s segment_path=%s",
                                self._device_id, segment.path)
            except Exception as exc:
                logger.error("Error recording segment: device_id=%s segment_path=%s error=%s",
                            self._device_id, segment.path, exc, exc_info=True)

    async def _probe_for_frames(self, timeout: float = 10.0) -> bool:
        """
        Probe tracks to verify frames are being received.
        Uses MediaRelay subscriptions so we don't consume the actual track frames.
        """
        if not self._remote_tracks or not self._media_relay:
            logger.warning(
                "Cannot probe for frames: device_id=%s tracks=%s relay=%s",
                self._device_id, len(self._remote_tracks), self._media_relay is not None
            )
            return False
        
        logger.info(
            "Probing for frames: device_id=%s session_id=%s timeout=%s",
            self._device_id, self._session_id, timeout
        )
        
        # Try to receive a frame from the video track
        video_tracks = [t for t in self._remote_tracks if t.kind == "video"]
        if not video_tracks:
            logger.warning("No video track found for probing: device_id=%s", self._device_id)
            return False
        
        video_track = video_tracks[0]
        probe_track = self._media_relay.subscribe(video_track, buffered=False)
        
        try:
            # Try to receive a single frame
            recv_method = getattr(probe_track, 'recv', None)
            if not recv_method:
                logger.warning(
                    "Probe track has no recv method: device_id=%s track_type=%s",
                    self._device_id, type(probe_track).__name__
                )
                return False
            
            frame = await asyncio.wait_for(recv_method(), timeout=timeout)
            frame_type = type(frame).__name__
            frame_info = ""
            if hasattr(frame, 'width') and hasattr(frame, 'height'):
                frame_info = f" size={frame.width}x{frame.height}"
            if hasattr(frame, 'pts'):
                frame_info += f" pts={frame.pts}"
            
            logger.info(
                "Frame probe SUCCESS: device_id=%s session_id=%s frame_type=%s%s",
                self._device_id, self._session_id, frame_type, frame_info
            )
            return True
        except asyncio.TimeoutError:
            logger.error(
                "Frame probe FAILED - No frames received within %ss: device_id=%s session_id=%s. "
                "WebRTC connection is not receiving media. Possible causes: "
                "1) Ring session expired or invalid, "
                "2) Firewall blocking UDP traffic, "
                "3) NAT traversal failed, "
                "4) Ring server not sending media",
                timeout, self._device_id, self._session_id
            )
            return False
        except Exception as exc:
            logger.error(
                "Frame probe ERROR: device_id=%s session_id=%s error=%s",
                self._device_id, self._session_id, exc, exc_info=True
            )
            return False

    def _next_segment(self) -> RecorderSegment:
        timestamp = datetime.fromtimestamp(self._time_provider(), tz=timezone.utc)
        filename = (
            f"ring_{self._device_id}_{timestamp.strftime('%Y%m%dT%H%M%SZ')}_{self._segment_index}.mp4"
        )
        self._segment_index += 1
        segment = RecorderSegment(path=self._output_dir / filename, started_at=timestamp)
        logger.debug("Generated segment path: device_id=%s segment_index=%s path=%s",
                    self._device_id, self._segment_index - 1, segment.path)
        return segment


async def _wait_for_ice_gathering_complete(
    peer_connection: PeerConnectionProtocol, timeout: float
) -> None:
    state = getattr(peer_connection, "iceGatheringState", None)
    if state in (None, "complete"):
        logger.debug("ICE gathering already complete or not supported: state=%s", state)
        return
    logger.debug("Waiting for ICE gathering to complete: initial_state=%s timeout=%s", state, timeout)
    event = asyncio.Event()

    @peer_connection.on("icegatheringstatechange")
    def on_state_change(_: object = None) -> None:
        new_state = getattr(peer_connection, "iceGatheringState", None)
        logger.debug("ICE gathering state changed: state=%s", new_state)
        if new_state == "complete":
            event.set()

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        logger.debug("ICE gathering completed successfully")
    except asyncio.TimeoutError:
        logger.warning("Timed out waiting for ICE gathering to complete: timeout=%s", timeout)


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


def _load_media_relay_factory() -> MediaRelayFactory:
    try:
        from aiortc.contrib.media import MediaRelay
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return MediaRelay
