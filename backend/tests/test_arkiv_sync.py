from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from unittest.mock import Mock

from arkiv.types import Attributes, EntityKey
from requests.exceptions import HTTPError
from requests.models import Response

from app.models.video import Timestamp, Video
from app.services.arkiv_sync import (
    ArkivSyncClient,
    ArkivSyncConfig,
    _build_attributes,
    _build_payload,
    _is_413_error,
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
    ) -> object:  # Returns TransactionReceipt, not a tuple
        self.updated.append(
            {
                "key": key,
                "payload": payload,
                "content_type": content_type,
                "attributes": attributes,
                "expires_in": expires_in,
            }
        )
        return object()  # Just return receipt, not a tuple


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


def test_build_payload_excludes_path_and_optimized_structure() -> None:
    video = make_video()
    payload = _build_payload(video, [make_timestamp("car")])
    assert "path" not in payload
    # Optimized payload only includes essential fields
    assert "cid_hash" in payload  # Always included for deduplication
    assert "is_encrypted" in payload
    assert "timestamps" in payload
    assert payload["timestamps"][0]["tag"] == "car"
    # For non-encrypted videos, encrypted CID fields are not included
    assert "encrypted_cid" not in payload
    assert "filecoin_root_cid" not in payload
    assert "lit_encryption_metadata" not in payload
    # Redundant fields (already in attributes or recalculatable) are excluded
    assert "title" not in payload
    assert "duration" not in payload
    assert "file_size" not in payload


def test_build_attributes_flat_and_typed() -> None:
    video = make_video()
    attributes = _build_attributes(video, [make_timestamp("car"), make_timestamp("tree")])
    assert attributes["title"] == "Sample"
    assert "path" not in attributes
    assert attributes["tags"] == "car,tree"
    assert attributes["phash"] == "ffee"
    assert "cid_hash" not in attributes
    # Recalculatable fields should NOT be in attributes
    assert "duration_s" not in attributes
    assert "file_size" not in attributes
    assert "file_ext" not in attributes
    assert "codec" not in attributes


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
    # Optimized payload structure
    assert "cid_hash" in payload_dict  # Always included for deduplication
    assert "is_encrypted" in payload_dict
    assert "timestamps" in payload_dict
    # Encrypted fields not included when not encrypted
    assert "encrypted_cid" not in payload_dict
    assert "filecoin_root_cid" not in payload_dict
    assert "lit_encryption_metadata" not in payload_dict


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


def test_is_413_error_detects_http_413() -> None:
    """Test that _is_413_error correctly identifies HTTP 413 errors."""
    response = Mock(spec=Response)
    response.status_code = 413
    error = HTTPError(response=response)
    
    assert _is_413_error(error) is True


def test_is_413_error_detects_413_in_message() -> None:
    """Test that _is_413_error detects 413 errors from error messages."""
    error = Exception("413 Client Error: Request Entity Too Large for url: https://example.com/rpc")
    
    assert _is_413_error(error) is True


def test_is_413_error_ignores_other_errors() -> None:
    """Test that _is_413_error returns False for non-413 errors."""
    response = Mock(spec=Response)
    response.status_code = 500
    error = HTTPError(response=response)
    
    assert _is_413_error(error) is False
    
    other_error = Exception("Some other error")
    assert _is_413_error(other_error) is False


def test_sync_handles_413_error_gracefully() -> None:
    """Test that sync_video returns None gracefully when encountering a 413 error."""
    config = ArkivSyncConfig(enabled=True, private_key="0x" + "1" * 64, rpc_url="http://localhost:8545")
    
    class ErrorArkivModule:
        def update_entity(
            self,
            key: EntityKey,
            payload: bytes,
            content_type: str,
            attributes: Attributes,
            expires_in: int,
        ) -> object:  # Returns TransactionReceipt, not a tuple
            response = Mock(spec=Response)
            response.status_code = 413
            raise HTTPError(response=response)
    
    class ErrorArkivClient:
        def __init__(self) -> None:
            self.arkiv = ErrorArkivModule()
    
    client = ArkivSyncClient(config, arkiv_factory=lambda *_args, **_kwargs: ErrorArkivClient())
    video = make_video(arkiv_entity_key="0x123")
    session = DummySession()
    
    result = client.sync_video(session, video, [])
    
    # Should return None gracefully instead of raising
    assert result is None
    assert not session.committed


def test_build_payload_removes_ciphertext_from_metadata() -> None:
    """Test that ciphertext is removed from lit_encryption_metadata in payload."""
    video = make_video(
        is_encrypted=True,
        lit_encryption_metadata=json.dumps({
            "ciphertext": "large_encrypted_data_string",
            "dataToEncryptHash": "hash123",
            "accessControlConditions": [],
            "chain": "ethereum"
        })
    )
    payload = _build_payload(video, [])
    
    assert "lit_encryption_metadata" in payload
    metadata = json.loads(payload["lit_encryption_metadata"])
    # ciphertext should be removed
    assert "ciphertext" not in metadata
    # Other fields should remain
    assert "dataToEncryptHash" in metadata
    assert "accessControlConditions" in metadata
    assert "chain" in metadata

