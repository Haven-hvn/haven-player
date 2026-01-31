# Haven Player: Retrieval Strategy Migration Plan

**Status:** Ready for Implementation  
**Priority:** High  
**Estimated Effort:** 3-5 days  
**Based on:** Synapse SDK Retrieval Migration Plan v1.0

---

## 1. Executive Summary

Haven Player currently uses `https://ipfs.io` for video content retrieval. This approach, while functional, lacks cryptographic validation, CDN optimization, and guaranteed availability for Filecoin-stored content.

### Current Flow (IPFS.io Gateway)
```
Video Playback Request → playbackResolver.ts → ipfs.io/ipfs/{rootCid} → IPFS Network → Video Content
                                                             ↓
                                    No validation, no CDN, no provider awareness
```

### Target Flow (Synapse SDK Native)
```
Video Playback Request → AdaptiveRetrievalService → Synapse SDK → FOC Providers → Video Content
                                          ↓                              ↓
                                   CDN (FilBeam) fast path       PieceCID validation
```

---

## 2. Current Implementation Analysis

### 2.1 IPFS Retrieval Code Locations

| File | Line(s) | Purpose |
|------|---------|---------|
| `frontend/src/services/playbackResolver.ts` | 7, 36-43 | Builds IPFS gateway URLs |
| `frontend/src/services/playbackResolver.ts` | 47-110 | Resolves playback source (local/IPFS) |
| `backend/app/api/config.py` | 18 | Default IPFS gateway constant |
| `backend/app/api/config.py` | 346-354 | Gateway config endpoints |
| `backend/app/services/arkiv_sync.py` | 478-495 | Downloads VLM JSON from IPFS |
| `backend/app/services/arkiv_sync.py` | 866-870 | Downloads video for metadata recalculation |
| `frontend/src/utils/explorerLinks.ts` | 139-147 | Generates IPFS gateway links |
| `frontend/src/components/VideoPlayer.tsx` | 365, 379 | Fetches encrypted video data |

### 2.2 Database Schema (Video Model)

```python
# backend/app/models/video.py
filecoin_root_cid: Mapped[Optional[str]]      # Currently used for IPFS retrieval
filecoin_piece_cid: Mapped[Optional[str]]     # Available but unused for retrieval
filecoin_piece_id: Mapped[Optional[int]]      # Available but unused
filecoin_data_set_id: Mapped[Optional[str]]   # Needed for Synapse retrieval
```

**Key Issue:** The app uses `rootCid` for IPFS retrieval but ignores `pieceCid` which is required for Synapse SDK verified downloads.

### 2.3 Upload Flow (Already Correct)

```typescript
// frontend/src/services/filecoinService.ts
const uploadResult = await executeUpload(synapseService, carBytes, rootCid, {...});
return {
  rootCid: rootCid.toString(),
  pieceCid: uploadResult.pieceCid,  // ✅ Already captured
  pieceId: uploadResult.pieceId,     // ✅ Already captured
  dataSetId: uploadResult.dataSetId, // ✅ Already captured
  // ...
};
```

---

## 3. Migration Strategy

### Phase 1: Backend Retrieval Service (Day 1-2)

Create a new adaptive retrieval service in the backend that:
1. Tries Synapse SDK download first (using pieceCid)
2. Falls back to IPFS gateway on failure
3. Validates content integrity

### Phase 2: Frontend Playback Resolver Update (Day 2-3)

Extend the playback resolver to:
1. Support Synapse SDK as primary retrieval method
2. Maintain IPFS fallback for backward compatibility
3. Add retrieval method preference (configurable)

### Phase 3: Backend Arkiv Sync Update (Day 3-4)

Update `_download_from_ipfs` in `arkiv_sync.py` to use the new adaptive retrieval.

### Phase 4: Testing & Validation (Day 4-5)

1. Unit tests for new retrieval service
2. Integration tests with testnet
3. Performance comparison

---

## 4. Implementation Guide

### 4.1 New Backend Service: `app/services/retrieval_service.py`

```python
"""
Adaptive Retrieval Service for Filecoin content.
Tries Synapse SDK first, falls back to IPFS gateway.
"""

import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Protocol

import requests
from arkiv import Arkiv
from arkiv.account import NamedAccount
from arkiv.provider import ProviderBuilder

logger = logging.getLogger(__name__)


class RetrievalStrategy(Enum):
    SYNAPSE = "synapse"      # Native Synapse SDK retrieval
    IPFS = "ipfs"            # IPFS gateway fallback
    ADAPTIVE = "adaptive"    # Try Synapse first, fallback to IPFS


@dataclass
class RetrievalConfig:
    """Configuration for retrieval operations."""
    strategy: RetrievalStrategy = RetrievalStrategy.ADAPTIVE
    synapse_timeout: int = 30  # seconds
    ipfs_timeout: int = 60     # seconds
    ipfs_gateway: str = "https://ipfs.io/ipfs/"
    with_cdn: bool = True      # Use FilBeam CDN when available
    retries: int = 3


class RetrievalError(Exception):
    """Custom error for retrieval failures."""
    
    def __init__(self, message: str, code: str, piece_cid: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.piece_cid = piece_cid


class SynapseClientProtocol(Protocol):
    """Protocol for Synapse storage client."""
    
    async def download(self, piece_cid: str) -> bytes:
        """Download content by PieceCID."""
        ...


class AdaptiveRetrievalService:
    """
    Adaptive retrieval service that prefers Synapse SDK
    but falls back to IPFS gateway when needed.
    """
    
    def __init__(
        self,
        private_key: Optional[str] = None,
        rpc_url: Optional[str] = None,
        config: Optional[RetrievalConfig] = None
    ):
        self.config = config or RetrievalConfig()
        self.private_key = private_key or os.getenv("FILECOIN_PRIVATE_KEY")
        self.rpc_url = rpc_url or os.getenv(
            "FILECOIN_RPC_URL", 
            "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1"
        )
        self._synapse_client: Optional[SynapseClientProtocol] = None
    
    async def _get_synapse_client(self) -> SynapseClientProtocol:
        """Lazy initialization of Synapse client."""
        if self._synapse_client is None:
            if not self.private_key:
                raise RetrievalError(
                    "Private key required for Synapse retrieval",
                    "MISSING_PRIVATE_KEY"
                )
            
            # Initialize Synapse SDK
            # Note: This requires adding Synapse SDK to backend requirements
            from filecoin_pin.core.synapse import initializeSynapse
            
            synapse = await initializeSynapse({
                "privateKey": self.private_key,
                "rpcUrl": self.rpc_url,
                "withCDN": self.config.with_cdn,
            })
            self._synapse_client = synapse.storage
        
        return self._synapse_client
    
    async def retrieve(
        self,
        piece_cid: str,
        root_cid: Optional[str] = None,
        fallback_to_ipfs: bool = True
    ) -> bytes:
        """
        Retrieve content using configured strategy.
        
        Args:
            piece_cid: The Filecoin PieceCID (required for Synapse)
            root_cid: The IPFS root CID (fallback for IPFS gateway)
            fallback_to_ipfs: Whether to fallback to IPFS on Synapse failure
            
        Returns:
            Content bytes
            
        Raises:
            RetrievalError: If retrieval fails
        """
        strategy = self.config.strategy
        
        # Try Synapse first if adaptive or explicit synapse strategy
        if strategy in (RetrievalStrategy.ADAPTIVE, RetrievalStrategy.SYNAPSE):
            try:
                return await self._retrieve_via_synapse(piece_cid)
            except RetrievalError as e:
                if strategy == RetrievalStrategy.SYNAPSE or not fallback_to_ipfs:
                    raise
                logger.warning(
                    "Synapse retrieval failed, falling back to IPFS: %s",
                    e
                )
        
        # Fallback to IPFS (requires root_cid)
        if not root_cid:
            raise RetrievalError(
                "root_cid required for IPFS fallback",
                "MISSING_ROOT_CID",
                piece_cid
            )
        
        return await self._retrieve_via_ipfs(root_cid)
    
    async def _retrieve_via_synapse(self, piece_cid: str) -> bytes:
        """Retrieve content using Synapse SDK."""
        try:
            client = await self._get_synapse_client()
            
            # Synapse SDK handles:
            # - Provider discovery
            # - Parallel fetching from multiple providers
            # - PieceCID validation
            # - CDN integration (if with_cdn=True)
            data = await client.download(piece_cid)
            
            logger.info(
                "Successfully retrieved content via Synapse SDK: %s",
                piece_cid
            )
            return data
            
        except Exception as e:
            raise RetrievalError(
                f"Synapse retrieval failed: {str(e)}",
                "SYNAPSE_RETRIEVAL_FAILED",
                piece_cid
            )
    
    async def _retrieve_via_ipfs(self, root_cid: str) -> bytes:
        """Retrieve content via IPFS gateway (legacy)."""
        url = f"{self.config.ipfs_gateway.rstrip('/')}/{root_cid}"
        
        for attempt in range(self.config.retries):
            try:
                response = requests.get(
                    url,
                    timeout=self.config.ipfs_timeout,
                    stream=True
                )
                response.raise_for_status()
                
                # Read content
                content = response.content
                
                logger.info(
                    "Successfully retrieved content via IPFS: %s",
                    root_cid
                )
                return content
                
            except requests.RequestException as e:
                logger.warning(
                    "IPFS retrieval attempt %d failed: %s",
                    attempt + 1,
                    e
                )
                if attempt == self.config.retries - 1:
                    raise RetrievalError(
                        f"IPFS retrieval failed after {self.config.retries} attempts",
                        "IPFS_RETRIEVAL_FAILED"
                    )
        
        raise RetrievalError(
            "Unexpected end of IPFS retrieval",
            "UNEXPECTED_ERROR"
        )


# Convenience function for simple retrieval
async def retrieve_content(
    piece_cid: str,
    root_cid: Optional[str] = None,
    strategy: str = "adaptive"
) -> bytes:
    """
    Convenience function for one-off retrievals.
    
    Usage:
        data = await retrieve_content(
            piece_cid=video.filecoin_piece_cid,
            root_cid=video.filecoin_root_cid
        )
    """
    config = RetrievalConfig(strategy=RetrievalStrategy(strategy))
    service = AdaptiveRetrievalService(config=config)
    return await service.retrieve(piece_cid, root_cid)
```

### 4.2 Frontend Service: `src/services/retrievalService.ts`

```typescript
/**
 * Adaptive Retrieval Service for Haven Player
 * Tries Synapse SDK first, falls back to IPFS gateway
 */

import { Synapse } from "@filoz/synapse-sdk";
import type { PieceCID } from "@filoz/synapse-sdk/types";

export type RetrievalStrategy = "synapse" | "ipfs" | "adaptive";

export interface RetrievalConfig {
  strategy: RetrievalStrategy;
  synapseTimeout: number;  // ms
  ipfsTimeout: number;     // ms
  ipfsGateway: string;
  withCdn: boolean;
}

export interface RetrievalOptions {
  pieceCid?: string;       // Preferred: Filecoin PieceCID for Synapse
  rootCid?: string;        // Fallback: IPFS root CID
  strategy?: RetrievalStrategy;
  fallbackToIpfs?: boolean;
}

export interface RetrievalResult {
  data: Uint8Array;
  method: "synapse" | "ipfs";
  duration: number;        // ms
  validated: boolean;      // PieceCID validated (Synapse only)
}

export class RetrievalError extends Error {
  constructor(
    message: string,
    public code: string,
    public pieceCid?: string
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}

class AdaptiveRetrievalService {
  private synapse: Synapse | null = null;
  private config: RetrievalConfig;
  private synapsePromise: Promise<Synapse> | null = null;

  constructor(config: Partial<RetrievalConfig> = {}) {
    this.config = {
      strategy: config.strategy ?? "adaptive",
      synapseTimeout: config.synapseTimeout ?? 30000,
      ipfsTimeout: config.ipfsTimeout ?? 60000,
      ipfsGateway: config.ipfsGateway ?? "https://ipfs.io/ipfs/",
      withCdn: config.withCdn ?? true,
    };
  }

  /**
   * Initialize Synapse SDK (lazy singleton)
   */
  private async getSynapse(): Promise<Synapse> {
    if (this.synapse) return this.synapse;
    
    // Return existing initialization promise if in progress
    if (this.synapsePromise) return this.synapsePromise;

    this.synapsePromise = this.initializeSynapse();
    
    try {
      this.synapse = await this.synapsePromise;
      return this.synapse;
    } catch (error) {
      this.synapsePromise = null;
      throw error;
    }
  }

  private async initializeSynapse(): Promise<Synapse> {
    // Get config from main process via IPC
    const filecoinConfig = await window.electron.invoke("getFilecoinConfig");
    
    if (!filecoinConfig?.privateKey) {
      throw new RetrievalError(
        "Private key required for Synapse retrieval",
        "MISSING_PRIVATE_KEY"
      );
    }

    return await Synapse.create({
      privateKey: filecoinConfig.privateKey,
      rpcUrl: filecoinConfig.rpcUrl,
      withCDN: this.config.withCdn,
      withIpni: true,
    });
  }

  /**
   * Retrieve content using configured strategy
   */
  async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
    const {
      pieceCid,
      rootCid,
      strategy = this.config.strategy,
      fallbackToIpfs = true,
    } = options;

    const startTime = performance.now();

    // Try Synapse first if adaptive or explicit
    if (strategy === "adaptive" || strategy === "synapse") {
      if (pieceCid) {
        try {
          const data = await this.retrieveViaSynapse(pieceCid);
          return {
            data,
            method: "synapse",
            duration: performance.now() - startTime,
            validated: true,
          };
        } catch (error) {
          if (strategy === "synapse" || !fallbackToIpfs) {
            throw error;
          }
          console.warn("Synapse retrieval failed, falling back to IPFS:", error);
        }
      } else if (strategy === "synapse") {
        throw new RetrievalError(
          "pieceCid required for Synapse retrieval",
          "MISSING_PIECE_CID"
        );
      }
    }

    // Fallback to IPFS
    if (!rootCid) {
      throw new RetrievalError(
        "rootCid required for IPFS retrieval",
        "MISSING_ROOT_CID"
      );
    }

    const data = await this.retrieveViaIpfs(rootCid);
    return {
      data,
      method: "ipfs",
      duration: performance.now() - startTime,
      validated: false,
    };
  }

  private async retrieveViaSynapse(pieceCid: string): Promise<Uint8Array> {
    const synapse = await this.getSynapse();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.synapseTimeout
    );

    try {
      // Synapse SDK handles provider discovery, parallel fetching, validation
      const data = await synapse.storage.download(pieceCid);
      clearTimeout(timeoutId);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Don't fallback on validation failure (security risk)
      if (error instanceof Error && 
          error.message.includes("verification failed")) {
        throw new RetrievalError(
          "Content validation failed - possible tampering",
          "VALIDATION_FAILED",
          pieceCid
        );
      }
      
      throw new RetrievalError(
        `Synapse retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
        "SYNAPSE_RETRIEVAL_FAILED",
        pieceCid
      );
    }
  }

  private async retrieveViaIpfs(rootCid: string): Promise<Uint8Array> {
    const url = `${this.config.ipfsGateway.replace(/\/$/, "")}/${rootCid}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.ipfsTimeout
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new RetrievalError(
          `IPFS retrieval failed: ${response.status}`,
          "IPFS_HTTP_ERROR"
        );
      }
      
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof RetrievalError) throw error;
      
      throw new RetrievalError(
        `IPFS retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
        "IPFS_RETRIEVAL_FAILED"
      );
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.synapse) {
      await this.synapse.cleanup?.();
      this.synapse = null;
    }
  }
}

// Singleton instance for app-wide use
let defaultService: AdaptiveRetrievalService | null = null;

export function getRetrievalService(
  config?: Partial<RetrievalConfig>
): AdaptiveRetrievalService {
  if (!defaultService || config) {
    defaultService = new AdaptiveRetrievalService(config);
  }
  return defaultService;
}

export async function retrieveContent(
  options: RetrievalOptions
): Promise<RetrievalResult> {
  const service = getRetrievalService();
  return service.retrieve(options);
}
```

### 4.3 Updated Playback Resolver

```typescript
// frontend/src/services/playbackResolver.ts

import { retrieveContent, RetrievalError } from "./retrievalService";

export interface SynapsePlaybackSource extends PlaybackSourceBase {
  type: "synapse";
  uri: string;              // blob URL from downloaded data
  pieceCid: string;
  duration: number;         // download time
  validated: boolean;       // PieceCID validated
}

// Update resolvePlaybackSource to support Synapse
export const resolvePlaybackSource = async (
  input: PlaybackResolutionInput
): Promise<PlaybackResolution> => {
  const {
    videoPath,
    rootCid,
    pieceCid,              // NEW: piece CID for Synapse
    gatewayConfig,
    checkFileExists,
    isEncrypted = false,
    litEncryptionMetadata = null,
    retrievalStrategy = "adaptive",  // NEW
  } = input;

  const fileExists = await checkFileExists(videoPath);
  const hasIpfsCid = Boolean(rootCid);
  const hasPieceCid = Boolean(pieceCid);

  // Try Synapse retrieval first if piece CID available and strategy allows
  if ((retrievalStrategy === "adaptive" || retrievalStrategy === "synapse") 
      && hasPieceCid && !fileExists) {
    try {
      const result = await retrieveContent({
        pieceCid: pieceCid!,
        rootCid: rootCid || undefined,
        strategy: "synapse",
      });

      // Create blob URL from downloaded data
      const blob = new Blob([result.data]);
      const blobUrl = URL.createObjectURL(blob);

      return {
        type: "synapse",
        uri: blobUrl,
        pieceCid: pieceCid!,
        duration: result.duration,
        validated: result.validated,
        isEncrypted,
        litEncryptionMetadata,
      };
    } catch (error) {
      if (retrievalStrategy === "synapse") {
        // Synapse explicitly requested but failed
        throw error;
      }
      // Adaptive: fall through to IPFS
      console.warn("Synapse retrieval failed, falling back to IPFS:", error);
    }
  }

  // Existing IPFS/local logic remains unchanged
  // ... (keep existing implementation)
};
```

### 4.4 Backend Arkiv Sync Update

```python
# backend/app/services/arkiv_sync.py

# Replace _download_from_ipfs with adaptive retrieval

async def _download_content_adaptive(
    piece_cid: Optional[str] = None,
    root_cid: Optional[str] = None,
    gateway_url: str = "https://ipfs.io/ipfs/"
) -> bytes:
    """
    Download content using adaptive retrieval strategy.
    
    Args:
        piece_cid: Filecoin PieceCID (preferred for Synapse)
        root_cid: IPFS root CID (fallback)
        gateway_url: IPFS gateway for fallback
        
    Returns:
        Content bytes
    """
    from app.services.retrieval_service import AdaptiveRetrievalService, RetrievalConfig
    
    config = RetrievalConfig(
        strategy=RetrievalStrategy.ADAPTIVE,
        ipfs_gateway=gateway_url
    )
    
    service = AdaptiveRetrievalService(config=config)
    
    try:
        return await service.retrieve(
            piece_cid=piece_cid,
            root_cid=root_cid,
            fallback_to_ipfs=True
        )
    finally:
        await service.dispose()


# Update usages in restore_catalog:
# OLD: file_content = _download_from_ipfs(download_cid)
# NEW: file_content = await _download_content_adaptive(
#          piece_cid=video.filecoin_piece_cid,
#          root_cid=download_cid
#      )
```

### 4.5 Environment Configuration

```bash
# .env file additions

# Retrieval Strategy: "synapse" | "ipfs" | "adaptive"
RETRIEVAL_STRATEGY=adaptive

# Synapse SDK settings
RETRIEVAL_SYNAPSE_TIMEOUT=30000
RETRIEVAL_IPFS_TIMEOUT=60000
RETRIEVAL_WITH_CDN=true
RETRIEVAL_RETRIES=3

# Feature flag for gradual rollout
RETRIEVAL_SYNAPSE_ENABLED=true
```

---

## 5. API Changes

### 5.1 Backend API Endpoints

Add new endpoints to `backend/app/api/config.py`:

```python
@router.get("/retrieval-config")
def get_retrieval_config() -> dict:
    """Get current retrieval configuration."""
    return {
        "strategy": os.getenv("RETRIEVAL_STRATEGY", "adaptive"),
        "synapse_enabled": os.getenv("RETRIEVAL_SYNAPSE_ENABLED", "true").lower() == "true",
        "with_cdn": os.getenv("RETRIEVAL_WITH_CDN", "true").lower() == "true",
        "ipfs_gateway": load_gateway_config().base_url,
    }

@router.post("/retrieval/test")
async def test_retrieval(piece_cid: str, root_cid: Optional[str] = None) -> dict:
    """Test retrieval for a specific CID (diagnostic endpoint)."""
    from app.services.retrieval_service import AdaptiveRetrievalService
    
    service = AdaptiveRetrievalService()
    start = time.time()
    
    try:
        data = await service.retrieve(piece_cid, root_cid)
        return {
            "success": True,
            "size": len(data),
            "duration_ms": (time.time() - start) * 1000,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "duration_ms": (time.time() - start) * 1000,
        }
```

---

## 6. Testing Strategy

### 6.1 Unit Tests: `backend/tests/test_retrieval_service.py`

```python
import pytest
from app.services.retrieval_service import (
    AdaptiveRetrievalService,
    RetrievalConfig,
    RetrievalStrategy,
    RetrievalError,
)


@pytest.mark.asyncio
async def test_retrieve_via_ipfs_fallback():
    """Test IPFS fallback when Synapse fails."""
    service = AdaptiveRetrievalService(
        config=RetrievalConfig(strategy=RetrievalStrategy.ADAPTIVE)
    )
    
    # Mock Synapse to fail
    # Mock IPFS to succeed
    
    result = await service.retrieve(
        piece_cid="bafkzcib...",
        root_cid="QmTest...",
        fallback_to_ipfs=True
    )
    
    assert result is not None


@pytest.mark.asyncio
async def test_validation_failure_no_fallback():
    """Test that validation failures don't fallback to IPFS."""
    service = AdaptiveRetrievalService(
        config=RetrievalConfig(strategy=RetrievalStrategy.ADAPTIVE)
    )
    
    # Mock Synapse to fail with validation error
    
    with pytest.raises(RetrievalError) as exc_info:
        await service.retrieve(
            piece_cid="bafkzcib...",
            root_cid="QmTest...",
            fallback_to_ipfs=True
        )
    
    assert exc_info.value.code == "VALIDATION_FAILED"
```

### 6.2 Frontend Tests: `frontend/src/services/__tests__/retrievalService.test.ts`

```typescript
import { AdaptiveRetrievalService, RetrievalError } from "../retrievalService";

describe("AdaptiveRetrievalService", () => {
  it("should prefer Synapse when pieceCid provided in adaptive mode", async () => {
    const service = new AdaptiveRetrievalService({ strategy: "adaptive" });
    
    const result = await service.retrieve({
      pieceCid: "bafkzcib...",
      rootCid: "QmTest...",
    });
    
    expect(result.method).toBe("synapse");
    expect(result.validated).toBe(true);
  });

  it("should fallback to IPFS when Synapse fails", async () => {
    const service = new AdaptiveRetrievalService({ strategy: "adaptive" });
    
    // Mock Synapse to fail
    jest.spyOn(service as any, "retrieveViaSynapse").mockRejectedValue(
      new Error("Provider unavailable")
    );
    
    const result = await service.retrieve({
      pieceCid: "bafkzcib...",
      rootCid: "QmTest...",
      fallbackToIpfs: true,
    });
    
    expect(result.method).toBe("ipfs");
    expect(result.validated).toBe(false);
  });

  it("should not fallback on validation failure", async () => {
    const service = new AdaptiveRetrievalService({ strategy: "adaptive" });
    
    // Mock Synapse to fail with validation error
    jest.spyOn(service as any, "retrieveViaSynapse").mockRejectedValue(
      new RetrievalError("validation failed", "VALIDATION_FAILED")
    );
    
    await expect(
      service.retrieve({
        pieceCid: "bafkzcib...",
        rootCid: "QmTest...",
        fallbackToIpfs: true,
      })
    ).rejects.toThrow("validation failed");
  });
});
```

---

## 7. Migration Checklist

### Pre-Migration
- [ ] Review and approve this plan
- [ ] Set up Synapse SDK backend dependency
- [ ] Configure environment variables
- [ ] Set up monitoring for retrieval metrics

### Phase 1: Backend Service
- [ ] Create `app/services/retrieval_service.py`
- [ ] Add Synapse SDK to `requirements.txt`
- [ ] Add retrieval config endpoints
- [ ] Write unit tests

### Phase 2: Frontend Service
- [ ] Create `src/services/retrievalService.ts`
- [ ] Update `playbackResolver.ts` to use new service
- [ ] Update `VideoPlayer.tsx` for Synapse playback source
- [ ] Add retrieval strategy to settings UI

### Phase 3: Arkiv Sync Update
- [ ] Update `_download_from_ipfs` to use adaptive retrieval
- [ ] Update `_process_vlm_json_from_arkiv` to use adaptive retrieval
- [ ] Test restore catalog with Synapse retrieval

### Phase 4: Testing & Rollout
- [ ] Run full test suite
- [ ] Test with encrypted videos
- [ ] Performance comparison (Synapse vs IPFS)
- [ ] Deploy to staging
- [ ] Gradual rollout (feature flag)

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Synapse SDK dependency issues | High | Keep IPFS fallback, feature flag |
| Performance regression | Medium | A/B testing, metrics monitoring |
| Encrypted video compatibility | High | Thorough testing with Lit Protocol |
| Provider availability | Medium | Multiple provider retries built-in |
| Breaking existing playback | High | Gradual rollout, easy rollback |

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Retrieval success rate | >99% | Backend logs |
| Average retrieval time | <5s for <100MB | Frontend telemetry |
| Synapse vs IPFS speed | Synapse 20% faster | A/B test |
| Validation failure rate | <0.1% | Backend logs |
| User-reported playback issues | Zero | Issue tracker |

---

## 10. References

- Original Synapse SDK Plan: `RETRIEVAL_MIGRATION_PLAN.md`
- Video Model: `backend/app/models/video.py`
- Playback Resolver: `frontend/src/services/playbackResolver.ts`
- Arkiv Sync: `backend/app/services/arkiv_sync.py`
- Filecoin Service: `frontend/src/services/filecoinService.ts`
