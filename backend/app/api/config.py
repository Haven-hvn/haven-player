from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.config import AppConfig
from pydantic import BaseModel, ConfigDict, field_validator

router = APIRouter()

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

@router.get("/config/", response_model=ConfigResponse)
def get_config(db: Session = Depends(get_db)) -> AppConfig:
    """Get current application configuration"""
    config = get_or_create_config(db)
    return config

@router.put("/config/", response_model=ConfigResponse)
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

@router.get("/config/available-models/", response_model=AvailableModelsResponse)
def get_available_models() -> dict:
    """Get list of available visual language models"""
    # For now, only one model is available
    # In the future, this could be dynamically loaded or configured
    models = [
        "HuggingFaceTB/SmolVLM-Instruct"
    ]
    return {"models": models} 