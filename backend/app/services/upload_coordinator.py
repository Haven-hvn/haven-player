"""
UploadCoordinator service for managing automatic FileCoin uploads.

This service coordinates the automatic upload pipeline, managing the upload queue,
checking configuration, and providing methods for plugin integration.
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.upload_queue import UploadQueue
from app.models.video import Video
from app.models.config import AppConfig
from app.models.database import SessionLocal

logger = logging.getLogger(__name__)


class UploadCoordinator:
    """
    Coordinates automatic FileCoin uploads for downloaded videos.

    This service:
    - Queues videos for upload after plugin downloads complete
    - Checks upload configuration (enabled/disabled, per-plugin settings)
    - Manages upload queue state via API
    - Provides download completion callbacks for JobScheduler integration
    """

    # Default configuration
    DEFAULT_CONFIG = {
        'enabled': None,  # None = auto-detect based on FileCoin config
        'plugin_overrides': {
            'YouTubePlugin': True,  # YouTube plugin enabled by default
            'BitTorrentPlugin': True,
            'PumpFunPlugin': True,  # ADD THIS
        },
        'priority': 0,  # Default priority for auto-uploads
    }

    def __init__(self):
        """
        Initialize UploadCoordinator (loads config from database).
        """
        self.config = self.load_config()
        logger.info(f"UploadCoordinator initialized (enabled={self.config['enabled']})")

    def load_config(self) -> Dict[str, Any]:
        """
        Load upload coordinator configuration from database.

        Returns:
            Configuration dictionary
        """
        db = SessionLocal()
        try:
            # Get app config
            config = db.query(AppConfig).first()

            if not config:
                # No config exists yet, create default
                logger.info("No app config found, creating default")
                return self.DEFAULT_CONFIG.copy()

            # Start with default config as base
            merged_config = self.DEFAULT_CONFIG.copy()

            # Override with database values
            db_config = {}
            if config.upload_coordinator_enabled is not None:
                db_config['enabled'] = config.upload_coordinator_enabled
            if config.upload_coordinator_plugin_overrides:
                db_config['plugin_overrides'] = config.upload_coordinator_plugin_overrides
            if config.upload_coordinator_priority is not None:
                db_config['priority'] = config.upload_coordinator_priority

            # Merge database config into defaults (only override what's explicitly set)
            merged_config.update(db_config)

            # Auto-detect if enabled is None
            if merged_config['enabled'] is None:
                if self.is_filecoin_configured():
                    merged_config['enabled'] = True
                    logger.info("FileCoin is configured, auto-enabled upload coordinator")
                else:
                    merged_config['enabled'] = False
                    logger.info("FileCoin not configured, upload coordinator remains disabled")

                # Save the auto-detected value to database (only update enabled field)
                self.save_config({'enabled': merged_config['enabled']})

            logger.info(f"Loaded UploadCoordinator config from database")
            logger.info(f"Plugin overrides: {merged_config['plugin_overrides']}")
            return merged_config

        finally:
            db.close()

    def save_config(self, config: Dict[str, Any]) -> None:
        """
        Save upload coordinator configuration to database.

        Args:
            config: Configuration dictionary to save
        """
        db = SessionLocal()
        try:
            # Get or create app config
            app_config = db.query(AppConfig).first()
            if not app_config:
                app_config = AppConfig()
                db.add(app_config)

            # Update config values only if provided (preserve existing values)
            if 'enabled' in config:
                app_config.upload_coordinator_enabled = config.get('enabled')
            if 'plugin_overrides' in config:
                app_config.upload_coordinator_plugin_overrides = config.get('plugin_overrides')
            if 'priority' in config:
                app_config.upload_coordinator_priority = config.get('priority', 0)
            app_config.updated_at = datetime.now(timezone.utc)

            db.commit()
            logger.debug("Saved UploadCoordinator config to database")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save config to database: {e}")
            raise
        finally:
            db.close()

    def is_auto_upload_enabled(self, plugin_name: str) -> bool:
        """
        Check if auto-upload is enabled for a specific plugin.

        Args:
            plugin_name: Name of the plugin

        Returns:
            True if auto-upload is enabled for this plugin
        """
        # Check global enabled flag
        if not self.config['enabled']:
            logger.info(f"Auto-upload check for {plugin_name}: DISABLED (global enabled={self.config['enabled']})")
            return False

        # Check per-plugin override
        plugin_enabled = self.config['plugin_overrides'].get(plugin_name, False)

        logger.info(f"Auto-upload check for {plugin_name}: enabled={plugin_enabled} (global enabled={self.config['enabled']})")
        return plugin_enabled

    def get_plugin_priority(self, plugin_name: str) -> int:
        """
        Get upload priority for a specific plugin.

        Args:
            plugin_name: Name of the plugin

        Returns:
            Priority value (higher = higher priority)
        """
        return self.config.get('priority', 0)

    def is_filecoin_configured(self) -> bool:
        """
        Check if FileCoin is configured in the environment.

        This checks for:
        - FILECOIN_PRIVATE_KEY environment variable
        - FILECOIN_RPC_URL environment variable

        Returns:
            True if FileCoin is configured
        """
        import os

        has_private_key = bool(os.getenv('FILECOIN_PRIVATE_KEY'))
        has_rpc_url = bool(os.getenv('FILECOIN_RPC_URL'))

        is_configured = has_private_key and has_rpc_url

        if not is_configured:
            logger.warning(
                f"FileCoin not configured: "
                f"private_key={'set' if has_private_key else 'missing'}, "
                f"rpc_url={'set' if has_rpc_url else 'missing'}"
            )

        return is_configured

    async def enqueue_video_after_download(self, video_path: str, plugin_name: str) -> bool:
        """
        Enqueue a video for automatic upload after plugin download.

        This method is called by JobScheduler after a plugin successfully
        downloads a video. It checks configuration and adds the video to
        the upload queue if auto-upload is enabled.

        Args:
            video_path: Path to the downloaded video file
            plugin_name: Name of the plugin that downloaded the video

        Returns:
            True if video was enqueued, False otherwise
        """
        try:
            # Check if auto-upload is enabled for this plugin
            if not self.is_auto_upload_enabled(plugin_name):
                logger.info(f"Auto-upload disabled for plugin: {plugin_name}")
                return False

            # Check if FileCoin is configured
            if not self.is_filecoin_configured():
                logger.warning(
                    f"Cannot enqueue {video_path} for upload: FileCoin not configured. "
                    "Please configure FileCoin settings in the UI."
                )
                return False

            # Check if video exists in database
            db = SessionLocal()
            try:
                video = db.query(Video).filter(Video.path == video_path).first()
                if not video:
                    logger.warning(f"Video not found in database: {video_path}")
                    return False

                # Check if already uploaded
                if video.filecoin_root_cid:
                    logger.info(f"Video already uploaded to FileCoin: {video_path}")
                    return False

            finally:
                db.close()

            # Add to upload queue via API
            queue_data = {
                'video_path': video_path,
                'priority': self.get_plugin_priority(plugin_name),
                'source': 'plugin',
            }

            # Make internal API call to add to queue
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'http://localhost:8000/api/upload-queue',
                    json=queue_data,
                    headers={'Content-Type': 'application/json'}
                ) as response:
                    if response.status == 201:
                        logger.info(
                            f"✅ Enqueued video for auto-upload: {video_path} "
                            f"(plugin={plugin_name}, priority={queue_data['priority']})"
                        )
                        return True
                    elif response.status == 409:
                        # Already in queue
                        logger.info(f"Video already in upload queue: {video_path}")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to enqueue video: {response.status} - {error_text}")
                        return False

        except Exception as e:
            logger.error(f"Error enqueueing video {video_path}: {e}")
            return False

    async def enqueue_manual_upload(self, video_path: str, priority: int = 0) -> bool:
        """
        Enqueue a video for upload via manual user request.

        Args:
            video_path: Path to the video file
            priority: Upload priority (higher = higher priority)

        Returns:
            True if enqueued successfully, False otherwise
        """
        try:
            db = SessionLocal()
            try:
                video = db.query(Video).filter(Video.path == video_path).first()
                if not video:
                    logger.warning(f"Video not found in database: {video_path}")
                    return False

                # Check if already uploaded
                if video.filecoin_root_cid:
                    logger.info(f"Video already uploaded to FileCoin: {video_path}")
                    return False

            finally:
                db.close()

            # Add to upload queue
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'http://localhost:8000/api/upload-queue',
                    json={
                        'video_path': video_path,
                        'priority': priority,
                        'source': 'manual',
                    },
                    headers={'Content-Type': 'application/json'}
                ) as response:
                    if response.status in [201, 409]:
                        logger.info(f"✅ Manually enqueued video: {video_path}")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to enqueue manual upload: {response.status} - {error_text}")
                        return False

        except Exception as e:
            logger.error(f"Error enqueuing manual upload: {e}")
            return False

    def get_config(self) -> Dict[str, Any]:
        """
        Get current upload coordinator configuration.

        Returns:
            Configuration dictionary
        """
        return self.config.copy()

    def update_config(self, new_config: Dict[str, Any]) -> None:
        """
        Update upload coordinator configuration.

        Args:
            new_config: New configuration values (partial update supported)
        """
        # Update config with new values
        for key, value in new_config.items():
            if key in self.config:
                self.config[key] = value
            elif key == 'plugin_overrides' and isinstance(value, dict):
                # Update plugin overrides
                for plugin, enabled in value.items():
                    self.config['plugin_overrides'][plugin] = enabled

        logger.info(f"UploadCoordinator config updated: {self.config}")
        # Save to file
        self.save_config(self.config)
