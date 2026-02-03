# Haven Headless CLI Design

## Executive Summary

This document proposes a headless CLI version of Haven Player that leverages the existing frontend packages (Lit Protocol, Synapse SDK) without requiring a browser environment. The design is inspired by **yt-dlp's JavaScript Challenge Provider (JSC) architecture**, which uses Deno as a browser emulator to execute JavaScript that would normally run in a browser.

## Current Architecture Problem

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Haven Architecture               │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐        ┌──────────────────────────────┐   │
│  │   Frontend   │◄──────►│         Backend              │   │
│  │  (Electron)  │  HTTP  │  (Python FastAPI)            │   │
│  │              │        │                              │   │
│  │ • Lit SDK    │        │ • Stream Management          │   │
│  │ • Synapse    │        │ • Recording                  │   │
│  │ • React UI   │        │ • Job Scheduling             │   │
│  └──────────────┘        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Problems:**
1. **Two-process requirement**: Frontend (Electron) + Backend (Python) must both run
2. **Frontend packages depend on browser APIs**: `localStorage`, `window`, `crypto.subtle`, etc.
3. **Cannot run headless**: Requires GUI for Electron to function
4. **Resource overhead**: Electron consumes significant memory even for background tasks

## Proposed Headless CLI Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Haven CLI Architecture (Headless)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                    Haven CLI (Python)                           │      │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │      │
│   │  │   Command   │  │   Upload    │  │    Recording Manager    │ │      │
│   │  │   Router    │  │   Manager   │  │                         │ │      │
│   │  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘ │      │
│   │         │                │                                      │      │
│   │  ┌──────▼────────────────▼────────────────┐                     │      │
│   │  │      JS Runtime Bridge (Deno)          │                     │      │
│   │  │  ┌──────────────┐  ┌──────────────┐   │                     │      │
│   │  │  │  Lit Service │  │ Synapse Svc  │   │                     │      │
│   │  │  │  (Wrapped)   │  │  (Wrapped)   │   │                     │      │
│   │  │  └──────────────┘  └──────────────┘   │                     │      │
│   │  └────────────────────────────────────────┘                     │      │
│   │                          │                                      │      │
│   │  ┌───────────────────────▼──────────────────────┐               │      │
│   │  │        Browser Environment Simulator         │               │      │
│   │  │  • localStorage (file-backed)                │               │      │
│   │  │  • crypto.subtle (Web Crypto API)            │               │      │
│   │  │  • window, document, navigator (stubs)       │               │      │
│   │  └──────────────────────────────────────────────┘               │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                     Network Layer                               │      │
│   │         (Lit Nodes, Filecoin, Web3, IPFS)                       │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Patterns from yt-dlp

### 1. JavaScript Runtime Abstraction

yt-dlp abstracts multiple JavaScript runtimes behind a common interface:

```python
# yt-dlp/yt_dlp/utils/_jsruntime.py pattern
class JsRuntime(ABC):
    @functools.cached_property
    def info(self) -> JsRuntimeInfo | None:
        return self._info()
    
    @abc.abstractmethod
    def _info(self) -> JsRuntimeInfo | None:
        raise NotImplementedError

class DenoJsRuntime(JsRuntime):
    MIN_SUPPORTED_VERSION = (2, 0, 0)
    # ... implementation

class NodeJsRuntime(JsRuntime):
    MIN_SUPPORTED_VERSION = (20, 0, 0)
    # ... implementation
```

**Haven CLI Adaptation:**
- Primary runtime: **Deno** (supports npm packages, TypeScript out-of-the-box)
- Fallback: **Node.js** (if Deno unavailable)

### 2. Browser Environment Simulation

yt-dlp sets up a fake browser environment before executing JS challenges:

```javascript
// yt-dlp/yt_dlp/extractor/youtube/jsc/_builtin/vendor/yt.solver.core.js
const setupNodes = meriyah.parse(`
if (typeof globalThis.XMLHttpRequest === "undefined") {
    globalThis.XMLHttpRequest = { prototype: {} };
}
const window = Object.create(null);
if (typeof URL === "undefined") {
    window.location = {
        hash: "",
        host: "www.youtube.com",
        hostname: "www.youtube.com",
        href: "https://www.youtube.com/watch?v=yt-dlp-wins",
        origin: "https://www.youtube.com",
        password: "",
        pathname: "/watch",
        port: "",
        protocol: "https:",
        search: "?v=yt-dlp-wins",
        username: "",
    };
}
if (typeof globalThis.document === "undefined") {
    globalThis.document = Object.create(null);
}
if (typeof globalThis.navigator === "undefined") {
    globalThis.navigator = Object.create(null);
}
if (typeof globalThis.self === "undefined") {
    globalThis.self = globalThis;
}
`);
```

**Haven CLI Adaptation:**
- Create `haven-shim.ts` that sets up browser globals before importing Lit/Synapse
- Implement file-backed `localStorage` for persistence
- Provide Web Crypto API polyfills if needed

### 3. Provider Pattern with Auto-Discovery

yt-dlp uses a registry pattern for JS challenge providers:

```python
# yt-dlp/yt_dlp/extractor/youtube/jsc/provider.py
@register_provider
class DenoJCP(JsChallengeProvider):
    PROVIDER_NAME = 'deno'
    JS_RUNTIME_NAME = 'deno'
    # ... implementation

@register_preference(DenoJCP)
def preference(provider: JsChallengeProvider, requests: list[JsChallengeRequest]) -> int:
    return 1000  # Higher = preferred
```

**Haven CLI Adaptation:**
- Register multiple crypto providers (Deno-first, Node fallback)
- Preference system for runtime selection
- Graceful degradation if preferred runtime unavailable

## Implementation Architecture

### Directory Structure

```
haven-cli/
├── haven_cli/
│   ├── __init__.py
│   ├── main.py              # CLI entry point (Click/Typer)
│   ├── commands/
│   │   ├── __init__.py
│   │   ├── upload.py        # upload command
│   │   ├── download.py      # download/decrypt command
│   │   ├── record.py        # recording command
│   │   └── config.py        # configuration management
│   ├── js_runtime/
│   │   ├── __init__.py
│   │   ├── runtime.py       # Abstract JS runtime interface
│   │   ├── deno_runtime.py  # Deno-specific implementation
│   │   ├── node_runtime.py  # Node.js fallback
│   │   └── bridge.py        # Python ↔ JS communication
│   ├── browser_shim/
│   │   ├── __init__.py
│   │   ├── storage.py       # File-backed localStorage
│   │   └── environment.ts   # Browser environment stubs
│   └── services/
│       ├── __init__.py
│       ├── lit_service.py   # Lit Protocol wrapper
│       └── synapse_service.py # Synapse/Filecoin wrapper
├── js-services/             # TypeScript services for Deno
│   ├── lit-wrapper.ts       # Wrapped Lit SDK
│   ├── synapse-wrapper.ts   # Wrapped Synapse SDK
│   ├── browser-shim.ts      # Environment setup
│   └── types.ts             # Shared types
├── tests/
└── pyproject.toml
```

### Core Components

#### 1. JS Runtime Bridge (`js_runtime/bridge.py`)

```python
"""
Python-to-JavaScript bridge using JSON-RPC over stdio.
Similar to yt-dlp's subprocess-based JS execution.
"""

import json
import subprocess
from typing import Any, Dict, Optional
from dataclasses import dataclass

@dataclass
class JSRuntimeConfig:
    runtime: str = "deno"  # or "node"
    runtime_path: Optional[str] = None
    debug: bool = False

class JSRuntimeBridge:
    """
    Manages a JavaScript runtime subprocess for executing browser-based code.
    
    Communication protocol: JSON-RPC 2.0 over stdin/stdout
    """
    
    def __init__(self, config: JSRuntimeConfig):
        self.config = config
        self._process: Optional[subprocess.Popen] = None
        self._request_id = 0
        
    def start(self) -> None:
        """Start the JS runtime subprocess with browser shim."""
        if self.config.runtime == "deno":
            cmd = [
                self.config.runtime_path or "deno",
                "run",
                "--ext=ts",
                "--no-prompt",
                "--allow-read",      # For file operations
                "--allow-write",     # For temp files
                "--allow-net",       # For Lit/Synapse network calls
                "--allow-env",       # For env var access
                "--allow-sys",       # For system info
                "--unstable-bare-node-builtins", # Node compatibility
                "-",                 # Read from stdin
            ]
        else:
            cmd = [self.config.runtime_path or "node", "--input-type=module"]
            
        self._process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line buffered
        )
        
        # Inject browser shim and service code
        self._inject_runtime()
        
    def _inject_runtime(self) -> None:
        """Inject the browser shim and wrapped services."""
        runtime_code = self._load_runtime_code()
        self._send_raw(runtime_code)
        
    def _load_runtime_code(self) -> str:
        """Load bundled TypeScript/JavaScript runtime code."""
        # This would load from js-services/ directory
        # For Deno, we can import directly from URL or local file
        return """
// Browser environment simulation
import "./browser-shim.ts";

// Wrapped services
import { LitService } from "./lit-wrapper.ts";
import { SynapseService } from "./synapse-wrapper.ts";

// JSON-RPC handler
const services = {
    lit: new LitService(),
    synapse: new SynapseService(),
};

// Main message loop
for await (const line of console.iter) {
    const request = JSON.parse(line);
    const { id, method, params } = request;
    
    try {
        const [serviceName, methodName] = method.split(".");
        const service = services[serviceName];
        const result = await service[methodName](...params);
        
        console.log(JSON.stringify({
            jsonrpc: "2.0",
            id,
            result
        }));
    } catch (error) {
        console.log(JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { message: error.message, code: -32000 }
        }));
    }
}
"""
        
    def call(self, method: str, *params) -> Any:
        """Call a JavaScript service method."""
        self._request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        
        self._send_raw(json.dumps(request))
        response = self._read_response()
        
        if "error" in response:
            raise JSRuntimeError(response["error"]["message"])
        return response["result"]
        
    def _send_raw(self, data: str) -> None:
        """Send raw data to the JS subprocess."""
        if self._process and self._process.stdin:
            self._process.stdin.write(data + "\n")
            self._process.stdin.flush()
            
    def _read_response(self) -> Dict:
        """Read and parse a JSON-RPC response."""
        if self._process and self._process.stdout:
            line = self._process.stdout.readline()
            return json.loads(line)
        raise RuntimeError("Process not running")
        
    def stop(self) -> None:
        """Stop the JS runtime subprocess."""
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=5)
            self._process = None
```

#### 2. Browser Shim (`js-services/browser-shim.ts`)

```typescript
/**
 * Browser Environment Shim for Deno
 * 
 * Provides browser globals that Lit Protocol and Synapse SDK expect.
 * Based on yt-dlp's browser simulation approach.
 */

import { ensureDir } from "https://deno.land/std@0.200.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.200.0/path/mod.ts";

// ============================================================================
// Configuration
// ============================================================================

const HAVEN_CONFIG_DIR = (() => {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
    return path.join(home, ".haven-cli");
})();

const STORAGE_FILE = path.join(HAVEN_CONFIG_DIR, "storage.json");

// Ensure config directory exists
await ensureDir(HAVEN_CONFIG_DIR);

// ============================================================================
// localStorage Implementation (File-backed)
// ============================================================================

class FileStorage {
    private data: Map<string, string> = new Map();
    private loaded: boolean = false;

    async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const content = await Deno.readTextFile(STORAGE_FILE);
            const parsed = JSON.parse(content);
            this.data = new Map(Object.entries(parsed));
        } catch {
            // File doesn't exist or is corrupt, start fresh
            this.data = new Map();
        }
        this.loaded = true;
    }

    async save(): Promise<void> {
        const obj = Object.fromEntries(this.data);
        await Deno.writeTextFile(STORAGE_FILE, JSON.stringify(obj, null, 2));
    }

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
        // Debounce saves
        this.debouncedSave();
    }

    removeItem(key: string): void {
        this.data.delete(key);
        this.debouncedSave();
    }

    clear(): void {
        this.data.clear();
        this.debouncedSave();
    }

    private saveTimeout: number | null = null;
    private debouncedSave(): void {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.save(), 100);
    }
}

const storage = new FileStorage();
await storage.load();

// ============================================================================
// Global Browser Objects
// ============================================================================

// @ts-ignore: Define localStorage on globalThis
(globalThis as any).localStorage = {
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => storage.setItem(key, value),
    removeItem: (key: string) => storage.removeItem(key),
    clear: () => storage.clear(),
    length: 0, // Could be implemented if needed
    key: (_index: number) => null,
};

// window object
const window = {
    location: {
        href: "https://haven-player.local",
        origin: "https://haven-player.local",
        protocol: "https:",
        host: "haven-player.local",
        hostname: "haven-player.local",
        port: "",
        pathname: "/",
        search: "",
        hash: "",
    },
    navigator: {
        userAgent: "Haven-CLI/1.0 (Deno)",
        language: Deno.env.get("LANG")?.split(".")[0] || "en-US",
        platform: Deno.build.os,
        onLine: true,
    },
    crypto: globalThis.crypto, // Deno has Web Crypto API
    localStorage: (globalThis as any).localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};

// @ts-ignore
(globalThis as any).window = window;

// document object
const document = {
    createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
    }),
    head: {
        appendChild: () => {},
    },
    body: {
        appendChild: () => {},
    },
    documentElement: {
        style: {},
    },
    location: window.location,
    addEventListener: () => {},
    removeEventListener: () => {},
};

// @ts-ignore
(globalThis as any).document = document;

// navigator
// @ts-ignore
(globalThis as any).navigator = window.navigator;

// self
// @ts-ignore
(globalThis as any).self = globalThis;

// XMLHttpRequest stub (for legacy compatibility)
class XMLHttpRequest {
    open() {}
    send() {}
    setRequestHeader() {}
    onload: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
    onerror: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null;
}

// @ts-ignore
(globalThis as any).XMLHttpRequest = XMLHttpRequest;

// btoa/atob (Base64)
if (typeof (globalThis as any).btoa === "undefined") {
    (globalThis as any).btoa = (str: string) => btoa(str);
    (globalThis as any).atob = (str: string) => atob(str);
}

console.log("[BrowserShim] Environment initialized");
```

#### 3. Lit Service Wrapper (`js-services/lit-wrapper.ts`)

```typescript
/**
 * Lit Protocol Service Wrapper for Deno
 * 
 * Wraps the Lit SDK to provide a clean interface for the Python CLI.
 * Handles initialization, encryption, and decryption.
 */

// Import Lit SDK (npm packages work in Deno)
import { createLitClient, type LitClient } from "npm:@lit-protocol/lit-client@^8.2.3";
import { nagaDev } from "npm:@lit-protocol/networks@^8.4.1";
import { createAuthManager, storagePlugins } from "npm:@lit-protocol/auth@^8.2.3";
import { LitAccessControlConditionResource } from "npm:@lit-protocol/auth-helpers@^8.2.3";
import { ethers } from "npm:ethers@^6.16.0";

// Import from viem for account creation
import { privateKeyToAccount } from "npm:viem@^2.38.3/accounts";

export interface EncryptionResult {
    encryptedData: string; // base64
    metadata: {
        version: string;
        encryptedKey: string;
        keyHash: string;
        iv: string;
        algorithm: string;
        keyLength: number;
        accessControlConditions: any[];
        chain: string;
    };
}

export class LitService {
    private client: LitClient | null = null;
    private authManager: ReturnType<typeof createAuthManager> | null = null;
    private initPromise: Promise<LitClient> | null = null;

    async initialize(): Promise<void> {
        if (this.client) return;
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = (async (): Promise<LitClient> => {
            this.client = await createLitClient({ network: nagaDev });
            
            this.authManager = createAuthManager({
                storage: storagePlugins.localStorage({
                    appName: "haven-cli",
                    networkName: "naga-dev",
                }),
            });

            console.log("[LitService] Connected to Lit network (naga-dev)");
            return this.client;
        })();

        await this.initPromise;
    }

    async encryptFile(
        fileData: Uint8Array,
        privateKey: string
    ): Promise<EncryptionResult> {
        await this.initialize();

        const { hybridEncryptFile } = await import("./hybrid-crypto.ts");
        
        const result = await hybridEncryptFile(
            fileData.buffer as ArrayBuffer,
            privateKey,
            "ethereum",
            (msg: string) => console.log(`[Encrypt] ${msg}`)
        );

        return {
            encryptedData: btoa(String.fromCharCode(...result.encryptedFile)),
            metadata: result.metadata,
        };
    }

    async decryptFile(
        encryptedData: string, // base64
        metadata: any,
        privateKey: string
    ): Promise<Uint8Array> {
        await this.initialize();

        const { hybridDecryptFile } = await import("./hybrid-crypto.ts");

        const encryptedBytes = Uint8Array.from(
            atob(encryptedData),
            (c) => c.charCodeAt(0)
        );

        const blob = await hybridDecryptFile(
            encryptedBytes,
            metadata,
            privateKey,
            "application/octet-stream",
            (msg: string) => console.log(`[Decrypt] ${msg}`)
        );

        return new Uint8Array(await blob.arrayBuffer());
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.disconnect();
            this.client = null;
            this.authManager = null;
            this.initPromise = null;
        }
    }
}
```

#### 4. Synapse Service Wrapper (`js-services/synapse-wrapper.ts`)

```typescript
/**
 * Synapse SDK (Filecoin) Service Wrapper for Deno
 * 
 * Wraps the filecoin-pin Synapse SDK for headless operation.
 */

import {
    createUnixfsCarBuilder,
    type CarBuildResult,
} from "npm:filecoin-pin@0.14.0/core/unixfs";
import {
    initializeSynapse,
    createStorageContext,
    cleanupSynapseService,
} from "npm:filecoin-pin@0.14.0/core/synapse";
import { executeUpload, checkUploadReadiness } from "npm:filecoin-pin@0.14.0/core/upload";

export interface UploadConfig {
    privateKey: string;
    rpcUrl: string;
    dataSetId?: string;
    encryptionEnabled?: boolean;
}

export interface UploadResult {
    rootCid: string;
    pieceCid: string;
    pieceId: string;
    dataSetId?: string;
    transactionHash?: string;
    isEncrypted: boolean;
    encryptionMetadata?: string;
}

export class SynapseService {
    private carBuilder = createUnixfsCarBuilder();

    async uploadFile(
        filePath: string,
        config: UploadConfig,
        onProgress?: (stage: string, progress: number, message: string) => void
    ): Promise<UploadResult> {
        // Read file
        const fileData = await Deno.readFile(filePath);
        onProgress?.("reading", 5, `Read ${fileData.length} bytes`);

        // Initialize Synapse
        const synapse = await this.initializeSynapse(config);
        onProgress?.("init", 10, "Synapse initialized");

        // Create CAR file
        const carResult = await this.createCar(filePath, fileData);
        onProgress?.("car", 20, `CAR created: ${carResult.rootCid}`);

        // Check upload readiness
        const readiness = await checkUploadReadiness({
            synapse: synapse as any,
            fileSize: carResult.carBytes.length,
            autoConfigureAllowances: true,
        });

        if (readiness.status === "blocked") {
            throw new Error(`Upload blocked: ${readiness.validation?.errorMessage}`);
        }
        onProgress?.("payment", 30, "Payment validated");

        // Create storage context
        const { storage, providerInfo } = await createStorageContext(
            synapse as any,
            undefined, // logger
            config.dataSetId ? { dataset: { useExisting: config.dataSetId } } : undefined
        );
        onProgress?.("storage", 40, "Storage context created");

        // Execute upload
        const uploadResult = await executeUpload(
            { synapse, storage, providerInfo } as any,
            carResult.carBytes,
            carResult.rootCid,
            {
                contextId: filePath.split("/").pop() || "upload",
                onProgress: (event: { type: string }) => {
                    switch (event.type) {
                        case "onUploadComplete":
                            onProgress?.("upload", 80, "Upload complete");
                            break;
                        case "onPieceAdded":
                            onProgress?.("confirm", 90, "Piece added to dataset");
                            break;
                        case "onPieceConfirmed":
                            onProgress?.("confirm", 95, "Piece confirmed on-chain");
                            break;
                    }
                },
            }
        );

        onProgress?.("complete", 100, "Upload completed");

        // Cleanup
        await cleanupSynapseService();

        return {
            rootCid: carResult.rootCid,
            pieceCid: uploadResult.pieceCid,
            pieceId: uploadResult.pieceId,
            dataSetId: uploadResult.dataSetId,
            transactionHash: uploadResult.transactionHash,
            isEncrypted: config.encryptionEnabled || false,
        };
    }

    private async initializeSynapse(config: UploadConfig): Promise<any> {
        const initConfig = {
            privateKey: config.privateKey.startsWith("0x")
                ? config.privateKey
                : `0x${config.privateKey}`,
            rpcUrl: config.rpcUrl,
            telemetry: { sentryInitOptions: { enabled: false } },
        };

        return await initializeSynapse(initConfig);
    }

    private async createCar(
        filePath: string,
        _fileData: Uint8Array
    ): Promise<{ carBytes: Uint8Array; rootCid: string; carPath: string }> {
        // Create temp directory for CAR
        const tempDir = await Deno.makeTempDir();
        const carPath = `${tempDir}/output.car`;

        // Build CAR file
        const result: CarBuildResult = await this.carBuilder.buildCar(filePath, {
            logger: undefined,
            bare: true,
        });

        // Read CAR bytes
        const carBytes = await Deno.readFile(result.carPath);

        // Cleanup temp file
        await Deno.remove(result.carPath);
        await Deno.remove(tempDir);

        return {
            carBytes,
            rootCid: result.rootCid,
            carPath: result.carPath,
        };
    }
}
```

#### 5. CLI Commands (`commands/upload.py`)

```python
"""
Upload command for Haven CLI.
"""

import click
import asyncio
from pathlib import Path
from typing import Optional

from ..js_runtime.bridge import JSRuntimeBridge, JSRuntimeConfig
from ..config import load_config

@click.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--encrypt/--no-encrypt", default=True, help="Enable Lit encryption")
@click.option("--private-key", envvar="HAVEN_PRIVATE_KEY", help="Ethereum private key")
@click.option("--rpc-url", envvar="HAVEN_RPC_URL", help="Filecoin RPC URL")
@click.option("--dataset", help="Existing dataset ID to add to")
@click.option("--runtime", default="deno", type=click.Choice(["deno", "node"]))
def upload(
    file_path: str,
    encrypt: bool,
    private_key: Optional[str],
    rpc_url: Optional[str],
    dataset: Optional[str],
    runtime: str,
):
    """Upload a file to Filecoin with optional Lit encryption."""
    
    config = load_config()
    
    # Validate inputs
    if not private_key:
        private_key = config.get("private_key")
    if not private_key:
        raise click.UsageError("Private key required (use --private-key or HAVEN_PRIVATE_KEY)")
        
    if not rpc_url:
        rpc_url = config.get("rpc_url", "https://api.calibration.node.glif.io/rpc/v1")
    
    # Run async upload
    asyncio.run(_upload_async(
        file_path=file_path,
        private_key=private_key,
        rpc_url=rpc_url,
        encrypt=encrypt,
        dataset=dataset,
        runtime=runtime,
    ))

async def _upload_async(
    file_path: str,
    private_key: str,
    rpc_url: str,
    encrypt: bool,
    dataset: Optional[str],
    runtime: str,
):
    """Async upload implementation."""
    
    # Initialize JS runtime bridge
    bridge = JSRuntimeBridge(JSRuntimeConfig(runtime=runtime))
    bridge.start()
    
    try:
        # Encrypt if requested
        file_to_upload = file_path
        encryption_metadata = None
        
        if encrypt:
            click.echo("🔐 Encrypting file with Lit Protocol...")
            
            # Read file
            with open(file_path, "rb") as f:
                file_data = f.read()
            
            # Encrypt via Lit service
            encrypt_result = bridge.call(
                "lit.encryptFile",
                list(file_data),  # Convert bytes to list for JSON serialization
                private_key,
            )
            
            encryption_metadata = encrypt_result["metadata"]
            
            # Write encrypted file to temp
            encrypted_data = bytes(encrypt_result["encryptedData"], "utf-8")  # base64
            temp_path = f"{file_path}.encrypted"
            with open(temp_path, "wb") as f:
                f.write(encrypted_data)
            file_to_upload = temp_path
            
            click.echo("✅ Encryption complete")
        
        # Upload to Filecoin
        click.echo("📤 Uploading to Filecoin...")
        
        def progress_handler(stage: str, progress: int, message: str):
            click.echo(f"  [{progress}%] {stage}: {message}")
        
        # Register progress callback (implementation detail omitted)
        upload_result = bridge.call(
            "synapse.uploadFile",
            file_to_upload,
            {
                "privateKey": private_key,
                "rpcUrl": rpc_url,
                "dataSetId": dataset,
                "encryptionEnabled": encrypt,
            },
        )
        
        click.echo("\n✅ Upload successful!")
        click.echo(f"   Root CID: {upload_result['rootCid']}")
        click.echo(f"   Piece CID: {upload_result['pieceCid']}")
        if dataset:
            click.echo(f"   Dataset ID: {upload_result.get('dataSetId')}")
        if encrypt:
            click.echo(f"   Encryption: Enabled (metadata stored)")
        
        # Save upload record
        _save_upload_record(upload_result, encryption_metadata)
        
    finally:
        bridge.stop()
        
        # Cleanup temp encrypted file
        if encrypt and file_to_upload != file_path:
            Path(file_to_upload).unlink(missing_ok=True)

def _save_upload_record(result: dict, encryption_metadata: Optional[dict]):
    """Save upload record to local database."""
    # Implementation: save to SQLite or JSON file
    pass
```

## Usage Examples

### 1. Upload a File

```bash
# Basic upload with encryption (default)
haven upload ./my-video.mp4 --private-key $PRIVATE_KEY

# Upload without encryption
haven upload ./my-video.mp4 --no-encrypt --private-key $PRIVATE_KEY

# Upload to existing dataset
haven upload ./my-video.mp4 --dataset 12345 --private-key $PRIVATE_KEY

# Use Node.js instead of Deno
haven upload ./my-video.mp4 --runtime node --private-key $PRIVATE_KEY
```

### 2. Download/Decrypt a File

```bash
# Download and decrypt
haven download <cid> --output ./restored-video.mp4 --private-key $PRIVATE_KEY

# Download from specific provider
haven download <cid> --provider <provider-address> --output ./video.mp4
```

### 3. Recording Operations

```bash
# Start recording a stream
haven record start <stream-url> --name "my-recording" --auto-upload

# List active recordings
haven record list

# Stop recording
haven record stop <recording-id>
```

### 4. Configuration

```bash
# Set default configuration
haven config set private_key $PRIVATE_KEY
haven config set rpc_url https://api.calibration.node.glif.io/rpc/v1
haven config set default_dataset 12345

# View configuration
haven config show
```

## Migration Strategy

### Phase 1: JS Runtime Bridge (Week 1-2)
1. Implement `JSRuntimeBridge` with Deno support
2. Create `browser-shim.ts` for environment simulation
3. Port `hybridCrypto.ts` to Deno

### Phase 2: Service Wrappers (Week 2-3)
1. Wrap Lit SDK for Deno
2. Wrap Synapse SDK for Deno
3. Implement Python bindings

### Phase 3: CLI Commands (Week 3-4)
1. Implement upload command
2. Implement download/decrypt command
3. Add configuration management

### Phase 4: Recording Integration (Week 4-5)
1. Port recording logic from backend
2. Integrate with JS runtime for uploads
3. Background recording daemon mode

### Phase 5: Testing & Optimization (Week 5-6)
1. End-to-end testing
2. Performance optimization
3. Documentation

## Benefits

1. **Single Binary**: No need for separate frontend/backend processes
2. **Headless Operation**: Run on servers without GUI
3. **Resource Efficient**: No Electron overhead
4. **Scriptable**: Easy to integrate into automation pipelines
5. **Familiar API**: Leverages proven yt-dlp patterns
6. **Future-Proof**: Deno's npm compatibility ensures package updates work

## Comparison with yt-dlp

| Feature | yt-dlp | Haven CLI |
|---------|--------|-----------|
| **Primary Runtime** | Deno | Deno |
| **Fallback Runtime** | Node.js, QuickJS | Node.js |
| **Browser Sim** | JS Challenge solving | Lit/Synapse SDK execution |
| **Communication** | JSON-RPC over stdio | JSON-RPC over stdio |
| **Network Layer** | HTTP requests | Web3/Lit/Filecoin |
| **Use Case** | Video extraction | Encrypted video storage |

## Conclusion

This design leverages yt-dlp's proven architecture for running browser-based JavaScript in a headless environment. By using Deno as a JavaScript runtime with browser API shims, we can execute the existing Lit Protocol and Synapse SDK code without modification, while providing a clean Python CLI interface for users.
