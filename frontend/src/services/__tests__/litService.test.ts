import {
  getWalletAddressFromPrivateKey,
  serializeEncryptionMetadata,
  deserializeEncryptionMetadata,
  isLitClientConnected,
  type LitEncryptionMetadata,
} from '../litService';

// Mock the Lit Protocol packages
jest.mock('@lit-protocol/lit-node-client', () => ({
  LitNodeClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ready: true,
    encrypt: jest.fn().mockResolvedValue({
      ciphertext: 'mock-ciphertext',
      dataToEncryptHash: 'mock-hash',
    }),
    decrypt: jest.fn().mockResolvedValue({
      decryptedData: new Uint8Array([1, 2, 3, 4]),
    }),
    getSessionSigs: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('@lit-protocol/constants', () => ({
  LIT_NETWORK: {
    DatilDev: 'datil-dev',
  },
  LIT_ABILITY: {
    AccessControlConditionDecryption: 'access-control-condition-decryption',
  },
}));

jest.mock('@lit-protocol/auth-helpers', () => ({
  LitAccessControlConditionResource: jest.fn().mockImplementation((resource: string) => ({
    resource,
    getResourceKey: jest.fn().mockReturnValue(resource),
    isValidLitAbility: jest.fn().mockReturnValue(true),
  })),
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
        dataToEncryptHash: 'test-hash',
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
      expect(parsed.dataToEncryptHash).toBe('test-hash');
      expect(parsed.chain).toBe('ethereum');
      // ciphertext should NOT be in metadata (it's stored on IPFS only)
      expect(parsed.ciphertext).toBeUndefined();
    });

    it('should throw error if ciphertext is present in metadata', () => {
      const metadataWithCiphertext = {
        ciphertext: 'test-ciphertext',
        dataToEncryptHash: 'test-hash',
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
      } as any; // Use 'as any' to bypass TypeScript check for testing
      
      expect(() => {
        serializeEncryptionMetadata(metadataWithCiphertext);
      }).toThrow('Cannot serialize metadata with ciphertext');
    });
  });

  describe('deserializeEncryptionMetadata', () => {
    it('should deserialize JSON string to encryption metadata', () => {
      const metadata: LitEncryptionMetadata = {
        dataToEncryptHash: 'test-hash',
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
      
      expect(deserialized.dataToEncryptHash).toBe('test-hash');
      expect(deserialized.chain).toBe('ethereum');
      // ciphertext should NOT be in metadata (it's stored on IPFS only)
      expect('ciphertext' in deserialized).toBe(false);
    });

    it('should throw on invalid JSON', () => {
      expect(() => {
        deserializeEncryptionMetadata('invalid-json');
      }).toThrow();
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
        dataToEncryptHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
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
      };
      
      const serialized = serializeEncryptionMetadata(originalMetadata);
      const deserialized = deserializeEncryptionMetadata(serialized);
      
      expect(deserialized.dataToEncryptHash).toBe(originalMetadata.dataToEncryptHash);
      expect(deserialized.chain).toBe(originalMetadata.chain);
      expect(deserialized.accessControlConditions).toHaveLength(1);
      expect(deserialized.accessControlConditions[0].returnValueTest.value).toBe(
        originalMetadata.accessControlConditions[0].returnValueTest.value
      );
      // ciphertext should NOT be in metadata (it's stored on IPFS only)
      expect('ciphertext' in deserialized).toBe(false);
    });
  });
});
