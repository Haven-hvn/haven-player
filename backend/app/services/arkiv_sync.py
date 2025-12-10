from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Iterable, Protocol
from typing import Callable, Iterable, Protocol

from arkiv import Arkiv
from arkiv.account import NamedAccount
from arkiv.provider import ProviderBuilder
from arkiv.types import Attributes, EntityKey
from sqlalchemy.orm import Session

from app.models.video import Timestamp, Video

logger = logging.getLogger(__name__)


@dataclass
class ArkivSyncConfig:
    enabled: bool
    private_key: str | None
    rpc_url: str
    expires_in: int = 24 * 60 * 60


def build_arkiv_config() -> ArkivSyncConfig:
    """
    Build Arkiv sync config reusing the same key as Filecoin/Lit to avoid
    double configuration. Single source of truth is FILECOIN_PRIVATE_KEY;
    ARKIV_PRIVATE_KEY is kept only as a legacy fallback.
    """
    shared_key = os.getenv("FILECOIN_PRIVATE_KEY")
    legacy_override = os.getenv("ARKIV_PRIVATE_KEY")

    # Prefer the shared Filecoin/Lit key; fall back to legacy override
    private_key = shared_key or legacy_override
    rpc_url = os.getenv("ARKIV_RPC_URL") or "http://127.0.0.1:8545"
    enabled = bool(private_key)
    return ArkivSyncConfig(enabled=enabled, private_key=private_key, rpc_url=rpc_url)


class ArkivEntityClient(Protocol):
    def create_entity(
        self,
        payload: bytes,
        content_type: str,
        attributes: Attributes,
        expires_in: int,
    ) -> tuple[EntityKey, object]:
        ...

    def update_entity(
        self,
        key: EntityKey,
        payload: bytes,
        content_type: str,
        attributes: Attributes,
        expires_in: int,
    ) -> tuple[EntityKey, object]:
        ...


class ArkivClientProtocol(Protocol):
    arkiv: ArkivEntityClient


def _build_attributes(video: Video, timestamps: Iterable[Timestamp]) -> dict[str, str | int]:
    """
    Public attributes sent to Arkiv. Do NOT include any CID or cid_hash to avoid
    leaking retrieval hints. CID-related data lives only in the encrypted payload.
    """
    tag_names = sorted({ts.tag_name for ts in timestamps})
    attributes: dict[str, str | int] = {}

    if video.title:
        attributes["title"] = video.title
    if video.creator_handle:
        attributes["creator_handle"] = video.creator_handle
    if video.mint_id:
        attributes["mint_id"] = video.mint_id
    if tag_names:
        attributes["tags"] = ",".join(tag_names)
    if video.duration is not None:
        attributes["duration_s"] = int(video.duration)
    if video.is_encrypted:
        attributes["is_encrypted"] = 1
    if video.phash:
        attributes["phash"] = video.phash
    if video.file_size is not None:
        attributes["file_size"] = int(video.file_size)
    if video.file_extension:
        attributes["file_ext"] = video.file_extension
    if video.codec:
        attributes["codec"] = video.codec
    if video.analysis_model:
        attributes["analysis_model"] = video.analysis_model
    if video.source_uri:
        attributes["source_uri"] = video.source_uri
    if video.created_at:
        attributes["created_at"] = video.created_at.isoformat()
    if video.updated_at:
        attributes["updated_at"] = video.updated_at.isoformat()

    return attributes


def _build_payload(video: Video, timestamps: Iterable[Timestamp]) -> dict:
    tags = [
        {
            "tag": ts.tag_name,
            "start_time": ts.start_time,
            "end_time": ts.end_time,
            "confidence": ts.confidence,
        }
        for ts in timestamps
    ]

    # Encrypted fields: only include CID and cid_hash inside encrypted payload for need-to-know access
    return {
        "encrypted_cid": video.encrypted_filecoin_cid if video.is_encrypted else None,
        "cid_hash": video.cid_hash if video.is_encrypted else None,
        "filecoin_root_cid": video.filecoin_root_cid if video.is_encrypted else None,
        "title": video.title,
        "creator_handle": video.creator_handle,
        "mint_id": video.mint_id,
        "duration": video.duration,
        "file_size": video.file_size,
        "file_extension": video.file_extension,
        "mime_type": video.mime_type,
        "codec": video.codec,
        "phash": video.phash,
        "source_uri": video.source_uri,
        "analysis_model": video.analysis_model,
        "timestamps": tags,
        "is_encrypted": video.is_encrypted,
        "lit_encryption_metadata": video.lit_encryption_metadata,
        "created_at": video.created_at.isoformat() if video.created_at else None,
        "updated_at": video.updated_at.isoformat() if video.updated_at else None,
    }


class ArkivSyncClient:
    """
    Handles pushing video metadata to Arkiv using the Arkiv SDK.

    Network calls are skipped when disabled or missing key.
    """

    def __init__(
        self,
        config: ArkivSyncConfig,
        arkiv_factory: Callable[..., ArkivClientProtocol] | None = None,
    ) -> None:
        self.config = config
        self._arkiv_factory = arkiv_factory or self._default_factory
        self._client: ArkivClientProtocol | None = None

    def _default_factory(self, provider_url: str, private_key: str) -> ArkivClientProtocol:
        provider = ProviderBuilder().custom(provider_url).build()
        account = NamedAccount.from_private_key("haven-node", private_key)
        return Arkiv(provider=provider, account=account)

    def _get_client(self) -> ArkivClientProtocol:
        if self._client is None:
            if not self.config.private_key:
                raise ValueError("Arkiv private key missing")
            self._client = self._arkiv_factory(self.config.rpc_url, self.config.private_key)
        return self._client

    def sync_video(self, db_session: Session, video: Video, timestamps: Iterable[Timestamp]) -> EntityKey | None:
        """
        Push video metadata to Arkiv.
        Returns entity key if created/updated, otherwise None.
        """
        if not self.config.enabled:
            logger.debug("Arkiv sync disabled (no private key configured)")
            return None

        if not video.share_to_arkiv:
            logger.debug("Video marked as local-only; skipping Arkiv sync")
            return None

        client = self._get_client()

        payload = _build_payload(video, timestamps)
        attributes = _build_attributes(video, timestamps)
        payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        if video.arkiv_entity_key:
            logger.info("Updating Arkiv entity for video %s", video.path)
            client.arkiv.update_entity(
                EntityKey(video.arkiv_entity_key),
                payload=payload_bytes,
                content_type="application/json",
                attributes=Attributes(attributes),
                expires_in=self.config.expires_in,
            )
            return EntityKey(video.arkiv_entity_key)

        logger.info("Creating Arkiv entity for video %s", video.path)
        entity_key, _receipt = client.arkiv.create_entity(
            payload=payload_bytes,
            content_type="application/json",
            attributes=Attributes(attributes),
            expires_in=self.config.expires_in,
        )

        video.arkiv_entity_key = str(entity_key)
        db_session.commit()
        db_session.refresh(video)
        return entity_key

