from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.config import AppConfig
from app.models.database import SessionLocal
from vlm_engine.config_models import EngineConfig, ModelConfig, PipelineConfig, PipelineModelConfig

def get_vlm_config() -> Dict[str, Any]:
    """
    Load VLM configuration from database and merge with hardcoded defaults.
    """
    db = SessionLocal()
    try:
        config = db.query(AppConfig).first()
        if not config:
            raise ValueError("No configuration found in database")
        
        # Convert comma-separated tags to list
        tag_list = [tag.strip() for tag in config.analysis_tags.split(',') if tag.strip()]
        
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
                    "short_name": "dynamic_video",
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
                "video_preprocessor_dynamic": {
                    "type": "video_preprocessor",
                    "model_file_name": "video_preprocessor_dynamic"
                },
                "vlm_nsfw_model": {
                    "type": "vlm_model",
                    "model_file_name": "vlm_nsfw_model",
                    "model_category": "actiondetection",
                    "model_id": config.llm_model,
                    "model_identifier": 93848,
                    "model_version": "1.0",
                    "api_base_url": config.llm_base_url,
                    "tag_list": tag_list,
                    "max_new_tokens": 128,
                    "request_timeout": 70,
                    "vlm_detected_tag_confidence": 0.99
                },
                "result_coalescer": {
                    "type": "python",
                    "model_file_name": "result_coalescer"
                },
                "result_finisher": {
                    "type": "python",
                    "model_file_name": "result_finisher"
                },
                "batch_awaiter": {
                    "type": "python",
                    "model_file_name": "batch_awaiter"
                },
                "video_result_postprocessor": {
                    "type": "python",
                    "model_file_name": "video_result_postprocessor"
                },
            },
            "category_config": {
                "actiondetection": {
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
            short_name=pipeline_config["short_name"],
            version=pipeline_config["version"],
            models=pipeline_models
        )
    
    return EngineConfig(
        active_ai_models=config_dict["active_ai_models"],
        models=models,
        pipelines=pipelines,
        category_config=config_dict["category_config"]
    )
