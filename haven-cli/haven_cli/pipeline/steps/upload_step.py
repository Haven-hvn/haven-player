"""Upload step - Filecoin upload via Synapse SDK.

This step uploads video content to the Filecoin network using
the Synapse SDK. It:
1. Creates a CAR file from the video
2. Uploads to Filecoin via Synapse
3. Records the CID and transaction details

The step uses the JS Runtime Bridge to communicate with the
Synapse SDK running in a Deno subprocess.
"""

from typing import Any, Dict, Optional

from haven_cli.pipeline.context import PipelineContext, UploadResult
from haven_cli.pipeline.events import EventType
from haven_cli.pipeline.results import ErrorCategory, StepError, StepResult
from haven_cli.pipeline.step import PipelineStep


class UploadStep(PipelineStep):
    """Pipeline step for Filecoin upload.
    
    This step uploads video content to the Filecoin network using
    the Synapse SDK. It handles CAR file creation, upload, and
    transaction confirmation.
    
    The upload is performed via the JS Runtime Bridge, which
    communicates with the Synapse SDK running in a Deno subprocess.
    
    Emits:
        - UPLOAD_REQUESTED event when starting
        - UPLOAD_PROGRESS events during upload
        - UPLOAD_COMPLETE event on success
        - UPLOAD_FAILED event on failure
    
    Output data:
        - root_cid: Content ID of the uploaded file
        - piece_cid: Piece CID for Filecoin deals
        - transaction_hash: Blockchain transaction hash
    """
    
    @property
    def name(self) -> str:
        """Step identifier."""
        return "upload"
    
    @property
    def max_retries(self) -> int:
        """Upload can retry on transient network errors."""
        return 3
    
    @property
    def retry_delay_seconds(self) -> float:
        """Longer delay for upload retries."""
        return 5.0
    
    async def process(self, context: PipelineContext) -> StepResult:
        """Process Filecoin upload.
        
        Args:
            context: Pipeline context with video path
            
        Returns:
            StepResult with upload details
        """
        video_path = context.video_path
        
        # Emit upload requested event
        await self._emit_event(EventType.UPLOAD_REQUESTED, context, {
            "video_path": video_path,
            "encrypted": context.encryption_metadata is not None,
        })
        
        try:
            # Get Filecoin configuration
            filecoin_config = self._get_filecoin_config(context)
            
            # Get JS Runtime Bridge
            bridge = await self._get_js_bridge()
            
            # Create progress callback
            async def on_progress(stage: str, percent: int) -> None:
                await self._emit_event(EventType.UPLOAD_PROGRESS, context, {
                    "video_path": video_path,
                    "stage": stage,
                    "progress_percent": percent,
                })
            
            # Upload to Filecoin
            # TODO: Implement actual upload via JS bridge
            upload_result = await self._upload_to_filecoin(
                bridge,
                video_path,
                filecoin_config,
                context.encryption_metadata,
                on_progress,
            )
            
            # Create upload result
            result = UploadResult(
                video_path=video_path,
                root_cid=upload_result.get("root_cid", ""),
                piece_cid=upload_result.get("piece_cid", ""),
                transaction_hash=upload_result.get("transaction_hash", ""),
                encryption_metadata=context.encryption_metadata,
            )
            
            # Store in context
            context.upload_result = result
            
            # Update database
            # TODO: Implement database update
            await self._update_database(video_path, result)
            
            # Emit upload complete event
            await self._emit_event(EventType.UPLOAD_COMPLETE, context, {
                "video_path": video_path,
                "root_cid": result.root_cid,
                "piece_cid": result.piece_cid,
                "transaction_hash": result.transaction_hash,
            })
            
            return StepResult.ok(
                self.name,
                root_cid=result.root_cid,
                piece_cid=result.piece_cid,
                transaction_hash=result.transaction_hash,
                cid=result.root_cid,  # Alias for convenience
            )
            
        except Exception as e:
            # Emit upload failed event
            await self._emit_event(EventType.UPLOAD_FAILED, context, {
                "video_path": video_path,
                "error": str(e),
            })
            
            # Determine if error is retryable
            category = self._categorize_error(e)
            
            return StepResult.fail(
                self.name,
                StepError.from_exception(e, code="UPLOAD_ERROR", category=category),
            )
    
    def _get_filecoin_config(self, context: PipelineContext) -> Dict[str, Any]:
        """Get Filecoin configuration from context or config.
        
        TODO: Implement actual config loading.
        """
        return {
            "rpc_url": self._config.get("filecoin_rpc_url", ""),
            "private_key": self._config.get("filecoin_private_key", ""),
            "data_set_id": context.dataset_id or self._config.get("data_set_id", 1),
        }
    
    async def _get_js_bridge(self) -> Any:
        """Get the JS Runtime Bridge for Synapse SDK communication.
        
        TODO: Implement actual bridge initialization.
        """
        from haven_cli.js_runtime.bridge import JSRuntimeBridge
        
        return JSRuntimeBridge()
    
    async def _upload_to_filecoin(
        self,
        bridge: Any,
        video_path: str,
        config: Dict[str, Any],
        encryption_metadata: Optional[Any],
        on_progress: Any,
    ) -> Dict[str, Any]:
        """Upload content to Filecoin via Synapse SDK.
        
        TODO: Implement actual Filecoin upload.
        
        The process:
        1. Create CAR file from video
        2. Upload CAR to Filecoin via Synapse
        3. Wait for transaction confirmation
        4. Return CIDs and transaction hash
        
        Args:
            bridge: JS Runtime Bridge instance
            video_path: Path to video file
            config: Filecoin configuration
            encryption_metadata: Encryption metadata if encrypted
            on_progress: Progress callback
            
        Returns:
            Dictionary with upload result
        """
        # Placeholder implementation
        # Real implementation would call bridge.call("synapse", "upload", {...})
        
        import hashlib
        
        # Generate placeholder CID
        with open(video_path, "rb") as f:
            content_hash = hashlib.sha256(f.read()).hexdigest()
        
        # Simulate progress
        await on_progress("preparing", 10)
        await on_progress("uploading", 50)
        await on_progress("confirming", 90)
        await on_progress("complete", 100)
        
        return {
            "root_cid": f"bafybeig{content_hash[:32]}",
            "piece_cid": f"baga{content_hash[:32]}",
            "transaction_hash": f"0x{content_hash[:64]}",
        }
    
    def _categorize_error(self, error: Exception) -> ErrorCategory:
        """Categorize error for retry decisions.
        
        Network errors are transient and can be retried.
        Configuration errors are permanent.
        """
        error_str = str(error).lower()
        
        # Transient errors (retry)
        transient_patterns = [
            "timeout",
            "connection",
            "network",
            "rate limit",
            "503",
            "502",
            "504",
        ]
        
        for pattern in transient_patterns:
            if pattern in error_str:
                return ErrorCategory.TRANSIENT
        
        # Permanent errors (no retry)
        permanent_patterns = [
            "invalid",
            "not found",
            "unauthorized",
            "forbidden",
            "400",
            "401",
            "403",
            "404",
        ]
        
        for pattern in permanent_patterns:
            if pattern in error_str:
                return ErrorCategory.PERMANENT
        
        return ErrorCategory.UNKNOWN
    
    async def _update_database(
        self,
        video_path: str,
        result: UploadResult,
    ) -> None:
        """Update database with upload result.
        
        TODO: Implement database update.
        """
        # Placeholder - no-op until database is implemented
        pass
