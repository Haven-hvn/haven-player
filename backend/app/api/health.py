"""
Health API endpoint for system status monitoring.

Provides comprehensive system health information including:
- Backend connection status
- Wallet connection status
- Encryption/Filecoin configuration status
- DePin statistics (points, streak, level, tier)
- Plugin status
"""

import os
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter

from app.models.config import AppConfig
from app.models.database import SessionLocal
from app.models.plugin import Plugin as PluginModel

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/health")
async def get_health() -> Dict[str, Any]:
    """
    Get comprehensive system health status.
    
    Returns information about:
    - Backend connectivity
    - Wallet connection
    - Encryption/Filecoin configuration
    - DePin statistics
    - Plugin status
    """
    # Backend is connected if we're responding
    backend_connected = True
    
    # Check wallet connection (from Filecoin config in environment)
    wallet_connected = check_wallet_connection()
    wallet_address = get_wallet_address() if wallet_connected else None
    
    # Check encryption (from Filecoin config)
    filecoin_configured = is_filecoin_configured()
    encryption_enabled = False
    
    if filecoin_configured:
        # Check if encryption is enabled in Filecoin config
        # This is determined by whether Lit Protocol keys are configured
        encryption_enabled = is_encryption_enabled()
    
    # Get DePin stats (placeholder - would come from database)
    depin_stats = get_depin_stats()
    points = depin_stats.get("points", 0)
    streak = depin_stats.get("daily_streak", 0)
    level = points // 1000 + 1
    tier = calculate_tier(points)
    node_active = depin_stats.get("is_active", False)
    
    # Get plugin status
    plugins = get_plugin_status()
    
    return {
        "backend_connected": backend_connected,
        "wallet_connected": wallet_connected,
        "wallet_address": wallet_address,
        "encryption_enabled": encryption_enabled,
        "points": points,
        "streak": streak,
        "level": level,
        "tier": tier,
        "node_active": node_active,
        "filecoin_configured": filecoin_configured,
        "plugins": plugins
    }


def check_wallet_connection() -> bool:
    """
    Check if wallet is connected.
    
    Wallet is considered connected if Filecoin private key is configured.
    """
    # Check for Filecoin private key in environment
    private_key = os.environ.get("FILECOIN_PRIVATE_KEY")
    return bool(private_key)


def get_wallet_address() -> Optional[str]:
    """
    Get connected wallet address.
    
    Returns the wallet address if configured, None otherwise.
    """
    # In a real implementation, this would derive the address from the private key
    # For now, return a placeholder if wallet is connected
    if check_wallet_connection():
        # Would derive address from private key
        return None  # Placeholder - would return actual address
    return None


def is_filecoin_configured() -> bool:
    """
    Check if Filecoin is configured.
    
    Filecoin is configured if the required environment variables are set.
    """
    # Check for required Filecoin environment variables
    private_key = os.environ.get("FILECOIN_PRIVATE_KEY")
    gateway_url = os.environ.get("FILECOIN_GATEWAY_URL")
    
    return bool(private_key and gateway_url)


def is_encryption_enabled() -> bool:
    """
    Check if encryption is enabled.
    
    Encryption is enabled if Lit Protocol configuration is present.
    """
    # Check for Lit Protocol environment variables
    lit_network = os.environ.get("LIT_NETWORK")
    lit_api_key = os.environ.get("LIT_API_KEY")
    
    # Encryption is enabled if Lit Protocol is configured
    return bool(lit_network and lit_api_key)


def get_depin_stats() -> Dict[str, Any]:
    """
    Get DePin statistics.
    
    Returns points, streak, and activity status.
    In a real implementation, this would query the database.
    """
    # Placeholder - would query database for actual stats
    return {
        "points": 0,
        "daily_streak": 0,
        "is_active": False
    }


def calculate_tier(points: int) -> str:
    """
    Calculate tier based on points.
    
    Tier system:
    - 0-999: Observer
    - 1000-2499: Archivist
    - 2500-4999: Signal Keeper
    - 5000-9999: Chronicle Guardian
    - 10000+: Mythic Librarian
    """
    if points >= 10000:
        return "Mythic Librarian"
    elif points >= 5000:
        return "Chronicle Guardian"
    elif points >= 2500:
        return "Signal Keeper"
    elif points >= 1000:
        return "Archivist"
    else:
        return "Observer"


def get_plugin_status() -> List[Dict[str, Any]]:
    """
    Get plugin status.
    
    Returns list of plugins with their load and health status.
    """
    db = SessionLocal()
    try:
        plugins = db.query(PluginModel).all()
        
        plugin_status = []
        for plugin in plugins:
            plugin_status.append({
                "name": plugin.name,
                "loaded": plugin.enabled,
                "healthy": plugin.enabled  # Simplified - would check actual health
            })
        
        return plugin_status
    except Exception as e:
        logger.error(f"Error getting plugin status: {e}")
        return []
    finally:
        db.close()