from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models.config import AppConfig
from app.models.database import SessionLocal
from vlm_engine.config_models import EngineConfig, ModelConfig, PipelineConfig, PipelineModelConfig


def validate_multiplexer_endpoints(endpoints: List[Dict[str, Any]]) -> None:
    """Validate multiplexer endpoint configuration."""
    if not endpoints:
        raise ValueError("Multiplexer endpoints cannot be empty when enabled")
    
    for i, ep in enumerate(endpoints):
        if not ep.get('base_url'):
            raise ValueError(f"Endpoint {i}: base_url is required")
        if not ep.get('name'):
            raise ValueError(f"Endpoint {i}: name is required")
        weight = ep.get('weight', 1)
        if not isinstance(weight, int) or weight <= 0:
            raise ValueError(f"Endpoint {i}: weight must be a positive integer")
        max_concurrent = ep.get('max_concurrent', 5)
        if not isinstance(max_concurrent, int) or max_concurrent <= 0:
            raise ValueError(f"Endpoint {i}: max_concurrent must be a positive integer")


def get_vlm_config() -> Dict[str, Any]:
    """
    Load VLM configuration from database with new architectural requirements.
    
    Architecture Changes:
    - Moved concurrency control from network layer (httpx) to application layer (multiplexer-llm)
    - Each endpoint now requires max_concurrent for Intelligent Overflow Routing
    - Global max_concurrent_requests acts as admission control gatekeeper
    - Self-healing and per-request load balancing enabled
    """
    db = SessionLocal()
    try:
        config = db.query(AppConfig).first()
        if not config:
            raise ValueError("No configuration found in database")
        
        # Convert comma-separated tags to list
        tag_list = [tag.strip() for tag in config.analysis_tags.split(',') if tag.strip()]
        
        # Build model config with new multiplexer architecture
        model_config = {
            "type": "vlm_model",
            "model_category": "humanactivityevaluation",
            "model_id": config.llm_model,
            "api_base_url": config.llm_base_url,
            "tag_list": tag_list,
            "max_new_tokens": 128,
            "request_timeout": 70,
            "vlm_detected_tag_confidence": 0.99
        }
        
        # Configure multiplexer with application-layer concurrency control
        if config.vlm_multiplexer_enabled:
            if config.vlm_multiplexer_endpoints:
                # Validate and use configured endpoints
                validate_multiplexer_endpoints(config.vlm_multiplexer_endpoints)
                
                model_config["use_multiplexer"] = True
                model_config["multiplexer_endpoints"] = config.vlm_multiplexer_endpoints
                
                # Set global admission control based on sum of endpoint capacities
                total_capacity = sum(ep['max_concurrent'] for ep in config.vlm_multiplexer_endpoints)
                model_config["max_concurrent_requests"] = min(
                    config.vlm_max_concurrent_requests,
                    total_capacity + 5  # Small buffer above total capacity
                )
                
            elif config.llm_base_url:
                # Create single endpoint with reasonable defaults for backward compatibility
                # This maintains functionality while requiring future migration to explicit endpoints
                single_endpoint = {
                    "base_url": config.llm_base_url,
                    "name": "default_endpoint",
                    "weight": 1,
                    "max_concurrent": 5  # Conservative default
                }
                
                model_config.update({
                    "use_multiplexer": True,
                    "multiplexer_endpoints": [single_endpoint],
                    "max_concurrent_requests": min(config.vlm_max_concurrent_requests, 10)
                })
        
        # Build the complete configuration
        return {
            "active_ai_models": ["vlm_nsfw_model"],
            "pipelines": {
                "video_pipeline_dynamic": {
                    "inputs": [
                        "video_path",
                        "return_timestamps",
                        "time_interval",
                        "threshold",
                        "return_confidence",
                        "vr_video",
                        "existing_video_data",
                        "skipped_categories",
                    ],
                    "output": "results",
                    "version": 1.0,
                    "models": [
                        {
                            "name": "dynamic_video_ai",
                            "inputs": ["video_path", "return_timestamps", "time_interval", "threshold", "return_confidence", "vr_video", "existing_video_data", "skipped_categories"],
                            "outputs": "results",
                        },
                    ],
                }
            },
            "models": {
                "binary_search_processor_dynamic": {
                    "type": "video_preprocessor"
                },
                "vlm_nsfw_model": model_config,
                "result_coalescer": {
                    "type": "python"
                },
                "result_finisher": {
                    "type": "python"
                },
                "batch_awaiter": {
                    "type": "python"
                },
                "video_result_postprocessor": {
                    "type": "python"
                },
            },
            "category_config": {
                "humanactivityevaluation": {
                    tag: {
                        "RenamedTag": tag,
                        "MinMarkerDuration": "1s",
                        "MaxGap": "30s",
                        "RequiredDuration": "1s",
                        "TagThreshold": 0.5,
                    }
                    for tag in tag_list
                }
            }
        }
    finally:
        db.close()


def create_engine_config() -> EngineConfig:
    """
    Create a VLM EngineConfig object from database configuration.
    """
    config_dict = get_vlm_config()
    
    # Convert dict to proper config objects
    models = {}
    for model_name, model_config in config_dict["models"].items():
        models[model_name] = ModelConfig(**model_config)
    
    pipelines = {}
    for pipeline_name, pipeline_config in config_dict["pipelines"].items():
        # Convert model configs in pipeline
        pipeline_models = []
        for model in pipeline_config["models"]:
            pipeline_models.append(PipelineModelConfig(**model))
        
        pipelines[pipeline_name] = PipelineConfig(
            inputs=pipeline_config["inputs"],
            output=pipeline_config["output"],
            version=pipeline_config["version"],
            models=pipeline_models
        )
    
    return EngineConfig(
        active_ai_models=config_dict.get("active_ai_models", ["vlm_nsfw_model"]),
        models=models,
        pipelines=pipelines,
        category_config=config_dict["category_config"]
    )


def get_vlm_processing_params() -> Dict[str, Any]:
    """
    Get VLM processing parameters from database configuration.
    """
    db = SessionLocal()
    try:
        config = db.query(AppConfig).first()
        if not config:
            return {
                "frame_interval": 2.0,
                "threshold": 0.5,
                "return_timestamps": True,
                "return_confidence": True,
                "vr_video": False,
            }
        
        return {
            "frame_interval": config.vlm_frame_interval,
            "threshold": config.vlm_threshold,
            "return_timestamps": config.vlm_return_timestamps,
            "return_confidence": config.vlm_return_confidence,
            "vr_video": False,  # VR video support can be added later if needed
        }
    finally:
        db.close()


def get_example_multiplexer_config() -> str:
    """
    Return an example of proper multiplexer endpoint configuration.
    
    This demonstrates the new required format with smaller weights and explicit max_concurrent.
    """
    example_endpoints = [
        {
            "base_url": "http://primary-server:1234/v1",
            "api_key": "your-api-key-here",
            "name": "primary-server",
            "weight": 8,
            "max_concurrent": 10
        },
        {
            "base_url": "http://secondary-server:1234/v1", 
            "api_key": "your-api-key-here",
            "name": "secondary-server",
            "weight": 1,
            "max_concurrent": 8
        },
        {
            "base_url": "http://fallback-server:1234/v1",
            "api_key": "your-api-key-here", 
            "name": "fallback-server",
            "weight": 1,
            "max_concurrent": 2
        }
    ]
    
    import json
    return json.dumps({
        "vlm_multiplexer_enabled": True,
        "vlm_multiplexer_endpoints": example_endpoints,
        "vlm_max_concurrent_requests": 25  # Sum of capacities (10+8+2) + small buffer
    }, indent=2)
