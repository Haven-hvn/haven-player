# Task 04: Documentation & Help Text

## Assignee
Tech Writer / Backend Developer

## Priority
Medium

## Estimated Effort
3 days

## Description
Create comprehensive documentation for the Haven CLI including user guides, API documentation, and inline help text.

## Current State
- Basic README exists
- Help text is minimal
- No user guide
- No API documentation

## Requirements

### 1. README Enhancement
Update the main README:

```markdown
# Haven CLI

Decentralized video archival with AI-powered analysis and blockchain verification.

## Features

- 📹 **Video Archival**: Archive videos from YouTube, local files, and more
- 🔐 **Encryption**: Lit Protocol access-controlled encryption
- 🗄️ **Decentralized Storage**: Filecoin/IPFS via Synapse
- 🤖 **AI Analysis**: VLM-powered timestamp and tag generation
- ⛓️ **Blockchain Sync**: Arkiv on-chain metadata records
- 🔌 **Plugin System**: Extensible archiver plugins
- ⏰ **Scheduling**: Cron-based automated archival

## Quick Start

### Installation

```bash
pip install haven-cli
```

### Configuration

```bash
haven config init
```

### Upload a Video

```bash
haven upload video.mp4
```

### Start Daemon

```bash
haven run
```

## Documentation

- [User Guide](docs/user-guide.md)
- [Configuration](docs/configuration.md)
- [Plugins](docs/plugins.md)
- [API Reference](docs/api.md)
```

### 2. User Guide
Create comprehensive user guide:

```markdown
# Haven CLI User Guide

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Basic Usage](#basic-usage)
4. [Pipeline Steps](#pipeline-steps)
5. [Plugins](#plugins)
6. [Scheduling](#scheduling)
7. [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- Python 3.10+
- FFmpeg (for video processing)
- Deno (for JS runtime)
- yt-dlp (for YouTube plugin)

### Install via pip

```bash
pip install haven-cli
```

### Install from source

```bash
git clone https://github.com/haven/haven-cli
cd haven-cli
pip install -e .
```

## Configuration

### Initialize Configuration

```bash
haven config init
```

This creates `~/.config/haven/config.toml` with default settings.

### Configuration Options

| Section | Key | Description | Default |
|---------|-----|-------------|---------|
| pipeline | vlm_enabled | Enable AI analysis | true |
| pipeline | encryption_enabled | Enable Lit encryption | false |
| pipeline | upload_enabled | Enable Filecoin upload | true |
| pipeline | sync_enabled | Enable Arkiv sync | true |

### Environment Variables

All configuration can be overridden via environment variables:

```bash
export HAVEN_VLM_ENABLED=true
export HAVEN_SYNAPSE_API_KEY=your-key
```

## Basic Usage

### Upload a Video

```bash
# Basic upload
haven upload video.mp4

# With encryption
haven upload video.mp4 --encrypt

# Skip analysis
haven upload video.mp4 --no-analyze
```

### Download from Filecoin

```bash
# Download by CID
haven download bafybeig... --output video.mp4

# With decryption
haven download bafybeig... --output video.mp4 --decrypt
```

### Check Status

```bash
haven download info bafybeig...
```

## Pipeline Steps

The Haven pipeline processes videos through these steps:

1. **Ingest**: Extract metadata, calculate pHash, check duplicates
2. **Analyze**: Run VLM to generate timestamps and tags
3. **Encrypt**: Encrypt with Lit Protocol (optional)
4. **Upload**: Store on Filecoin via Synapse
5. **Sync**: Record metadata on Arkiv blockchain

## Plugins

### List Available Plugins

```bash
haven plugins list
```

### Configure a Plugin

```bash
haven plugins configure YouTubePlugin channel_ids "UCxxx,UCyyy"
```

### Test a Plugin

```bash
haven plugins test YouTubePlugin --discover
```

## Scheduling

### Create a Job

```bash
haven jobs create --plugin YouTubePlugin --schedule "0 * * * *"
```

### List Jobs

```bash
haven jobs list
```

### Run Job Manually

```bash
haven jobs run <job-id>
```

## Troubleshooting

### Common Issues

**JS Runtime not starting**
- Ensure Deno is installed: `deno --version`
- Check JS services path in config

**Upload failing**
- Verify Synapse API key is set
- Check network connectivity

**VLM analysis slow**
- Consider using local model
- Reduce frame sampling count
```

### 3. Configuration Reference
Document all configuration options:

```markdown
# Configuration Reference

## File Location

Default: `~/.config/haven/config.toml`

Override with: `HAVEN_CONFIG_DIR` environment variable

## Full Configuration Example

```toml
[pipeline]
vlm_enabled = true
vlm_model = "gpt-4-vision-preview"
vlm_api_key = ""  # Or use HAVEN_VLM_API_KEY

encryption_enabled = false
lit_network = "datil-dev"

upload_enabled = true
synapse_endpoint = "https://api.synapse.storage"
synapse_api_key = ""  # Or use HAVEN_SYNAPSE_API_KEY

sync_enabled = true

[arkiv]
rpc_url = "https://rpc.arkiv.network"
contract_address = "0x..."
private_key = ""  # Or use HAVEN_ARKIV_PRIVATE_KEY

[scheduler]
enabled = true
max_concurrent = 4

[js_runtime]
runtime = "deno"
debug = false

[plugins.YouTubePlugin]
channel_ids = []
playlist_ids = []
max_videos = 10
quality = "best"
output_dir = "~/haven/downloads"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| HAVEN_CONFIG_DIR | Configuration directory |
| HAVEN_DATA_DIR | Data storage directory |
| HAVEN_DATABASE_URL | Database connection URL |
| HAVEN_VLM_API_KEY | VLM API key |
| HAVEN_SYNAPSE_API_KEY | Synapse API key |
| HAVEN_ARKIV_PRIVATE_KEY | Arkiv wallet private key |
| HAVEN_LOG_LEVEL | Logging level (DEBUG, INFO, WARNING, ERROR) |
```

### 4. CLI Reference
Auto-generate CLI reference:

```python
# Script to generate CLI reference
# haven_cli/docs/generate_cli_ref.py

import typer
from haven_cli.cli.main import app

def generate_cli_reference() -> str:
    """Generate markdown documentation for all CLI commands."""
    docs = ["# CLI Reference\n"]
    
    for name, command in app.registered_commands:
        docs.append(f"## haven {name}\n")
        docs.append(f"{command.help or ''}\n")
        
        # Parameters
        if command.params:
            docs.append("### Options\n")
            for param in command.params:
                docs.append(f"- `{param.name}`: {param.help or ''}\n")
        
        docs.append("\n")
    
    return "\n".join(docs)
```

### 5. Inline Help Improvements
Enhance all command help text with examples:

```python
# Example for upload command
"""
Upload a video to Filecoin storage.

The video is processed through the Haven pipeline:
- Metadata extraction and pHash calculation
- AI-powered timestamp generation (optional)
- Lit Protocol encryption (optional)
- Filecoin storage via Synapse
- Arkiv blockchain sync (optional)

Examples:
    # Basic upload
    $ haven upload video.mp4
    
    # Upload with encryption
    $ haven upload video.mp4 --encrypt
    
    # Upload without analysis
    $ haven upload video.mp4 --no-analyze
    
    # Upload to specific dataset
    $ haven upload video.mp4 --dataset-id 42
"""
```

## Files to Create

### Create
- `haven-cli/docs/user-guide.md`
- `haven-cli/docs/configuration.md`
- `haven-cli/docs/plugins.md`
- `haven-cli/docs/api.md`
- `haven-cli/docs/cli-reference.md`
- `haven-cli/docs/troubleshooting.md`

### Modify
- `haven-cli/README.md` - Comprehensive overview
- All CLI command files - Enhanced help text

## Acceptance Criteria
- [ ] README provides clear quick start
- [ ] User guide covers all features
- [ ] Configuration fully documented
- [ ] CLI reference auto-generated
- [ ] All commands have examples
- [ ] Troubleshooting guide exists
- [ ] Documentation builds without errors

## Technical Notes
- Consider using MkDocs for documentation site
- Include diagrams for architecture
- Add video tutorials if possible
- Keep docs in sync with code

## Dependencies
- All previous tasks (to document features)

## Blocking
- None (final task)
