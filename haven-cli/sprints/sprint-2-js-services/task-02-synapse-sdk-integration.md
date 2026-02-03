# Task 02: Synapse SDK / Filecoin Integration

## Assignee
Web3 Developer

## Priority
Critical

## Estimated Effort
4 days

## Description
Replace the stub implementation in `synapse-wrapper.ts` with actual Synapse SDK integration for Filecoin storage. This enables uploading encrypted video content to decentralized storage.

## Current State
- `js-services/synapse-wrapper.ts` has stub implementation:
  - `connect()` - Simulates connection
  - `upload()` - Generates fake CID, doesn't actually upload
  - `getStatus()` - Returns simulated status
  - `getCid()` - Generates fake CID from file hash
- All methods marked with TODO comments

## Requirements

### 1. Install Synapse SDK
```bash
# In js-services directory - actual package name may vary
deno add @synapse-storage/sdk
# OR if using direct Filecoin
deno add @filecoin-storage/client
```

### 2. Implement Real Connection
```typescript
import { SynapseClient } from '@synapse-storage/sdk';

class SynapseWrapperImpl implements SynapseWrapper {
  private client: SynapseClient | null = null;
  
  async connect(params: SynapseConnectParams): Promise<SynapseConnectResult> {
    const endpoint = params.endpoint ?? 'https://api.synapse.storage';
    const apiKey = params.apiKey ?? Deno.env.get('SYNAPSE_API_KEY');
    
    if (!apiKey) {
      throw new Error('Synapse API key required');
    }
    
    this.client = new SynapseClient({
      endpoint,
      apiKey,
    });
    
    // Verify connection
    await this.client.ping();
    
    this._isConnected = true;
    return {
      connected: true,
      endpoint,
    };
  }
}
```

### 3. Implement Real Upload
```typescript
async upload(
  params: SynapseUploadParams,
  onProgress?: ProgressCallback
): Promise<SynapseUploadResult> {
  if (!this.client) {
    throw new Error('Synapse not connected');
  }
  
  const { filePath, metadata } = params;
  
  // Read file
  const fileData = await Deno.readFile(filePath);
  
  // Create upload with progress tracking
  const result = await this.client.upload(fileData, {
    metadata,
    onProgress: (uploaded, total) => {
      onProgress?.({
        bytesUploaded: uploaded,
        totalBytes: total,
        percentage: Math.round((uploaded / total) * 100),
      });
    },
  });
  
  return {
    cid: result.cid,
    size: result.size,
    uploadedAt: new Date().toISOString(),
    dealId: result.dealId,
  };
}
```

### 4. Implement Status Checking
```typescript
async getStatus(params: SynapseStatusParams): Promise<SynapseStatusResult> {
  if (!this.client) {
    throw new Error('Synapse not connected');
  }
  
  const { cid } = params;
  const status = await this.client.getStatus(cid);
  
  return {
    cid,
    status: status.state, // 'pending', 'active', 'expired'
    deals: status.deals.map(deal => ({
      dealId: deal.id,
      provider: deal.provider,
      status: deal.status,
      startEpoch: deal.startEpoch,
      endEpoch: deal.endEpoch,
    })),
  };
}
```

### 5. Implement Download
Add download functionality (currently missing):
```typescript
async download(params: {
  cid: string;
  outputPath: string;
  onProgress?: ProgressCallback;
}): Promise<{ success: boolean; size: number }> {
  if (!this.client) {
    throw new Error('Synapse not connected');
  }
  
  const { cid, outputPath, onProgress } = params;
  
  const data = await this.client.download(cid, {
    onProgress: (downloaded, total) => {
      onProgress?.({
        bytesUploaded: downloaded,
        totalBytes: total,
        percentage: Math.round((downloaded / total) * 100),
      });
    },
  });
  
  await Deno.writeFile(outputPath, data);
  
  return {
    success: true,
    size: data.byteLength,
  };
}
```

### 6. CAR File Creation
Implement proper CAR (Content Addressable aRchive) file creation:
```typescript
async createCar(params: {
  filePath: string;
  outputPath?: string;
}): Promise<{ carPath: string; rootCid: string }> {
  // Create CAR file for Filecoin upload
  // This may require IPFS libraries
}
```

### 7. Add to Main.ts
Register new methods in the RPC handler:
```typescript
// In main.ts methods object
'synapse.download': async (params: unknown) => {
  if (!synapseWrapper?.isConnected) {
    throw new Error('Synapse not connected');
  }
  return await synapseWrapper.download(params as Record<string, unknown>);
},
```

## Files to Modify

### Modify
- `js-services/synapse-wrapper.ts` - Replace stub with real implementation
- `js-services/main.ts` - Add download method handler
- `js-services/types.ts` - Add download types
- `js-services/deno.json` - Add Synapse/Filecoin dependencies

## Acceptance Criteria
- [ ] Can connect to Synapse/Filecoin storage
- [ ] Can upload files and receive valid CID
- [ ] Upload progress is reported accurately
- [ ] Can check status of uploaded files
- [ ] Can download files by CID
- [ ] Deal information is correctly retrieved
- [ ] Proper error handling for network issues
- [ ] Integration test with actual storage

## Technical Notes
- CIDs should be valid IPFS CIDv1 format
- Consider chunking for large files (>100MB)
- Implement retry logic for network failures
- CAR files are preferred for Filecoin deals
- Store deal IDs for later verification

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app frontend has a **complete, production-tested Filecoin upload implementation** using the `filecoin-pin` package:

#### Source Files to Reference:
1. **`frontend/src/services/filecoinService.ts`** - Complete Filecoin upload service
   - Uses `filecoin-pin` package (Synapse SDK wrapper)
   - CAR file creation with UnixFS
   - Size validation with encryption overhead calculation
   - Progress tracking with time-based estimation
   - Payment validation before upload
   - **Reuse Level: 65%** - Core logic portable, needs Deno adaptation

#### Key Architecture to Port:

```typescript
// From frontend/src/services/filecoinService.ts - Package imports
import {
  createUnixfsCarBuilder,
  type CarBuildResult,
} from 'filecoin-pin/core/unixfs';
import {
  initializeSynapse as initSynapse,
  createStorageContext,
  cleanupSynapseService,
} from 'filecoin-pin/core/synapse';
import { executeUpload, checkUploadReadiness } from 'filecoin-pin/core/upload';
```

```typescript
// From frontend/src/services/filecoinService.ts - Size validation
const MAX_UPLOAD_SIZE = 1_065_353_216; // ~1 GiB (hard limit from Synapse SDK)
const MIN_UPLOAD_SIZE = 127; // Minimum size for PieceCIDv2 calculation
const ENCRYPTION_OVERHEAD_FACTOR = 1.35; // Base64 encoding overhead (~35%)
const CAR_OVERHEAD_FACTOR = 1.01; // CAR file overhead (~1%)

export function validateFilecoinUploadSize(
  fileSize: number,
  encryptionEnabled: boolean = false
): FilecoinSizeValidationResult {
  // Pre-flight validation to avoid wasting time on files that will fail
  const projectedSize = calculateProjectedSize(fileSize, encryptionEnabled);
  if (projectedSize > MAX_UPLOAD_SIZE) {
    return { valid: false, reason: 'TOO_LARGE', ... };
  }
  return { valid: true, ... };
}
```

```typescript
// From frontend/src/services/filecoinService.ts - Upload flow
export async function uploadVideoToFilecoin(options: UploadOptions): Promise<FilecoinUploadResult> {
  // Step 0: Validate file size
  const sizeValidation = validateFileForFilecoinUpload(file, config.encryptionEnabled);
  
  // Step 1: Encrypt if enabled (uses Lit Protocol)
  if (config.encryptionEnabled) {
    const encryptResult = await encryptFile(fileBuffer, config.privateKey);
    fileToUpload = new File([encryptResult.encryptedData], `${file.name}.encrypted`);
  }
  
  // Step 2: Create CAR file
  const { carBytes, rootCid } = await createCarFromVideo(fileToUpload);
  
  // Step 3: Initialize Synapse SDK
  const synapse = await initializeSynapseSDK(config, logger);
  
  // Step 4: Check payment readiness
  const readiness = await checkUploadReadiness({ synapse, fileSize: carBytes.length });
  
  // Step 5: Create storage context
  const { storage, providerInfo } = await createStorageContext(synapse, logger);
  
  // Step 6: Execute upload
  const uploadResult = await executeUpload(synapseService, carBytes, rootCid, { ... });
  
  return {
    rootCid: rootCid.toString(),
    pieceCid: uploadResult.pieceCid,
    pieceId: uploadResult.pieceId,
    dataSetId: uploadResult.dataSetId,
    ...
  };
}
```

```typescript
// From frontend/src/services/filecoinService.ts - CAR creation
async function createCarFromVideo(file: File, ...): Promise<CarCreationResult> {
  const unixfsCarBuilder = createUnixfsCarBuilder();
  
  // Use bare: true to create file CID directly without directory wrapping
  const carBuildResult = await unixfsCarBuilder.buildCar(sourcePath, { 
    logger,
    bare: true,
  });
  
  const carBytes = await readFileFromFs(carBuildResult.carPath);
  return { carBytes, rootCid: carBuildResult.rootCid, ... };
}
```

### Implementation Strategy
1. **Use** `filecoin-pin` package (same as electron app)
2. **Port** size validation logic → `js-services/synapse-wrapper.ts`
3. **Port** CAR creation flow → `js-services/synapse-wrapper.ts`
4. **Port** upload flow with payment validation
5. **Adapt** for Deno file system APIs

### Key Differences for CLI
- Use Deno file APIs instead of Node.js fs
- Environment variables for private key and RPC URL
- No UI progress callbacks (use JSON-RPC progress events)
- Simpler error handling (no user-facing messages)

### What's NOT Reusable
- Browser-specific Blob/File handling
- React progress state management
- UI-specific error messages

### What's NEW for CLI
- Deno-specific file handling
- JSON-RPC progress reporting
- Download functionality (electron app doesn't have this)

## Dependencies
- Synapse API key or Filecoin wallet
- Network access to storage providers

## Blocking
- Sprint 3: Upload pipeline step
- Sprint 2 Task 04: Download implementation
