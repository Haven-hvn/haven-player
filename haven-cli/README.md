# Haven CLI

A headless command-line interface for the Haven video archival system. This CLI replaces the Electron frontend with a pure Python implementation featuring an event-driven data pipeline architecture.

## Features

- **Event-Driven Pipeline**: Process videos through Ingest → Analyze → Encrypt → Upload → Sync stages
- **Parallel Processing**: Handle multiple videos concurrently with sequential steps per video
- **Plugin System**: Extensible archiver plugins for YouTube, BitTorrent, and custom sources
- **Scheduled Jobs**: Cron-like scheduling for automated plugin polling
- **JS Runtime Bridge**: Seamless integration with browser-dependent SDKs (Lit Protocol, Synapse)

## Installation

```bash
# From the haven-cli directory
pip install -e .

# Or with optional dependencies
pip install -e ".[dev]"
```

## Quick Start

```bash
# Initialize configuration
haven config init

# Upload a single video
haven upload /path/to/video.mp4

# Run the daemon (scheduler + pipeline)
haven run

# Manage jobs
haven jobs list
haven jobs create youtube --cron "0 */6 * * *"
```

## Architecture

```
haven-cli/
├── haven_cli/
│   ├── main.py              # CLI entry point (Typer)
│   ├── config.py            # Configuration management
│   ├── cli/                  # Command implementations
│   │   ├── run.py           # Daemon command
│   │   ├── upload.py        # Single file upload
│   │   ├── download.py      # Download command
│   │   ├── jobs.py          # Job management
│   │   ├── plugins.py       # Plugin management
│   │   └── config.py        # Config commands
│   ├── pipeline/            # Event-driven pipeline
│   │   ├── events.py        # EventBus, EventType
│   │   ├── results.py       # StepResult, PipelineResult
│   │   ├── context.py       # PipelineContext
│   │   ├── step.py          # PipelineStep ABC
│   │   ├── manager.py       # PipelineManager
│   │   └── steps/           # Pipeline step implementations
│   │       ├── ingest_step.py
│   │       ├── analyze_step.py
│   │       ├── encrypt_step.py
│   │       ├── upload_step.py
│   │       └── sync_step.py
│   ├── scheduler/           # Job scheduling
│   │   ├── job_scheduler.py # APScheduler integration
│   │   └── job_executor.py  # Job execution logic
│   ├── plugins/             # Plugin system
│   │   ├── base.py          # ArchiverPlugin ABC
│   │   ├── manager.py       # Plugin lifecycle
│   │   └── registry.py      # Plugin discovery
│   └── js_runtime/          # JavaScript bridge
│       ├── protocol.py      # JSON-RPC 2.0
│       ├── bridge.py        # Subprocess management
│       └── discovery.py     # Runtime detection
└── js-services/             # TypeScript services (Deno)
    ├── main.ts              # JSON-RPC server
    ├── browser-shim.ts      # Browser API stubs
    ├── lit-wrapper.ts       # Lit Protocol SDK
    └── synapse-wrapper.ts   # Synapse SDK
```

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        PipelineManager                          │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐   ┌────┐ │
│  │ Ingest  │──▶│ Analyze │──▶│ Encrypt │──▶│ Upload │──▶│Sync│ │
│  └─────────┘   └─────────┘   └─────────┘   └────────┘   └────┘ │
│       │             │             │             │           │   │
│       ▼             ▼             ▼             ▼           ▼   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                        EventBus                             ││
│  │  VIDEO_INGESTED → ANALYSIS_COMPLETE → ENCRYPTED → UPLOADED  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

Configuration is loaded from (in order of priority):
1. Environment variables (`HAVEN_*`)
2. Config file (`~/.config/haven/config.toml`)
3. Default values

### Example Configuration

```toml
# ~/.config/haven/config.toml

[pipeline]
vlm_enabled = true
vlm_model = "gpt-4-vision-preview"
encryption_enabled = true
lit_network = "datil-dev"
upload_enabled = true
sync_enabled = true
max_concurrent_videos = 4

[scheduler]
enabled = true
check_interval = 60
max_concurrent_jobs = 2
default_cron = "0 */6 * * *"

[logging]
level = "INFO"

[js_runtime]
startup_timeout = 30.0
request_timeout = 60.0
debug = false
```

### Environment Variables

```bash
HAVEN_VLM_ENABLED=true
HAVEN_VLM_API_KEY=sk-...
HAVEN_LIT_NETWORK=datil-dev
HAVEN_SYNAPSE_API_KEY=...
HAVEN_LOG_LEVEL=DEBUG
```

## Commands

### `haven run`

Start the daemon with scheduler and pipeline processing.

```bash
haven run [--no-scheduler] [--workers N] [--config PATH]
```

### `haven upload`

Upload a single video file through the pipeline.

```bash
haven upload /path/to/video.mp4 [--skip-analysis] [--skip-encryption]
```

### `haven jobs`

Manage scheduled jobs.

```bash
haven jobs list
haven jobs create <plugin> --cron "0 */6 * * *"
haven jobs delete <job-id>
haven jobs run <job-id>
haven jobs pause <job-id>
haven jobs resume <job-id>
haven jobs history [--job-id ID] [--limit N]
```

### `haven plugins`

Manage archiver plugins.

```bash
haven plugins list
haven plugins enable <name>
haven plugins disable <name>
haven plugins config <name> [--set KEY=VALUE]
haven plugins test <name>
haven plugins info <name>
```

### `haven config`

Manage configuration.

```bash
haven config show
haven config set <key> <value>
haven config init
haven config path
haven config validate
haven config edit
```

## Plugin Development

Create a custom archiver plugin by implementing the `ArchiverPlugin` interface:

```python
from haven_cli.plugins.base import ArchiverPlugin, MediaSource, ArchiveResult

class MyPlugin(ArchiverPlugin):
    @property
    def name(self) -> str:
        return "my-plugin"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def discover_sources(self) -> list[MediaSource]:
        # Return list of media sources to archive
        return [...]
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        # Download and prepare the media for pipeline
        return ArchiveResult(...)
```

## JS Runtime Bridge

The CLI uses a Deno subprocess to run browser-dependent SDKs:

- **Lit Protocol**: Encryption/decryption with access control
- **Synapse SDK**: Filecoin storage uploads

Communication uses JSON-RPC 2.0 over stdio:

```python
from haven_cli.js_runtime import JSRuntimeBridge

async with JSRuntimeBridge() as bridge:
    result = await bridge.call("lit.encrypt", {
        "data": base64_data,
        "accessControlConditions": [...]
    })
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Type checking
mypy haven_cli

# Linting
ruff check haven_cli

# Format code
ruff format haven_cli
```

## Requirements

- Python 3.11+
- Deno 1.40+ (for JS runtime)
- Optional: Node.js 18+ or Bun (alternative JS runtimes)

## License

MIT
