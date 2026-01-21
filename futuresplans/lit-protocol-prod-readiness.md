# Lit Protocol Production Readiness Plan

## Overview

Enable Lit Protocol for production use by adding network configuration, Capacity Credit management, and payment validation. This follows the existing Filecoin and Arkiv configuration patterns while implementing Lit Protocol's NFT-based Capacity Credits payment model.

## Architecture

The implementation follows the same pattern as Filecoin/Arkiv:

- Configuration stored in secure storage (encrypted private key)

- Capacity Credit validation before operations
- Auto-minting of Capacity Credits when needed

- User-friendly error messages with wallet addresses

- Integration with existing configuration UI

## Key Concepts

**Capacity Credits** are NFT tokens on the Chronicle Yellowstone blockchain that:
- Reserve a specific amount of capacity (requests per second) over a predefined period (e.g., one week)
- Are required for operations like decrypting data, signing with PKP, and executing Lit Actions
- Must be minted (not deposited) and their token ID provided with requests
- Can be delegated to users via Capacity Delegation Auth Signature

## Implementation Steps

### 1. Install Required Lit Protocol Packages

Add payment management packages to `frontend/package.json`:

- `@lit-protocol/contracts-sdk` - For minting Capacity Credits via NFT contract
- `@lit-protocol/constants` - For network constants (LIT_NETWORK, LIT_RPC)
- `ethers@v5` - For Ethereum wallet and provider (if not already present)

Note: `@lit-protocol/lit-node-client` should already be installed for existing Lit functionality.

### 2. Create Lit Protocol Configuration Types

**File: `frontend/src/types/filecoin.ts`**

Add Lit Protocol configuration interface:

```typescript
export interface LitConfig {
  network: 'datil-dev' | 'datil-test' | 'manzano' | 'datil' | 'naga';
  chronicleRpcUrl?: string; // Optional custom RPC URL (defaults to LIT_RPC.CHRONICLE_YELLOWSTONE)
  capacityCreditTokenId?: string; // Token ID of minted Capacity Credit NFT (as string)
  autoMintCapacityCredit?: boolean; // Auto-mint new Capacity Credit if expired/insufficient (application-level, not on-chain)
  capacityCreditRequestsPerKilosecond?: number; // Capacity to reserve (e.g., 80)
  capacityCreditRequestsPerDay?: number; // Alternative: capacity per day (e.g., 14400)
  capacityCreditRequestsPerSecond?: number; // Alternative: capacity per second (e.g., 10)
  capacityCreditDaysUntilExpiration?: number; // Days until UTC midnight expiration (default: 7)
}
```

Extend `FilecoinConfig` to include Lit config:

```typescript
export interface FilecoinConfig {
  // ... existing fields
  litConfig?: LitConfig;
}
```



### 3. Create Lit Protocol Payment Service

**File: `frontend/src/services/litPaymentService.ts`** (new file)

Create service for:

- Minting Capacity Credits on Chronicle Yellowstone
- Checking Capacity Credit status (active, expired, capacity remaining)
- Creating Capacity Delegation Auth Signatures
- Checking ETH balance on Chronicle for gas (for minting)
- Getting wallet address from private key

Key functions:

- `mintCapacityCredit(privateKey: string, config: LitConfig): Promise<{ capacityTokenId: string, rliTxHash: string }>`
  - Uses `LitContracts` from `@lit-protocol/contracts-sdk`
  - Requires Lit test tokens (tstLPX) on Chronicle for payment
  - Returns token ID and transaction hash

- `checkCapacityCreditStatus(tokenId: string, network: string): Promise<CapacityCreditStatus>`
  - Validates token exists, is active, and has capacity remaining
  - Checks expiration (expires at UTC midnight)

- `createCapacityDelegationAuthSig(privateKey: string, tokenId: string, delegateeAddresses: string[], uses: number, expirationMinutes: number): Promise<CapacityDelegationAuthSig>`
  - Uses `LitNodeClient.createCapacityDelegationAuthSig()`
  - Creates ERC-5573 SIWE message signed by Capacity Credit owner
  - Returns Auth Sig for use in session signatures

- `checkChronicleGasBalance(privateKey: string, rpcUrl: string): Promise<GasBalanceResponse>`
  - Checks ETH balance on Chronicle for gas fees

- `ensureValidCapacityCredit(privateKey: string, config: LitConfig): Promise<string>`
  - Checks if existing token ID is valid
  - Auto-mints new Capacity Credit if expired/insufficient (if enabled)
  - **Note**: Auto-renewal is application-level, not on-chain. Requires app to be running to detect expiration.
  - Returns valid token ID

### 4. Update Lit Service for Production Networks

**File: `frontend/src/services/litService.ts`**

Modify `initLitClient()` to:

- Accept network parameter (datil-dev, datil-test, manzano, datil, naga)
- Use production network when configured
- Keep DatilDev as default for backward compatibility
- Map 'datil' to Datil Mainnet (production, launched October 2024)
- Map 'naga' to Naga v1 Mainnet (when available)

Add network configuration:

```typescript
export async function initLitClient(network?: 'datil-dev' | 'datil-test' | 'manzano' | 'datil' | 'naga'): Promise<LitNodeClient>
```

Update `getSessionSigs()` to accept and use Capacity Delegation Auth Sig:

```typescript
async function getSessionSigs(
  client: LitNodeClient,
  privateKey: string,
  accessControlConditions: EvmBasicAccessControlCondition[],
  chain: string = 'ethereum',
  capacityDelegationAuthSig?: CapacityDelegationAuthSig // Add this parameter
): Promise<SessionSigsMap>
```

When `capacityDelegationAuthSig` is provided, include it in the `getSessionSigs` call:

```typescript
const sessionSigs = await client.getSessionSigs({
  chain,
  expiration,
  capabilityAuthSigs: capacityDelegationAuthSig ? [capacityDelegationAuthSig] : undefined,
  resourceAbilityRequests: [...],
  authNeededCallback: async (params) => { ... }
});
```



### 5. Create Backend Lit Payment Validation

**File: `backend/app/services/lit_payment_service.py`** (new file)

Create Python service for:

- Validating Lit Protocol configuration
- Checking Capacity Credit status via Chronicle RPC (if token ID provided)
- Checking ETH balance on Chronicle for gas (needed for minting)
- Returning wallet address and validation info

Key functions:

- `validate_lit_config(private_key: str, network: str, token_id: Optional[str] = None) -> Tuple[str, str, bool]`
  - Returns: (wallet_address, network_name, is_valid)
  - Validates network and wallet configuration

- `check_capacity_credit_status(token_id: str, network: str, rpc_url: str) -> CapacityCreditStatus`
  - Checks if Capacity Credit NFT exists on Chronicle
  - Validates token is active and not expired
  - Returns expiration date and capacity info

- `check_chronicle_gas_balance(private_key: str, rpc_url: str) -> GasBalanceResponse`
  - Checks ETH balance on Chronicle (needed for minting Capacity Credits)
  - Returns balance and minimum required amount

### 6. Add Backend API Endpoints

**File: `backend/app/api/config.py`**

Add endpoints similar to EVM config validation:

- `GET /api/config/lit-config` - Validate Lit configuration
  - Validates network, wallet, and optional Capacity Credit token ID

- `GET /api/config/capacity-credit-status` - Check Capacity Credit status
  - Requires: `tokenId` query parameter
  - Returns: active status, expiration, capacity remaining

- `GET /api/config/chronicle-gas-balance` - Check Chronicle gas balance
  - Returns: ETH balance on Chronicle (needed for minting)

### 7. Update Filecoin Config Modal

**File: `frontend/src/components/FilecoinConfigModal.tsx`**

Add Lit Protocol section:

- Network selector with clear labels:
  - **Datil-dev**: Free development network (no payments required) - Current default
  - **Datil-test**: Testnet with payments (requires Capacity Credits)
  - **Manzano**: Testnet with payments (requires Capacity Credits)
  - **Datil**: Production mainnet (launched October 2024) - Requires Capacity Credits, uses real Lit tokens
  - **Naga**: Future mainnet (when available) - Enhanced features, requires Capacity Credits

- Chronicle RPC URL field (optional, defaults to Lit's RPC)

- Capacity Credit Token ID field (display current token ID if configured)
  - Show status: Active, Expired, or Not Set
  - Link to view on Chronicle explorer

- Capacity Credit settings (for auto-minting):
  - Requests per kilosecond/day/second selector
  - Days until expiration (default: 7)
  - Auto-mint toggle

- Validation on save:
  - Check if Capacity Credit token ID is valid (if provided)
  - Check Chronicle gas balance (if minting enabled)
  - Show user-friendly errors with wallet address

### 8. Add IPC Handlers for Lit Operations

**File: `frontend/src/main.ts`**

Add IPC handlers:

- `validate-lit-config` - Validate Lit configuration
  - Validates network, wallet, and Capacity Credit token ID

- `check-capacity-credit-status` - Check Capacity Credit status
  - Requires: tokenId
  - Returns: status, expiration, capacity info

- `check-chronicle-gas-balance` - Check gas balance
  - Returns: ETH balance on Chronicle

- `mint-capacity-credit` - Mint new Capacity Credit
  - Requires: capacity config (requestsPerKilosecond, daysUntilExpiration)
  - Returns: tokenId and transaction hash
  - Requires Lit test tokens (tstLPX) on Chronicle

- `create-capacity-delegation-auth-sig` - Create delegation Auth Sig
  - Requires: tokenId, delegateeAddresses, uses, expiration
  - Returns: Capacity Delegation Auth Sig

### 9. Update Configuration Save Flow

**File: `frontend/src/components/ConfigurationModal.tsx`**

In `handleSave()` for Filecoin tab:

- When encryption is enabled and network requires payments (not datil-dev):
  - Check if Capacity Credit token ID is provided
  - Validate Capacity Credit is active and not expired
  - If no token ID or expired:
    - If auto-mint enabled: Check Chronicle gas balance, then mint new Capacity Credit
    - If auto-mint disabled: Show error with instructions to mint via Lit Explorer
  - Check Chronicle gas balance (ETH needed for minting)
  - Show user-friendly errors with wallet address and explorer links

- For datil-dev network: Skip payment validation (free network)

### 10. Update Lit Client Initialization and Session Signatures

**File: `frontend/src/services/litService.ts`**

Update to:

- Read network from config
- Initialize with production network when configured
- Handle payment errors gracefully (rate limit errors, expired Capacity Credits)
- Log network and payment status

**Critical Update**: Modify `getSessionSigs()` and all decryption functions to:

1. Check if network requires payments (not datil-dev)
2. If payments required:
   - Get Capacity Credit token ID from config
   - Create Capacity Delegation Auth Sig delegating to the user's wallet address
   - Include `capabilityAuthSigs: [capacityDelegationAuthSig]` in `getSessionSigs()` call
3. Handle payment errors:
   - Rate limit errors (capacity exhausted)
   - Expired Capacity Credit errors
   - Invalid token ID errors

Update functions:
- `getSessionSigs()` - Add `capacityDelegationAuthSig` parameter
- `decryptVideo()` - Pass Capacity Delegation Auth Sig to `getSessionSigs()`
- `decryptFileFromStorage()` - Pass Capacity Delegation Auth Sig to `getSessionSigs()`
- `decryptTextWithLit()` - Pass Capacity Delegation Auth Sig to `getSessionSigs()`

### 11. Add Error Handling

Create custom errors for Capacity Credit scenarios:

- `MissingCapacityCreditError` - No Capacity Credit token ID configured
  - Shows wallet address
  - Provides link to Lit Explorer for minting
  - Instructions for auto-mint if enabled

- `ExpiredCapacityCreditError` - Capacity Credit has expired
  - Shows expiration date (UTC midnight)
  - Shows wallet address
  - Option to mint new Capacity Credit

- `InsufficientCapacityError` - Capacity Credit rate limit reached
  - Shows current usage vs capacity
  - Shows when capacity resets (UTC midnight)
  - Option to mint new Capacity Credit with higher capacity

- `InsufficientChronicleGasError` - Not enough ETH for minting
  - Shows wallet address
  - Shows required ETH amount
  - Provides link to Chronicle explorer

### 12. Update Explorer Links

**File: `frontend/src/utils/explorerLinks.ts`**

Add Chronicle transaction links:

- Chronicle (Arbitrum Orbit) transaction explorer
  - For viewing Capacity Credit mint transactions
  - Format: `https://chronicle-explorer.litprotocol.com/tx/{txHash}`

- Capacity Credit NFT links
  - For viewing Capacity Credit token details
  - Format: `https://chronicle-explorer.litprotocol.com/token/{tokenId}`

- Lit Explorer links
  - For viewing and minting Capacity Credits via UI
  - Format: `https://explorer.litprotocol.com/`

## Key Implementation Details

### Chronicle Network

- Chronicle Yellowstone is an Arbitrum Orbit rollup blockchain
- Requires ETH for gas (same as Arbitrum)
- Capacity Credits are NFT tokens (ERC-721) on Chronicle
- Lit test tokens (tstLPX) are required to pay for minting Capacity Credits
- Can obtain test tokens from Lit Protocol faucet

### Capacity Credit Minting

When minting a Capacity Credit using `LitContracts.mintCapacityCreditsNFT()`:

1. **Capacity Parameters** (provide one of):
   - `requestsPerKilosecond`: e.g., 80 (80 requests per 1000 seconds)
   - `requestsPerDay`: e.g., 14400 (14400 requests per day)
   - `requestsPerSecond`: e.g., 10 (10 requests per second)

2. **Expiration**:
   - `daysUntilUTCMidnightExpiration`: Number of days until expiration
   - Credit expires at 12:00 AM UTC on the specified date
   - Example: `daysUntilUTCMidnightExpiration: 7` expires at UTC midnight 7 days from now

3. **Return Value**:
   - `capacityTokenId`: Token ID as number
   - `capacityTokenIdStr`: Token ID as string (use this for storage)
   - `rliTxHash`: Transaction hash on Chronicle

### Capacity Delegation Auth Signature

When creating a Capacity Delegation Auth Sig using `LitNodeClient.createCapacityDelegationAuthSig()`:

1. **Parameters**:
   - `dAppOwnerWallet`: Ethers signer that owns the Capacity Credit
   - `capacityTokenId`: Token ID of the Capacity Credit to delegate
   - `delegateeAddresses`: Array of addresses to authorize (include your own address for self-use)
   - `uses`: Total number of uses across all delegatees (e.g., "1" for single use, "100" for 100 uses)
   - `expiration`: ISO timestamp when Auth Sig expires (e.g., 10 minutes from now)

2. **Usage**:
   - Include in `getSessionSigs()` via `capabilityAuthSigs: [capacityDelegationAuthSig]`
   - Auth Sig must be created by the Capacity Credit owner
   - Delegated addresses can use the Auth Sig to pay for Lit network requests

### Auto-Mint Logic (Application-Level, Not On-Chain)

**Important**: Lit Protocol does not provide native on-chain auto-renewal. This is application-level logic that:

1. Check if Capacity Credit token ID exists in config (reads on-chain state)
2. If token ID provided:
   - Validate token is active and not expired (reads on-chain state)
   - Check if capacity is sufficient (reads on-chain state)
3. If no token ID or expired/insufficient:
   - If auto-mint enabled:
     - Check Chronicle gas balance (ETH) - reads on-chain state
     - Check for Lit test tokens (tstLPX) on Chronicle - reads on-chain state
     - **Mint new Capacity Credit** (on-chain transaction via `LitContracts.mintCapacityCreditsNFT()`)
     - Store new token ID in config (off-chain, local storage)
     - Log mint transaction hash
   - If auto-mint disabled:
     - Show error with wallet address
     - Provide link to Lit Explorer for manual minting

**Limitations**:
- Requires application to be running to detect expiration
- Requires sufficient tokens in wallet for auto-minting
- Token ID storage is local (off-chain)
- No smart contract handles auto-renewal automatically

### Network Configuration

- **Datil-dev**: Free development network (current default)
  - No Capacity Credits needed
  - No payment validation
  - Suitable for development and testing

- **Datil-test**: Testnet with payments
  - Requires Capacity Credits
  - Uses Lit test tokens (tstLPX) for minting
  - Suitable for testing payment flows

- **Manzano**: Testnet with payments
  - Requires Capacity Credits
  - Uses Lit test tokens (tstLPX) for minting
  - Alternative testnet environment

- **Datil**: Production mainnet (launched October 2024)
  - **Primary production target** for Haven Player
  - Requires Capacity Credits
  - Uses real Lit tokens for minting
  - Network nodes are live and operational
  - Supports persistent key storage
  - All network nodes are on-chain

- **Naga**: Future mainnet (expected late 2025/early 2026)
  - Enhanced mainnet with improved features
  - Faster threshold algorithms
  - Better scalability
  - Will require Capacity Credits when available
  - Note: Not yet available as of plan creation

### Payment Delegation Database (Optional)

Lit Protocol offers a Payment Delegation Database service that:
- Allows registering a payer wallet
- Manages delegatees via API routes
- Simplifies delegation management for applications
- Can be integrated later if needed for multi-user scenarios

## Files to Create/Modify

**New Files:**

- `frontend/src/services/litPaymentService.ts` - Capacity Credit minting, validation, and delegation
- `backend/app/services/lit_payment_service.py` - Backend Capacity Credit validation

**Modified Files:**

- `frontend/src/types/filecoin.ts` - Add LitConfig

- `frontend/src/services/litService.ts` - Add network support

- `frontend/src/components/FilecoinConfigModal.tsx` - Add Lit config UI

- `frontend/src/components/ConfigurationModal.tsx` - Add Lit validation

- `frontend/src/main.ts` - Add IPC handlers

- `backend/app/api/config.py` - Add Lit API endpoints

- `frontend/src/utils/explorerLinks.ts` - Add Chronicle links

- `frontend/package.json` - Add Lit payment packages (`@lit-protocol/contracts-sdk`, `@lit-protocol/constants`, `ethers@v5`)

## Testing Considerations

- Test with Datil-dev (free, no payments)
  - Verify no Capacity Credit validation occurs
  - Verify decryption works without payment

- Test with Datil-test/Manzano (testnet with payments)
  - Obtain test tokens (tstLPX) from Lit faucet
  - Test minting Capacity Credit
  - Test using Capacity Credit for decryption
  - Test Capacity Delegation Auth Sig creation
  - Test auto-mint functionality
  - Test error handling for expired Capacity Credits
  - Test rate limiting (exhaust capacity, verify error)

- Test error handling:
  - Missing Capacity Credit token ID
  - Expired Capacity Credit
  - Insufficient capacity (rate limit)
  - Insufficient Chronicle gas for minting
  - Invalid token ID

- Test network switching:
  - Switch from datil-dev to datil-test (should require Capacity Credit)
  - Switch between testnet networks
  - Switch to datil (production mainnet) - verify real token requirements
  - Verify Capacity Credit token IDs are network-specific
  - Test that datil mainnet uses real Lit tokens (not test tokens)

- Test Capacity Credit lifecycle:
  - Mint new Capacity Credit
  - Use for multiple decryption operations
  - Verify expiration handling
  - Test auto-mint functionality (application-level):
    - Verify app detects expiration
    - Verify auto-mint triggers when app is running
    - Verify auto-mint does NOT trigger when app is closed (limitation)
    - Test that minting transaction is on-chain
    - Verify token ID is stored locally (off-chain)

- Verify Chronicle gas balance checking

## Summary of Key Changes from Original Plan

This plan has been updated to accurately reflect Lit Protocol's Capacity Credits payment model:

### ✅ Correct Implementation Model

1. **Capacity Credits are NFTs, not tokens**: Credits are ERC-721 NFT tokens minted on Chronicle Yellowstone, not ERC-20 tokens deposited into a ledger contract.

2. **Minting Process**: Use `LitContracts.mintCapacityCreditsNFT()` from `@lit-protocol/contracts-sdk` to mint new Capacity Credits. Requires Lit test tokens (tstLPX) on Chronicle for payment.

3. **Token ID Storage**: Store the Capacity Credit token ID (as string) in configuration. This token ID must be provided when creating Capacity Delegation Auth Sigs.

4. **Delegation via Auth Sig**: Use `LitNodeClient.createCapacityDelegationAuthSig()` to create delegation signatures. Include these in `getSessionSigs()` via `capabilityAuthSigs` parameter.

5. **Session Signatures**: Capacity Delegation Auth Sigs are passed to `getSessionSigs()`, not directly to decrypt/encrypt functions.

### ❌ Removed Incorrect Concepts

- Removed: LITKEY token balance checking
- Removed: Ledger contract deposits
- Removed: Token balance auto-deposit logic
- Removed: ERC-20 token model assumptions

### 📚 Reference Documentation

- [Capacity Credits Overview](https://developer.litprotocol.com/paying-for-lit/capacity-credits)
- [Minting via Contracts SDK](https://developer.litprotocol.com/paying-for-lit/minting-capacity-credit/via-contract)
- [Delegating Capacity Credits](https://developer.litprotocol.com/paying-for-lit/delegating-credit)
- [Using Delegated Auth Sig](https://developer.litprotocol.com/paying-for-lit/using-delegated-auth-sig)
- [Payment Delegation Database](https://developer.litprotocol.com/paying-for-lit/payment-delegation-db)

### Network Status Clarifications

- **Datil Mainnet** (production): Launched October 2024, fully operational with all network nodes on-chain
- **Naga v1 Mainnet**: Expected late 2025/early 2026, will be the enhanced production mainnet
- **Auto-renewal**: Application-level logic, not native on-chain feature. Minting is on-chain, but renewal detection and triggering happens in the application.