# Haven Headless CLI - Quick Start Guide

## Overview

This guide shows you how to build and use the headless Haven CLI, which allows you to upload/download encrypted videos without running the full Electron frontend.

## Prerequisites

```bash
# 1. Python 3.10+
python --version

# 2. Deno 2.0+ (recommended)
curl -fsSL https://deno.land/install.sh | sh
# Or via package manager: https://docs.deno.com/runtime/getting_started/installation/

# 3. Verify Deno installation
deno --version  # Should show 2.0.0 or higher
```

## Installation

```bash
# Navigate to the example implementation
cd docs/haven-cli-example

# Install the Python package
pip install -e "."

# Verify installation
haven --help
```

## Configuration

```bash
# Set your Ethereum private key
export HAVEN_PRIVATE_KEY="0x..."

# Or set via config command
haven config set private_key "0x..."

# Set Filecoin RPC URL (Cal testnet)
haven config set rpc_url "https://api.calibration.node.glif.io/rpc/v1"

# View current config
haven config show
```

## Basic Usage

### Upload a File

```bash
# Upload with encryption (default)
haven upload ./my-video.mp4

# Upload without encryption
haven upload ./my-video.mp4 --no-encrypt

# Upload to specific dataset
haven upload ./my-video.mp4 --dataset 12345

# Specify private key inline
haven upload ./my-video.mp4 --private-key 0x...
```

Expected output:
```
📁 File: my-video.mp4 (156.32 MB)
🔐 Encrypting with Lit Protocol...
   Encrypted: 211.05 MB
📤 Uploading to Filecoin...
   [80%] Uploading to Filecoin...
   [90%] Piece added to dataset
   [95%] Piece confirmed on-chain
   [100%] Upload completed successfully

✅ Upload successful!
   Root CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
   Piece CID: baga6ea4seaqhmw3...
   Dataset ID: 12345
   Encryption: Enabled

Upload record saved.
```

### List Uploads

```bash
haven download list
```

Output:
```
Upload History (3 files)

📄 my-video.mp4
   CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
   Size: 156.32 MB
   Encrypted: ✓
   Date: 2024-01-15T10:30:00

📄 another-video.mp4
   CID: bafybeicae2w...x4x5
   Size: 89.12 MB
   Encrypted: ✓
   Date: 2024-01-14T16:45:00
```

### Download a File

```bash
# Download and decrypt using CID
haven download bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi \
  --output ./restored-video.mp4

# Download to specific directory
haven download <cid> --output ~/Downloads/ --private-key 0x...
```

## Advanced Usage

### Using Different JS Runtime

```bash
# Use Deno (default, recommended)
haven upload ./video.mp4 --runtime deno

# Use Node.js (fallback)
haven upload ./video.mp4 --runtime node
```

### Batch Upload

```bash
# Upload multiple files
for file in *.mp4; do
    haven upload "$file" --dataset 12345
done
```

### Automation Script

```bash
#!/bin/bash
# upload-and-verify.sh

FILE=$1
PRIVATE_KEY=$2

# Upload
OUTPUT=$(haven upload "$FILE" --private-key "$PRIVATE_KEY" --json)
CID=$(echo "$OUTPUT" | jq -r '.rootCid')

# Verify upload
haven download "$CID" --output "/tmp/verify-$(basename "$FILE")"

# Compare hashes
if diff <(sha256sum "$FILE") <(sha256sum "/tmp/verify-$(basename "$FILE")"); then
    echo "✅ Upload verified!"
else
    echo "❌ Verification failed!"
fi
```

## Troubleshooting

### "Deno not found"

```bash
# Make sure deno is in your PATH
export PATH="$HOME/.deno/bin:$PATH"

# Or use Node.js instead
haven upload ./file.mp4 --runtime node
```

### "Private key required"

```bash
# Set via environment variable
export HAVEN_PRIVATE_KEY="0x..."

# Or pass inline
haven upload ./file.mp4 --private-key "0x..."

# Or set permanently
haven config set private_key "0x..."
```

### Upload fails with "Payment setup incomplete"

You need to set up Filecoin payments for the calibration testnet:

```bash
# The Synapse SDK will attempt to auto-configure allowances
# but you may need FIL tokens on calibration network

# Check your wallet balance
# Get test FIL from: https://faucet.calibration.fildev.network/
```

### Encryption fails

```bash
# Try with verbose output
haven upload ./file.mp4 --verbose

# Check if Lit network is accessible
curl https://naga-dev.litprotocol.com/
```

## Architecture in 60 Seconds

```
┌─────────────┐     JSON-RPC      ┌─────────────────────────────┐
│   Python    │ ◄────────────────►│  Deno (JavaScript Runtime)  │
│   CLI       │   over stdio      │                             │
│  (Click)    │                   │  ┌───────────────────────┐  │
└─────────────┘                   │  │  Browser Shim         │  │
                                  │  │  - localStorage       │  │
                                  │  │  - window, document   │  │
                                  │  └───────────────────────┘  │
                                  │              │              │
                                  │  ┌───────────▼───────────┐  │
                                  │  │  Lit + Synapse SDKs   │  │
                                  │  └───────────────────────┘  │
                                  └─────────────────────────────┘
```

## Next Steps

- Read the full design document: [headless-cli-design.md](./headless-cli-design.md)
- Explore the example code: [haven-cli-example/](./haven-cli-example/)
- Check the main Haven documentation

## Migration from Electron App

| Feature | Electron App | Headless CLI |
|---------|--------------|--------------|
| Upload | Click UI | `haven upload file.mp4` |
| Download | Click UI | `haven download <cid> -o file.mp4` |
| Encryption | Toggle in UI | `--encrypt` / `--no-encrypt` |
| Config | Settings page | `haven config set key value` |
| Automation | ❌ | ✅ Shell scripts |
| Server Deployment | ❌ Heavy | ✅ Lightweight |
