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

    async def start_recording(
        self,
        device_id: int,
        device_name: str,
        service: OpenRingService,
        segment_duration: int,
        output_dir: Path,
    ) -> bool:
        if device_id in self.active_recordings:
            return False
        if segment_duration <= 0:
            return False

        session_id = uuid.uuid4().hex
        device_dir = output_dir / "openring" / str(device_id)
        device_dir.mkdir(parents=True, exist_ok=True)

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
        except Exception as exc:
            logger.error(f"Failed to start recording for {device_id}: {exc}")
            return False

        self.active_recordings[device_id] = OpenRingRecordingSession(
            device_id=device_id,
            device_name=device_name,
            session_id=session_id,
            output_dir=device_dir,
            recorder=recorder,
            started_at=datetime.now(timezone.utc),
        )
        return True

    async def stop_recording(self, device_id: int) -> bool:
        session = self.active_recordings.get(device_id)
        if not session:
            return False
        await session.recorder.stop()
        self.active_recordings.pop(device_id, None)
        return True

    async def stop_all(self) -> None:
        for device_id in list(self.active_recordings.keys()):
            await self.stop_recording(device_id)

    async def _handle_segment_complete(self, segment_path: Path) -> None:
        await self.upload_coordinator.enqueue_video_after_download(
            video_path=str(segment_path),
            plugin_name="OpenRingPlugin",
        )


def online_device_ids(devices: Iterable[RingDevice]) -> set[int]:
    return {device.id for device in devices if device.is_online}
