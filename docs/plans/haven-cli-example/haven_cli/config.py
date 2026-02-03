"""
Configuration management for Haven CLI.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from platformdirs import user_config_dir, user_data_dir

APP_NAME = "haven-cli"


def get_config_dir() -> Path:
    """Get the configuration directory."""
    return Path(user_config_dir(APP_NAME))


def get_data_dir() -> Path:
    """Get the data directory for uploads, cache, etc."""
    return Path(user_data_dir(APP_NAME))


def get_config_path() -> Path:
    """Get the configuration file path."""
    return get_config_dir() / "config.json"


def get_uploads_db_path() -> Path:
    """Get the uploads database path."""
    return get_data_dir() / "uploads.json"


def load_config() -> Dict[str, Any]:
    """Load configuration from file."""
    config_path = get_config_path()
    
    if not config_path.exists():
        return {}
    
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_config(config: Dict[str, Any]) -> None:
    """Save configuration to file."""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)


def set_config(key: str, value: Any) -> None:
    """Set a configuration value."""
    config = load_config()
    config[key] = value
    save_config(config)


def save_upload_record(record: Dict[str, Any]) -> None:
    """Save an upload record."""
    db_path = get_uploads_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    uploads = []
    if db_path.exists():
        try:
            with open(db_path, "r") as f:
                uploads = json.load(f)
        except (json.JSONDecodeError, IOError):
            uploads = []
    
    # Add timestamp
    from datetime import datetime
    record["timestamp"] = datetime.now().isoformat()
    
    uploads.append(record)
    
    with open(db_path, "w") as f:
        json.dump(uploads, f, indent=2)


def get_upload_record(cid: str) -> Optional[Dict[str, Any]]:
    """Get an upload record by CID."""
    db_path = get_uploads_db_path()
    
    if not db_path.exists():
        return None
    
    try:
        with open(db_path, "r") as f:
            uploads = json.load(f)
        
        for record in uploads:
            if record.get("rootCid") == cid or record.get("pieceCid") == cid:
                return record
    except (json.JSONDecodeError, IOError):
        pass
    
    return None


def list_upload_records() -> List[Dict[str, Any]]:
    """List all upload records."""
    db_path = get_uploads_db_path()
    
    if not db_path.exists():
        return []
    
    try:
        with open(db_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []
