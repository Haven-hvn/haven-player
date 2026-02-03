# Task 02: Configuration System Enhancement

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
2 days

## Description
Enhance the configuration system to fully support loading, saving, validation, and environment variable overrides. Several CLI commands reference configuration features that are not fully implemented.

## Current State
- `haven_cli/config.py` - Has structure but some features incomplete
- `haven_cli/cli/config.py` - Multiple TODOs:
  - `show_config()` - YAML/JSON output not implemented
  - `set_config()` - `set_config_value()` function doesn't exist
  - `init_config()` - Config file writing not implemented
  - `validate_config()` - Actual validation not implemented
- References to `CONFIG_DIR` and `CONFIG_FILE` that need to be defined

## Requirements

### 1. Configuration File Operations
```python
# Add to haven_cli/config.py

CONFIG_DIR = Path.home() / ".config" / "haven"
CONFIG_FILE = "config.toml"

def set_config_value(section: str, key: str, value: Any) -> None:
    """Set a single configuration value and persist to file."""
    
def validate_config(config: HavenConfig) -> List[ValidationError]:
    """Validate configuration and return list of errors."""
    
def export_config_yaml(config: HavenConfig) -> str:
    """Export configuration as YAML string."""
    
def export_config_json(config: HavenConfig) -> str:
    """Export configuration as JSON string."""
```

### 2. Configuration Validation
Implement validation for:
- Required fields (API keys, endpoints)
- URL format validation for RPC URLs
- Path existence checks for directories
- Cron expression validation for schedules

```python
@dataclass
class ValidationError:
    field: str
    message: str
    severity: str  # "error" or "warning"
```

### 3. Interactive Configuration Wizard
Complete the `haven config init` wizard:
- Prompt for Filecoin RPC URL
- Prompt for private keys (with secure input)
- Prompt for Arkiv settings
- Prompt for pipeline defaults
- Write resulting config file

### 4. Environment Variable Documentation
Create a mapping of all supported environment variables:
```
HAVEN_VLM_ENABLED
HAVEN_VLM_MODEL
HAVEN_VLM_API_KEY
HAVEN_ENCRYPTION_ENABLED
HAVEN_LIT_NETWORK
HAVEN_UPLOAD_ENABLED
HAVEN_SYNAPSE_ENDPOINT
HAVEN_SYNAPSE_API_KEY
HAVEN_SYNC_ENABLED
HAVEN_SCHEDULER_ENABLED
HAVEN_LOG_LEVEL
HAVEN_JS_RUNTIME
HAVEN_JS_DEBUG
HAVEN_CONFIG_DIR
HAVEN_DATA_DIR
HAVEN_DATABASE_URL
```

## Files to Create/Modify

### Modify
- `haven_cli/config.py` - Add missing functions and constants
- `haven_cli/cli/config.py` - Implement all TODO items

### Create
- `haven_cli/config_validation.py` - Validation logic (optional, can be in config.py)

## Acceptance Criteria
- [ ] `haven config show --format yaml` works
- [ ] `haven config show --format json` works
- [ ] `haven config set section.key value` persists changes
- [ ] `haven config init` creates a valid config file interactively
- [ ] `haven config validate` performs actual validation
- [ ] Environment variables properly override config file values
- [ ] Unit tests for config operations

## Technical Notes
- Use `tomli-w` for writing TOML files (tomllib only reads)
- Use `pyyaml` for YAML export
- Ensure sensitive values (API keys) are masked in `show` output
- Config file should have appropriate permissions (0600)

## Dependencies
None

## Blocking
- All commands that rely on configuration
