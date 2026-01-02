# Lit Protocol Production Readiness Plan

## Overview

Enable Lit Protocol for production use by adding network configuration, payment validation, and auto-deposit functionality. This mirrors the existing Filecoin and Arkiv configuration patterns.

## Architecture

The implementation follows the same pattern as Filecoin/Arkiv:

- Configuration stored in secure storage (encrypted private key)

- Balance checking before operations
- Auto-deposit of tokens when insufficient

- User-friendly error messages with wallet addresses

- Integration with existing configuration UI

## Implementation Steps

### 1. Install Required Lit Protocol Packages

Add payment management packages to `frontend/package.json`:

- `@lit-protocol/lit-client` - For Payment Manager

- `@lit-protocol/networks` - For network configuration

- `viem` - For Ethereum interactions (if not already present)

### 2. Create Lit Protocol Configuration Types

**File: `frontend/src/types/filecoin.ts`**

Add Lit Protocol configuration interface:

```typescript
export interface LitConfig {
  network: 'datil-dev' | 'manzano' | 'mainnet';
  chronicleRpcUrl?: string; // Arbitrum RPC for Chronicle
  minLitkeyBalance?: string; // Minimum LITKEY balance required
  autoDepositAmount?: string; // Amount to auto-deposit if insufficient
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

- Checking LITKEY token balance in ledger contract

- Checking ETH balance on Chronicle (Arbitrum) for gas

- Depositing LITKEY tokens into ledger contract

- Getting wallet address from private key

Key functions:

- `checkLitkeyBalance(privateKey: string, network: string): Promise<LitBalanceResponse>`

- `checkChronicleGasBalance(privateKey: string, rpcUrl: string): Promise<GasBalanceResponse>`

- `depositLitkeyTokens(privateKey: string, amount: string, network: string): Promise<DepositResult>`

- `ensureSufficientLitkeyBalance(privateKey: string, config: LitConfig): Promise<void>`

### 4. Update Lit Service for Production Networks

**File: `frontend/src/services/litService.ts`**

Modify `initLitClient()` to:

- Accept network parameter (datil-dev, manzano, mainnet)
- Use production network when configured

- Keep DatilDev as default for backward compatibility

Add network configuration:

```typescript
export async function initLitClient(network?: 'datil-dev' | 'manzano' | 'mainnet'): Promise<LitNodeClient>
```



### 5. Create Backend Lit Payment Validation

**File: `backend/app/services/lit_payment_service.py`** (new file)

Create Python service for:

- Validating Lit Protocol configuration

- Checking LITKEY balance via Chronicle RPC

- Checking ETH balance on Arbitrum (Chronicle gas)

- Returning wallet address and balance info

Key functions:

- `validate_lit_config(private_key: str, network: str) -> Tuple[str, str, str]` (wallet_address, network_name, token_symbol)

- `check_litkey_balance(private_key: str, network: str) -> LitBalanceResponse`

- `check_chronicle_gas_balance(private_key: str, rpc_url: str) -> GasBalanceResponse`

### 6. Add Backend API Endpoints

**File: `backend/app/api/config.py`**

Add endpoints similar to EVM config validation:

- `GET /api/config/lit-config` - Validate Lit configuration

- `GET /api/config/lit-balance` - Check LITKEY balance

- `GET /api/config/chronicle-gas-balance` - Check Chronicle gas balance

### 7. Update Filecoin Config Modal

**File: `frontend/src/components/FilecoinConfigModal.tsx`**

Add Lit Protocol section:

- Network selector (Datil-dev, Manzano, Mainnet)

- Chronicle RPC URL field (Arbitrum RPC)

- Balance checking on save (similar to Filecoin/Arkiv)
- Auto-deposit toggle/configuration

- Error messages showing wallet address and required tokens

### 8. Add IPC Handlers for Lit Operations

**File: `frontend/src/main.ts`**

Add IPC handlers:

- `validate-lit-config` - Validate Lit configuration
- `check-lit-balance` - Check LITKEY balance

- `check-chronicle-gas-balance` - Check gas balance

- `deposit-litkey-tokens` - Auto-deposit tokens

### 9. Update Configuration Save Flow

**File: `frontend/src/components/ConfigurationModal.tsx`**

In `handleSave()` for Filecoin tab:

- When encryption is enabled, check Lit Protocol balances

- Check LITKEY token balance
- Check Chronicle gas balance (ETH on Arbitrum)

- Auto-deposit LITKEY if insufficient (log the action)

- Show user-friendly errors with wallet address if manual deposit needed

### 10. Update Lit Client Initialization

**File: `frontend/src/services/litService.ts`**Update to:

- Read network from config

- Initialize with production network when configured

- Handle payment errors gracefully

- Log network and payment status

### 11. Add Error Handling

Create `InsufficientLitkeyError` similar to `InsufficientGasError`:

- Shows wallet address

- Shows required LITKEY amount

- Shows Chronicle gas requirements (ETH on Arbitrum)

### 12. Update Explorer Links

**File: `frontend/src/utils/explorerLinks.ts`**

Add Chronicle transaction links:

- Chronicle (Arbitrum) transaction explorer

- LITKEY token contract links

- Ledger contract links

## Key Implementation Details

### Chronicle Network

- Chronicle is an Arbitrum Orbit chain

- Requires ETH for gas (same as Arbitrum)
- LITKEY tokens are ERC-20 on Chronicle

- Ledger contract is deployed on Chronicle

### Auto-Deposit Logic

1. Check LITKEY balance in ledger contract

2. If below minimum threshold, check wallet LITKEY balance
3. If wallet has sufficient LITKEY, auto-deposit to ledger

4. Log the deposit transaction

5. If wallet insufficient, show error with wallet address

### Minimum Balances

- LITKEY: Configurable minimum (e.g., 1 LITKEY)

- Chronicle Gas (ETH): Similar to other EVM chains (e.g., 0.01 ETH)

### Network Configuration

- Datil-dev: Free, no payments (current default)

- Manzano: Testnet with payments

- Mainnet: Production with payments

## Files to Create/Modify

**New Files:**

- `frontend/src/services/litPaymentService.ts`

- `backend/app/services/lit_payment_service.py`

**Modified Files:**

- `frontend/src/types/filecoin.ts` - Add LitConfig

- `frontend/src/services/litService.ts` - Add network support

- `frontend/src/components/FilecoinConfigModal.tsx` - Add Lit config UI

- `frontend/src/components/ConfigurationModal.tsx` - Add Lit validation

- `frontend/src/main.ts` - Add IPC handlers

- `backend/app/api/config.py` - Add Lit API endpoints

- `frontend/src/utils/explorerLinks.ts` - Add Chronicle links

- `frontend/package.json` - Add Lit payment packages

## Testing Considerations

- Test with Datil-dev (free, no payments)
- Test with Manzano (testnet with test tokens)

- Test auto-deposit functionality

- Test error handling for insufficient balances

- Test network switching
- Verify Chronicle gas balance checking