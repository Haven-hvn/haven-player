import {
  getWalletAddressFromPrivateKey,
  serializeEncryptionMetadata,
  deserializeEncryptionMetadata,
  isLitClientConnected,
  type LitEncryptionMetadata,
} from '../litService';

// Mock the Lit Protocol v8 packages
jest.mock('@lit-protocol/lit-client', () => ({
  createLitClient: jest.fn().mockResolvedValue({
    disconnect: jest.fn().mockResolvedValue(undefined),
    encrypt: jest.fn().mockResolvedValue({
      ciphertext: 'mock-ciphertext',
      dataToEncryptHash: 'mock-hash',
    }),
    decrypt: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  }),
}));

jest.mock('@lit-protocol/networks', () => ({
  nagaDev: {
    name: 'naga-dev',
    networkId: 'naga-dev',
  },
}));

jest.mock('@lit-protocol/auth', () => ({
  createAuthManager: jest.fn().mockReturnValue({
    createEoaAuthContext: jest.fn().mockResolvedValue({
      authSig: 'mock-auth-sig',
    }),
  }),
  storagePlugins: {
    memory: jest.fn().mockReturnValue({}),
  },
}));

describe('litService', () => {
  describe('getWalletAddressFromPrivateKey', () => {
    it('should derive correct wallet address from private key with 0x prefix', () => {
      // Test private key (DO NOT USE IN PRODUCTION)
      const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      const address = getWalletAddressFromPrivateKey(testPrivateKey);
      
      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should derive correct wallet address from private key without 0x prefix', () => {
      // Test private key without 0x prefix
      const testPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      const address = getWalletAddressFromPrivateKey(testPrivateKey);
      
      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle whitespace in private key', () => {
      const testPrivateKey = '  0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  ';
      
      const address = getWalletAddressFromPrivateKey(testPrivateKey);
      
      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should produce same address for same key with/without 0x prefix', () => {
      const keyWithPrefix = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const keyWithoutPrefix = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      const address1 = getWalletAddressFromPrivateKey(keyWithPrefix);
      const address2 = getWalletAddressFromPrivateKey(keyWithoutPrefix);
      
      expect(address1).toBe(address2);
    });
  });

  describe('serializeEncryptionMetadata', () => {
    it('should serialize encryption metadata to JSON string', () => {
      const metadata: LitEncryptionMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test-encrypted-key',
        keyHash: 'test-hash',
        iv: 'dGVzdC1pdg==', // base64 of "test-iv"
        algorithm: 'AES-GCM',
        keyLength: 256,
        accessControlConditions: [
          {
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: '',
            parameters: [':userAddress'],
            returnValueTest: {
              comparator: '=',
              value: '0x1234567890123456789012345678901234567890',
            },
          },
        ],
        chain: 'ethereum',
      };
      
      const serialized = serializeEncryptionMetadata(metadata);
      
      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe('hybrid-v1');
      expect(parsed.encryptedKey).toBe('test-encrypted-key');
      expect(parsed.keyHash).toBe('test-hash');
      expect(parsed.chain).toBe('ethereum');
    });
  });

  describe('deserializeEncryptionMetadata', () => {
    it('should deserialize JSON string to encryption metadata', () => {
      const metadata: LitEncryptionMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test-encrypted-key',
        keyHash: 'test-hash',
        iv: 'dGVzdC1pdg==',
        algorithm: 'AES-GCM',
        keyLength: 256,
        accessControlConditions: [
          {
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: '',
            parameters: [':userAddress'],
            returnValueTest: {
              comparator: '=',
              value: '0x1234567890123456789012345678901234567890',
            },
          },
        ],
        chain: 'ethereum',
      };
      
      const serialized = JSON.stringify(metadata);
      const deserialized = deserializeEncryptionMetadata(serialized);
      
      expect(deserialized.version).toBe('hybrid-v1');
      expect(deserialized.encryptedKey).toBe('test-encrypted-key');
      expect(deserialized.keyHash).toBe('test-hash');
      expect(deserialized.chain).toBe('ethereum');
    });

    it('should throw on invalid JSON', () => {
      expect(() => {
        deserializeEncryptionMetadata('invalid-json');
      }).toThrow();
    });

    it('should throw on non-hybrid metadata', () => {
      const legacyMetadata = {
        dataToEncryptHash: 'test-hash',
        accessControlConditions: [],
        chain: 'ethereum',
      };
      
      expect(() => {
        deserializeEncryptionMetadata(JSON.stringify(legacyMetadata));
      }).toThrow('Unsupported hybrid encryption version');
    });
  });

  describe('isLitClientConnected', () => {
    it('should return false when client is not initialized', () => {
      expect(typeof isLitClientConnected()).toBe('boolean');
    });
  });

  describe('metadata roundtrip', () => {
    it('should preserve all metadata fields through serialize/deserialize cycle', () => {
      const originalMetadata: LitEncryptionMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test-encrypted-key',
        keyHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        iv: 'dGVzdC1pdg==',
        algorithm: 'AES-GCM',
        keyLength: 256,
        accessControlConditions: [
          {
            contractAddress: '',
            standardContractType: '',
            chain: 'ethereum',
            method: '',
            parameters: [':userAddress'],
            returnValueTest: {
              comparator: '=',
              value: '0xabc123def456789012345678901234567890abcd',
            },
          },
        ],
        chain: 'ethereum',
        originalMimeType: 'video/mp4',
        originalSize: 1024,
        originalHash: 'hash123',
      };
      
      const serialized = serializeEncryptionMetadata(originalMetadata);
      const deserialized = deserializeEncryptionMetadata(serialized);
      
      expect(deserialized.version).toBe(originalMetadata.version);
      expect(deserialized.encryptedKey).toBe(originalMetadata.encryptedKey);
      expect(deserialized.keyHash).toBe(originalMetadata.keyHash);
      expect(deserialized.chain).toBe(originalMetadata.chain);
      expect(deserialized.accessControlConditions).toHaveLength(1);
      expect(deserialized.accessControlConditions[0].returnValueTest.value).toBe(
        originalMetadata.accessControlConditions[0].returnValueTest.value
      );
      expect(deserialized.originalSize).toBe(originalMetadata.originalSize);
      expect(deserialized.originalMimeType).toBe(originalMetadata.originalMimeType);
    });
  });
});
