"""
OpenRing plugin for Ring camera live view recording.

Implements subscription-based auto-recording using aiortc (no LiveKit).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

from sqlalchemy.orm.attributes import flag_modified

from app.plugins.plugin_interface import (
    ArchiverPlugin,
    PluginMetadata,
    MediaSource,
    ArchiveResult,
    MediaType,
    DefaultJobConfig,
)
from app.plugins.mixins import CollectionPluginMixin, ConfigurablePluginMixin
from app.models.database import get_db as get_db_session
from app.models.plugin import Plugin as PluginModel
from app.models.config import AppConfig
from app.services.openring_service import OpenRingService, OpenRingTokens, RingDevice
from app.services.openring_recording_manager import (
    OpenRingRecordingManager,
    OpenRingSubscription,
    online_device_ids,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OpenRingAuthConfig:
    access_token: Optional[str]
    refresh_token: Optional[str]
    expires_at: Optional[datetime]
    hardware_id: Optional[str]
    two_factor_pending: bool


class OpenRingPlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin):
    """Ring camera recording plugin."""

    def __init__(self) -> None:
        self.config: Dict[str, Any] = {}
        self._initialized = False
        self._recording_manager = OpenRingRecordingManager()

    def get_metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="OpenRingPlugin",
            version="1.0.0",
            description="Records Ring camera live view sessions using aiortc",
            media_types=[MediaType.WEBRTC],
            author="Haven Team",
            capabilities=[
                "discover_sources",
                "archive",
                "health_check",
                "stop_archiving",
                "get_archiving_status",
                "subscribe",
                "unsubscribe",
                "list_subscriptions",
                "get_subscription",
                "discover_from_subscription",
                "archive_from_subscription",
                "get_config",
                "update_config",
                "get_default_config",
                "manage_recordings",
            ],
            default_jobs=[
                DefaultJobConfig(
                    job_name="openring_auto_recordings",
                    schedule="*/30 * * * * *",
                    method="manage_recordings",
                    on_success="log_only",
                    config={},
                    enabled=True,
                )
            ],
        )

    async def initialize(self, config: Dict[str, Any]) -> bool:
        self.config = config
        self._initialized = True
        logger.info("OpenRingPlugin initialized")
        return True

    async def discover_sources(
        self,
        offset: int = 0,
        limit: int = 20,
        filter_options: Dict[str, Any] = None,
    ) -> List[MediaSource]:
        filter_options = filter_options or {}
        include_offline = bool(filter_options.get("include_offline", False))

        service, devices = await self._get_service_and_devices()
        if not service:
            return []

        filtered = [device for device in devices if include_offline or device.is_online]
        paginated = filtered[offset : offset + limit]
        sources: list[MediaSource] = []
        for device in paginated:
            sources.append(
                MediaSource(
                    source_id=str(device.id),
                    media_type=MediaType.WEBRTC,
                    uri=f"webrtc://ring/{device.id}",
                    metadata={
                        "device_id": device.id,
                        "device_name": device.description,
                        "kind": device.kind,
                        "is_online": device.is_online,
                    },
                )
            )
        return sources

    async def archive(self, source: MediaSource) -> ArchiveResult:
        if source.media_type != MediaType.WEBRTC:
            return ArchiveResult(success=False, error="Unsupported media type")

        device_id = _parse_device_id(source)
        if device_id is None:
            return ArchiveResult(success=False, error="Invalid device ID")

        service = await self._get_authenticated_service()
        if not service:
            return ArchiveResult(success=False, error="Ring authentication missing or expired")

        output_dir = self._get_download_directory()
        if not output_dir:
            return ArchiveResult(success=False, error="Global download_directory not configured")

        segment_duration = int(self.config.get("segment_duration", 30))
        started = await self._recording_manager.start_recording(
            device_id=device_id,
            device_name=source.metadata.get("device_name", str(device_id)),
            service=service,
            segment_duration=segment_duration,
            output_dir=output_dir,
        )
        if not started:
            return ArchiveResult(success=False, error="Failed to start recording")

        return ArchiveResult(
            success=True,
            metadata={
                "device_id": device_id,
                "device_name": source.metadata.get("device_name"),
                "segment_duration": segment_duration,
            },
        )

    async def health_check(self) -> bool:
        service = await self._get_authenticated_service()
        if not service:
            return False
        try:
            await service.fetch_devices()
            return True
        except Exception as exc:
            logger.error(f"OpenRingPlugin health check failed: {exc}")
            return False

    async def stop_archiving(self, source_id: str) -> Dict[str, Any]:
        try:
            device_id = int(source_id)
        except ValueError:
            return {"success": False, "error": "Invalid device ID"}
        stopped = await self._recording_manager.stop_recording(device_id)
        return {"success": stopped, "device_id": device_id}

    async def get_archiving_status(self, source_id: str) -> Dict[str, Any]:
        try:
            device_id = int(source_id)
        except ValueError:
            return {"success": False, "error": "Invalid device ID"}
        status = self._recording_manager.get_status(device_id)
        status["success"] = True
        return status

    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        config = config or {}
        device_id = config.get("device_id", collection_uri)
        device_name = config.get("device_name", str(device_id))

        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin:
                return {"success": False, "error": "OpenRing plugin not found"}

            plugin_config = plugin.config or {}
            devices = plugin_config.get("devices", [])

            if any(str(d.get("device_id")) == str(device_id) for d in devices):
                return {"success": False, "error": f"Already subscribed to device: {device_id}"}

            new_device = {
                "device_id": device_id,
                "device_name": device_name,
                "enabled": True,
                "created_at": datetime.utcnow().isoformat(),
            }
            devices.append(new_device)

            updated_config = plugin_config.copy()
            updated_config["devices"] = devices
            plugin.config = updated_config
            flag_modified(plugin, "config")
            db.commit()

            return {"success": True, **new_device}
        except Exception as exc:
            db.rollback()
            return {"success": False, "error": str(exc)}
        finally:
            db.close()

    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin:
                return {"success": False, "error": "OpenRing plugin not found"}

            plugin_config = plugin.config or {}
            devices = plugin_config.get("devices", [])
            remaining = [d for d in devices if str(d.get("device_id")) != str(collection_id)]

            if len(remaining) == len(devices):
                return {"success": False, "error": f"Subscription not found: {collection_id}"}

            updated_config = plugin_config.copy()
            updated_config["devices"] = remaining
            plugin.config = updated_config
            flag_modified(plugin, "config")
            db.commit()
            return {"success": True, "message": f"Unsubscribed from {collection_id}"}
        except Exception as exc:
            db.rollback()
            return {"success": False, "error": str(exc)}
        finally:
            db.close()

    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin or not plugin.config:
                return []
            return plugin.config.get("devices", [])
        finally:
            db.close()

    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin or not plugin.config:
                return None
            for device in plugin.config.get("devices", []):
                if str(device.get("device_id")) == str(collection_id):
                    return device
            return None
        finally:
            db.close()

    async def discover_from_subscription(self, collection_id: str) -> List[MediaSource]:
        sources = await self.discover_sources(offset=0, limit=1000)
        return [source for source in sources if source.source_id == str(collection_id)]

    async def archive_from_subscription(self, collection_id: str) -> List[ArchiveResult]:
        sources = await self.discover_from_subscription(collection_id)
        results: list[ArchiveResult] = []
        for source in sources:
            results.append(await self.archive(source))
        return results

    def get_config(self) -> Dict[str, Any]:
        return {
            "segment_duration": self.config.get("segment_duration", 30),
            "auto_recording_enabled": self.config.get("auto_recording_enabled", True),
            "refresh_buffer_seconds": self.config.get("refresh_buffer_seconds", 60),
            **self.config,
        }

    async def update_config(self, config: Dict[str, Any]) -> bool:
        self.config.update(config)
        return True

    def get_default_config(self) -> Dict[str, Any]:
        return {
            "segment_duration": 30,
            "auto_recording_enabled": True,
            "refresh_buffer_seconds": 60,
            "two_factor_pending": False,
        }

    async def manage_recordings(self) -> Dict[str, Any]:
        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin or not plugin.config:
                return {"status": "no_config", "message": "Plugin configuration not found"}

            plugin_config = plugin.config
            auto_recording_enabled = bool(plugin_config.get("auto_recording_enabled", False))
            if not auto_recording_enabled:
                return {"status": "disabled", "message": "Auto recording disabled"}

            service = await self._build_authenticated_service(plugin, db)
            if not service:
                return {"status": "auth_error", "message": "Authentication missing or expired"}

            devices = await service.fetch_devices()
            subscriptions = [
                sub
                for sub in (
                    OpenRingSubscription.from_config(item)
                    for item in plugin_config.get("devices", [])
                )
                if sub is not None
            ]
            segment_duration = int(plugin_config.get("segment_duration", 30))
            output_dir = self._get_download_directory()
            if not output_dir:
                return {"status": "error", "message": "Global download_directory not configured"}

            stats = await self._recording_manager.manage_subscriptions(
                subscriptions=subscriptions,
                online_device_ids=online_device_ids(devices),
                service=service,
                segment_duration=segment_duration,
                output_dir=output_dir,
            )
            return {
                "status": "success",
                "segment_duration": segment_duration,
                **stats,
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        finally:
            db.close()

    async def _get_service_and_devices(
        self,
    ) -> tuple[Optional[OpenRingService], list[RingDevice]]:
        service = await self._get_authenticated_service()
        if not service:
            return None, []
        try:
            devices = await service.fetch_devices()
        except Exception as exc:
            logger.error(f"Failed to fetch Ring devices: {exc}")
            return None, []
        return service, devices

    async def _get_authenticated_service(self) -> Optional[OpenRingService]:
        db = next(get_db_session())
        try:
            plugin = db.query(PluginModel).filter(PluginModel.name == "OpenRingPlugin").first()
            if not plugin:
                return None
            return await self._build_authenticated_service(plugin, db)
        finally:
            db.close()

    async def _build_authenticated_service(
        self,
        plugin: PluginModel,
        db,
    ) -> Optional[OpenRingService]:
        config = plugin.config or {}
        auth = _parse_auth_config(config)
        if not auth.access_token and not auth.refresh_token:
            return None

        hardware_id = auth.hardware_id or OpenRingService.generate_hardware_id()
        if not auth.hardware_id:
            config = config.copy()
            config["hardware_id"] = hardware_id
            plugin.config = config
            flag_modified(plugin, "config")
            db.commit()
            auth = _parse_auth_config(config)

        service = OpenRingService(
            access_token=auth.access_token,
            refresh_token=auth.refresh_token,
            hardware_id=hardware_id,
        )

        refresh_buffer = int(config.get("refresh_buffer_seconds", 60))
        needs_refresh = auth.access_token is None or _should_refresh(auth, refresh_buffer)
        if needs_refresh and auth.refresh_token:
            try:
                tokens = await service.refresh_access_token()
                self._persist_tokens(plugin, config, tokens, two_factor_pending=False)
                flag_modified(plugin, "config")
                db.commit()
                service.set_tokens(tokens)
            except Exception as exc:
                logger.error(f"Failed to refresh Ring token: {exc}")
                return None

        return service

    def _get_download_directory(self) -> Optional[Path]:
        db = next(get_db_session())
        try:
            app_config = db.query(AppConfig).first()
            if app_config and app_config.download_directory:
                return Path(app_config.download_directory)
            return None
        finally:
            db.close()

    def _persist_tokens(
        self,
        plugin: PluginModel,
        config: Dict[str, Any],
        tokens: OpenRingTokens,
        two_factor_pending: bool,
    ) -> None:
        updated = config.copy()
        updated["access_token"] = tokens.access_token
        updated["refresh_token"] = tokens.refresh_token
        updated["expires_at"] = tokens.expires_at.isoformat()
        updated["two_factor_pending"] = two_factor_pending
        plugin.config = updated


def _parse_device_id(source: MediaSource) -> Optional[int]:
    if "device_id" in source.metadata:
        try:
            return int(source.metadata["device_id"])
        except (ValueError, TypeError):
            return None
    try:
        return int(source.uri.split("/")[-1])
    except (ValueError, IndexError):
        return None


def _parse_auth_config(config: Dict[str, Any]) -> OpenRingAuthConfig:
    access_token = _get_str(config.get("access_token"))
    refresh_token = _get_str(config.get("refresh_token"))
    hardware_id = _get_str(config.get("hardware_id"))
    expires_at = _parse_iso_datetime(_get_str(config.get("expires_at")))
    two_factor_pending = bool(config.get("two_factor_pending", False))
    return OpenRingAuthConfig(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
        hardware_id=hardware_id,
        two_factor_pending=two_factor_pending,
    )


def _should_refresh(auth: OpenRingAuthConfig, buffer_seconds: int) -> bool:
    if not auth.expires_at:
        return False
    refresh_deadline = datetime.now(timezone.utc) + timedelta(seconds=buffer_seconds)
    return auth.expires_at <= refresh_deadline


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _get_str(value: object) -> Optional[str]:
    if isinstance(value, str):
        return value
    return None
