/**
 * Lit Protocol Service Wrapper for Deno
 * 
 * Wraps the Lit SDK to provide a clean interface for the Python CLI.
 */

import { createLitClient, type LitClient } from "npm:@lit-protocol/lit-client@^8.2.3";
import { nagaDev } from "npm:@lit-protocol/networks@^8.4.1";
import { createAuthManager, storagePlugins } from "npm:@lit-protocol/auth@^8.2.3";
import { LitAccessControlConditionResource } from "npm:@lit-protocol/auth-helpers@^8.2.3";
import { ethers } from "npm:ethers@^6.16.0";
import { privateKeyToAccount } from "npm:viem@^2.38.3/accounts";

// Re-export types
export interface EncryptionResult {
    encryptedFile: string; // base64 encoded
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

export interface DecryptionResult {
    data: string; // base64 encoded
}

// Access control condition type
interface AccessControlCondition {
    contractAddress: string;
    standardContractType: string;
    chain: string;
    method: string;
    parameters: string[];
    returnValueTest: {
        comparator: string;
        value: string;
    };
}

export class LitService {
    private client: LitClient | null = null;
    private authManager: ReturnType<typeof createAuthManager> | null = null;
    private initPromise: Promise<void> | null = null;

    /**
     * Initialize Lit client and auth manager.
     */
    async initialize(): Promise<void> {
        if (this.client) return;
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = (async () => {
            this.client = await createLitClient({ network: nagaDev });
            
            this.authManager = createAuthManager({
                storage: storagePlugins.localStorage({
                    appName: "haven-cli",
                    networkName: "naga-dev",
                }),
            });

            console.log("[LitService] Connected to Lit network (naga-dev)");
        })();

        await this.initPromise;
    }

    /**
     * Encrypt a file using hybrid encryption (AES-256-GCM + Lit Protocol).
     * 
     * @param fileData - Raw file bytes (as array)
     * @param privateKey - Ethereum private key (with or without 0x prefix)
     * @returns Encryption result with encrypted file and metadata
     */
    async encryptFile(
        fileData: number[],
        privateKey: string
    ): Promise<EncryptionResult> {
        await this.initialize();

        const data = new Uint8Array(fileData);
        const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
        
        // Generate AES key
        const aesKey = crypto.getRandomValues(new Uint8Array(32));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // Encrypt file with AES-GCM
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            aesKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt"]
        );
        
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            data
        );
        
        const encryptedFile = new Uint8Array(encryptedBuffer);
        
        // Encrypt AES key with Lit
        const wallet = new ethers.Wallet(normalizedKey);
        const accessControlConditions: AccessControlCondition[] = [
            {
                contractAddress: "",
                standardContractType: "",
                chain: "ethereum",
                method: "",
                parameters: [":userAddress"],
                returnValueTest: {
                    comparator: "=",
                    value: wallet.address.toLowerCase(),
                },
            },
        ];

        const unifiedConditions = accessControlConditions.map(c => ({
            conditionType: "evmBasic" as const,
            ...c,
        }));

        const litResult = await this.client!.encrypt({
            dataToEncrypt: aesKey.buffer as ArrayBuffer,
            unifiedAccessControlConditions: unifiedConditions,
            chain: "ethereum",
        });

        // Clear key from memory
        aesKey.fill(0);

        return {
            encryptedFile: btoa(String.fromCharCode(...encryptedFile)),
            metadata: {
                version: "hybrid-v1",
                encryptedKey: litResult.ciphertext,
                keyHash: litResult.dataToEncryptHash,
                iv: btoa(String.fromCharCode(...iv)),
                algorithm: "AES-GCM",
                keyLength: 256,
                accessControlConditions,
                chain: "ethereum",
            },
        };
    }

    /**
     * Decrypt a file using hybrid decryption.
     * 
     * @param encryptedData - Base64-encoded encrypted file
     * @param metadata - Encryption metadata from encryptFile
     * @param privateKey - Ethereum private key
     * @returns Decrypted file data (base64 encoded)
     */
    async decryptFile(
        encryptedData: string,
        metadata: EncryptionResult["metadata"],
        privateKey: string
    ): Promise<DecryptionResult> {
        await this.initialize();

        const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
        
        // Create viem account for auth
        const account = privateKeyToAccount(normalizedKey as `0x${string}`);

        // Create auth context
        const authContext = await this.authManager!.createEoaAuthContext({
            authConfig: {
                domain: "haven-player.local",
                statement: "Sign this message to decrypt with Haven CLI",
                resources: [
                    {
                        resource: new LitAccessControlConditionResource("*"),
                        ability: "access-control-condition-decryption",
                    },
                ],
                expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
            },
            config: { account },
            litClient: this.client!,
        });

        // Decrypt AES key
        const unifiedConditions = metadata.accessControlConditions.map(c => ({
            conditionType: "evmBasic" as const,
            ...c,
        }));

        const keyResult = await this.client!.decrypt({
            data: {
                ciphertext: metadata.encryptedKey,
                dataToEncryptHash: metadata.keyHash,
            },
            unifiedAccessControlConditions: unifiedConditions,
            authContext,
            chain: metadata.chain,
        } as any);

        const aesKey = new Uint8Array(keyResult.decryptedData);

        try {
            // Decrypt file
            const iv = Uint8Array.from(atob(metadata.iv), c => c.charCodeAt(0));
            const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

            const cryptoKey = await crypto.subtle.importKey(
                "raw",
                aesKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["decrypt"]
            );

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                cryptoKey,
                encryptedBytes
            );

            const decrypted = new Uint8Array(decryptedBuffer);
            
            return {
                data: btoa(String.fromCharCode(...decrypted)),
            };
        } finally {
            // Clear key from memory
            aesKey.fill(0);
        }
    }

    /**
     * Disconnect from Lit network.
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.disconnect();
            this.client = null;
            this.authManager = null;
            this.initPromise = null;
        }
    }
}
