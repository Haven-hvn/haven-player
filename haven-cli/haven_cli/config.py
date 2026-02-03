"""
Haven CLI Configuration Management.

Handles loading, saving, and validating configuration from various sources:
- Default values
- Configuration files (TOML/YAML)
- Environment variables
- Command-line arguments
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

# Try to import tomllib (Python 3.11+) or tomli as fallback
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore
    except ImportError:
        tomllib = None  # type: ignore


# Default configuration directory
DEFAULT_CONFIG_DIR = Path.home() / ".config" / "haven"
DEFAULT_CONFIG_FILE = "config.toml"
DEFAULT_DATA_DIR = Path.home() / ".local" / "share" / "haven"


@dataclass
class PipelineConfig:
    """Configuration for the processing pipeline."""
    
    # VLM Analysis
    vlm_enabled: bool = True
    vlm_model: str = "gpt-4-vision-preview"
    vlm_api_key: Optional[str] = None
    vlm_timeout: float = 120.0
    
    # Encryption (Lit Protocol)
    encryption_enabled: bool = True
    lit_network: str = "datil-dev"
    
    # Upload (Filecoin via Synapse)
    upload_enabled: bool = True
    synapse_endpoint: Optional[str] = None
    synapse_api_key: Optional[str] = None
    
    # Blockchain Sync (Arkiv)
    sync_enabled: bool = True
    arkiv_endpoint: Optional[str] = None
    arkiv_contract: Optional[str] = None
    
    # Processing
    max_concurrent_videos: int = 4
    retry_attempts: int = 3
    retry_delay: float = 5.0


@dataclass
class SchedulerConfig:
    """Configuration for the job scheduler."""
    
    # Scheduler settings
    enabled: bool = True
    check_interval: int = 60  # seconds
    max_concurrent_jobs: int = 2
    
    # Job defaults
    default_cron: str = "0 */6 * * *"  # Every 6 hours
    job_timeout: int = 3600  # 1 hour
    
    # Persistence
    state_file: Optional[Path] = None


@dataclass
class PluginConfig:
    """Configuration for the plugin system."""
    
    # Plugin directories
    plugin_dirs: list[Path] = field(default_factory=list)
    
    # Enabled plugins
    enabled_plugins: list[str] = field(default_factory=list)
    disabled_plugins: list[str] = field(default_factory=list)
    
    # Plugin-specific settings
    plugin_settings: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class JSRuntimeConfig:
    """Configuration for the JavaScript runtime bridge."""
    
    # Runtime settings
    runtime: Optional[str] = None  # Auto-detect if None
    services_path: Optional[Path] = None
    
    # Timeouts
    startup_timeout: float = 30.0
    request_timeout: float = 60.0
    
    # Debug
    debug: bool = False


@dataclass
class LoggingConfig:
    """Configuration for logging."""
    
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file: Optional[Path] = None
    max_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5


@dataclass
class HavenConfig:
    """Main configuration container for Haven CLI."""
    
    # Paths
    config_dir: Path = DEFAULT_CONFIG_DIR
    data_dir: Path = DEFAULT_DATA_DIR
    
    # Sub-configurations
    pipeline: PipelineConfig = field(default_factory=PipelineConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    plugins: PluginConfig = field(default_factory=PluginConfig)
    js_runtime: JSRuntimeConfig = field(default_factory=JSRuntimeConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    
    # Database
    database_url: str = ""
    
    def __post_init__(self):
        """Initialize derived values."""
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir}/haven.db"
        
        if self.scheduler.state_file is None:
            self.scheduler.state_file = self.data_dir / "scheduler_state.json"


def load_config(
    config_path: Optional[Path] = None,
    env_prefix: str = "HAVEN_"
) -> HavenConfig:
    """
    Load configuration from file and environment variables.
    
    Priority (highest to lowest):
    1. Environment variables
    2. Config file
    3. Default values
    
    Args:
        config_path: Path to config file (default: ~/.config/haven/config.toml)
        env_prefix: Prefix for environment variables
    
    Returns:
        Loaded configuration
    """
    config = HavenConfig()
    
    # Determine config file path
    if config_path is None:
        config_path = DEFAULT_CONFIG_DIR / DEFAULT_CONFIG_FILE
    
    # Load from file if exists
    if config_path.exists() and tomllib is not None:
        config = _load_from_file(config_path, config)
    
    # Override with environment variables
    config = _load_from_env(config, env_prefix)
    
    return config


def _load_from_file(path: Path, config: HavenConfig) -> HavenConfig:
    """Load configuration from a TOML file."""
    if tomllib is None:
        return config
    
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
        
        # Update config from file data
        if "pipeline" in data:
            for key, value in data["pipeline"].items():
                if hasattr(config.pipeline, key):
                    setattr(config.pipeline, key, value)
        
        if "scheduler" in data:
            for key, value in data["scheduler"].items():
                if hasattr(config.scheduler, key):
                    setattr(config.scheduler, key, value)
        
        if "plugins" in data:
            for key, value in data["plugins"].items():
                if hasattr(config.plugins, key):
                    setattr(config.plugins, key, value)
        
        if "js_runtime" in data:
            for key, value in data["js_runtime"].items():
                if hasattr(config.js_runtime, key):
                    setattr(config.js_runtime, key, value)
        
        if "logging" in data:
            for key, value in data["logging"].items():
                if hasattr(config.logging, key):
                    setattr(config.logging, key, value)
        
        # Top-level settings
        if "config_dir" in data:
            config.config_dir = Path(data["config_dir"])
        if "data_dir" in data:
            config.data_dir = Path(data["data_dir"])
        if "database_url" in data:
            config.database_url = data["database_url"]
            
    except Exception as e:
        print(f"Warning: Failed to load config from {path}: {e}")
    
    return config


def _load_from_env(config: HavenConfig, prefix: str) -> HavenConfig:
    """Load configuration from environment variables."""
    
    # Pipeline settings
    if env_val := os.environ.get(f"{prefix}VLM_ENABLED"):
        config.pipeline.vlm_enabled = env_val.lower() in ("true", "1", "yes")
    if env_val := os.environ.get(f"{prefix}VLM_MODEL"):
        config.pipeline.vlm_model = env_val
    if env_val := os.environ.get(f"{prefix}VLM_API_KEY"):
        config.pipeline.vlm_api_key = env_val
    
    if env_val := os.environ.get(f"{prefix}ENCRYPTION_ENABLED"):
        config.pipeline.encryption_enabled = env_val.lower() in ("true", "1", "yes")
    if env_val := os.environ.get(f"{prefix}LIT_NETWORK"):
        config.pipeline.lit_network = env_val
    
    if env_val := os.environ.get(f"{prefix}UPLOAD_ENABLED"):
        config.pipeline.upload_enabled = env_val.lower() in ("true", "1", "yes")
    if env_val := os.environ.get(f"{prefix}SYNAPSE_ENDPOINT"):
        config.pipeline.synapse_endpoint = env_val
    if env_val := os.environ.get(f"{prefix}SYNAPSE_API_KEY"):
        config.pipeline.synapse_api_key = env_val
    
    if env_val := os.environ.get(f"{prefix}SYNC_ENABLED"):
        config.pipeline.sync_enabled = env_val.lower() in ("true", "1", "yes")
    
    # Scheduler settings
    if env_val := os.environ.get(f"{prefix}SCHEDULER_ENABLED"):
        config.scheduler.enabled = env_val.lower() in ("true", "1", "yes")
    
    # Logging settings
    if env_val := os.environ.get(f"{prefix}LOG_LEVEL"):
        config.logging.level = env_val.upper()
    
    # JS Runtime settings
    if env_val := os.environ.get(f"{prefix}JS_RUNTIME"):
        config.js_runtime.runtime = env_val
    if env_val := os.environ.get(f"{prefix}JS_DEBUG"):
        config.js_runtime.debug = env_val.lower() in ("true", "1", "yes")
    
    # Paths
    if env_val := os.environ.get(f"{prefix}CONFIG_DIR"):
        config.config_dir = Path(env_val)
    if env_val := os.environ.get(f"{prefix}DATA_DIR"):
        config.data_dir = Path(env_val)
    if env_val := os.environ.get(f"{prefix}DATABASE_URL"):
        config.database_url = env_val
    
    return config


def save_config(config: HavenConfig, path: Optional[Path] = None) -> None:
    """
    Save configuration to a TOML file.
    
    Args:
        config: Configuration to save
        path: Path to save to (default: config.config_dir / config.toml)
    """
    if path is None:
        path = config.config_dir / DEFAULT_CONFIG_FILE
    
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # Build TOML content
    lines = [
        "# Haven CLI Configuration",
        "# Generated automatically - edit with care",
        "",
        f'config_dir = "{config.config_dir}"',
        f'data_dir = "{config.data_dir}"',
        f'database_url = "{config.database_url}"',
        "",
        "[pipeline]",
        f"vlm_enabled = {str(config.pipeline.vlm_enabled).lower()}",
        f'vlm_model = "{config.pipeline.vlm_model}"',
        f"encryption_enabled = {str(config.pipeline.encryption_enabled).lower()}",
        f'lit_network = "{config.pipeline.lit_network}"',
        f"upload_enabled = {str(config.pipeline.upload_enabled).lower()}",
        f"sync_enabled = {str(config.pipeline.sync_enabled).lower()}",
        f"max_concurrent_videos = {config.pipeline.max_concurrent_videos}",
        f"retry_attempts = {config.pipeline.retry_attempts}",
        "",
        "[scheduler]",
        f"enabled = {str(config.scheduler.enabled).lower()}",
        f"check_interval = {config.scheduler.check_interval}",
        f"max_concurrent_jobs = {config.scheduler.max_concurrent_jobs}",
        f'default_cron = "{config.scheduler.default_cron}"',
        "",
        "[logging]",
        f'level = "{config.logging.level}"',
        "",
        "[js_runtime]",
        f"startup_timeout = {config.js_runtime.startup_timeout}",
        f"request_timeout = {config.js_runtime.request_timeout}",
        f"debug = {str(config.js_runtime.debug).lower()}",
    ]
    
    with open(path, "w") as f:
        f.write("\n".join(lines))


def ensure_directories(config: HavenConfig) -> None:
    """Ensure all required directories exist."""
    config.config_dir.mkdir(parents=True, exist_ok=True)
    config.data_dir.mkdir(parents=True, exist_ok=True)
    
    # Plugin directories
    for plugin_dir in config.plugins.plugin_dirs:
        plugin_dir.mkdir(parents=True, exist_ok=True)


def get_default_config() -> HavenConfig:
    """Get the default configuration."""
    return HavenConfig()


# Global configuration instance (lazy-loaded)
_global_config: Optional[HavenConfig] = None


def get_config() -> HavenConfig:
    """Get the global configuration instance."""
    global _global_config
    if _global_config is None:
        _global_config = load_config()
    return _global_config


def set_config(config: HavenConfig) -> None:
    """Set the global configuration instance."""
    global _global_config
    _global_config = config
