"""Sync step - Arkiv blockchain synchronization.

This step synchronizes video metadata to the Arkiv blockchain,
creating a permanent, queryable record of the archived content.
It:
1. Builds the Arkiv entity payload
2. Checks for existing entities (update vs create)
3. Submits transaction to Arkiv
4. Records the entity key

The step is conditional and can be skipped via the arkiv_sync_enabled option.
"""

from typing import Any, Dict, Optional

from haven_cli.pipeline.context import PipelineContext
from haven_cli.pipeline.events import EventType
from haven_cli.pipeline.results import ErrorCategory, StepError, StepResult
from haven_cli.pipeline.step import ConditionalStep


class SyncStep(ConditionalStep):
    """Pipeline step for Arkiv blockchain synchronization.
    
    This step creates or updates an entity on the Arkiv blockchain
    with the video's metadata, enabling decentralized discovery
    and verification of archived content.
    
    Emits:
        - SYNC_REQUESTED event when starting
        - SYNC_COMPLETE event on success
    
    Output data:
        - entity_key: Arkiv entity key
        - transaction_hash: Blockchain transaction hash
        - is_update: Whether this was an update to existing entity
    """
    
    @property
    def name(self) -> str:
        """Step identifier."""
        return "sync"
    
    @property
    def enabled_option(self) -> str:
        """Context option that enables this step."""
        return "arkiv_sync_enabled"
    
    @property
    def default_enabled(self) -> bool:
        """Arkiv sync is enabled by default."""
        return True
    
    @property
    def max_retries(self) -> int:
        """Blockchain operations can retry on transient errors."""
        return 3
    
    async def should_skip(self, context: PipelineContext) -> bool:
        """Skip if sync is disabled or no upload result available."""
        # Check if sync is enabled
        if await super().should_skip(context):
            return True
        
        # Skip if no upload result (nothing to sync)
        if context.upload_result is None:
            return True
        
        return False
    
    async def _get_skip_reason(self, context: PipelineContext) -> str:
        """Provide specific skip reason."""
        if context.upload_result is None:
            return "No upload result to sync"
        return await super()._get_skip_reason(context)
    
    async def process(self, context: PipelineContext) -> StepResult:
        """Process Arkiv synchronization.
        
        Args:
            context: Pipeline context with upload result
            
        Returns:
            StepResult with sync details
        """
        video_path = context.video_path
        
        # Emit sync requested event
        await self._emit_event(EventType.SYNC_REQUESTED, context, {
            "video_path": video_path,
            "cid": context.cid,
        })
        
        try:
            # Get Arkiv configuration
            arkiv_config = self._get_arkiv_config()
            
            # Build entity payload and attributes
            payload = self._build_payload(context)
            attributes = self._build_attributes(context)
            
            # Initialize Arkiv client
            # TODO: Implement actual Arkiv client
            client = await self._get_arkiv_client(arkiv_config)
            
            # Check for existing entity
            existing_entity = await self._find_existing_entity(
                client,
                attributes.get("cid_hash", ""),
            )
            
            # Create or update entity
            if existing_entity:
                result = await self._update_entity(
                    client,
                    existing_entity["entity_key"],
                    payload,
                    attributes,
                )
                is_update = True
            else:
                result = await self._create_entity(
                    client,
                    payload,
                    attributes,
                )
                is_update = False
            
            # Store entity key in context
            context.arkiv_entity_key = result["entity_key"]
            
            # Update database
            # TODO: Implement database update
            await self._update_database(video_path, result["entity_key"])
            
            # Emit sync complete event
            await self._emit_event(EventType.SYNC_COMPLETE, context, {
                "video_path": video_path,
                "entity_key": result["entity_key"],
                "transaction_hash": result.get("transaction_hash", ""),
                "is_update": is_update,
            })
            
            return StepResult.ok(
                self.name,
                entity_key=result["entity_key"],
                transaction_hash=result.get("transaction_hash", ""),
                is_update=is_update,
            )
            
        except Exception as e:
            category = self._categorize_error(e)
            
            return StepResult.fail(
                self.name,
                StepError.from_exception(e, code="SYNC_ERROR", category=category),
            )
    
    def _get_arkiv_config(self) -> Dict[str, Any]:
        """Get Arkiv configuration.
        
        TODO: Implement actual config loading.
        """
        return {
            "rpc_url": self._config.get("arkiv_rpc_url", ""),
            "private_key": self._config.get("arkiv_private_key", ""),
            "expiration_seconds": self._config.get("arkiv_expiration", 31536000),  # 1 year
        }
    
    def _build_payload(self, context: PipelineContext) -> Dict[str, Any]:
        """Build the entity payload for Arkiv.
        
        The payload contains the video metadata that will be
        stored on-chain.
        """
        payload: Dict[str, Any] = {
            "version": "1.0",
            "type": "video",
        }
        
        # Add video metadata
        if context.video_metadata:
            payload["title"] = context.video_metadata.title
            payload["duration"] = context.video_metadata.duration
            payload["file_size"] = context.video_metadata.file_size
            payload["mime_type"] = context.video_metadata.mime_type
            payload["phash"] = context.video_metadata.phash
            payload["creator_handle"] = context.video_metadata.creator_handle
            payload["source_uri"] = context.video_metadata.source_uri
        
        # Add upload result
        if context.upload_result:
            payload["root_cid"] = context.upload_result.root_cid
            payload["piece_cid"] = context.upload_result.piece_cid
        
        # Add analysis result
        if context.analysis_result:
            payload["has_ai_data"] = True
            payload["tag_count"] = len(context.analysis_result.tags)
            payload["timestamp_count"] = len(context.analysis_result.timestamps)
        
        # Add encryption info
        if context.encryption_metadata:
            payload["encrypted"] = True
            payload["encryption_chain"] = context.encryption_metadata.chain
        
        return payload
    
    def _build_attributes(self, context: PipelineContext) -> Dict[str, str]:
        """Build entity attributes for Arkiv indexing.
        
        Attributes are indexed and queryable on-chain.
        """
        attributes: Dict[str, str] = {}
        
        # CID hash for duplicate detection
        if context.upload_result:
            import hashlib
            cid_hash = hashlib.sha256(
                context.upload_result.root_cid.encode()
            ).hexdigest()
            attributes["cid_hash"] = cid_hash
            attributes["root_cid"] = context.upload_result.root_cid
        
        # pHash for content matching
        if context.video_metadata and context.video_metadata.phash:
            attributes["phash"] = context.video_metadata.phash
        
        # Source for provenance
        if context.video_metadata and context.video_metadata.source_uri:
            attributes["source_uri"] = context.video_metadata.source_uri
        
        return attributes
    
    async def _get_arkiv_client(self, config: Dict[str, Any]) -> Any:
        """Get or initialize the Arkiv client.
        
        TODO: Implement actual Arkiv client initialization.
        """
        # Placeholder - return None until implemented
        return None
    
    async def _find_existing_entity(
        self,
        client: Any,
        cid_hash: str,
    ) -> Optional[Dict[str, Any]]:
        """Find existing entity by CID hash.
        
        TODO: Implement actual Arkiv query.
        """
        # Placeholder - always return None (create new)
        return None
    
    async def _create_entity(
        self,
        client: Any,
        payload: Dict[str, Any],
        attributes: Dict[str, str],
    ) -> Dict[str, Any]:
        """Create a new entity on Arkiv.
        
        TODO: Implement actual entity creation.
        """
        import hashlib
        import json
        
        # Generate placeholder entity key
        payload_hash = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode()
        ).hexdigest()
        
        return {
            "entity_key": f"entity_{payload_hash[:16]}",
            "transaction_hash": f"0x{payload_hash}",
        }
    
    async def _update_entity(
        self,
        client: Any,
        entity_key: str,
        payload: Dict[str, Any],
        attributes: Dict[str, str],
    ) -> Dict[str, Any]:
        """Update an existing entity on Arkiv.
        
        TODO: Implement actual entity update.
        """
        import hashlib
        import json
        
        payload_hash = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode()
        ).hexdigest()
        
        return {
            "entity_key": entity_key,
            "transaction_hash": f"0x{payload_hash}",
        }
    
    def _categorize_error(self, error: Exception) -> ErrorCategory:
        """Categorize error for retry decisions."""
        error_str = str(error).lower()
        
        # Transient errors
        if any(p in error_str for p in ["timeout", "connection", "network"]):
            return ErrorCategory.TRANSIENT
        
        # Permanent errors
        if any(p in error_str for p in ["invalid", "unauthorized"]):
            return ErrorCategory.PERMANENT
        
        return ErrorCategory.UNKNOWN
    
    async def _update_database(
        self,
        video_path: str,
        entity_key: str,
    ) -> None:
        """Update database with entity key.
        
        TODO: Implement database update.
        """
        # Placeholder - no-op until database is implemented
        pass
    
    async def on_skip(self, context: PipelineContext, reason: str) -> None:
        """Handle step skip."""
        # Could add logging here
        pass
