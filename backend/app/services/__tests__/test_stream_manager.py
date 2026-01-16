from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import stream_manager as stream_manager_module
from app.services.stream_manager import StreamManager


class FakeQuery:
    def __init__(self, config: object):
        self._config = config

    def first(self) -> object:
        return self._config


class FakeSession:
    def __init__(self, config: object):
        self._config = config

    def query(self, _model: object) -> FakeQuery:
        return FakeQuery(self._config)

    def close(self) -> None:
        return None


def _reset_stream_manager() -> None:
    StreamManager._instance = None
    StreamManager._initialized = False


@pytest.mark.asyncio
async def test_initialize_logs_livekit_url(monkeypatch, capsys) -> None:
    _reset_stream_manager()
    manager = StreamManager()

    config = SimpleNamespace(livekit_url="wss://example.livekit")
    fake_session = FakeSession(config)

    def fake_get_db():
        yield fake_session

    monkeypatch.setattr(stream_manager_module, "get_db", fake_get_db)

    await manager.initialize()

    output = capsys.readouterr().out
    assert "wss://example.livekit" in output


@pytest.mark.asyncio
async def test_initialize_logs_missing_livekit_url(monkeypatch, capsys) -> None:
    _reset_stream_manager()
    manager = StreamManager()

    config = SimpleNamespace()
    fake_session = FakeSession(config)

    def fake_get_db():
        yield fake_session

    monkeypatch.setattr(stream_manager_module, "get_db", fake_get_db)

    await manager.initialize()

    output = capsys.readouterr().out
    assert "no livekit_url" in output
