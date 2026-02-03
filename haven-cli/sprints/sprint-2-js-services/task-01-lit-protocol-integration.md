# Task 01: Lit Protocol SDK Integration

## Assignee
Web3 Developer

## Priority
Critical

## Estimated Effort
4 days

## Description
Replace the stub implementation in `lit-wrapper.ts` with actual Lit Protocol SDK integration. This enables access-controlled encryption and decryption of video content.

## Current State
- `js-services/lit-wrapper.ts` has stub implementation:
  - `connect()` - Simulates connection, doesn't actually connect to Lit network
  - `encrypt()` - Generates fake ciphertext, doesn't encrypt
  - `decrypt()` - Extracts from fake ciphertext, doesn't decrypt
- Multiple TODO comments indicate placeholder code

## Requirements

### 1. Install Lit Protocol SDK
```bash
# In js-services directory
deno add @lit-protocol/lit-node-client
deno add @lit-protocol/auth-helpers
deno add @lit-protocol/constants
```

### 2. Implement Real Connection
```typescript
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';

class LitWrapperImpl implements LitWrapper {
  private client: LitNodeClient | null = null;
  private sessionSigs: any = null;
  
  async connect(params: LitConnectParams): Promise<LitConnectResult> {
    const network = params.network ?? 'datil-dev';
    
    this.client = new LitNodeClient({
      litNetwork: network as LIT_NETWORK,
      debug: params.debug ?? false,
    });
    
    await this.client.connect();
    
    // Generate session signatures
    this.sessionSigs = await this.generateSessionSigs();
    
    return {
      connected: true,
      network,
      nodeCount: this.client.connectedNodes.size,
    };
  }
}
```

### 3. Implement Real Encryption
```typescript
import { encryptString, encryptFile } from '@lit-protocol/encryption';

async encrypt(params: LitEncryptParams): Promise<LitEncryptResult> {
  if (!this.client || !this.sessionSigs) {
    throw new Error('Lit Protocol not connected');
  }
  
  const { ciphertext, dataToEncryptHash } = await encryptString(
    {
      accessControlConditions: params.accessControlConditions,
      chain: params.chain ?? 'ethereum',
      dataToEncrypt: params.data,
    },
    this.client,
  );
  
  return {
    ciphertext,
    dataToEncryptHash,
    accessControlConditionHash: await this.hashAccessConditions(params.accessControlConditions),
  };
}
```

### 4. Implement Real Decryption
```typescript
import { decryptToString, decryptToFile } from '@lit-protocol/encryption';

async decrypt(params: LitDecryptParams): Promise<LitDecryptResult> {
  if (!this.client || !this.sessionSigs) {
    throw new Error('Lit Protocol not connected');
  }
  
  const decryptedString = await decryptToString(
    {
      accessControlConditions: params.accessControlConditions,
      chain: params.chain ?? 'ethereum',
      ciphertext: params.ciphertext,
      dataToEncryptHash: params.dataToEncryptHash,
    },
    this.client,
    this.sessionSigs,
  );
  
  return {
    decryptedData: btoa(decryptedString),
  };
}
```

### 5. Session Management
Implement proper session signature generation:
```typescript
async generateSessionSigs(): Promise<any> {
  // Use auth helpers to generate session signatures
  // This typically requires wallet authentication
  
  // For server-side operation, use PKP (Programmable Key Pairs)
  // or implement a custom auth callback
}

async getSession(): Promise<LitSessionResult> {
  if (!this.sessionSigs) {
    return { active: false };
  }
  
  return {
    active: true,
    expiresAt: this.sessionExpiry?.toISOString(),
    resourceAbilities: ['encryption', 'decryption'],
  };
}
```

### 6. File Encryption Support
Add support for encrypting/decrypting files (not just strings):
```typescript
async encryptFile(params: {
  filePath: string;
  accessControlConditions: AccessControlCondition[];
  chain?: string;
}): Promise<{
  encryptedFilePath: string;
  metadata: LitEncryptResult;
}>;

async decryptFile(params: {
  encryptedFilePath: string;
  metadata: LitEncryptResult;
  outputPath: string;
}): Promise<string>;
```

## Files to Modify

### Modify
- `js-services/lit-wrapper.ts` - Replace stub with real implementation
- `js-services/types.ts` - Add any new types needed
- `js-services/deno.json` - Add Lit Protocol dependencies

### Create
- `js-services/lit-auth.ts` - Authentication helpers (optional)

## Acceptance Criteria
- [ ] Can connect to Lit Protocol datil-dev network
- [ ] Can encrypt string data with access conditions
- [ ] Can decrypt data when access conditions are met
- [ ] Session management works (generate, refresh, check expiry)
- [ ] File encryption/decryption works for video files
- [ ] Proper error handling for network issues
- [ ] Integration test with actual Lit network

## Technical Notes
- Lit Protocol requires a wallet for authentication
- Consider using PKP (Programmable Key Pairs) for server-side operation
- Session signatures expire - implement refresh logic
- Access control conditions must be valid for the specified chain
- Large files should use streaming encryption

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app frontend has a **complete, production-tested Lit Protocol v8 implementation** with hybrid encryption:

#### Source Files to Reference:
1. **`frontend/src/services/litService.ts`** - Complete Lit Protocol integration
   - Lit SDK v8 (Naga) implementation
   - Hybrid encryption (AES-256-GCM + Lit BLS-IBE)
   - Session management with AuthManager
   - Memory storage fallback for Node.js/Electron
   - **Reuse Level: 70%** - TypeScript patterns portable to Deno

2. **`frontend/src/services/hybridCrypto.ts`** - Hybrid encryption implementation
   - AES-256-GCM for file encryption (hardware accelerated)
   - Lit BLS-IBE for encrypting AES key only (32 bytes)
   - Efficient handling of large files
   - **Reuse Level: 75%** - Core crypto logic directly portable

3. **`frontend/src/services/viemAdapter.ts`** - Wallet adapter
   - Creates viem account from private key
   - Used for Lit authentication
   - **Reuse Level: 80%** - Directly portable

#### Key Architecture to Port:

```typescript
// From frontend/src/services/litService.ts - Hybrid encryption approach

/**
 * Architecture:
 * - AES-256-GCM for local file encryption (hardware accelerated)
 * - Lit BLS-IBE for encrypting the AES key only (32 bytes)
 * 
 * Benefits:
 * - Can encrypt/decrypt files of any size efficiently
 * - Only 32 bytes (the AES key) is sent to Lit nodes
 * - Uses standard Web Crypto API (hardware accelerated)
 */

// Initialize Lit client (v8 API)
import { createLitClient, type LitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';
import { createAuthManager, storagePlugins } from '@lit-protocol/auth';

export async function initLitClient(): Promise<LitClient> {
  litClient = await createLitClient({
    network: nagaDev,
  });
  
  // Use memory storage for CLI (no localStorage)
  authManager = createAuthManager({
    storage: createMemoryStorage(appName, networkName),
  });
  
  return litClient;
}
```

```typescript
// From frontend/src/services/litService.ts - Owner-only access control
function createOwnerOnlyAccessControlConditions(walletAddress: string) {
  return [{
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '=',
      value: walletAddress.toLowerCase(),
    },
  }];
}
```

```typescript
// From frontend/src/services/litService.ts - File encryption
export async function encryptFile(
  fileBuffer: ArrayBuffer,
  privateKey: string,
  onProgress?: (message: string) => void
): Promise<{
  encryptedData: Uint8Array;
  metadata: LitEncryptionMetadata;
}> {
  const { hybridEncryptFile } = await import('./hybridCrypto');
  return hybridEncryptFile(fileBuffer, privateKey, 'ethereum', onProgress);
}
```

### Implementation Strategy
1. **Port** `frontend/src/services/hybridCrypto.ts` → `js-services/hybrid-crypto.ts`
2. **Port** `frontend/src/services/litService.ts` → `js-services/lit-wrapper.ts`
3. **Adapt** for Deno runtime (use Deno's Web Crypto API)
4. **Use** memory storage (no localStorage in CLI context)
5. **Keep** the hybrid encryption approach (efficient for large files)

### Key Differences for CLI
- Use Deno's Web Crypto API instead of browser's
- Memory storage instead of localStorage
- Private key from environment variable instead of wallet connection
- No UI progress callbacks needed

### What's NOT Reusable
- Browser-specific localStorage handling
- React hooks and context
- UI progress callbacks

### What's NEW for CLI
- Deno-specific imports
- Environment variable configuration
- JSON-RPC interface for Python bridge

## Dependencies
- Network access to Lit Protocol nodes
- Wallet or PKP for authentication

## Blocking
- Sprint 3: Encryption pipeline step
