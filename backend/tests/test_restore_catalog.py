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


def test_restore_catalog_handles_encrypted_video():
    """Test that restore correctly handles encrypted videos with all required fields."""
    session = make_session()

    config = ArkivSyncConfig(enabled=True, private_key="0x" + "1" * 64, rpc_url="http://localhost:8545")
    client = ArkivSyncClient(config)

    # Simulate the JSON structure from the user's encrypted video
    payload = {
        "encrypted_cid": "itmwCMN0RaJaGe2yfHRZeYvv8b1SRclkgLcp20As5zW7LXwBInqKexhDVhUe7MTITQplbgsouC302FZbvV+XKougvVW8/sY3e7SoLpA/UiU8+FwV9DRSi19QrpKtAscJ5LDLcBlVNmvIdXUZmibOGMQaN3TVSoKaXx380oiU1lGXt55EMaZzqxNERDVoAg==",
        "filecoin_root_cid": "bafybeibxf2mrt4dfk6rczcdxueriamrouxi6nhs43ndxk5sicgpmn6uuvi",
        "lit_encryption_metadata": '{"dataToEncryptHash": "7b357bc24c2297d4ac794a542589906b00dc6864564fb50e167a039f4b6347ae", "accessControlConditions": [{"contractAddress": "", "standardContractType": "", "chain": "ethereum", "method": "", "parameters": [":userAddress"], "returnValueTest": {"comparator": "=", "value": "0xbe5e45771ec33b6efce4ae71c9887837d9ae9b49"}}], "chain": "ethereum"}',
        "cid_hash": "bcfe2ff533298ef5079b77ad9159e41e117818538a3e30cc8bcf4b4f4928edc7",
        "is_encrypted": True,
        "title": "Encrypted Video",
    }

    entity = make_entity("0xencrypted", payload)

    # Patch fetch_entities to return our dummy entity
    client.fetch_entities = lambda: [entity]  # type: ignore[assignment]

    result = client.restore_catalog(session)
    assert result["restored"] == 1
    assert result["skipped"] == 0
    
    # Verify the video was created with correct encrypted fields
    video = session.query(Video).first()
    assert video is not None
    assert video.is_encrypted is True
    assert video.encrypted_filecoin_cid == payload["encrypted_cid"]
    assert video.filecoin_root_cid == payload["filecoin_root_cid"]
    assert video.lit_encryption_metadata == payload["lit_encryption_metadata"]
    assert video.cid_hash == payload["cid_hash"]
    assert video.title == payload["title"]

