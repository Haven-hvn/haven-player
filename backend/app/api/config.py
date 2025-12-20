import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, field_validator

from app.models.database import get_db
from app.models.config import AppConfig
from app.services.evm_utils import validate_evm_config, InsufficientGasError

router = APIRouter()

DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/"
GATEWAY_CONFIG_FILENAME = "ipfs-gateway.json"
GATEWAY_CONFIG_DIR = Path(
    os.environ.get("HAVEN_PLAYER_CONFIG_DIR", Path.home() / ".haven-player")
)


def normalize_gateway_url(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Gateway URL cannot be empty")

    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Gateway URL must start with http:// or https://")

    path = parsed.path
    if "ipfs" not in path:
        path = f"{path.rstrip('/')}/ipfs/"
    elif not path.endswith("/"):
        path = f"{path.rstrip('/')}/"

    normalized = parsed._replace(path=path).geturl()
    return normalized


class GatewayConfig(BaseModel):
    base_url: str

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        return normalize_gateway_url(v)


def gateway_config_path() -> Path:
    GATEWAY_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    return GATEWAY_CONFIG_DIR / GATEWAY_CONFIG_FILENAME


def load_gateway_config() -> GatewayConfig:
    path = gateway_config_path()
    if path.exists():
        try:
            data = json.loads(path.read_text())
            base_url = data.get("base_url", DEFAULT_IPFS_GATEWAY)
            return GatewayConfig(base_url=base_url)
        except Exception:
            # Fall back to default if file is malformed
            return GatewayConfig(base_url=DEFAULT_IPFS_GATEWAY)
    return GatewayConfig(base_url=DEFAULT_IPFS_GATEWAY)


def save_gateway_config(config: GatewayConfig) -> GatewayConfig:
    path = gateway_config_path()
    path.write_text(json.dumps({"base_url": config.base_url}, indent=2))
    return config

class ConfigUpdate(BaseModel):
    analysis_tags: str
    llm_base_url: str
    llm_model: str
    max_batch_size: int
    livekit_url: str

    @field_validator('analysis_tags')
    @classmethod
    def validate_tags(cls, v: str) -> str:
        # Remove extra whitespace and ensure at least one tag
        tags = [tag.strip() for tag in v.split(',') if tag.strip()]
        if not tags:
            raise ValueError('At least one analysis tag is required')
        return ','.join(tags)
    
    @field_validator('llm_base_url')
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('LLM base URL cannot be empty')
        return v.strip()
    
    @field_validator('llm_model')
    @classmethod
    def validate_model(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('LLM model cannot be empty')
        return v.strip()
    
    @field_validator('max_batch_size')
    @classmethod
    def validate_batch_size(cls, v: int) -> int:
        if v < 1 or v > 10:
            raise ValueError('Max batch size must be between 1 and 10')
        return v
    
    @field_validator('livekit_url')
    @classmethod
    def validate_livekit_url(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('LiveKit URL cannot be empty')
        if not v.startswith(('ws://', 'wss://')):
            raise ValueError('LiveKit URL must start with ws:// or wss://')
        return v.strip()

class ConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    analysis_tags: str
    llm_base_url: str
    llm_model: str
    max_batch_size: int
    livekit_url: str
    updated_at: datetime

class AvailableModelsResponse(BaseModel):
    models: List[str]

def get_or_create_config(db: Session) -> AppConfig:
    """Get existing config or create default config"""
    config = db.query(AppConfig).first()
    if not config:
        config = AppConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.get("/", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)) -> AppConfig:
    """Get current application configuration"""
    config = get_or_create_config(db)
    return config

@router.put("/", response_model=ConfigResponse)
def update_config(config_update: ConfigUpdate, db: Session = Depends(get_db)) -> AppConfig:
    """Update application configuration"""
    config = get_or_create_config(db)
    
    # Update fields
    config.analysis_tags = config_update.analysis_tags
    config.llm_base_url = config_update.llm_base_url
    config.llm_model = config_update.llm_model
    config.max_batch_size = config_update.max_batch_size
    config.livekit_url = config_update.livekit_url
    config.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(config)
    return config

@router.get("/evm-config")
def validate_evm_configuration(
    rpc_url: str | None = None
) -> dict:
    """
    Validate EVM configuration and return wallet address and chain info.
    Reads private key from environment variables only (never from request).
    Useful for backend that already has FILECOIN_PRIVATE_KEY set.
    
    Args:
        rpc_url: Optional RPC URL (if not provided, reads from env or uses default)
        
    Returns:
        Dictionary with wallet_address, chain_name, and native_token_symbol
    """
    # Only read from environment variables - never accept private key in request
    private_key = os.getenv("FILECOIN_PRIVATE_KEY") or os.getenv("ARKIV_PRIVATE_KEY")
    
    if not rpc_url:
        rpc_url = os.getenv("ARKIV_RPC_URL") or os.getenv("FILECOIN_RPC_URL") or "https://mendoza.hoodi.arkiv.network/rpc"
    
    if not private_key:
        raise HTTPException(
            status_code=400,
            detail="Private key not configured. Set FILECOIN_PRIVATE_KEY environment variable."
        )
    
    try:
        wallet_address, chain_name, token_symbol = validate_evm_config(private_key, rpc_url)
        return {
            "wallet_address": wallet_address,
            "chain_name": chain_name,
            "native_token_symbol": token_symbol,
            "rpc_url": rpc_url
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to validate EVM config: {str(e)}")


@router.get("/evm-balance")
def check_evm_balance(
    rpc_url: str | None = None
) -> dict:
    """
    Check wallet balance for gas tokens on the specified EVM chain.
    Reads private key from environment variables only (never from request).
    Useful for backend that already has FILECOIN_PRIVATE_KEY set.
    
    Args:
        rpc_url: Optional RPC URL (if not provided, reads from env or uses default)
        
    Returns:
        Dictionary with wallet_address, chain_name, native_token_symbol, balance_wei, 
        balance_ether (human-readable), and has_sufficient_balance
    """
    from app.services.evm_utils import check_wallet_balance
    from web3 import Web3
    
    # Only read from environment variables - never accept private key in request
    private_key = os.getenv("FILECOIN_PRIVATE_KEY") or os.getenv("ARKIV_PRIVATE_KEY")
    
    if not rpc_url:
        rpc_url = os.getenv("ARKIV_RPC_URL") or os.getenv("FILECOIN_RPC_URL") or "https://mendoza.hoodi.arkiv.network/rpc"
    
    if not private_key:
        raise HTTPException(
            status_code=400,
            detail="Private key not configured. Set FILECOIN_PRIVATE_KEY environment variable."
        )
    
    try:
        wallet_address, chain_name, token_symbol, balance_wei, has_sufficient = check_wallet_balance(
            private_key, rpc_url
        )
        
        # Convert wei to ether for human-readable format
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        balance_ether = float(w3.from_wei(int(balance_wei), 'ether'))
        
        return {
            "wallet_address": wallet_address,
            "chain_name": chain_name,
            "native_token_symbol": token_symbol,
            "balance_wei": str(balance_wei),
            "balance_ether": balance_ether,
            "has_sufficient_balance": has_sufficient,
            "rpc_url": rpc_url
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check wallet balance: {str(e)}")


@router.get("/gateway", response_model=GatewayConfig)
def get_gateway_config() -> GatewayConfig:
    """Get IPFS gateway configuration used for remote playback."""
    return load_gateway_config()

@router.put("/gateway", response_model=GatewayConfig)
def update_gateway_config(gateway_config: GatewayConfig) -> GatewayConfig:
    """Update IPFS gateway configuration used for remote playback."""
    return save_gateway_config(gateway_config)

@router.get("/available-models/", response_model=AvailableModelsResponse)
def get_available_models() -> dict:
    """Get list of available visual language models"""
    # For now, only one model is available
    # In the future, this could be dynamically loaded or configured
    models = [
        "HuggingFaceTB/SmolVLM-Instruct"
    ]
    return {"models": models} 