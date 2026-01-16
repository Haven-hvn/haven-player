from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock

import pytest

from app.plugins.builtin.openring_plugin import OpenRingPlugin
from app.plugins.plugin_interface import MediaSource, MediaType
from app.models.plugin import Plugin as PluginModel
from app.models.config import AppConfig
from app.services.openring_service import RingDevice, OpenRingTokens
from app.plugins.builtin import openring_plugin


class FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class FakeDB:
    def __init__(self, plugin=None, app_config=None):
        self._plugin = plugin
        self._app_config = app_config
        self.commit_calls = 0
        self.rollback_calls = 0
        self.closed = False

    def query(self, model):
        if model is PluginModel:
            return FakeQuery(self._plugin)
        if model is AppConfig:
            return FakeQuery(self._app_config)
        return FakeQuery(None)

    def commit(self):
        self.commit_calls += 1

    def rollback(self):
        self.rollback_calls += 1

    def close(self):
        self.closed = True


class FakeManager:
    def __init__(self):
        self.start_calls: list[tuple[int, str]] = []
        self.stop_calls: list[int] = []
        self.status = {"recording": True}
        self.start_result = True
        self.stop_result = True
        self.manage_result = {"status": "ok", "active": 1, "started": 1, "stopped": 0, "errors": 0}

    async def start_recording(self, device_id, device_name, service, segment_duration, output_dir):
        self.start_calls.append((device_id, device_name))
        return self.start_result

    async def stop_recording(self, device_id):
        self.stop_calls.append(device_id)
        return self.stop_result

    def get_status(self, device_id):
        return {"device_id": device_id, **self.status}

    async def manage_subscriptions(self, **kwargs):
        return self.manage_result


class FakeService:
    def __init__(self, devices=None):
        self._devices = devices or []
        self.fetch_devices = AsyncMock(return_value=self._devices)
        self.refresh_access_token = AsyncMock()
        self.set_tokens = Mock()


@pytest.mark.asyncio
async def test_subscribe_success() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": []}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            result = await plugin.subscribe("123", {"device_name": "Front Door"})

    assert result["success"] is True
    assert plugin_model.config["devices"][0]["device_id"] == "123"


@pytest.mark.asyncio
async def test_subscribe_plugin_missing() -> None:
    plugin = OpenRingPlugin()
    db = FakeDB(plugin=None)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.subscribe("123")

    assert result["success"] is False


@pytest.mark.asyncio
async def test_subscribe_duplicate() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": [{"device_id": 1, "device_name": "Door"}]}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.subscribe("1", {"device_name": "Door"})

    assert result["success"] is False


@pytest.mark.asyncio
async def test_subscribe_exception_returns_error() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": []}

    db = FakeDB(plugin=plugin_model)
    db.commit = Mock(side_effect=RuntimeError("boom"))

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            result = await plugin.subscribe("123")

    assert result["success"] is False


@pytest.mark.asyncio
async def test_unsubscribe_success() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": [{"device_id": 1, "device_name": "Door"}]}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            result = await plugin.unsubscribe("1")

    assert result["success"] is True
    assert plugin_model.config["devices"] == []


@pytest.mark.asyncio
async def test_unsubscribe_not_found() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": [{"device_id": 2, "device_name": "Door"}]}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.unsubscribe("1")

    assert result["success"] is False


@pytest.mark.asyncio
async def test_unsubscribe_plugin_missing() -> None:
    plugin = OpenRingPlugin()
    db = FakeDB(plugin=None)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.unsubscribe("1")

    assert result["success"] is False


@pytest.mark.asyncio
async def test_unsubscribe_exception() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"devices": [{"device_id": 1, "device_name": "Door"}]}
    db = FakeDB(plugin=plugin_model)
    db.commit = Mock(side_effect=RuntimeError("boom"))

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            result = await plugin.unsubscribe("1")

    assert result["success"] is False


@pytest.mark.asyncio
async def test_list_subscriptions_empty_when_missing() -> None:
    plugin = OpenRingPlugin()
    db = FakeDB(plugin=None)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        subscriptions = await plugin.list_subscriptions()

    assert subscriptions == []


@pytest.mark.asyncio
async def test_get_subscription_none_when_missing() -> None:
    plugin = OpenRingPlugin()
    db = FakeDB(plugin=None)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        subscription = await plugin.get_subscription("1")

    assert subscription is None


@pytest.mark.asyncio
async def test_discover_sources_no_service() -> None:
    plugin = OpenRingPlugin()
    with patch.object(plugin, "_get_service_and_devices", return_value=(None, [])):
        sources = await plugin.discover_sources()
    assert sources == []


@pytest.mark.asyncio
async def test_discover_sources_filters_offline() -> None:
    plugin = OpenRingPlugin()
    devices = [
        RingDevice(id=1, description="Front", device_id="1", kind="doorbell", location_id=None, alerts=None),
        RingDevice(
            id=2,
            description="Back",
            device_id="2",
            kind="camera",
            location_id=None,
            alerts=type("Alerts", (), {"connection": "offline"})(),
        ),
    ]
    with patch.object(plugin, "_get_service_and_devices", return_value=(FakeService(devices), devices)):
        sources = await plugin.discover_sources()
    assert len(sources) == 1


@pytest.mark.asyncio
async def test_discover_sources_include_offline() -> None:
    plugin = OpenRingPlugin()
    devices = [
        RingDevice(id=1, description="Front", device_id="1", kind="doorbell", location_id=None, alerts=None),
        RingDevice(
            id=2,
            description="Back",
            device_id="2",
            kind="camera",
            location_id=None,
            alerts=type("Alerts", (), {"connection": "offline"})(),
        ),
    ]
    with patch.object(plugin, "_get_service_and_devices", return_value=(FakeService(devices), devices)):
        sources = await plugin.discover_sources(filter_options={"include_offline": True})
    assert len(sources) == 2


@pytest.mark.asyncio
async def test_archive_invalid_media_type() -> None:
    plugin = OpenRingPlugin()
    source = MediaSource(source_id="1", media_type=MediaType.YOUTUBE, uri="x")
    result = await plugin.archive(source)
    assert result.success is False


@pytest.mark.asyncio
async def test_archive_invalid_device_id() -> None:
    plugin = OpenRingPlugin()
    source = MediaSource(source_id="x", media_type=MediaType.WEBRTC, uri="webrtc://ring/abc")
    result = await plugin.archive(source)
    assert result.success is False


@pytest.mark.asyncio
async def test_archive_missing_auth() -> None:
    plugin = OpenRingPlugin()
    source = MediaSource(source_id="1", media_type=MediaType.WEBRTC, uri="webrtc://ring/1")
    with patch.object(plugin, "_get_authenticated_service", return_value=None):
        result = await plugin.archive(source)
    assert result.success is False


@pytest.mark.asyncio
async def test_archive_missing_download_dir() -> None:
    plugin = OpenRingPlugin()
    source = MediaSource(source_id="1", media_type=MediaType.WEBRTC, uri="webrtc://ring/1")
    with patch.object(plugin, "_get_authenticated_service", return_value=FakeService()):
        with patch.object(plugin, "_get_download_directory", return_value=None):
            result = await plugin.archive(source)
    assert result.success is False


@pytest.mark.asyncio
async def test_archive_start_failure() -> None:
    plugin = OpenRingPlugin()
    manager = FakeManager()
    manager.start_result = False
    plugin._recording_manager = manager
    source = MediaSource(source_id="1", media_type=MediaType.WEBRTC, uri="webrtc://ring/1")

    with patch.object(plugin, "_get_authenticated_service", return_value=FakeService()):
        with patch.object(plugin, "_get_download_directory", return_value=Path("downloads")):
            result = await plugin.archive(source)
    assert result.success is False


@pytest.mark.asyncio
async def test_archive_success() -> None:
    plugin = OpenRingPlugin()
    manager = FakeManager()
    plugin._recording_manager = manager
    source = MediaSource(
        source_id="1",
        media_type=MediaType.WEBRTC,
        uri="webrtc://ring/1",
        metadata={"device_name": "Front", "device_id": "1"},
    )

    with patch.object(plugin, "_get_authenticated_service", return_value=FakeService()):
        with patch.object(plugin, "_get_download_directory", return_value=Path("downloads")):
            result = await plugin.archive(source)
    assert result.success is True


@pytest.mark.asyncio
async def test_health_check_no_service() -> None:
    plugin = OpenRingPlugin()
    with patch.object(plugin, "_get_authenticated_service", return_value=None):
        assert await plugin.health_check() is False


@pytest.mark.asyncio
async def test_health_check_fetch_failure() -> None:
    plugin = OpenRingPlugin()
    service = FakeService()
    service.fetch_devices = AsyncMock(side_effect=RuntimeError("boom"))
    with patch.object(plugin, "_get_authenticated_service", return_value=service):
        assert await plugin.health_check() is False


@pytest.mark.asyncio
async def test_health_check_success() -> None:
    plugin = OpenRingPlugin()
    service = FakeService([])
    with patch.object(plugin, "_get_authenticated_service", return_value=service):
        assert await plugin.health_check() is True


@pytest.mark.asyncio
async def test_stop_archiving_invalid_id() -> None:
    plugin = OpenRingPlugin()
    result = await plugin.stop_archiving("invalid")
    assert result["success"] is False


@pytest.mark.asyncio
async def test_stop_archiving_success() -> None:
    plugin = OpenRingPlugin()
    manager = FakeManager()
    plugin._recording_manager = manager
    result = await plugin.stop_archiving("1")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_get_archiving_status_invalid_id() -> None:
    plugin = OpenRingPlugin()
    result = await plugin.get_archiving_status("invalid")
    assert result["success"] is False


@pytest.mark.asyncio
async def test_get_archiving_status_success() -> None:
    plugin = OpenRingPlugin()
    manager = FakeManager()
    plugin._recording_manager = manager
    result = await plugin.get_archiving_status("1")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_manage_recordings_no_config() -> None:
    plugin = OpenRingPlugin()
    db = FakeDB(plugin=None)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.manage_recordings()

    assert result["status"] == "no_config"


@pytest.mark.asyncio
async def test_manage_recordings_disabled() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"auto_recording_enabled": False}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        result = await plugin.manage_recordings()

    assert result["status"] == "disabled"


@pytest.mark.asyncio
async def test_manage_recordings_auth_error() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"auto_recording_enabled": True}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch.object(plugin, "_build_authenticated_service", return_value=None):
            result = await plugin.manage_recordings()

    assert result["status"] == "auth_error"


@pytest.mark.asyncio
async def test_manage_recordings_download_dir_missing() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"auto_recording_enabled": True, "devices": []}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch.object(plugin, "_build_authenticated_service", return_value=FakeService()):
            with patch.object(plugin, "_get_download_directory", return_value=None):
                result = await plugin.manage_recordings()

    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_manage_recordings_success() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {
        "auto_recording_enabled": True,
        "devices": [{"device_id": 1, "device_name": "Front", "enabled": True}],
        "segment_duration": 30,
    }
    db = FakeDB(plugin=plugin_model)
    manager = FakeManager()
    plugin._recording_manager = manager

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch.object(plugin, "_build_authenticated_service", return_value=FakeService([])):
            with patch.object(plugin, "_get_download_directory", return_value=Path("downloads")):
                result = await plugin.manage_recordings()

    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_manage_recordings_exception() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"auto_recording_enabled": True, "devices": []}
    db = FakeDB(plugin=plugin_model)
    plugin._recording_manager = Mock()
    plugin._recording_manager.manage_subscriptions = AsyncMock(side_effect=RuntimeError("boom"))

    with patch("app.plugins.builtin.openring_plugin.get_db_session", return_value=iter([db])):
        with patch.object(plugin, "_build_authenticated_service", return_value=FakeService([])):
            with patch.object(plugin, "_get_download_directory", return_value=Path("downloads")):
                result = await plugin.manage_recordings()

    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_build_authenticated_service_returns_none_when_missing_tokens() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {}
    db = FakeDB(plugin=plugin_model)

    service = await plugin._build_authenticated_service(plugin_model, db)

    assert service is None


@pytest.mark.asyncio
async def test_build_authenticated_service_generates_hardware_id() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {"access_token": "access"}
    db = FakeDB(plugin=plugin_model)

    with patch("app.plugins.builtin.openring_plugin.OpenRingService.generate_hardware_id", return_value="hw"):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            service = await plugin._build_authenticated_service(plugin_model, db)

    assert service is not None
    assert plugin_model.config["hardware_id"] == "hw"


@pytest.mark.asyncio
async def test_build_authenticated_service_refreshes_tokens() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {
        "access_token": "access",
        "refresh_token": "refresh",
        "hardware_id": "hw",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat(),
    }
    db = FakeDB(plugin=plugin_model)

    fake_service = FakeService()
    tokens = OpenRingTokens(
        access_token="new_access",
        refresh_token="new_refresh",
        expires_in=60,
        scope="client",
        token_type="bearer",
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
    )
    fake_service.refresh_access_token = AsyncMock(return_value=tokens)

    with patch("app.plugins.builtin.openring_plugin.OpenRingService", return_value=fake_service):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            service = await plugin._build_authenticated_service(plugin_model, db)

    assert service is fake_service
    assert plugin_model.config["access_token"] == "new_access"


@pytest.mark.asyncio
async def test_build_authenticated_service_refresh_failure() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {
        "access_token": "access",
        "refresh_token": "refresh",
        "hardware_id": "hw",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat(),
    }
    db = FakeDB(plugin=plugin_model)

    fake_service = FakeService()
    fake_service.refresh_access_token = AsyncMock(side_effect=RuntimeError("boom"))

    with patch("app.plugins.builtin.openring_plugin.OpenRingService", return_value=fake_service):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            service = await plugin._build_authenticated_service(plugin_model, db)

    assert service is None


@pytest.mark.asyncio
async def test_build_authenticated_service_refreshes_without_access_token() -> None:
    plugin = OpenRingPlugin()
    plugin_model = Mock(spec=PluginModel)
    plugin_model.config = {
        "refresh_token": "refresh",
        "hardware_id": "hw",
    }
    db = FakeDB(plugin=plugin_model)

    fake_service = FakeService()
    tokens = OpenRingTokens(
        access_token="new_access",
        refresh_token="new_refresh",
        expires_in=60,
        scope="client",
        token_type="bearer",
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
    )
    fake_service.refresh_access_token = AsyncMock(return_value=tokens)

    with patch("app.plugins.builtin.openring_plugin.OpenRingService", return_value=fake_service):
        with patch("app.plugins.builtin.openring_plugin.flag_modified"):
            service = await plugin._build_authenticated_service(plugin_model, db)

    assert service is fake_service
    assert plugin_model.config["access_token"] == "new_access"


def test_parse_helpers_handle_invalid_values() -> None:
    assert openring_plugin._get_str(123) is None
    assert openring_plugin._parse_iso_datetime("not-a-date") is None
    assert openring_plugin._parse_iso_datetime(None) is None
    auth = openring_plugin.OpenRingAuthConfig(
        access_token="access",
        refresh_token="refresh",
        expires_at=None,
        hardware_id="hw",
        two_factor_pending=False,
    )
    assert openring_plugin._should_refresh(auth, 60) is False
