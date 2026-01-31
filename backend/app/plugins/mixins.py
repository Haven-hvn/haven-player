"""
Plugin mixins for standardized operations.

This module provides mixin classes that plugins can inherit from
to support domain-specific operations beyond the core interface.

Mixins allow plugins to advertise their capabilities without
requiring custom API endpoints for each plugin.
"""

import asyncio
import logging
import subprocess
from typing import Dict, Any, List, Optional, Callable, Tuple
from abc import ABC, abstractmethod

from app.plugins.plugin_interface import MediaSource, ArchiveResult

logger = logging.getLogger(__name__)


class RetryableMixin:
    """
    Mixin for plugins that need retry logic for operations.
    
    This mixin provides standardized retry functionality for operations
    that may fail transiently, such as downloading videos or fetching data.
    
    Examples:
    - YouTubePlugin: Retry video downloads with fallback formats
    - BitTorrentPlugin: Retry peer connections
    - HTTPPlugin: Retry failed HTTP requests
    """
    
    async def execute_with_retry(
        self,
        primary_cmd: List[str],
        fallback_cmd: Optional[List[str]] = None,
        timeout: int = 3600,
        retryable_errors: Optional[List[str]] = None
    ) -> Tuple[bool, str, str]:
        """
        Execute a command with optional fallback retry.
        
        Args:
            primary_cmd: Primary command to execute
            fallback_cmd: Optional fallback command if primary fails
            timeout: Timeout in seconds for each attempt
            retryable_errors: List of error substrings that indicate a retry should be attempted
            
        Returns:
            Tuple of (success: bool, stdout: str, stderr: str)
        """
        retryable_errors = retryable_errors or [
            "JavaScript runtime",
            "Requested format is not available",
            "Sign in to confirm your age"
        ]
        
        try:
            # Try primary command
            logger.info(f"Executing primary command: {' '.join(primary_cmd)}")
            result = subprocess.run(
                primary_cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode == 0:
                return True, result.stdout, result.stderr
            
            # Check if error is retryable and fallback is available
            stderr_output = result.stderr
            is_retryable = any(err in stderr_output for err in retryable_errors)
            
            if is_retryable and fallback_cmd:
                logger.warning(f"Primary command failed with retryable error, attempting fallback")
                fallback_result = subprocess.run(
                    fallback_cmd,
                    capture_output=True,
                    text=True,
                    timeout=timeout
                )
                
                if fallback_result.returncode == 0:
                    logger.info("Fallback command succeeded")
                    return True, fallback_result.stdout, fallback_result.stderr
                else:
                    # Both failed
                    combined_error = stderr_output + "\n\nFallback also failed:\n" + fallback_result.stderr
                    return False, fallback_result.stdout, combined_error
            
            # Not retryable or no fallback
            return False, result.stdout, stderr_output
            
        except subprocess.TimeoutExpired:
            error_msg = f"Command timed out after {timeout} seconds"
            logger.error(error_msg)
            return False, "", error_msg
        except Exception as e:
            error_msg = f"Error executing command: {e}"
            logger.error(error_msg)
            return False, "", error_msg


class CollectionPluginMixin(ABC):
    """
    Mixin for plugins that work with collections of sources.
    
    Examples:
    - YouTubePlugin: Channels (collections of videos)
    - BitTorrentPlugin: Trackers (collections of torrents)
    - IPTVPlugin: Playlists (collections of streams)
    
    Plugins that inherit from this mixin support:
    - Subscribing/unsubscribing to collections
    - Listing subscriptions
    - Discovering sources from specific subscriptions
    - Archiving all sources from a subscription
    """
    
    @abstractmethod
    async def subscribe(
        self,
        collection_uri: str,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Subscribe to a collection (channel, tracker, playlist).
        
        Args:
            collection_uri: URI of the collection to subscribe to
            config: Optional configuration (quality, format, etc.)
            
        Returns:
            Dict with subscription info
            {
                "success": bool,
                "collection_id": str,
                "collection_name": str,
                "config": dict,
                "created_at": str
            }
        """
        pass
    
    @abstractmethod
    async def unsubscribe(self, collection_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from a collection.
        
        Args:
            collection_id: ID of the collection to unsubscribe from
            
        Returns:
            Dict with result
            {
                "success": bool,
                "message": str,
                "error": str (optional)
            }
        """
        pass
    
    @abstractmethod
    async def list_subscriptions(self) -> List[Dict[str, Any]]:
        """
        List all subscriptions.
        
        Returns:
            List of subscription dicts
            [
                {
                    "collection_id": str,
                    "collection_name": str,
                    "collection_uri": str,
                    "enabled": bool,
                    "created_at": str,
                    "last_polled_at": str (optional),
                    "source_count": int (optional)
                },
                ...
            ]
        """
        pass
    
    @abstractmethod
    async def get_subscription(self, collection_id: str) -> Dict[str, Any]:
        """
        Get subscription details.
        
        Args:
            collection_id: ID of the subscription
            
        Returns:
            Subscription dict with full details
        """
        pass
    
    @abstractmethod
    async def discover_from_subscription(
        self,
        collection_id: str
    ) -> List[MediaSource]:
        """
        Discover sources from a specific subscription.
        
        This is a targeted version of discover_sources() that only
        polls one collection instead of all subscriptions.
        
        Args:
            collection_id: ID of the subscription to poll
            
        Returns:
            List of MediaSource objects
        """
        pass
    
    @abstractmethod
    async def archive_from_subscription(
        self,
        collection_id: str
    ) -> List[ArchiveResult]:
        """
        Archive all sources from a subscription.
        
        This is a batch operation that discovers and archives all
        sources from a specific collection.
        
        Args:
            collection_id: ID of the subscription
            
        Returns:
            List of ArchiveResult objects
        """
        pass


class SourcePluginMixin(ABC):
    """
    Mixin for plugins that work with individual sources.
    
    Examples:
    - PumpFunPlugin: Individual live streams
    - HTTPPlugin: Individual downloadable files
    
    Plugins that inherit from this mixin support:
    - Listing all known sources
    - Getting status of specific sources
    - Managing source metadata
    """
    
    @abstractmethod
    async def list_sources(self) -> List[Dict[str, Any]]:
        """
        List all known sources (both discovered and archived).
        
        Returns:
            List of source dicts
            [
                {
                    "source_id": str,
                    "media_type": str,
                    "uri": str,
                    "status": str,  # "discovered", "archived", "failed"
                    "metadata": dict,
                    "archived_at": str (optional),
                    "output_path": str (optional)
                },
                ...
            ]
        """
        pass
    
    @abstractmethod
    async def get_source_status(self, source_id: str) -> Dict[str, Any]:
        """
        Get status of a specific source.
        
        Args:
            source_id: ID of the source
            
        Returns:
            Source status dict
            {
                "source_id": str,
                "media_type": str,
                "uri": str,
                "status": str,
                "progress": float (optional),  # 0.0 to 1.0
                "error": str (optional),
                "metadata": dict,
                "archived_at": str (optional),
                "output_path": str (optional),
                "file_size_bytes": int (optional),
                "duration_seconds": int (optional)
            }
        """
        pass


class ConfigurablePluginMixin(ABC):
    """
    Mixin for plugins that support runtime configuration.
    
    Examples:
    - All plugins can inherit this for configuration management
    
    Plugins that inherit from this mixin support:
    - Getting current configuration
    - Updating configuration
    - Resetting to defaults
    """
    
    @abstractmethod
    def get_config(self) -> Dict[str, Any]:
        """
        Get current plugin configuration.
        
        Returns:
            Current configuration dict
        """
        pass
    
    @abstractmethod
    async def update_config(self, config: Dict[str, Any]) -> bool:
        """
        Update plugin configuration.
        
        Args:
            config: New configuration (partial update allowed)
            
        Returns:
            True if update successful
        """
        pass
    
    @abstractmethod
    def get_default_config(self) -> Dict[str, Any]:
        """
        Get default configuration.
        
        Returns:
            Default configuration dict
        """
        pass


class ObservablePluginMixin(ABC):
    """
    Mixin for plugins that support real-time notifications.
    
    Examples:
    - PumpFunPlugin: Notify when stream goes live
    - YouTubePlugin: Notify when new video discovered
    
    Plugins that inherit from this mixin support:
    - Event callbacks
    - WebSocket subscriptions
    - Real-time status updates
    """
    
    def add_event_callback(self, event_type: str, callback: callable):
        """
        Register a callback for a specific event type.
        
        Args:
            event_type: Type of event (e.g., "source_discovered", "archive_complete")
            callback: Callable function(event_data)
        """
        # Default implementation: no-op
        pass
    
    def remove_event_callback(self, event_type: str, callback: callable):
        """
        Remove a previously registered callback.
        
        Args:
            event_type: Type of event
            callback: Callable function to remove
        """
        # Default implementation: no-op
        pass
    
    async def get_event_stream(self):
        """
        Get async generator for real-time events.
        
        Returns:
            Async generator yielding event dicts
        """
        # Default implementation: empty generator
        return
        yield  # Make this a generator


class RetryableMixin:
    """
    Mixin for plugins that need retry logic for operations that may fail transiently.
    
    Examples:
    - YouTubePlugin: Retry video downloads with different formats
    - HTTPPlugin: Retry failed downloads with exponential backoff
    - BitTorrentPlugin: Retry tracker connections
    
    Plugins that inherit from this mixin support:
    - Configurable retry attempts
    - Multiple fallback strategies
    - Error classification (retryable vs non-retryable)
    - Exponential backoff between retries
    """
    
    def __init__(self):
        self.max_retries: int = 3
        self.retry_delay_seconds: float = 1.0
        self.retryable_error_patterns: List[str] = []
        self.non_retryable_error_patterns: List[str] = []
    
    def configure_retry(
        self,
        max_retries: int = 3,
        retry_delay_seconds: float = 1.0,
        retryable_patterns: Optional[List[str]] = None,
        non_retryable_patterns: Optional[List[str]] = None
    ) -> None:
        """
        Configure retry behavior.
        
        Args:
            max_retries: Maximum number of retry attempts
            retry_delay_seconds: Delay between retries (uses exponential backoff)
            retryable_patterns: List of error message patterns that should trigger a retry
            non_retryable_patterns: List of error message patterns that should NOT trigger a retry
        """
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds
        if retryable_patterns:
            self.retryable_error_patterns = retryable_patterns
        if non_retryable_patterns:
            self.non_retryable_error_patterns = non_retryable_patterns
    
    def is_retryable_error(self, error_message: str) -> bool:
        """
        Determine if an error is retryable based on configured patterns.
        
        Args:
            error_message: The error message to check
            
        Returns:
            True if the error appears to be retryable, False otherwise
        """
        error_lower = error_message.lower()
        
        # Check non-retryable patterns first (they take precedence)
        for pattern in self.non_retryable_error_patterns:
            if pattern.lower() in error_lower:
                return False
        
        # Check retryable patterns
        for pattern in self.retryable_error_patterns:
            if pattern.lower() in error_lower:
                return True
        
        # Default: retryable if no patterns match
        return True
    
    async def execute_with_retry(
        self,
        operation: Callable[[], Tuple[List[str], Optional[Dict[str, Any]]]],
        fallback_strategies: Optional[List[Callable[[], Tuple[List[str], Optional[Dict[str, Any]]]]]] = None,
        operation_name: str = "operation"
    ) -> Dict[str, Any]:
        """
        Execute an operation with retry logic and optional fallback strategies.
        
        This method attempts the primary operation, and if it fails with a retryable error,
        it will retry up to max_retries times. If all retries fail and fallback strategies
        are provided, it will attempt each fallback strategy in order.
        
        Args:
            operation: Primary operation to execute. Should return (command_args, extra_context).
            fallback_strategies: List of fallback operations to try if primary fails.
                                Each fallback should return (command_args, extra_context).
            operation_name: Name of the operation for logging purposes.
            
        Returns:
            Dict with result:
            {
                "success": bool,
                "output_path": str (optional),
                "file_size_bytes": int (optional),
                "error": str (optional),
                "attempts": int,
                "fallback_used": bool,
                "command_executed": List[str]
            }
        """
        fallback_strategies = fallback_strategies or []
        all_errors = []
        attempts = 0
        
        # Try primary operation with retries
        for attempt in range(self.max_retries):
            attempts += 1
            try:
                cmd_args, extra_context = operation()
                cmd_str = ' '.join(cmd_args) if isinstance(cmd_args, list) else str(cmd_args)
                logger.info(f"Executing {operation_name} (attempt {attempt + 1}/{self.max_retries}): {cmd_str}")
                
                result = subprocess.run(
                    cmd_args,
                    capture_output=True,
                    text=True,
                    timeout=3600
                )
                
                if result.returncode == 0:
                    logger.info(f"✓ {operation_name} succeeded on attempt {attempt + 1}")
                    return {
                        "success": True,
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                        "attempts": attempts,
                        "fallback_used": False,
                        "command_executed": cmd_args,
                        "extra_context": extra_context or {}
                    }
                
                # Operation failed, check if we should retry
                stderr = result.stderr or ""
                stdout = result.stdout or ""
                combined_error = f"{stderr}\n{stdout}".strip()
                
                if not self.is_retryable_error(combined_error):
                    logger.error(f"Non-retryable error for {operation_name}: {combined_error[:200]}")
                    return {
                        "success": False,
                        "error": combined_error,
                        "attempts": attempts,
                        "fallback_used": False,
                        "command_executed": cmd_args
                    }
                
                logger.warning(f"Retryable error for {operation_name} (attempt {attempt + 1}): {combined_error[:200]}")
                all_errors.append(f"Attempt {attempt + 1}: {combined_error[:500]}")
                
                # Wait before retry (exponential backoff)
                if attempt < self.max_retries - 1:
                    delay = self.retry_delay_seconds * (2 ** attempt)
                    logger.info(f"Waiting {delay}s before retry...")
                    await asyncio.sleep(delay)
                    
            except subprocess.TimeoutExpired:
                logger.error(f"{operation_name} timed out on attempt {attempt + 1}")
                all_errors.append(f"Attempt {attempt + 1}: Timeout")
                if attempt < self.max_retries - 1:
                    delay = self.retry_delay_seconds * (2 ** attempt)
                    await asyncio.sleep(delay)
            except Exception as e:
                logger.error(f"Exception during {operation_name} (attempt {attempt + 1}): {e}")
                all_errors.append(f"Attempt {attempt + 1}: {str(e)}")
                if not self.is_retryable_error(str(e)):
                    return {
                        "success": False,
                        "error": str(e),
                        "attempts": attempts,
                        "fallback_used": False,
                        "command_executed": cmd_args if 'cmd_args' in locals() else []
                    }
                if attempt < self.max_retries - 1:
                    delay = self.retry_delay_seconds * (2 ** attempt)
                    await asyncio.sleep(delay)
        
        # Primary operation failed after all retries, try fallback strategies
        if fallback_strategies:
            logger.info(f"Primary {operation_name} failed after {attempts} attempts. Trying fallback strategies...")
            
            for fallback_idx, fallback_op in enumerate(fallback_strategies):
                attempts += 1
                try:
                    cmd_args, extra_context = fallback_op()
                    cmd_str = ' '.join(cmd_args) if isinstance(cmd_args, list) else str(cmd_args)
                    logger.info(f"Trying fallback strategy {fallback_idx + 1}: {cmd_str}")
                    
                    result = subprocess.run(
                        cmd_args,
                        capture_output=True,
                        text=True,
                        timeout=3600
                    )
                    
                    if result.returncode == 0:
                        logger.info(f"✓ Fallback strategy {fallback_idx + 1} succeeded!")
                        return {
                            "success": True,
                            "stdout": result.stdout,
                            "stderr": result.stderr,
                            "attempts": attempts,
                            "fallback_used": True,
                            "command_executed": cmd_args,
                            "extra_context": extra_context or {}
                        }
                    
                    stderr = result.stderr or ""
                    stdout = result.stdout or ""
                    combined_error = f"{stderr}\n{stdout}".strip()
                    logger.warning(f"Fallback strategy {fallback_idx + 1} failed: {combined_error[:200]}")
                    all_errors.append(f"Fallback {fallback_idx + 1}: {combined_error[:500]}")
                    
                except Exception as e:
                    logger.error(f"Exception during fallback strategy {fallback_idx + 1}: {e}")
                    all_errors.append(f"Fallback {fallback_idx + 1}: {str(e)}")
        
        # All attempts failed
        combined_error = "\n\n".join(all_errors)
        logger.error(f"All {operation_name} attempts failed after {attempts} tries")
        
        return {
            "success": False,
            "error": combined_error,
            "attempts": attempts,
            "fallback_used": False,
            "command_executed": []
        }
    
    def should_retry_error(self, error_message: str) -> bool:
        """
        Legacy method for backward compatibility.
        
        Returns:
            True if the error should trigger a retry
        """
        return self.is_retryable_error(error_message)