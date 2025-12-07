"""
Boombox-based recording service that pulls pump.fun LiveKit streams via URL.

This replaces the LiveKit ParticipantRecorder flow with a pull-based pipeline
using boomboxlib. It keeps the public API compatible for start/stop/status
while relying on StreamManager for discovery and metadata.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, Optional, Tuple

try:
    from boombox import Array, AudioPacket, Boombox, VideoPacket

    HAS_BOOMBOX = True
except Exception:  # pragma: no cover - import guard
    Array = None  # type: ignore
    AudioPacket = None  # type: ignore
    Boombox = None  # type: ignore
    VideoPacket = None  # type: ignore
    HAS_BOOMBOX = False

from app.lib.phash_generator.phash_calculator import get_video_duration
from app.lib.thumbnail_generator import generate_video_thumbnail
from app.models.live_session import LiveSession
from app.models.video import Video
from app.models.database import get_db
from app.services.stream_manager import StreamInfo, StreamManager
import httpx

logger = logging.getLogger(__name__)


class RecordingState(Enum):
    """High level recording lifecycle."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    RECORDING = "recording"
    STOPPING = "stopping"
    STOPPED = "stopped"


@dataclass
class RecordingStats:
    """Lightweight stats gathered during recording."""

    video_packets: int = 0
    audio_packets: int = 0
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class BoomboxRecordingSession:
    """Encapsulates a single Boombox pull pipeline with resilience primitives."""

    def __init__(
        self,
        mint_id: str,
        ingest_url: str,
        output_path: Path,
        *,
        max_retries: int = 3,
        retry_backoff_base: float = 1.0,
        stall_timeout_sec: float = 15.0,
    ) -> None:
        self.mint_id = mint_id
        self.ingest_url = ingest_url
        self.output_path = output_path
        self.state: RecordingState = RecordingState.DISCONNECTED
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self.stats = RecordingStats()
        self.max_retries = max_retries
        self.retry_backoff_base = retry_backoff_base
        self.stall_timeout_sec = stall_timeout_sec
        self.retry_count: int = 0
        self.last_error: Optional[str] = None
        self.last_packet_monotonic: Optional[float] = None
        self._start_monotonic: Optional[float] = None
        self._requested_new_ingest: Optional[str] = None

    async def start(self) -> None:
        if not HAS_BOOMBOX:
            raise ImportError("boomboxlib is not installed")
        if self._task:
            raise RuntimeError("Recording already started")
        self.state = RecordingState.CONNECTING
        self.stats.started_at = datetime.now(timezone.utc)
        self._task = asyncio.create_task(self._run_with_retries())

    async def stop(self) -> None:
        self.state = RecordingState.STOPPING
        self._stop_event.set()
        if self._task:
            await self._task
        self.state = RecordingState.STOPPED
        self.stats.ended_at = datetime.now(timezone.utc)

    def request_restart(self, ingest_url: str) -> None:
        self._requested_new_ingest = ingest_url
        self._stop_event.set()

    async def _run_with_retries(self) -> None:
        try:
            attempt = 0
            while True:
                if self._stop_event.is_set() and not self._requested_new_ingest:
                    break
                if self._requested_new_ingest:
                    self.ingest_url = self._requested_new_ingest
                    self._requested_new_ingest = None
                    self._stop_event.clear()
                try:
                    self.state = RecordingState.CONNECTING
                    await asyncio.to_thread(self._run_once)
                    return
                except Exception as exc:  # pragma: no cover - retry path
                    self.last_error = str(exc)
                    self.retry_count += 1
                    attempt += 1
                    if attempt > self.max_retries:
                        self.state = RecordingState.STOPPED
                        return
                    backoff = self.retry_backoff_base * attempt
                    await asyncio.sleep(backoff)
        finally:
            self.state = RecordingState.STOPPED

    def _run_once(self) -> None:
        """Blocking loop moving packets from ingest to output with stall detection."""
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        writer: Optional[Boombox] = None
        reader: Optional[Boombox] = None
        self.last_packet_monotonic = None
        self._start_monotonic = time.monotonic()
        try:
            reader = Boombox(input=self.ingest_url, output=Array(video=True, audio=True))
            writer = Boombox(input=Array(video=True, audio=True), output=str(self.output_path))
            self.state = RecordingState.RECORDING
            for packet in reader.read():
                if self._stop_event.is_set():
                    raise RuntimeError("Restart requested")
                writer.write(packet)
                now = time.monotonic()
                self.last_packet_monotonic = now
                if isinstance(packet, VideoPacket):
                    self.stats.video_packets += 1
                elif isinstance(packet, AudioPacket):
                    self.stats.audio_packets += 1
            writer.close(wait=True)
            reader.close(wait=True)
        finally:
            if writer:
                try:
                    writer.close(wait=True)
                except Exception:
                    pass
            if reader:
                try:
                    reader.close(wait=True)
                except Exception:
                    pass
            if not self.output_path.exists():
                self.output_path.touch()

    def status(self) -> Dict[str, object]:
        return {
            "mint_id": self.mint_id,
            "state": self.state.value,
            "output_path": str(self.output_path),
            "video_packets": self.stats.video_packets,
            "audio_packets": self.stats.audio_packets,
            "started_at": self.stats.started_at.isoformat() if self.stats.started_at else None,
            "ended_at": self.stats.ended_at.isoformat() if self.stats.ended_at else None,
            "retry_count": self.retry_count,
            "last_error": self.last_error,
            "ingest_url": self.ingest_url,
            "last_packet_at": self._format_last_packet(),
        }

    @property
    def is_active(self) -> bool:
        return self.state in {RecordingState.CONNECTING, RecordingState.RECORDING}

    def _format_last_packet(self) -> Optional[str]:
        if self.last_packet_monotonic is None:
            return None
        if self.stats.started_at:
            if self._start_monotonic is None:
                return None
            delta = self.last_packet_monotonic - self._start_monotonic
            return (self.stats.started_at + timedelta(seconds=delta)).isoformat()
        return None


class WebRTCRecordingService:
    """
    Public recording service API. Maintains start/stop/status compatibility while
    using Boombox under the hood.
    """

    _service_lock: Optional[asyncio.Lock] = None

    def __init__(self, output_dir: str = "recordings") -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.stream_manager = StreamManager()
        self.active_recordings: Dict[str, BoomboxRecordingSession] = {}
        self.default_config = {
            "format": "mp4",
            "video_codec": "h264",
            "audio_codec": "aac",
            "video_bitrate": "4M",
            "audio_bitrate": "192k",
            "max_retries": 3,
            "retry_backoff_base": 1.0,
            "stall_timeout_sec": 15.0,
            "ingest_refresh_interval_sec": 120.0,
            "min_free_space_mb": 200,
            "min_output_bytes": 2048,
            "ingest_check_attempts": 3,
            "ingest_check_timeout_sec": 5.0,
            "ingest_check_backoff_sec": 1.0,
        }
        self._watchdogs: Dict[str, asyncio.Task[None]] = {}
        self._refresh_tasks: Dict[str, asyncio.Task[None]] = {}
        logger.info("Boombox-based WebRTCRecordingService initialized at %s", self.output_dir)

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._service_lock is None:
            cls._service_lock = asyncio.Lock()
        return cls._service_lock

    def _build_output_path(self, mint_id: str) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return self.output_dir / f"{mint_id}_{timestamp}.mp4"

    async def start_recording(self, mint_id: str, video_quality: str = "high") -> Dict[str, object]:
        async with self._get_lock():
            return await self._start_recording_impl(mint_id, video_quality)

    async def _start_recording_impl(self, mint_id: str, video_quality: str) -> Dict[str, object]:
        if mint_id in self.active_recordings:
            return {"success": False, "error": f"Recording already active for {mint_id}"}

        stream_info = await self.stream_manager.get_stream_info(mint_id)
        if not stream_info:
            return {"success": False, "error": f"No active stream found for {mint_id}"}

        ingest_url = self._resolve_ingest_url(stream_info)
        if not ingest_url:
            return {"success": False, "error": "No ingest URL available for recording"}

        if not self._has_disk_space():
            return {"success": False, "error": "Insufficient disk space for recording"}

        if not await self._wait_for_ingest_ready(ingest_url):
            return {"success": False, "error": "Ingest URL not reachable"}

        output_path = self._build_output_path(mint_id)
        session = BoomboxRecordingSession(
            mint_id=mint_id,
            ingest_url=ingest_url,
            output_path=output_path,
            max_retries=int(self.default_config["max_retries"]),
            retry_backoff_base=float(self.default_config["retry_backoff_base"]),
            stall_timeout_sec=float(self.default_config["stall_timeout_sec"]),
        )

        try:
            await session.start()
        except Exception as exc:
            logger.error("Failed to start Boombox recording: %s", exc)
            return {"success": False, "error": str(exc)}

        self.active_recordings[mint_id] = session
        self._start_watchdog_task(mint_id, session)
        self._start_refresh_task(mint_id, session)
        self._persist_live_session_start(mint_id, stream_info, output_path)
        return {"success": True, "mint_id": mint_id, "output_path": str(output_path)}

    async def stop_recording(self, mint_id: str) -> Dict[str, object]:
        async with self._get_lock():
            return await self._stop_recording_impl(mint_id)

    async def _stop_recording_impl(self, mint_id: str) -> Dict[str, object]:
        if mint_id not in self.active_recordings:
            return {"success": False, "error": f"No active recording for {mint_id}"}

        session = self.active_recordings[mint_id]
        try:
            await session.stop()
        finally:
            del self.active_recordings[mint_id]
            await self._cancel_background_tasks(mint_id)

        output_path = str(session.output_path)
        if not self._is_output_valid(output_path):
            return {"success": False, "error": "Output file is empty or missing", "output_path": output_path}

        self._persist_live_session_stop(mint_id, output_path)
        self._persist_video_entry(mint_id, output_path)
        return {"success": True, "output_path": output_path}

    async def get_recording_status(self, mint_id: str) -> Dict[str, object]:
        if mint_id in self.active_recordings:
            status = self.active_recordings[mint_id].status()
            status["success"] = True
            return status

        return {"success": False, "error": f"No active recording for {mint_id}", "state": RecordingState.STOPPED.value}

    async def get_all_recordings(self) -> Dict[str, object]:
        return {
            "success": True,
            "count": len(self.active_recordings),
            "recordings": {mint_id: session.status() for mint_id, session in self.active_recordings.items()},
        }

    def _resolve_ingest_url(self, stream_info: StreamInfo) -> Optional[str]:
        if stream_info.ingest_url:
            return stream_info.ingest_url
        if stream_info.stream_data:
            candidate = stream_info.stream_data.get("ingest_url")
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    async def _wait_for_ingest_ready(self, ingest_url: str) -> bool:
        attempts = int(self.default_config.get("ingest_check_attempts", 3))
        timeout = float(self.default_config.get("ingest_check_timeout_sec", 5.0))
        backoff = float(self.default_config.get("ingest_check_backoff_sec", 1.0))
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    # Use HEAD first; some servers may not support it, so fall back to GET range
                    try:
                        resp = await client.head(ingest_url)
                        if resp.status_code < 400:
                            return True
                    except Exception:
                        resp = await client.get(ingest_url, headers={"Range": "bytes=0-0"})
                        if resp.status_code < 400:
                            return True
            except Exception as exc:
                logger.warning("Ingest check failed (attempt %s/%s): %s", attempt + 1, attempts, exc)
            if attempt + 1 < attempts:
                await asyncio.sleep(backoff * (attempt + 1))
        return False

    def _has_disk_space(self) -> bool:
        usage = shutil.disk_usage(self.output_dir)
        min_free = float(self.default_config.get("min_free_space_mb", 200)) * 1024 * 1024
        return usage.free >= min_free

    def _is_output_valid(self, output_path: str) -> bool:
        if not output_path or not os.path.exists(output_path):
            return False
        min_bytes = int(self.default_config.get("min_output_bytes", 2048))
        try:
            return os.path.getsize(output_path) >= min_bytes
        except OSError:
            return False

    def _start_watchdog_task(self, mint_id: str, session: BoomboxRecordingSession) -> None:
        if session.stall_timeout_sec <= 0:
            return
        task = asyncio.create_task(self._watch_session(mint_id, session))
        self._watchdogs[mint_id] = task

    def _start_refresh_task(self, mint_id: str, session: BoomboxRecordingSession) -> None:
        interval = float(self.default_config.get("ingest_refresh_interval_sec", 0))
        if interval <= 0:
            return
        task = asyncio.create_task(self._refresh_ingest_loop(mint_id, session, interval))
        self._refresh_tasks[mint_id] = task

    async def _cancel_background_tasks(self, mint_id: str) -> None:
        for mapping in (self._watchdogs, self._refresh_tasks):
            task = mapping.pop(mint_id, None)
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    async def _watch_session(self, mint_id: str, session: BoomboxRecordingSession) -> None:
        stall_timeout = float(self.default_config.get("stall_timeout_sec", 15.0))
        while session.is_active:
            await asyncio.sleep(1.0)
            last_packet = session.last_packet_monotonic
            if last_packet is None:
                continue
            if (time.monotonic() - last_packet) > stall_timeout:
                logger.warning("[%s] Stall detected, requesting restart", mint_id)
                session.request_restart(session.ingest_url)
                break

    async def _refresh_ingest_loop(
        self, mint_id: str, session: BoomboxRecordingSession, interval_sec: float
    ) -> None:
        while session.is_active:
            await asyncio.sleep(interval_sec)
            try:
                refreshed = await self.stream_manager.get_stream_info(mint_id)
                if not refreshed:
                    continue
                new_ingest = self._resolve_ingest_url(refreshed)
                if new_ingest and new_ingest != session.ingest_url:
                    logger.info("[%s] Ingest URL changed, restarting with new URL", mint_id)
                    session.request_restart(new_ingest)
                    break
            except Exception as exc:
                logger.warning("[%s] Ingest refresh failed: %s", mint_id, exc)

    def _persist_live_session_start(self, mint_id: str, stream_info: StreamInfo, output_path: Path) -> None:
        try:
            db = next(get_db())
            try:
                existing = db.query(LiveSession).filter(
                    LiveSession.mint_id == mint_id, LiveSession.status == "active"
                ).first()
                if existing:
                    existing.record_session = True
                    existing.recording_path = str(output_path)
                else:
                    live_session = LiveSession(
                        mint_id=mint_id,
                        room_name=stream_info.room_name,
                        participant_sid=stream_info.participant_sid,
                        status="active",
                        record_session=True,
                        recording_path=str(output_path),
                        created_at=datetime.now(timezone.utc),
                    )
                    db.add(live_session)
                db.commit()
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover - best-effort
            logger.warning("Could not persist live session start: %s", exc)

    def _persist_live_session_stop(self, mint_id: str, output_path: str) -> None:
        try:
            db = next(get_db())
            try:
                session = (
                    db.query(LiveSession)
                    .filter(LiveSession.mint_id == mint_id, LiveSession.status == "active")
                    .first()
                )
                if session:
                    session.record_session = False
                    session.recording_path = output_path
                    session.ended_at = datetime.now(timezone.utc)
                    db.commit()
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover - best-effort
            logger.warning("Could not persist live session stop: %s", exc)

    def _persist_video_entry(self, mint_id: str, output_path: str) -> None:
        try:
            db = next(get_db())
            try:
                existing_video = db.query(Video).filter(Video.path == output_path).first()
                if existing_video:
                    return

                duration_seconds = 0
                try:
                    duration_seconds = int(get_video_duration(output_path))
                except Exception:
                    pass

                title = f"Recording - {mint_id}"
                video_entry = Video(
                    path=output_path,
                    title=title,
                    duration=duration_seconds,
                    has_ai_data=False,
                    thumbnail_path=None,
                    position=0,
                    phash=None,
                    mint_id=mint_id,
                )
                db.add(video_entry)
                db.commit()
                db.refresh(video_entry)

                thumbnail_path = generate_video_thumbnail(output_path)
                if thumbnail_path:
                    video_entry.thumbnail_path = thumbnail_path
                    db.commit()
            finally:
                db.close()
        except Exception as exc:  # pragma: no cover - best-effort
            logger.warning("Could not persist video entry: %s", exc)


