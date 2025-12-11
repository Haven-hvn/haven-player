from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from arkiv.types import Attributes, EntityKey

from app.models.video import Timestamp, Video
from app.services.arkiv_sync import (
    ArkivSyncClient,
    ArkivSyncConfig,
    _build_attributes,
    _build_payload,
)


class DummyArkivModule:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []

    def create_entity(
        self,
        payload: bytes,
        content_type: str,
        attributes: Attributes,
        expires_in: int,
    ) -> tuple[EntityKey, object]:
        self.created.append(
            {
                "payload": payload,
                "content_type": content_type,
                "attributes": attributes,
                "expires_in": expires_in,
            }
        )
        return EntityKey("0xabc"), object()

    def update_entity(
        self,
        key: EntityKey,
        payload: bytes,
        content_type: str,
        attributes: Attributes,
        expires_in: int,
    ) -> tuple[EntityKey, object]:
        self.updated.append(
            {
                "key": key,
                "payload": payload,
                "content_type": content_type,
                "attributes": attributes,
                "expires_in": expires_in,
            }
        )
        return key, object()


class DummyArkivClient:
    def __init__(self) -> None:
        self.arkiv = DummyArkivModule()


class DummySession:
    def __init__(self) -> None:
        self.committed = False
        self.refreshed = False

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj: object) -> None:
        self.refreshed = True


def make_video(**overrides: Any) -> Video:
    import hashlib
    now = datetime.now(timezone.utc)
    test_cid = "bafy123"
    base = dict(
        path="/videos/sample.mp4",
        title="Sample",
        duration=120,
        has_ai_data=False,
        thumbnail_path=None,
        position=0,
        phash="ffee",
        created_at=now,
        updated_at=now,
        filecoin_root_cid=test_cid,
        cid_hash=hashlib.sha256(test_cid.encode("utf-8")).hexdigest(),  # Pre-computed hash
        file_size=1024,
        file_extension="mp4",
        mime_type="video/mp4",
        codec="h264",
        creator_handle="creator",
        source_uri="https://example.com/stream",
        analysis_model="smol-vlm",
        share_to_arkiv=True,
    )
    base.update(overrides)
    return Video(**base)  # type: ignore[arg-type]


def make_timestamp(tag: str) -> Timestamp:
    return Timestamp(
        id=1,
        video_path="/videos/sample.mp4",
        tag_name=tag,
        start_time=0.0,
        end_time=1.0,
        confidence=0.9,
    )


def test_build_payload_excludes_path_and_includes_cid_hash_and_encrypted() -> None:
    video = make_video()
    payload = _build_payload(video, [make_timestamp("car")])
    assert "path" not in payload
    # For non-encrypted videos, CID-related fields are omitted from payload
    assert payload["cid_hash"] is None
    assert payload["filecoin_root_cid"] is None
    assert payload["encrypted_cid"] is None  # encryption metadata not set
    assert payload["timestamps"][0]["tag"] == "car"


def test_build_attributes_flat_and_typed() -> None:
    video = make_video()
    attributes = _build_attributes(video, [make_timestamp("car"), make_timestamp("tree")])
    assert attributes["title"] == "Sample"
    assert attributes["duration_s"] == 120
    assert "path" not in attributes
    assert attributes["tags"] == "car,tree"
    assert "cid_hash" not in attributes


def test_sync_disabled_when_no_key() -> None:
    config = ArkivSyncConfig(enabled=False, private_key=None, rpc_url="http://localhost:8545")
    client = ArkivSyncClient(config, arkiv_factory=lambda *_args, **_kwargs: DummyArkivClient())
    video = make_video()
    session = DummySession()
    result = client.sync_video(session, video, [])
    assert result is None
    assert not session.committed


def test_sync_creates_entity_and_persists_key() -> None:
    config = ArkivSyncConfig(enabled=True, private_key="0x" + "1" * 64, rpc_url="http://localhost:8545")
    dummy_client = DummyArkivClient()

    def factory(_url: str, _key: str) -> DummyArkivClient:
        return dummy_client

    client = ArkivSyncClient(config, arkiv_factory=factory)
    video = make_video(arkiv_entity_key=None)
    session = DummySession()

    result = client.sync_video(session, video, [make_timestamp("car")])

    assert result == EntityKey("0xabc")
    assert video.arkiv_entity_key == "0xabc"
    assert session.committed
    assert session.refreshed
    assert dummy_client.arkiv.created, "create_entity should be called"

    created_payload = dummy_client.arkiv.created[0]["payload"]
    payload_dict = json.loads(created_payload.decode("utf-8"))
    assert "path" not in payload_dict
    assert payload_dict["cid_hash"] is None  # omitted when not encrypted
    assert payload_dict["filecoin_root_cid"] is None
    assert payload_dict["encrypted_cid"] is None


def test_sync_skips_local_only() -> None:
    config = ArkivSyncConfig(enabled=True, private_key="0x" + "1" * 64, rpc_url="http://localhost:8545")
    dummy_client = DummyArkivClient()
    client = ArkivSyncClient(config, arkiv_factory=lambda *_args, **_kwargs: dummy_client)
    video = make_video(share_to_arkiv=False)
    session = DummySession()

    result = client.sync_video(session, video, [])

    assert result is None
    assert not dummy_client.arkiv.created
    assert not session.committed

