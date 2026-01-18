"""
OpenRing recording manager.

Tracks active Ring live view recordings and coordinates segment uploads.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Optional, Iterable
import uuid

from app.services.openring_aiortc_recorder import OpenRingAiortcRecorder
from app.services.openring_service import OpenRingService, RingDevice
from app.services.upload_coordinator import UploadCoordinator

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OpenRingSubscription:
    device_id: int
    device_name: str
    enabled: bool

    @classmethod
    def from_config(cls, payload: dict[str, object]) -> Optional["OpenRingSubscription"]:
        raw_device_id = payload.get("device_id")
        if not isinstance(raw_device_id, (int, str)):
            return None
        try:
            device_id = int(raw_device_id)
        except ValueError:
            return None
        device_name = payload.get("device_name")
        if not isinstance(device_name, str):
            device_name = str(raw_device_id)
        enabled = bool(payload.get("enabled", True))
        return cls(device_id=device_id, device_name=device_name, enabled=enabled)


@dataclass
class OpenRingRecordingSession:
    device_id: int
    device_name: str
    session_id: str
    output_dir: Path
    recorder: OpenRingAiortcRecorder
    started_at: datetime


class OpenRingRecordingManager:
    """Singleton manager for Ring live view recordings."""

    _instance: Optional["OpenRingRecordingManager"] = None

    def __new__(cls) -> "OpenRingRecordingManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if not hasattr(self, "_initialized"):
            self.active_recordings: dict[int, OpenRingRecordingSession] = {}
            self.upload_coordinator = UploadCoordinator()
            self._recorder_factory = OpenRingAiortcRecorder
            self._manage_lock = asyncio.Lock()
            self._initialized = True

    def set_recorder_factory(self, factory: type[OpenRingAiortcRecorder]) -> None:
        self._recorder_factory = factory

    def get_status(self, device_id: int) -> dict[str, object]:
        session = self.active_recordings.get(device_id)
        if not session:
            return {"device_id": device_id, "recording": False}
        return {
            "device_id": device_id,
            "recording": True,
            "device_name": session.device_name,
            "session_id": session.session_id,
            "output_dir": str(session.output_dir),
            "started_at": session.started_at.isoformat(),
        }

    async def manage_subscriptions(
        self,
        subscriptions: Iterable[OpenRingSubscription],
        online_device_ids: set[int],
        service: OpenRingService,
        segment_duration: int,
        output_dir: Path,
    ) -> dict[str, int | str]:
        if self._manage_lock.locked():
            return {
                "status": "busy",
                "active": len(self.active_recordings),
                "started": 0,
                "stopped": 0,
                "errors": 0,
            }

        async with self._manage_lock:
            stats = {"status": "ok", "active": 0, "started": 0, "stopped": 0, "errors": 0}
            for subscription in subscriptions:
                if not subscription.enabled:
                    continue
                device_id = subscription.device_id
                is_online = device_id in online_device_ids

                try:
                    if is_online and device_id not in self.active_recordings:
                        started = await self.start_recording(
                            device_id=device_id,
                            device_name=subscription.device_name,
                            service=service,
                            segment_duration=segment_duration,
                            output_dir=output_dir,
                        )
                        if started:
                            stats["started"] += 1
                    if not is_online and device_id in self.active_recordings:
                        stopped = await self.stop_recording(device_id)
                        if stopped:
                            stats["stopped"] += 1
                except Exception as exc:
                    logger.error(f"Error managing device {device_id}: {exc}")
                    stats["errors"] += 1

            stats["active"] = len(self.active_recordings)
            return stats

    async def wait_for_first_segment(
        self,
        device_id: int,
        timeout: float = 60.0,
    ) -> Optional[Path]:
        """
        Wait for the first segment to complete for a recording.
        
        Args:
            device_id: Device ID to wait for
            timeout: Maximum time to wait in seconds
            
        Returns:
            Path to the first segment file, or None if timeout/error
        """
        session = self.active_recordings.get(device_id)
        if not session:
            logger.warning("No active recording found for device_id=%s", device_id)
            return None
        
        # Check if any segments already exist (in case segment completed before we set up callback)
        if session.output_dir.exists():
            try:
                existing_segments = [
                    p for p in session.output_dir.glob("ring_*.mp4")
                    if p.exists() and p.stat().st_size > 0
                ]
                if existing_segments:
                    # Sort by modification time, most recent first
                    existing_segments.sort(key=lambda p: p.stat().st_mtime, reverse=True)
                    logger.info("Found existing segment, using most recent: device_id=%s path=%s size=%s",
                               device_id, existing_segments[0], existing_segments[0].stat().st_size)
                    return existing_segments[0]
            except Exception as exc:
                logger.debug("Error checking for existing segments: device_id=%s error=%s", device_id, exc)
        
        # Create an event to signal when first segment completes
        segment_event = asyncio.Event()
        segment_path: Optional[Path] = None
        
        original_callback = session.recorder._on_segment_complete
        
        async def first_segment_callback(path: Path) -> None:
            nonlocal segment_path
            segment_path = path
            segment_event.set()
            # Call original callback if it exists
            if original_callback:
                from app.services.openring_aiortc_recorder import _maybe_await
                await _maybe_await(original_callback(path))
        
        # Temporarily replace callback
        session.recorder._on_segment_complete = first_segment_callback
        
        try:
            logger.info("Waiting for first segment: device_id=%s timeout=%s", device_id, timeout)
            await asyncio.wait_for(segment_event.wait(), timeout=timeout)
            logger.info("First segment completed: device_id=%s path=%s", device_id, segment_path)
            if not segment_path:
                return None
            file_ready = await self._wait_for_segment_file(segment_path, timeout=30.0)
            if not file_ready:
                file_exists = segment_path.exists()
                file_size = segment_path.stat().st_size if file_exists else None
                logger.warning(
                    "Segment file not found after completion: device_id=%s path=%s exists=%s size=%s",
                    device_id,
                    segment_path,
                    file_exists,
                    file_size,
                )
                return None
            return segment_path
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for first segment: device_id=%s timeout=%s", device_id, timeout)
            return None
        finally:
            # Restore original callback
            session.recorder._on_segment_complete = original_callback

    async def _wait_for_segment_file(
        self,
        segment_path: Path,
        timeout: float = 5.0,
        poll_interval: float = 0.5,
    ) -> bool:
        logger.info(
            "Waiting for segment file to appear: path=%s timeout=%s poll_interval=%s",
            segment_path,
            timeout,
            poll_interval,
        )
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                if segment_path.exists() and segment_path.stat().st_size > 0:
                    return True
            except Exception as exc:
                logger.debug("Error checking segment file: path=%s error=%s", segment_path, exc)
            await asyncio.sleep(poll_interval)
        return False

    async def start_recording(
        self,
        device_id: int,
        device_name: str,
        service: OpenRingService,
        segment_duration: int,
        output_dir: Path,
    ) -> bool:
        if device_id in self.active_recordings:
            logger.warning("Recording already active for device_id=%s", device_id)
            return False
        if segment_duration <= 0:
            logger.warning("Invalid segment_duration=%s for device_id=%s", segment_duration, device_id)
            return False

        session_id = str(uuid.uuid4())
        device_dir = output_dir / "openring" / str(device_id)
        device_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Starting recording: device_id=%s device_name=%s session_id=%s output_dir=%s segment_duration=%s",
                   device_id, device_name, session_id, device_dir, segment_duration)

        recorder = self._recorder_factory(
            service=service,
            device_id=device_id,
            session_id=session_id,
            output_dir=device_dir,
            segment_duration=segment_duration,
            on_segment_complete=self._handle_segment_complete,
        )

        try:
            await recorder.start()
            logger.info("Recording started successfully: device_id=%s device_name=%s session_id=%s",
                       device_id, device_name, session_id)
        except Exception as exc:
            logger.error("Failed to start recording for device_id=%s device_name=%s: %s",
                        device_id, device_name, exc, exc_info=True)
            return False

        self.active_recordings[device_id] = OpenRingRecordingSession(
            device_id=device_id,
            device_name=device_name,
            session_id=session_id,
            output_dir=device_dir,
            recorder=recorder,
            started_at=datetime.now(timezone.utc),
        )
        logger.info("Recording session registered: device_id=%s active_recordings_count=%s",
                   device_id, len(self.active_recordings))
        return True

    async def stop_recording(self, device_id: int) -> bool:
        session = self.active_recordings.get(device_id)
        if not session:
            logger.warning("No active recording found for device_id=%s", device_id)
            return False
        logger.info("Stopping recording: device_id=%s device_name=%s session_id=%s",
                   device_id, session.device_name, session.session_id)
        try:
            await session.recorder.stop()
            logger.info("Recording stopped successfully: device_id=%s", device_id)
        except Exception as exc:
            logger.error("Error stopping recording: device_id=%s error=%s", device_id, exc, exc_info=True)
        self.active_recordings.pop(device_id, None)
        logger.info("Recording session removed: device_id=%s active_recordings_count=%s",
                   device_id, len(self.active_recordings))
        return True

    async def stop_all(self) -> None:
        for device_id in list(self.active_recordings.keys()):
            await self.stop_recording(device_id)

    async def _handle_segment_complete(self, segment_path: Path) -> None:
        logger.info("Segment complete, enqueuing for upload: path=%s plugin=OpenRingPlugin", segment_path)
        try:
            await self.upload_coordinator.enqueue_video_after_download(
                video_path=str(segment_path),
                plugin_name="OpenRingPlugin",
            )
            logger.info("Segment enqueued for upload: path=%s", segment_path)
        except Exception as exc:
            logger.error("Failed to enqueue segment for upload: path=%s error=%s", segment_path, exc, exc_info=True)


def online_device_ids(devices: Iterable[RingDevice]) -> set[int]:
    return {device.id for device in devices if device.is_online}
