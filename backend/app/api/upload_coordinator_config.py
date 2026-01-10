"""
UploadCoordinator configuration API endpoints.

This module provides REST API endpoints for managing the UploadCoordinator configuration,
allowing the frontend to enable/disable auto-upload and configure per-plugin settings.
"""
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from app.services.upload_coordinator import UploadCoordinator
from app.services.job_scheduler import JobScheduler

logger = logging.getLogger(__name__)
router = APIRouter()

# Global upload coordinator reference (will be set in main.py)
upload_coordinator: Optional[UploadCoordinator] = None


class UploadCoordinatorConfigResponse(BaseModel):
    """Response model for upload coordinator configuration."""
    enabled: bool
    plugin_overrides: Dict[str, bool]
    priority: int


class UploadCoordinatorConfigUpdate(BaseModel):
    """Request to update upload coordinator configuration."""
    enabled: Optional[bool] = None
    plugin_overrides: Optional[Dict[str, bool]] = None
    priority: Optional[int] = None


def get_upload_coordinator() -> UploadCoordinator:
    """Dependency to get upload coordinator instance."""
    global upload_coordinator
    if upload_coordinator is None:
        raise HTTPException(status_code=500, detail="UploadCoordinator not initialized")
    return upload_coordinator


@router.get("/upload-coordinator/config", response_model=UploadCoordinatorConfigResponse)
async def get_upload_coordinator_config(
    coordinator: UploadCoordinator = Depends(get_upload_coordinator)
):
    """
    Get current upload coordinator configuration.

    Returns:
        Upload coordinator configuration
    """
    try:
        config = coordinator.get_config()
        logger.info(f"UploadCoordinator config requested: enabled={config.get('enabled')}, plugins={config.get('plugin_overrides', {})}")
        return {
            'enabled': config.get('enabled', False),
            'plugin_overrides': config.get('plugin_overrides', {}),
            'priority': config.get('priority', 0),
        }
    except Exception as e:
        logger.error(f"Error getting upload coordinator config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/upload-coordinator/config", response_model=UploadCoordinatorConfigResponse)
async def update_upload_coordinator_config(
    config_update: UploadCoordinatorConfigUpdate,
    coordinator: UploadCoordinator = Depends(get_upload_coordinator)
):
    """
    Update upload coordinator configuration.

    This allows the frontend to enable/disable auto-upload and configure
    per-plugin settings.

    Args:
        config_update: Configuration updates

    Returns:
        Updated configuration

    Raises:
        HTTPException: If update fails
    """
    try:
        # Convert Pydantic model to dict
        update_dict = config_update.model_dump(exclude_none=True)

        # Update configuration
        coordinator.update_config(update_dict)

        logger.info(f"Updated upload coordinator config: {update_dict}")

        # Return updated config
        config = coordinator.get_config()
        return {
            'enabled': config.get('enabled', False),
            'plugin_overrides': config.get('plugin_overrides', {}),
            'priority': config.get('priority', 0),
        }
    except Exception as e:
        logger.error(f"Error updating upload coordinator config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
