from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable, Protocol, Any
import mimetypes

import requests
from arkiv import Arkiv
from arkiv.account import NamedAccount
from arkiv.provider import ProviderBuilder
from arkiv.types import Attributes, EntityKey
from requests.exceptions import HTTPError
from sqlalchemy.orm import Session
from web3.exceptions import Web3RPCError

from app.lib.phash_generator.phash_calculator import calculate_phash, get_video_duration
from app.models.video import Timestamp, Video
from app.services.evm_utils import (
    InsufficientGasError,
    handle_evm_gas_error,
    validate_evm_config,
)

logger = logging.getLogger(__name__)


def _is_413_error(exc: Exception) -> bool:
    """
    Check if an exception is an HTTP 413 Request Entity Too Large error.
    
    This checks the exception itself and its cause chain, as web3 may wrap
    HTTPError exceptions in other exception types.
    """
    # Check the exception itself
    if isinstance(exc, HTTPError):
        if hasattr(exc, 'response') and exc.response is not None:
            return exc.response.status_code == 413
    
    # Check the exception chain (__cause__ and __context__)
    current = exc
    checked = set()
    while current is not None and id(current) not in checked:
        checked.add(id(current))
        if isinstance(current, HTTPError):
            if hasattr(current, 'response') and current.response is not None:
                if current.response.status_code == 413:
                    return True
        # Check if the error message contains 413
        error_str = str(current)
        if "413" in error_str and ("Request Entity Too Large" in error_str or "Entity Too Large" in error_str):
            return True
        # Move to the next exception in the chain
        current = getattr(current, '__cause__', None) or getattr(current, '__context__', None)
    
    return False


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
    
    The ARKIV_SYNC_ENABLED environment variable controls whether sync is enabled
    (user toggle in UI). If not set, defaults to False for safety.
    
    Validates EVM configuration and logs wallet address for gas error handling.
    """
    shared_key = os.getenv("FILECOIN_PRIVATE_KEY")
    legacy_override = os.getenv("ARKIV_PRIVATE_KEY")

    # Prefer the shared Filecoin/Lit key; fall back to legacy override
    private_key = shared_key or legacy_override
    rpc_url = os.getenv("ARKIV_RPC_URL") or "https://mendoza.hoodi.arkiv.network/rpc"
    
    # Check if sync is enabled via user toggle (ARKIV_SYNC_ENABLED env var)
    sync_enabled_str = os.getenv("ARKIV_SYNC_ENABLED", "false").lower()
    sync_enabled = sync_enabled_str in ("true", "1", "yes")
    
    # Arkiv is enabled only if both: user toggle is on AND private key exists
    enabled = bool(private_key) and sync_enabled
    
    # Validate EVM config and log wallet info when enabled (for gas error handling)
    if enabled and private_key:
        try:
            wallet_address, chain_name, token_symbol = validate_evm_config(private_key, rpc_url)
            logger.info(
                "✅ Arkiv sync enabled | "
                "Chain: %s | "
                "Wallet Address: %s | "
                "Ensure you have %s for gas fees",
                chain_name,
                wallet_address,
                token_symbol
            )
        except Exception as e:
            logger.warning("Failed to validate Arkiv EVM config: %s", e)
    
    if private_key and not sync_enabled:
        logger.info("🔒 Arkiv sync is disabled by user setting (ARKIV_SYNC_ENABLED=false)")
    elif not private_key:
        logger.info("🔑 Arkiv sync is disabled: no private key configured")
    
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
    if video.is_encrypted:
        attributes["is_encrypted"] = 1
    if video.phash:
        attributes["phash"] = video.phash
    if video.analysis_model:
        attributes["analysis_model"] = video.analysis_model
    if video.source_uri:
        attributes["source_uri"] = video.source_uri
    if video.created_at:
        attributes["created_at"] = video.created_at.isoformat()
    if video.updated_at:
        attributes["updated_at"] = video.updated_at.isoformat()
    # Note: duration, file_size, file_ext, codec are NOT included here as they can be recalculated from the video file

    return attributes


def _build_payload(video: Video, timestamps: Iterable[Timestamp]) -> dict:
    """
    Build optimized payload for Arkiv entity.
    
    The payload should only contain:
    1. Encrypted/sensitive data (CIDs, encryption metadata) - not in public attributes
    2. Data not available in attributes (timestamps with full details)
    3. Essential fields needed for restore (backward compatibility)
    
    Fields already in attributes (title, duration, etc.) are excluded to reduce size.
    """
    tags = [
        {
            "tag": ts.tag_name,
            "start_time": ts.start_time,
            "end_time": ts.end_time,
            "confidence": ts.confidence,
        }
        for ts in timestamps
    ]

    # Build minimal payload with only essential encrypted/sensitive data
    payload: dict[str, Any] = {}
    
    # Encrypted CIDs (only when encrypted) - sensitive, not in attributes
    if video.is_encrypted:
        if video.encrypted_filecoin_cid:
            payload["encrypted_cid"] = video.encrypted_filecoin_cid
        if video.filecoin_root_cid:
            payload["filecoin_root_cid"] = video.filecoin_root_cid
        # Encryption metadata (REQUIRED for decryption - contains accessControlConditions, dataToEncryptHash, chain)
        # NOTE: ciphertext is NOT included here - it's already on Filecoin and would be a duplicate
        # The decryption function will use the Filecoin data instead of metadata.ciphertext
        if video.lit_encryption_metadata:
            # Parse metadata and remove ciphertext to reduce payload size
            import json
            metadata_dict = json.loads(video.lit_encryption_metadata)
            # Remove ciphertext - it's already on Filecoin, no need to duplicate
            if "ciphertext" in metadata_dict:
                metadata_dict.pop("ciphertext")
            # Store metadata without ciphertext
            payload["lit_encryption_metadata"] = json.dumps(metadata_dict)
        else:
            # Log warning if encrypted video is missing metadata (decryption will fail)
            logger.warning(
                "⚠️ Encrypted video %s is missing lit_encryption_metadata. "
                "This video cannot be decrypted without this metadata.",
                video.path
            )
    
    # cid_hash is needed for deduplication during restore (both encrypted and non-encrypted)
    if video.cid_hash:
        payload["cid_hash"] = video.cid_hash
    
    # Timestamps with full details (not in attributes as full objects)
    if tags:
        payload["timestamps"] = tags
    
    # Essential flag for restore
    payload["is_encrypted"] = video.is_encrypted
    
    return payload


def _download_from_ipfs(cid: str, gateway_url: str = "https://ipfs.io/ipfs/") -> bytes:
    """
    Download file from IPFS gateway using CID.
    
    Args:
        cid: The IPFS CID to download
        gateway_url: The IPFS gateway URL (default: https://ipfs.io/ipfs/)
    
    Returns:
        bytes: The downloaded file content
    
    Raises:
        requests.RequestException: If download fails
    """
    url = f"{gateway_url.rstrip('/')}/{cid}"
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.content


def _recalculate_video_metadata(
    video_file_path: str,
    is_encrypted: bool = False
) -> dict[str, Any]:
    """
    Recalculate video metadata from file.
    
    For encrypted videos, we can only get file_size (cannot decrypt in backend).
    For non-encrypted videos, we can calculate all fields.
    
    Args:
        video_file_path: Path to the video file
        is_encrypted: Whether the video is encrypted
    
    Returns:
        dict with: phash, duration, file_size, file_extension, mime_type, codec
    """
    result: dict[str, Any] = {}
    
    try:
        # file_size can always be calculated
        result["file_size"] = os.path.getsize(video_file_path)
    except OSError:
        result["file_size"] = None
    
    # file_extension and mime_type can be inferred from path
    extension = Path(video_file_path).suffix.replace(".", "") if video_file_path else None
    result["file_extension"] = extension
    result["mime_type"], _ = mimetypes.guess_type(video_file_path)
    
    # For encrypted videos, we cannot calculate phash or duration (requires decryption)
    if is_encrypted:
        result["phash"] = None
        result["duration"] = 0
        result["codec"] = None
    else:
        # Calculate phash
        try:
            result["phash"] = calculate_phash(video_file_path)
        except Exception as e:
            logger.warning("Failed to calculate phash for %s: %s", video_file_path, e)
            result["phash"] = None
        
        # Calculate duration
        try:
            result["duration"] = int(get_video_duration(video_file_path))
        except Exception as e:
            logger.warning("Failed to calculate duration for %s: %s", video_file_path, e)
            result["duration"] = 0
        
        # Codec detection would require parsing video file (complex, skip for now)
        result["codec"] = None
    
    return result


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

            # Get attributes as fallback for fields not in optimized payload
            attributes = {}
            if hasattr(entity, "attributes") and entity.attributes:
                # Convert attributes to dict if it's not already
                if isinstance(entity.attributes, dict):
                    attributes = entity.attributes
                elif hasattr(entity.attributes, "__dict__"):
                    attributes = entity.attributes.__dict__
                elif hasattr(entity.attributes, "get"):
                    # Try to use as dict-like
                    attributes = {k: getattr(entity.attributes, k, None) for k in dir(entity.attributes) if not k.startswith("_")}

            # Helper to get value from payload or attributes with fallback
            def get_field(payload_key: str, attr_key: str | None = None, default: Any = None) -> Any:
                """Get field from payload, fallback to attributes, then default."""
                if payload_key in payload and payload[payload_key] is not None:
                    return payload[payload_key]
                if attr_key and attr_key in attributes and attributes[attr_key] is not None:
                    return attributes[attr_key]
                return default

            # Dedupe by phash (prioritized), arkiv_entity_key, or cid_hash
            existing = None
            phash = get_field("phash", "phash")
            if phash:
                existing = db_session.query(Video).filter(Video.phash == phash).first()
            if not existing and entity.key:
                existing = db_session.query(Video).filter(Video.arkiv_entity_key == str(entity.key)).first()
            cid_hash = get_field("cid_hash")
            if not existing and cid_hash:
                existing = db_session.query(Video).filter(Video.cid_hash == cid_hash).first()

            if existing:
                skipped += 1
                continue

            # path is required (nullable=False) and must be unique
            # Prioritize phash for path generation (content-based, better for deduplication)
            filecoin_cid = get_field("filecoin_root_cid")
            if phash:
                video_path = f"arkiv:phash:{phash}"
            elif filecoin_cid:
                video_path = filecoin_cid
            elif entity.key:
                # Use entity key as part of path to ensure uniqueness
                video_path = f"arkiv:{str(entity.key)}"
            else:
                # Fallback: use timestamp-based placeholder (shouldn't happen, but safe)
                video_path = f"arkiv:restored:{datetime.now().timestamp()}"
            
            # title is required (nullable=False)
            video_title = get_field("title", "title", "Restored Video")
            if not video_title or video_title.strip() == "":
                video_title = "Restored Video"
            
            # Determine if video is encrypted
            is_encrypted = bool(get_field("is_encrypted", "is_encrypted", False))
            
            # Recalculate fields from Filecoin/IPFS if CID is available
            recalculated_metadata: dict[str, Any] = {}
            temp_file_path: str | None = None
            
            # Determine which CID to use for download
            download_cid = get_field("encrypted_cid") if is_encrypted else filecoin_cid
            
            if download_cid:
                try:
                    logger.info("Downloading video from IPFS for recalculation: %s", download_cid)
                    # Download from IPFS
                    file_content = _download_from_ipfs(download_cid)
                    
                    # Save to temporary file for recalculation
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
                        temp_file.write(file_content)
                        temp_file_path = temp_file.name
                    
                    # Recalculate metadata from downloaded file
                    recalculated_metadata = _recalculate_video_metadata(temp_file_path, is_encrypted)
                    logger.info("Recalculated metadata: phash=%s, duration=%s, file_size=%s", 
                              recalculated_metadata.get("phash"), 
                              recalculated_metadata.get("duration"),
                              recalculated_metadata.get("file_size"))
                except Exception as e:
                    logger.warning("Failed to download/recalculate from IPFS for CID %s: %s", download_cid, e)
                    # Continue with fallback values from payload/attributes
            
            # Use recalculated values if available, otherwise fallback to payload/attributes
            final_phash = recalculated_metadata.get("phash") or phash
            final_duration = recalculated_metadata.get("duration") or 0
            final_file_size = recalculated_metadata.get("file_size") or get_field("file_size", "file_size")
            final_file_extension = recalculated_metadata.get("file_extension") or get_field("file_extension", "file_ext")
            final_mime_type = recalculated_metadata.get("mime_type")
            final_codec = recalculated_metadata.get("codec") or get_field("codec", "codec")
            
            # Update path if phash was recalculated
            if final_phash and not phash:
                video_path = f"arkiv:phash:{final_phash}"
            
            # Prepare timestamps (video_path will be set after Video is created)
            ts_payloads = payload.get("timestamps") or []
            timestamps: list[Timestamp] = []
            for ts in ts_payloads:
                try:
                    timestamps.append(
                        Timestamp(
                            video_path="",  # Will be set to video_path after Video creation
                            tag_name=ts.get("tag", "tag"),
                            start_time=float(ts.get("start_time", 0.0)),
                            end_time=ts.get("end_time"),
                            confidence=float(ts.get("confidence", 0.0)),
                        )
                    )
                except Exception:
                    continue

            db_video = Video(
                path=video_path,  # Required, non-nullable, unique
                title=video_title,  # Required, non-nullable
                duration=int(final_duration),  # Required (Mapped[int]) - from recalculation or default
                has_ai_data=bool(ts_payloads),
                thumbnail_path=None,  # Optional
                position=0,  # Has default, but explicit is fine
                phash=final_phash,  # Optional - from recalculation or attributes
                created_at=datetime.now(),  # Has default, but explicit is fine
                updated_at=datetime.now(),  # Has default, but explicit is fine
                file_size=final_file_size,  # Optional - from recalculation or fallback
                file_extension=final_file_extension,  # Optional - from recalculation or fallback
                mime_type=final_mime_type,  # Optional - from recalculation
                codec=final_codec,  # Optional - from recalculation or fallback
                creator_handle=get_field("creator_handle", "creator_handle"),  # Optional
                source_uri=get_field("source_uri", "source_uri"),  # Optional
                analysis_model=get_field("analysis_model", "analysis_model"),  # Optional
                share_to_arkiv=True,  # Has default, but explicit is fine
                arkiv_entity_key=str(entity.key) if entity.key else None,  # Optional
                mint_id=get_field("mint_id", "mint_id"),  # Optional
                filecoin_root_cid=filecoin_cid,  # Optional
                cid_hash=cid_hash,  # Optional
                encrypted_filecoin_cid=get_field("encrypted_cid"),  # Optional
                is_encrypted=is_encrypted,  # Has default, but explicit is fine
                lit_encryption_metadata=get_field("lit_encryption_metadata"),  # Optional
            )
            
            # Clean up temporary file if created
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.unlink(temp_file_path)
                except Exception as e:
                    logger.warning("Failed to clean up temporary file %s: %s", temp_file_path, e)
            
            # Validate that encrypted videos have required metadata for decryption
            if db_video.is_encrypted and not db_video.lit_encryption_metadata:
                logger.warning(
                    "⚠️ Restored encrypted video %s is missing lit_encryption_metadata. "
                    "This video cannot be decrypted. Entity key: %s",
                    db_video.path or "unknown",
                    str(entity.key) if entity.key else "unknown"
                )
            db_session.add(db_video)
            db_session.commit()
            db_session.refresh(db_video)

            # Update timestamps with video path reference (required: video_path is non-nullable)
            for ts in timestamps:
                ts.video_path = db_video.path  # Set the actual video path (required field)
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
        
        # Log payload size for debugging
        payload_size_kb = len(payload_bytes) / 1024
        if payload_size_kb > 100:  # Warn if payload is larger than 100KB
            logger.warning(
                "⚠️ Large Arkiv payload detected for video %s | "
                "Payload size: %.2f KB | "
                "This may cause RPC request size limits",
                video.path,
                payload_size_kb
            )

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
            # Check if this is a 413 Request Entity Too Large error
            # (web3 may wrap HTTPError in other exceptions, so check the exception chain)
            if _is_413_error(exc):
                logger.error(
                    "❌ Arkiv sync failed: Payload too large for RPC endpoint | "
                    "Video: %s | "
                    "Entity Key: %s | "
                    "Payload size: %.2f KB | "
                    "RPC endpoint has a request size limit that was exceeded. "
                    "This may occur with videos that have large encryption metadata or many timestamps. "
                    "The video has been uploaded to Filecoin successfully, but Arkiv sync could not complete.",
                    video.path,
                    video.arkiv_entity_key or "None",
                    payload_size_kb,
                    exc_info=False
                )
                # Return None gracefully - this is a non-critical error
                # The video is already uploaded to Filecoin, so we don't want to fail the entire operation
                return None
            
            # Check if this is an insufficient funds error (works across all EVM chains)
            if isinstance(exc, Web3RPCError):
                from app.services.evm_utils import is_insufficient_funds_error
                if is_insufficient_funds_error(exc):
                    # Use shared EVM gas error handler
                    gas_error = handle_evm_gas_error(
                        exc,
                        self.config.private_key,
                        self.config.rpc_url,
                        context=f"Arkiv sync for video {video.path}"
                    )
                    raise gas_error
            
            # Log and re-raise other errors
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

