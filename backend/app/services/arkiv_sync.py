from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Iterable, Protocol, Any

from arkiv import Arkiv
from arkiv.account import NamedAccount
from arkiv.provider import ProviderBuilder
from arkiv.types import Attributes, EntityKey
from sqlalchemy.orm import Session

from app.models.video import Timestamp, Video

logger = logging.getLogger(__name__)


def _extract_transaction_hash(receipt: Any) -> str | None:
    """
    Extract transaction hash from Arkiv SDK receipt object.
    
    The receipt object structure may vary, but typically contains:
    - receipt.transactionHash
    - receipt.hash
    - receipt.txHash
    - Or nested in receipt.receipt.transactionHash
    
    Returns the transaction hash as a string, or None if not found.
    """
    if not receipt:
        return None
    
    # Try common attribute names
    for attr_name in ['transactionHash', 'hash', 'txHash', 'transaction_hash']:
        if hasattr(receipt, attr_name):
            value = getattr(receipt, attr_name)
            if value:
                return str(value)
    
    # Try dictionary access if receipt is dict-like
    if isinstance(receipt, dict):
        for key in ['transactionHash', 'hash', 'txHash', 'transaction_hash']:
            if key in receipt and receipt[key]:
                return str(receipt[key])
    
    # Try nested receipt object
    if hasattr(receipt, 'receipt'):
        nested_receipt = receipt.receipt
        for attr_name in ['transactionHash', 'hash', 'txHash', 'transaction_hash']:
            if hasattr(nested_receipt, attr_name):
                value = getattr(nested_receipt, attr_name)
                if value:
                    return str(value)
    
    return None


def _log_transaction_info(receipt: Any, rpc_url: str, operation: str, entity_key: str | None = None) -> None:
    """
    Log transaction information for developers to check on block explorer.
    
    Args:
        receipt: The transaction receipt from Arkiv SDK
        rpc_url: The RPC URL used for the transaction (helps identify the network)
        operation: Either "create" or "update"
        entity_key: The Arkiv entity key if available
    """
    transaction_hash = _extract_transaction_hash(receipt)
    
    if transaction_hash:
        # Determine network from RPC URL for helpful logging
        network_hint = "unknown network"
        if "localhost" in rpc_url or "127.0.0.1" in rpc_url:
            network_hint = "local network"
        elif "sepolia" in rpc_url.lower():
            network_hint = "Sepolia testnet"
        elif "mainnet" in rpc_url.lower() or "ethereum" in rpc_url.lower():
            network_hint = "Ethereum mainnet"
        
        logger.info(
            "✅ Arkiv %s transaction confirmed | "
            "Transaction Hash: %s | "
            "Network: %s | "
            "RPC URL: %s | "
            "Entity Key: %s | "
            "View on block explorer using the transaction hash above",
            operation,
            transaction_hash,
            network_hint,
            rpc_url,
            entity_key or "N/A"
        )
    else:
        logger.warning(
            "⚠️ Arkiv %s transaction completed but could not extract transaction hash from receipt. "
            "Receipt type: %s | Receipt: %s",
            operation,
            type(receipt).__name__,
            str(receipt)[:200] if receipt else "None"
        )


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

    def fetch_entities(self) -> list:
        """
        Fetch all Arkiv entities for the current account.
        """
        if not self.config.enabled:
            return []
        client = self._get_client()
        # Select all fields; SDK defaults to all fields when no projection specified
        try:
            return list(client.arkiv.select().fetch())
        except Exception as exc:
            logger.error("Failed to fetch Arkiv entities: %s", exc)
            return []

    def restore_catalog(self, db_session: Session) -> dict:
        """
        Restore catalog metadata from Arkiv into local DB (catalog-only).
        """
        if not self.config.enabled:
            raise ValueError("Arkiv sync disabled (no private key configured)")

        entities = self.fetch_entities()
        restored = 0
        skipped = 0

        for entity in entities:
            payload_bytes = entity.payload if hasattr(entity, "payload") else None
            if not payload_bytes:
                skipped += 1
                continue
            try:
                payload = json.loads(payload_bytes.decode("utf-8"))
            except Exception as exc:
                logger.warning("Skipping entity due to payload decode error: %s", exc)
                skipped += 1
                continue

            # Dedupe by arkiv_entity_key, cid_hash, or phash
            existing = None
            if entity.key:
                existing = db_session.query(Video).filter(Video.arkiv_entity_key == str(entity.key)).first()
            if not existing and payload.get("cid_hash"):
                existing = db_session.query(Video).filter(Video.cid_hash == payload.get("cid_hash")).first()
            if not existing and payload.get("phash"):
                existing = db_session.query(Video).filter(Video.phash == payload.get("phash")).first()

            if existing:
                skipped += 1
                continue

            ts_payloads = payload.get("timestamps") or []
            timestamps: list[Timestamp] = []
            for ts in ts_payloads:
                try:
                    timestamps.append(
                        Timestamp(
                            video_path="",  # filled after Video path set
                            tag_name=ts.get("tag", "tag"),
                            start_time=float(ts.get("start_time", 0.0)),
                            end_time=ts.get("end_time"),
                            confidence=float(ts.get("confidence", 0.0)),
                        )
                    )
                except Exception:
                    continue

            db_video = Video(
                path=payload.get("filecoin_root_cid") or "",  # No local path; placeholder
                title=payload.get("title") or "Restored Video",
                duration=int(payload.get("duration") or 0),
                has_ai_data=bool(ts_payloads),
                thumbnail_path=None,
                position=0,
                phash=payload.get("phash"),
                created_at=datetime.now(),
                updated_at=datetime.now(),
                file_size=payload.get("file_size"),
                file_extension=payload.get("file_extension"),
                mime_type=payload.get("mime_type"),
                codec=payload.get("codec"),
                creator_handle=payload.get("creator_handle"),
                source_uri=payload.get("source_uri"),
                analysis_model=payload.get("analysis_model"),
                share_to_arkiv=True,
                arkiv_entity_key=str(entity.key) if entity.key else None,
                mint_id=payload.get("mint_id"),
                filecoin_root_cid=payload.get("filecoin_root_cid"),
                cid_hash=payload.get("cid_hash"),
                encrypted_filecoin_cid=payload.get("encrypted_cid"),
                is_encrypted=bool(payload.get("is_encrypted")),
                lit_encryption_metadata=payload.get("lit_encryption_metadata"),
            )
            db_session.add(db_video)
            db_session.commit()
            db_session.refresh(db_video)

            # Update timestamps with video path reference
            for ts in timestamps:
                ts.video_path = db_video.path
                db_session.add(ts)
            db_session.commit()
            restored += 1

        return {"restored": restored, "skipped": skipped}

    def sync_video(self, db_session: Session, video: Video, timestamps: Iterable[Timestamp]) -> EntityKey | None:
        """
        Push video metadata to Arkiv.
        Returns entity key if created/updated, otherwise None.
        """
        if not self.config.enabled:
            logger.info(
                "⏭️ Arkiv sync skipped for video %s: Arkiv sync is disabled (no private key configured). "
                "Set FILECOIN_PRIVATE_KEY or ARKIV_PRIVATE_KEY environment variable to enable.",
                video.path
            )
            return None

        if not video.share_to_arkiv:
            logger.info(
                "⏭️ Arkiv sync skipped for video %s: Video is marked as local-only (share_to_arkiv=False). "
                "Enable sharing in the UI to sync to Arkiv.",
                video.path
            )
            return None

        logger.info(
            "🔄 Starting Arkiv sync for video: %s | "
            "Entity Key: %s | "
            "Has Filecoin CID: %s | "
            "Is Encrypted: %s | "
            "Timestamps: %d",
            video.path,
            video.arkiv_entity_key or "None (will create)",
            "Yes" if video.filecoin_root_cid else "No",
            "Yes" if video.is_encrypted else "No",
            len(timestamps)
        )

        client = self._get_client()

        payload = _build_payload(video, timestamps)
        attributes = _build_attributes(video, timestamps)
        payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        try:
            if video.arkiv_entity_key:
                logger.info("📝 Updating existing Arkiv entity for video %s (entity key: %s)", video.path, video.arkiv_entity_key)
                _entity_key, receipt = client.arkiv.update_entity(
                    EntityKey(video.arkiv_entity_key),
                    payload=payload_bytes,
                    content_type="application/json",
                    attributes=Attributes(attributes),
                    expires_in=self.config.expires_in,
                )
                _log_transaction_info(
                    receipt=receipt,
                    rpc_url=self.config.rpc_url,
                    operation="update",
                    entity_key=video.arkiv_entity_key
                )
                logger.info("✅ Successfully updated Arkiv entity for video %s", video.path)
                return EntityKey(video.arkiv_entity_key)

            logger.info("🆕 Creating new Arkiv entity for video %s", video.path)
            entity_key, receipt = client.arkiv.create_entity(
                payload=payload_bytes,
                content_type="application/json",
                attributes=Attributes(attributes),
                expires_in=self.config.expires_in,
            )

            video.arkiv_entity_key = str(entity_key)
            db_session.commit()
            db_session.refresh(video)
            
            _log_transaction_info(
                receipt=receipt,
                rpc_url=self.config.rpc_url,
                operation="create",
                entity_key=str(entity_key)
            )
            
            logger.info("✅ Successfully created Arkiv entity for video %s (entity key: %s)", video.path, str(entity_key))
            return entity_key
        except Exception as exc:
            logger.error(
                "❌ Arkiv sync operation failed for video %s | "
                "Entity Key: %s | "
                "Error: %s",
                video.path,
                video.arkiv_entity_key or "None",
                exc,
                exc_info=True
            )
            raise

