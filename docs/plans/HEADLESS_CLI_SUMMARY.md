# Haven Headless CLI - Summary

This document provides a summary of the headless CLI design for Haven Player, based on yt-dlp's JavaScript runtime abstraction pattern.

## Documents in this Directory

| Document | Description |
|----------|-------------|
| `headless-cli-design.md` | Full architecture design document (37KB) |
| `headless-cli-quickstart.md` | Quick start guide for users |
| `haven-cli-example/` | Complete working example implementation |

## Problem Statement

The current Haven Player requires:
1. **Electron frontend** - Heavy GUI process
2. **Python backend** - API server
3. **Both running simultaneously** - Complex deployment

**Goal**: Create a headless CLI that:
- Runs without GUI
- Uses existing frontend packages (Lit, Synapse)
- Runs as a single process
- Can be deployed on servers

## Solution: yt-dlp Pattern

yt-dlp solves a similar problem - it needs to execute JavaScript from YouTube (challenges, signatures) without a browser. Their solution:

1. **Abstract JS Runtime** - Support Deno, Node.js, QuickJS
2. **Browser Shim** - Provide `window`, `document`, `localStorage` in JS runtime
3. **JSON-RPC Bridge** - Python communicates with JS subprocess over stdio
4. **Provider Pattern** - Auto-discover and select best available runtime

## Haven CLI Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Haven CLI (Python)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Commands: upload, download, config, record                         │     │
│  │  Framework: Click (CLI), Rich (output)                              │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                     │                                         │
│  ┌──────────────────────────────────▼──────────────────────────────────┐      │
│  │                     JS Runtime Bridge                               │      │
│  │  • Manages Deno/Node subprocess                                     │      │
│  │  • JSON-RPC 2.0 over stdin/stdout                                  │      │
│  │  • Handles serialization (bytes ↔ base64)                          │      │
│  └─────────────────────────────────────────────────────────────────────┘      │
│                                     │                                         │
└─────────────────────────────────────┼─────────────────────────────────────────┘
                                      │
                                      ▼ Spawn subprocess
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Deno / Node.js Subprocess                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Browser Environment Shim (browser-shim.ts)                         │     │
│  │  • File-backed localStorage                                         │     │
│  │  • window, document, navigator stubs                                │     │
│  │  • Web Crypto API (native in Deno)                                  │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                     │                                         │
│  ┌──────────────────────────────────▼──────────────────────────────────┐      │
│  │  Service Wrappers                                                   │      │
│  │  ┌──────────────────┐  ┌──────────────────┐                        │      │
│  │  │  Lit Service     │  │ Synapse Service  │                        │      │
│  │  │  • encryptFile() │  │ • uploadFile()   │                        │      │
│  │  │  • decryptFile() │  │ • createCar()    │                        │      │
│  │  └──────────────────┘  └──────────────────┘                        │      │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                     │                                         │
└─────────────────────────────────────┼─────────────────────────────────────────┘
                                      │
                                      ▼ Network calls
┌──────────────────────────────────────────────────────────────────────────────┐
│  Lit Protocol              Filecoin/Synapse               IPFS/Retrieval    │
│  • Encryption/Decryption   • Storage deals                • Content routing   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Why Deno?

| Feature | Deno | Node.js |
|---------|------|---------|
| TypeScript | Native | Requires ts-node |
| npm packages | ✅ `npm:` specifier | Native |
| Permissions | Fine-grained | All or nothing |
| Single executable | `deno compile` | Requires bundling |
| Web Crypto | Native | Native |
| Startup time | Fast | Slower |

**Primary**: Deno (modern, TypeScript-first, secure)
**Fallback**: Node.js (if Deno unavailable)

### 2. Why JSON-RPC over stdio?

- **Simple**: No network ports, no HTTP server
- **Fast**: In-process communication
- **Safe**: Isolated process, easy to terminate
- **Portable**: Works the same on all platforms
- **Proven**: yt-dlp uses this pattern successfully

### 3. Why File-backed localStorage?

Lit SDK requires `localStorage` for session caching:
- Stores auth signatures
- Avoids re-signing on every operation
- File-backed → persists across CLI invocations

## File Structure

```
docs/
├── headless-cli-design.md          # Full design (37KB)
├── headless-cli-quickstart.md      # Quick start guide
├── HEADLESS_CLI_SUMMARY.md         # This file
└── haven-cli-example/              # Working implementation
    ├── pyproject.toml
    ├── README.md
    ├── haven_cli/                  # Python CLI
    │   ├── main.py
    │   ├── js_runtime/
    │   │   └── bridge.py          # JS runtime bridge
    │   ├── commands/
    │   │   ├── upload.py
    │   │   ├── download.py
    │   │   ├── config.py
    │   │   └── record.py
    │   └── config.py
    └── js-services/               # TypeScript services
        ├── main.ts                # Entry point
        ├── browser-shim.ts        # Browser environment
        ├── lit-wrapper.ts         # Lit SDK wrapper
        ├── synapse-wrapper.ts     # Synapse SDK wrapper
        └── config.ts              # Config utilities
```

## Usage Examples

### Basic Upload
```bash
haven upload ./video.mp4 --private-key 0x...
```

### Upload with Options
```bash
haven upload ./video.mp4 \
  --private-key 0x... \
  --rpc-url https://api.calibration.node.glif.io/rpc/v1 \
  --dataset 12345 \
  --encrypt
```

### Download
```bash
haven download <cid> --output ./restored.mp4 --private-key 0x...
```

### Configuration
```bash
haven config set private_key 0x...
haven config set rpc_url https://api.calibration.node.glif.io/rpc/v1
haven config show
```

## Comparison: Current vs Headless

| Aspect | Current (Electron) | Headless CLI |
|--------|-------------------|--------------|
| Processes | 2 (Electron + Python) | 1 (Python + Deno subprocess) |
| Memory | ~300MB+ | ~50MB |
| GUI Required | Yes | No |
| Server Deployment | Difficult | Easy |
| Automation | Limited | Full (shell scripts) |
| Startup Time | Slow | Fast |
| Resource Usage | High | Low |

## Migration Path

1. **Phase 1**: Implement JS runtime bridge (2 weeks)
2. **Phase 2**: Wrap Lit + Synapse SDKs (2 weeks)
3. **Phase 3**: Implement CLI commands (2 weeks)
4. **Phase 4**: Recording integration (2 weeks)
5. **Phase 5**: Testing & optimization (2 weeks)

## Benefits

1. **Single Binary**: One command to run everything
2. **Headless**: No GUI required, runs on servers
3. **Efficient**: Minimal resource usage
4. **Scriptable**: Easy CI/CD integration
5. **Compatible**: Uses same Lit/Synapse packages as frontend
6. **Future-proof**: Deno's npm compatibility ensures updates work

## Next Steps

1. Review the design document: `headless-cli-design.md`
2. Try the example: `cd docs/haven-cli-example && pip install -e "."`
3. Test with a small file: `haven upload ./test.mp4 --private-key 0x...`
4. Iterate based on feedback

## References

- **yt-dlp JavaScript Challenge Provider**: `yt-dlp/yt_dlp/extractor/youtube/jsc/`
- **yt-dlp Deno Runtime**: `yt-dlp/yt_dlp/extractor/youtube/jsc/_builtin/deno.py`
- **yt-dlp Browser Shim**: `yt-dlp/yt_dlp/extractor/youtube/jsc/_builtin/vendor/yt.solver.core.js`
- **Deno Documentation**: https://docs.deno.com/
- **Lit Protocol**: https://developer.litprotocol.com/
- **Synapse SDK**: https://github.com/filecoin-station/synapse
