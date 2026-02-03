# Haven CLI - Example Implementation

This is a complete example implementation of the Haven CLI based on yt-dlp's JavaScript runtime abstraction pattern.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Haven CLI (Python)                           │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐  │
│  │   Commands  │  │      JS Runtime Bridge                  │  │
│  │  (Click)    │  │  ┌─────────────────────────────────────┐│  │
│  └──────┬──────┘  │  │  Subprocess (Deno/Node)             ││  │
│         │         │  │  ┌──────────────┐  ┌──────────────┐ ││  │
│         ▼         │  │  │ Lit Service  │  │ Synapse Svc  │ ││  │
│  ┌─────────────┐  │  │  └──────────────┘  └──────────────┘ ││  │
│  │  Config/DB  │  │  └─────────────────────────────────────┘│  │
│  │  (SQLite)   │  └─────────────────────────────────────────┘  │
│  └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. JS Runtime Bridge (`haven_cli/js_runtime/bridge.py`)

Manages a JavaScript subprocess (Deno or Node.js) and communicates via JSON-RPC over stdio.

```python
from haven_cli.js_runtime import JSRuntimeBridge, JSRuntimeConfig

with JSRuntimeBridge(JSRuntimeConfig(runtime="deno")) as bridge:
    result = bridge.call("lit.encryptFile", file_data, private_key)
```

### 2. Browser Shim (`js-services/browser-shim.ts`)

Sets up browser globals (`localStorage`, `window`, `document`, etc.) that Lit and Synapse SDK expect.

```typescript
// File-backed localStorage
(globalThis as any).localStorage = new FileStorage(storageFile);

// window, document, navigator stubs
(globalThis as any).window = { ... };
```

### 3. Service Wrappers (`js-services/lit-wrapper.ts`, `js-services/synapse-wrapper.ts`)

Wrap the SDKs to provide a clean JSON-RPC interface:

- `lit.encryptFile(data, privateKey)` → Encryption result
- `lit.decryptFile(encryptedData, metadata, privateKey)` → Decrypted data
- `synapse.uploadFile(filePath, config)` → Upload result

## Installation

### Prerequisites

1. **Python 3.10+**
2. **Deno 2.0+** (preferred) or Node.js 20+

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Or install Node.js
# See https://nodejs.org/
```

### Install Haven CLI

```bash
# Clone or copy the haven-cli-example directory
cd docs/haven-cli-example

# Install Python dependencies
pip install -e ".[dev]"

# Verify installation
haven --help
```

## Usage

### Upload a File

```bash
# Basic upload with encryption
haven upload ./video.mp4 --private-key $PRIVATE_KEY

# Upload without encryption
haven upload ./video.mp4 --no-encrypt --private-key $PRIVATE_KEY

# Upload to existing dataset
haven upload ./video.mp4 --dataset 12345 --private-key $PRIVATE_KEY
```

### Download/Decrypt a File

```bash
# Download and decrypt
haven download <cid> --output ./restored.mp4 --private-key $PRIVATE_KEY

# List uploaded files
haven download list
```

### Configuration

```bash
# Set default configuration
haven config set private_key $PRIVATE_KEY
haven config set rpc_url https://api.calibration.node.glif.io/rpc/v1
haven config set default_dataset 12345

# View configuration
haven config show
```

### Recording (Coming Soon)

```bash
# Start recording a stream
haven record start <stream-url> --name "my-recording" --auto-upload

# List active recordings
haven record list

# Stop recording
haven record stop <recording-id>
```

## How It Works

### 1. Python CLI Starts JS Runtime

```python
# haven_cli/js_runtime/bridge.py
bridge = JSRuntimeBridge(JSRuntimeConfig(runtime="deno"))
bridge.start()  # Spawns: deno run --allow-all main.ts
```

### 2. Browser Environment Initialized

```typescript
// js-services/browser-shim.ts
await setupBrowserEnvironment();
// Sets up localStorage, window, document, etc.
```

### 3. Services Initialized

```typescript
// js-services/main.ts
const litService = new LitService();
const synapseService = new SynapseService();
```

### 4. JSON-RPC Communication

```
Python                    Deno
─────────────────────────────────────
{"method":"lit.encryptFile",...}
─────────────────────────────────────>
                          ┌─────────┐
                          │Encrypt  │
                          └─────────┘
<─────────────────────────────────────
{"result":{"encryptedFile":"...",...}}
```

## Project Structure

```
haven-cli-example/
├── haven_cli/                 # Python CLI code
│   ├── main.py               # Entry point
│   ├── js_runtime/           # JS runtime bridge
│   │   └── bridge.py
│   ├── commands/             # CLI commands
│   │   ├── upload.py
│   │   ├── download.py
│   │   ├── config.py
│   │   └── record.py
│   └── config.py             # Config management
├── js-services/              # TypeScript services for Deno
│   ├── main.ts               # Entry point
│   ├── browser-shim.ts       # Browser environment
│   ├── lit-wrapper.ts        # Lit SDK wrapper
│   ├── synapse-wrapper.ts    # Synapse SDK wrapper
│   └── config.ts             # Config utilities
├── pyproject.toml
└── README.md
```

## Comparison with yt-dlp

| Aspect | yt-dlp | Haven CLI |
|--------|--------|-----------|
| **Primary Runtime** | Deno | Deno |
| **Use Case** | YouTube extraction | Encrypted video storage |
| **Browser Sim** | JS challenge solving | Lit/Synapse SDK execution |
| **Communication** | JSON-RPC over stdio | JSON-RPC over stdio |
| **Key Pattern** | Extract JS from page → Execute in Deno | Load SDKs → Execute with browser stubs |

## Development

### Running Tests

```bash
pytest tests/
```

### Type Checking

```bash
# Python
mypy haven_cli/

# TypeScript (Deno)
cd js-services
deno check *.ts
```

### Linting

```bash
# Python
ruff check haven_cli/

# TypeScript
deno lint
```

## Future Enhancements

1. **Native Binary**: Bundle with PyInstaller + Deno compile
2. **Background Daemon**: Keep JS runtime alive for multiple operations
3. **Parallel Uploads**: Queue multiple files for upload
4. **Resume Support**: Resume interrupted uploads
5. **Direct IPFS**: IPFS retrieval without Filecoin round-trip

## License

MIT License - See LICENSE file
