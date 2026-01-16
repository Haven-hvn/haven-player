from __future__ import annotations

from typing import Optional

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.plugins import load_plugin
from app.models.base import Base
from app.models.plugin import Plugin as PluginModel


class FakePlugin:
    def __init__(self, default_config: dict[str, object], should_raise: bool = False):
        self._default_config = default_config
        self._should_raise = should_raise

    def get_default_config(self) -> dict[str, object]:
        if self._should_raise:
            raise ValueError("default config error")
        return self._default_config


class FakePluginManager:
    def __init__(self, plugin: Optional[FakePlugin], load_success: bool = True):
        self._plugin = plugin
        self._load_success = load_success

    async def load_plugin(self, plugin_name: str, config: dict[str, object]) -> bool:
        return self._load_success

    def get_plugin(self, plugin_name: str) -> Optional[FakePlugin]:
        return self._plugin


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_local()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.mark.asyncio
async def test_load_plugin_creates_db_entry_with_default_config(db_session) -> None:
    plugin = FakePlugin(default_config={"auto_recording_enabled": False})
    plugin_mgr = FakePluginManager(plugin=plugin)

    response = await load_plugin(
        plugin_name="PumpFunPlugin",
        config={},
        plugin_mgr=plugin_mgr,
        db=db_session,
    )

    assert response["message"] == "Plugin PumpFunPlugin loaded successfully"

    db_plugin = db_session.query(PluginModel).filter(
        PluginModel.name == "PumpFunPlugin"
    ).first()
    assert db_plugin is not None
    assert db_plugin.enabled is True
    assert db_plugin.config == {"auto_recording_enabled": False}


@pytest.mark.asyncio
async def test_load_plugin_updates_existing_config_when_provided(db_session) -> None:
    existing = PluginModel(
        name="PumpFunPlugin",
        enabled=False,
        config={"auto_recording_enabled": False},
    )
    db_session.add(existing)
    db_session.commit()

    plugin = FakePlugin(default_config={"auto_recording_enabled": False})
    plugin_mgr = FakePluginManager(plugin=plugin)

    await load_plugin(
        plugin_name="PumpFunPlugin",
        config={"auto_recording_enabled": True},
        plugin_mgr=plugin_mgr,
        db=db_session,
    )

    db_plugin = db_session.query(PluginModel).filter(
        PluginModel.name == "PumpFunPlugin"
    ).first()
    assert db_plugin is not None
    assert db_plugin.config == {"auto_recording_enabled": True}

    plugin_count = db_session.query(PluginModel).count()
    assert plugin_count == 1


@pytest.mark.asyncio
async def test_load_plugin_handles_default_config_failure(db_session) -> None:
    plugin = FakePlugin(default_config={}, should_raise=True)
    plugin_mgr = FakePluginManager(plugin=plugin)

    await load_plugin(
        plugin_name="PumpFunPlugin",
        config={},
        plugin_mgr=plugin_mgr,
        db=db_session,
    )

    db_plugin = db_session.query(PluginModel).filter(
        PluginModel.name == "PumpFunPlugin"
    ).first()
    assert db_plugin is not None
    assert db_plugin.config is None


@pytest.mark.asyncio
async def test_load_plugin_with_no_default_config_provider(db_session) -> None:
    plugin_mgr = FakePluginManager(plugin=None)

    await load_plugin(
        plugin_name="PumpFunPlugin",
        config={},
        plugin_mgr=plugin_mgr,
        db=db_session,
    )

    db_plugin = db_session.query(PluginModel).filter(
        PluginModel.name == "PumpFunPlugin"
    ).first()
    assert db_plugin is not None
    assert db_plugin.config is None
