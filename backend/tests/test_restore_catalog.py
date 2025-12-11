from __future__ import annotations

import json
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.video import Video
from app.services.arkiv_sync import ArkivSyncClient, ArkivSyncConfig


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal()


def make_entity(key: str, payload: dict) -> SimpleNamespace:
    payload_bytes = json.dumps(payload).encode("utf-8")
    return SimpleNamespace(key=key, payload=payload_bytes)


def test_restore_catalog_inserts_and_dedupes():
    session = make_session()

    config = ArkivSyncConfig(enabled=True, private_key="0x" + "1" * 64, rpc_url="http://localhost:8545")
    client = ArkivSyncClient(config)

    payload = {
        "title": "Restored Video",
        "duration": 120,
        "phash": "ffee",
        "cid_hash": "abc123",
        "timestamps": [
            {"tag": "car", "start_time": 0.0, "end_time": 1.0, "confidence": 0.9}
        ],
    }

    entity = make_entity("0xabc", payload)

    # Patch fetch_entities to return our dummy entity
    client.fetch_entities = lambda: [entity]  # type: ignore[assignment]

    result_first = client.restore_catalog(session)
    assert result_first["restored"] == 1
    assert result_first["skipped"] == 0
    assert session.query(Video).count() == 1

    # Second restore should dedupe
    result_second = client.restore_catalog(session)
    assert result_second["restored"] == 0
    assert result_second["skipped"] == 1
    assert session.query(Video).count() == 1

