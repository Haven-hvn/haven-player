# Migrating from Lit SDK v7 (Datil) to v8 (Naga)

> Complete migration guide covering package renames, authContext, Lit Actions runtime changes, PKP signing, encryption, wrapped keys, and the new payment system.

## Documentation Index

Fetch the complete documentation index at `https://developer.litprotocol.com/llms.txt`. Use this file to discover all available pages before exploring further.

---

## Overview

Lit SDK v8 (Naga) is a major release over v7 (Datil). The public API is more modular, uses `viem` for chain interactions, introduces the `AuthManager`/`authContext` model, and replaces Capacity Credits with Ledger-based payments.

This guide is written for teams upgrading existing v7 integrations. It focuses on breaking changes and exact replacements.

### Upgrade Checklist

1. [ ] Replace v7 packages/imports with v8 packages (see tables below)
2. [ ] Swap `LitNodeClient.connect` for `createLitClient`
3. [ ] Replace `sessionSigs` and most `authSig` usage with `authContext` from `AuthManager` (`authSig` remains optional only for decrypt overrides)
4. [ ] Update Lit Actions to read inputs from `jsParams` (no longer global)
5. [ ] Update PKP signing to `litClient.chain.pkpSign`
6. [ ] Replace v7 encryption helpers with `litClient.encrypt` / `litClient.decrypt`
7. [ ] If you use Wrapped Keys, keep using `pkpSessionSigs` but mint them via `AuthManager`
8. [ ] On paid networks, migrate Capacity Credits flows to the new `PaymentManager`

---

## Quick Reference: v7 → v8 Mapping

Use this section as a searchable symbol map. Find the v7 name you used and jump to the v8 equivalent.

### Packages and Modules

| v7 | v8 | Notes |
|----|-----|-------|
| `@lit-protocol/lit-node-client` | `@lit-protocol/lit-client` | Core client package renamed/rearchitected |
| `@lit-protocol/lit-node-client-nodejs` | **Removed** | v8 is isomorphic; use `@lit-protocol/lit-client` in Node and browser |
| `@lit-protocol/lit-auth-client` | `@lit-protocol/auth` (+ optional `@lit-protocol/auth-services`) | Providers replaced by authenticators; `AuthManager` hosted infra moved to auth-services |
| `@lit-protocol/pkp-ethers`/`cosmos`/`sui`/`walletconnect` | **Removed** | Use `litClient.getPkpViemAccount` or `litClient.chain.pkpSign` |
| `@lit-protocol/encryption` | **Removed from core flow** | Use `litClient.encrypt` / `litClient.decrypt` |
| `@lit-protocol/contracts-sdk` | `@lit-protocol/contracts` | Contract helpers updated for Naga networks |
| `LIT_NETWORK` constants | Network modules from `@lit-protocol/networks` | Example: `nagaDev`, `nagaTest` |

### Client / Network Setup

| v7 | v8 | Notes |
|----|-----|-------|
| `new LitNodeClient({ litNetwork, debug })` | `await createLitClient({ network })` | Handshake happens during creation |
| `litNodeClient.connect()` | **Removed** | No explicit connect step in v8 |
| `litNodeClient.disconnect()` | `litClient.disconnect()` | Stops state manager/handshake polling |
| `litNodeClient.getLatestBlockhash()` | `const { latestBlockhash } = await litClient.getContext()` | Mostly internal now; `AuthManager` handles nonces |
| `litNodeClient.signSessionKey()` | **Don't call directly** | Still exists as a low-level endpoint; `AuthManager` uses it |
| `rpcUrl` | `bootstrapUrls` in client config / `network.withOverrides({ rpcUrl })` | Overrides are applied on the network module |

### Networks

| v7 Network | v8 Network Module | Notes |
|------------|-------------------|-------|
| `datil-dev` / `LIT_NETWORK.DatilDev` | `nagaDev` | Free dev network |
| `datil-test` / `LIT_NETWORK.DatilTest` | `nagaTest` | Paid testnet with Ledger |
| `datil` / `LIT_NETWORK.Datil` | `naga` | Mainnet module still rolling out |

### Authentication and Session Material

| v7 | v8 | Notes |
|----|-----|-------|
| `authSig` (required params on core APIs) | **Removed** (optional on decrypt) | Core APIs accept `authContext`; decrypt also allows an optional `authSig` override |
| `sessionSigs` (params on core APIs) | **Removed** | Session sigs minted internally from `authContext` |
| `litNodeClient.getSessionSigs()` | `authManager.createEoaAuthContext()` | No `authNeededCallback` required |
| `litNodeClient.getPkpSessionSigs()` | `authManager.createPkpAuthContext()` (core) or `authManager.createPkpSessionSigs()` (wrapped-keys) | Wrapped-keys still needs exported sigs |
| `litNodeClient.getLitActionSessionSigs()` | `authManager.createCustomAuthContext()` or `createEoaAuthContext()` with `lit-action-execution` | Depends on whether a Lit Action is your auth method |
| `resourceAbilityRequests` | `resource` + `ability` / `resources` + `litAbility` | Example: `lit-action-execution` |
| `generateSessionCapabilityObjectWithWildcards` on client | `generateSessionCapabilityObjectWithWildcards` from `@lit-protocol/auth-helpers` | Same helper, now standalone |

### Core APIs

| v7 Call | v8 Call | Notes |
|---------|---------|-------|
| `litNodeClient.executeJs({ sessionSigs, code/ipfsId, jsParams })` | `litClient.executeJs({ authContext, code/ipfsId, jsParams })` | `jsParams` is nested in actions (see below) |
| `litNodeClient.pkpSign({ sessionSigs, pubKey, toSign })` | `litClient.chain.ethereum.pkpSign({ authContext, pubKey, toSign })` | Use `chain.bitcoin` or `chain.raw` for other schemes |
| `encryptString` / `encryptUint8Array` (`@lit-protocol/encryption`) | `litClient.encrypt({ dataToEncrypt, unifiedAccessControlConditions, chain })` | Encryption does not require `authContext` |
| `decryptToString` / `decryptToUint8Array` (`@lit-protocol/encryption`) | `litClient.decrypt({ data, unifiedAccessControlConditions, authContext, chain })` | Decryption requires `authContext` |
| `getHashedAccessControlConditions` on client | `getHashedAccessControlConditions` from `@lit-protocol/access-control-conditions` | Same name, standalone |
| `getFormattedAccessControlConditions` on client | `getFormattedAccessControlConditions` from `@lit-protocol/access-control-conditions` | Same name, standalone |
| `litNodeClient.getSignedToken` (JWT) | **Not yet ported** (undocumented) | No v8 public helper at time of writing |

### Lit Actions Runtime

| v7 Lit Action | v8 Lit Action | Notes |
|---------------|---------------|-------|
| Globals injected from `jsParams` | Access via `jsParams` | Example: `magicNumber` → `jsParams.magicNumber` |
| `LitActions.*` | `LitActions.*` | New canonical namespace |

### PKP Management / Permissions

| v7 | v8 | Notes |
|----|-----|-------|
| `new LitContracts()` (`@lit-protocol/contracts-sdk`) | `litClient.mintWithEoa()` / `litClient.mintWithAuth()` | PKP minting moved onto `litClient` |
| `contractsClient.addPermittedAction()` | `pkpPermissionsManager.addPermittedAction()` | Obtain manager via `litClient.getPKPPermissionsManager()` |
| `contractsClient.addPermittedAddress()` | `pkpPermissionsManager.addPermittedAddress()` | Same method name, new object |
| `contractsClient.addPermittedAuthMethod()` | `pkpPermissionsManager.addPermittedAuthMethod()` | Same name, new object |
| `contractsClient.getPermitted*()` (Actions/Addresses/AuthMethods) | `pkpPermissionsManager.getPermitted*()` | Same names |
| `provider.fetchPKPs()` / `provider.getPKPsForAuthMethod(authMethod)` (`@lit-protocol/lit-auth-client`) | `litClient.viewPKPsByAddress(ownerAddress)` / `litClient.viewPKPsByAuthData({ authData })` | PKP discovery moved onto `litClient` |

### Wrapped Keys

| v7 | v8 | Notes |
|----|-----|-------|
| `wrappedKeysApi({ pkpSessionSigs, litNodeClient })` | `wrappedKeysApi({ pkpSessionSigs, litClient })` | Only the client param changes |
| `litNodeClient.getPkpSessionSigs()` (for WK) | `authManager.createPkpSessionSigs()` | Generate via `AuthManager` + delegation auth sig |

### Payments

| v7 | v8 | Notes |
|----|-----|-------|
| Capacity Credits NFTs | **Removed** | Paid networks use Ledger balance per request |
| `createCapacityDelegationAuthSig()` | `paymentManager.delegatePaymentsBatch()` | Sponsoring users now uses payment delegation |
| Capacity request per kilosecond limits | `paymentManager.setRestriction()` | Same concept, new API |

---

## Package and Import Changes

### Core Client + Networks

| v7 | v8 |
|----|-----|
| `@lit-protocol/lit-node-client` | `@lit-protocol/lit-client` |
| `@lit-protocol/lit-node-client-nodejs` | **Removed** - use `@lit-protocol/lit-client` everywhere |
| `LIT_NETWORK` from `@lit-protocol/constants` | Network modules from `@lit-protocol/networks` |
| `@lit-protocol/encryption` helpers | **Removed from core flow** - use `litClient.encrypt` / `litClient.decrypt` |

**Install:**

```bash
npm i @lit-protocol/lit-client @lit-protocol/networks viem
```

> **Note:** `viem` is a peer dependency in v8 - your app must install it.

### Authentication

| v7 | v8 |
|----|-----|
| `litNodeClient.getSessionSigs()` | `authManager.createEoaAuthContext()` |
| `litNodeClient.getPkpSessionSigs()` | `authManager.createPkpSessionSigs()` (for wrapped-keys) or `authManager.createPkpAuthContext()` (for core APIs) |
| `@lit-protocol/lit-auth-client` providers (e.g., `EthWalletProvider`) | `@lit-protocol/auth` authenticators + `AuthManager` |
| Hosted login/mint infra via v7 clients | `@lit-protocol/auth-services` (optional infra) |

**Install:**

```bash
npm i @lit-protocol/auth viem
```

### PKP Wallets / Chain Libs

| v7 | v8 |
|----|-----|
| `@lit-protocol/pkp-ethers` (`PKPEthersWallet`, etc.) | **Removed** - use `litClient.getPkpViemAccount()` or `litClient.chain.pkpSign()` |
| ethers-first examples | **viem-first examples** |

### Contracts

| v7 | v8 |
|----|-----|
| `@lit-protocol/contracts-sdk` | `@lit-protocol/contracts` |

---

## Networks and Client Setup

### v7

```typescript
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';

const litNodeClient = new LitNodeClient({
  litNetwork: LIT_NETWORK.DatilDev,
  debug: false,
});
await litNodeClient.connect();
```

### v8

```typescript
import { createLitClient } from '@lit-protocol/lit-client';
import { nagaDev } from '@lit-protocol/networks';

const litClient = await createLitClient({
  network: nagaDev,
});

// optional when shutting down
litClient.disconnect();
```

> **Note:** If you previously used `litNodeClient.getLatestBlockhash()` for SIWE nonces, you can access it via:
> ```typescript
> const { latestBlockhash } = await litClient.getContext();
> ```

### Network Name Mapping

| v7 Network | v8 Network |
|------------|------------|
| `datil-dev` / `LIT_NETWORK.DatilDev` | `nagaDev` |
| `datil-test` / `LIT_NETWORK.DatilTest` | `nagaTest` |
| `datil` / `LIT_NETWORK.Datil` | `naga` (mainnet coming soon) |

### Custom RPC / Bootstrap Overrides

v7 typically passed `rpcUrl` or custom bootstrap URLs into the client config. v8 does this on the network module:

```typescript
import { nagaTest } from '@lit-protocol/networks';

const network = nagaTest.withOverrides({
  rpcUrl: 'https://my-private-rpc.example.com',
});

const litClient = await createLitClient({ network });
```

---

## Authentication and Sessions

v8 removes `sessionSigs` from core APIs and no longer requires `authSig` except as an optional override on decrypt. Instead, you create an `authContext` once and pass it to any method that needs authorization.

### EOA Session (replaces `getSessionSigs`)

#### v7

```typescript
const sessionSigs = await litNodeClient.getSessionSigs({
  chain: 'ethereum',
  expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  resourceAbilityRequests: [
    {
      resource: new LitActionResource('*'),
      ability: LIT_ABILITY.LitActionExecution,
    },
  ],
  authNeededCallback: async ({ uri, expiration, resourceAbilityRequests }) => {
    const toSign = await createSiweMessage({
      uri,
      expiration,
      resources: resourceAbilityRequests,
      walletAddress: await ethersWallet.getAddress(),
      nonce: await litNodeClient.getLatestBlockhash(),
      litNodeClient,
    });
    return generateAuthSig({ signer: ethersWallet, toSign });
  },
});
```

#### v8

```typescript
import { createAuthManager, storagePlugins } from '@lit-protocol/auth';

const authManager = createAuthManager({
  storage: storagePlugins.localStorage(),
  appName: 'my-app',
  networkName: 'naga-dev',
});

const eoaAuthContext = await authManager.createEoaAuthContext({
  config: {
    account: myViemAccount,
    authConfig: {
      domain: 'example.com',
      statement: 'Authorize Lit session',
      resources: [
        'lit-action-execution',
        'access-control-condition-decryption',
        'pkp-signing',
      ],
      expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
  },
  litClient,
});
```

> You no longer build SIWE messages or fetch nonces manually - the `AuthManager` handles that through its authenticators.

> **Note:** v7 helpers like `checkAndSignAuthMessage` / `signAndSaveAuthMessage` are no longer needed. `AuthManager` persists session materials automatically using the storage plugin you configure.

### PKP Session (core APIs)

#### v7
You typically generated `pkpSessionSigs` and passed them into `executeJs` / `pkpSign`.

#### v8
Create a PKP auth context and pass it to core APIs:

```typescript
import { ViemAccountAuthenticator } from '@lit-protocol/auth';

const authData = await ViemAccountAuthenticator.authenticate(myViemAccount);

const pkpAuthContext = await authManager.createPkpAuthContext({
  authData,
  pkpPublicKey: myPkp.pubkey,
  authConfig: {
    resources: ['pkp-signing', 'lit-action-execution'],
    expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },
  litClient,
});
```

### PKP Session Signatures (wrapped-keys only)

Wrapped-keys APIs still expect a `pkpSessionSigs` bundle for v7 compatibility. Generate them in v8 like this:

```typescript
import { generateSessionKeyPair } from '@lit-protocol/auth';

const sessionKeyPair = generateSessionKeyPair();

const delegationAuthSig = await authManager.generatePkpDelegationAuthSig({
  pkpPublicKey: myPkp.pubkey,
  authData,
  sessionKeyPair,
  authConfig: {
    resources: [
      'pkp-signing',
      'lit-action-execution',
      'access-control-condition-decryption',
    ],
    expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  },
  litClient,
});

const pkpSessionSigs = await authManager.createPkpSessionSigs({
  sessionKeyPair,
  pkpPublicKey: myPkp.pubkey,
  delegationAuthSig,
  litClient,
});
```

---

## Core API Method Changes

### `executeJs`

#### v7

```typescript
const res = await litNodeClient.executeJs({
  sessionSigs,
  code: `...`,
  jsParams: { magicNumber: 43 },
});
```

#### v8

```typescript
const res = await litClient.executeJs({
  code: `...`,
  authContext: eoaAuthContext,
  jsParams: { magicNumber: 43 },
});
```

### Lit Actions Runtime: `jsParams` is now nested

This is the biggest Lit Actions breaking change.

#### v7 Lit Action

```javascript
if (magicNumber === 42) { ... }
```

#### v8 Lit Action

```javascript
if (jsParams.magicNumber === 42) { ... }
```

In v7, keys in `jsParams` were injected as globals. In v8, all custom inputs live under the global `jsParams` object.

Also prefer `LitActions.*` over `LitActions.*` in new actions.

### `pkpSign`

#### v7

```typescript
const sig = await litNodeClient.pkpSign({
  pubKey: pkpPubKey,
  toSign: ...,
  sessionSigs,
});
```

#### v8

```typescript
const sig = await litClient.chain.ethereum.pkpSign({
  pubKey: pkpPubKey,
  toSign: ...,
  authContext: pkpAuthContext,
  bypassAutoHashing: true, // if you already hashed data (e.g., EIP-712 digest)
});
```

**Notes:**
- PKP signing is now grouped by chain: `litClient.chain.ethereum`, `litClient.chain.bitcoin`, or `litClient.chain.raw`
- Core APIs always require `authContext`; they mint session signatures internally

---

## Encryption / Decryption

### v7 (typical)

```typescript
import { encryptString, decryptToString } from '@lit-protocol/encryption';

const encrypted = await encryptString({
  accessControlConditions,
  dataToEncrypt: secret,
  chain: 'ethereum',
  litNodeClient,
});

const plaintext = await decryptToString({
  accessControlConditions,
  ciphertext: encrypted.ciphertext,
  dataToEncryptHash: encrypted.dataToEncryptHash,
  chain: 'ethereum',
  sessionSigs,
  litNodeClient,
});
```

### v8

```typescript
const encrypted = await litClient.encrypt({
  dataToEncrypt: secret,
  unifiedAccessControlConditions,
  chain: 'ethereum',
});

const plaintext = await litClient.decrypt({
  data: encrypted,
  unifiedAccessControlConditions,
  authContext: eoaAuthContext,
  chain: 'ethereum',
});
```

v8 still accepts `accessControlConditions`, `evmContractConditions`, or `solRpcConditions`, but the unified builder (`createAccBuilder`) plus `unifiedAccessControlConditions` is the recommended path.

---

## Wrapped Keys Migration

Only two changes for most users:
1. Pass `litClient` instead of `litNodeClient`
2. Generate `pkpSessionSigs` via `AuthManager` (section above)

```typescript
import { api as wrappedKeysApi } from '@lit-protocol/wrapped-keys';

const { id } = await wrappedKeysApi.generatePrivateKey({
  pkpSessionSigs,
  litClient,
  network: 'evm',
});
```

---

## Payments: Capacity Credits → Ledger / PaymentManager

v7 Capacity Credits NFTs and `createCapacityDelegationAuthSig` flows are deprecated in v8. In v8:

- Paid networks (`naga-test`, `naga`) charge per request
- Users (or your app) fund a Ledger balance
- Apps can sponsor users by delegating payments

### Minimal Self-Funded Setup

```typescript
const paymentManager = await litClient.getPaymentManager({
  account: myViemAccount,
});

await paymentManager.deposit({ amountInLit: '0.1' });
```

Then call core APIs as usual. Use `userMaxPrice` to cap spend per request:

```typescript
await litClient.executeJs({
  code: ...,
  authContext,
  jsParams,
  userMaxPrice: 1_000_000_000_000_000n,
});
```

### Sponsoring Users (replaces Capacity Delegation)

```typescript
await paymentManager.setRestriction({
  totalMaxPrice: 1000000000000000000, // wei
  requestsPerPeriod: 100,
  periodSeconds: 3600,
});

await paymentManager.delegatePaymentsBatch({
  userAddresses: ['0xAlice', '0xBob'],
});
```

See [Payment Manager Setup](sdk/getting-started/payment-manager-setup) for full details.

---

## If You Used `@lit-protocol/pkp-ethers`

The ethers PKP wallets were removed. Two common replacements:

### 1. Use viem account integration

```typescript
const pkpAccount = await litClient.getPkpViemAccount({
  pkpPublicKey: myPkp.pubkey,
  authContext: pkpAuthContext,
  chainConfig: myViemChain,
});
```

### 2. Call `pkpSign` directly via `litClient.chain.pkpSign()` and assemble transactions yourself

---

## Other Notable Removals / Moves

- `lit-auth-client` and its auth providers are replaced by `@lit-protocol/auth` (+ optional `@lit-protocol/auth-services`)
- Node-only vs browser-only split packages are consolidated; v8 is isomorphic by default
- Low-level helpers from v7 still exist in sub-packages where applicable, but most apps can migrate to the higher-level `litClient`/`authManager` APIs shown here

---

## Troubleshooting After Upgrade

| Issue | Solution |
|-------|----------|
| `magicNumber is not defined` inside Lit Actions | Update Lit Action code to read `jsParams.magicNumber` (see runtime section) |
| Missing peer dependency: `viem` | Install `viem` and ensure your bundler doesn't dedupe it away |
| Insufficient ledger balance / payment required | Deposit funds with `PaymentManager.deposit()` or delegate a payer (paid networks only) |
| Wrapped keys failing with missing `pkpSessionSigs` | Core APIs no longer need session sigs, but wrapped-keys still do. Generate them via `authManager.createPkpSessionSigs()` |

---

## Next Steps

- Browse the v8 SDK docs starting at [Lit Client Setup](sdk/getting-started/lit-client)
- For serverless reuse patterns, see [Server Sessions](guides/server-sessions)

---

*Last updated: January 2026*
