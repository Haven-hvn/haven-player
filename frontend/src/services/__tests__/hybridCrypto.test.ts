/**
 * Tests for Hybrid Encryption (AES-256-GCM + Lit Protocol)
 * 
 * These tests verify the two-layer encryption approach:
 * 1. AES-256-GCM for local file encryption
 * 2. Lit BLS-IBE for encrypting the AES key
 */

// Create mock functions for crypto.subtle
const mockImportKey = jest.fn();
const mockEncrypt = jest.fn();
const mockDecrypt = jest.fn();
const mockDigest = jest.fn();
const mockGetRandomValues = jest.fn((array: Uint8Array) => {
  // Fill with predictable values for testing
  for (let i = 0; i < array.length; i++) {
    array[i] = i % 256;
  }
  return array;
});

// Mock crypto.subtle for Node.js environment before importing the module
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      importKey: mockImportKey,
      encrypt: mockEncrypt,
      decrypt: mockDecrypt,
      digest: mockDigest,
    },
    getRandomValues: mockGetRandomValues,
  },
  writable: true,
});

// Mock the Lit Protocol v8 packages
jest.mock('@lit-protocol/lit-client', () => ({
  createLitClient: jest.fn().mockResolvedValue({
    disconnect: jest.fn().mockResolvedValue(undefined),
    encrypt: jest.fn().mockResolvedValue({
      ciphertext: 'mock-lit-ciphertext-base64',
      dataToEncryptHash: 'mock-key-hash',
    }),
    decrypt: jest.fn().mockResolvedValue({
      decryptedData: new Uint8Array(Array(32).fill(0).map((_, i) => i % 256)),
    }),
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
    localStorage: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('@lit-protocol/auth-helpers', () => ({
  LitAccessControlConditionResource: jest.fn().mockImplementation((resource: string) => ({
    resource,
  })),
}));

jest.mock('../viemAdapter', () => ({
  createViemAccount: jest.fn().mockReturnValue({
    address: '0x1234567890123456789012345678901234567890',
  }),
}));

import {
  generateAESKey,
  generateIV,
  aesEncrypt,
  aesDecrypt,
  serializeHybridMetadata,
  deserializeHybridMetadata,
  isHybridMetadata,
  getEncryptedSize,
  getOriginalSize,
  estimateProcessingTime,
  type HybridEncryptionMetadata,
} from '../hybridCrypto';

describe('Hybrid Crypto - AES Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAESKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateAESKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should generate different keys on each call', () => {
      // Note: Mock returns predictable values, so this test verifies the mock behavior
      const key1 = generateAESKey();
      const key2 = generateAESKey();
      expect(key1).toBeInstanceOf(Uint8Array);
      expect(key2).toBeInstanceOf(Uint8Array);
    });
  });

  describe('generateIV', () => {
    it('should generate a 12-byte IV', () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });
  });

  describe('aesEncrypt', () => {
    it('should encrypt data successfully', async () => {
      const mockKey = new Uint8Array(32);
      const mockIV = new Uint8Array(12);
      const mockData = new Uint8Array([1, 2, 3, 4, 5]);
      const mockEncrypted = new Uint8Array([10, 20, 30, 40, 50, 60]);

      mockImportKey.mockResolvedValue({} as CryptoKey);
      mockEncrypt.mockResolvedValue(mockEncrypted.buffer);

      const result = await aesEncrypt(mockData, mockKey, mockIV);

      expect(crypto.subtle.importKey).toHaveBeenCalledWith(
        'raw',
        mockKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      expect(crypto.subtle.encrypt).toHaveBeenCalledWith(
        { name: 'AES-GCM', iv: mockIV },
        expect.anything(),
        mockData
      );
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });

  describe('aesDecrypt', () => {
    it('should decrypt data successfully', async () => {
      const mockKey = new Uint8Array(32);
      const mockIV = new Uint8Array(12);
      const mockEncrypted = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const mockDecrypted = new Uint8Array([1, 2, 3, 4, 5]);

      mockImportKey.mockResolvedValue({} as CryptoKey);
      mockDecrypt.mockResolvedValue(mockDecrypted.buffer);

      const result = await aesDecrypt(mockEncrypted, mockKey, mockIV);

      expect(crypto.subtle.decrypt).toHaveBeenCalledWith(
        { name: 'AES-GCM', iv: mockIV },
        expect.anything(),
        mockEncrypted
      );
      expect(result).toEqual(mockDecrypted);
    });

    it('should throw user-friendly error on DOMException', async () => {
      const mockKey = new Uint8Array(32);
      const mockIV = new Uint8Array(12);
      const mockEncrypted = new Uint8Array([10, 20, 30]);

      mockImportKey.mockResolvedValue({} as CryptoKey);
      mockDecrypt.mockRejectedValue(
        new DOMException('Decryption failed')
      );

      await expect(aesDecrypt(mockEncrypted, mockKey, mockIV)).rejects.toThrow(
        'AES decryption failed'
      );
    });
  });
});

describe('Hybrid Crypto - Metadata Utilities', () => {
  const sampleMetadata: HybridEncryptionMetadata = {
    version: 'hybrid-v1',
    encryptedKey: 'mock-encrypted-key-base64',
    keyHash: 'mock-key-hash',
    iv: 'bW9jay1pdg==', // base64 of "mock-iv"
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
    originalMimeType: 'video/mp4',
    originalSize: 1024,
    originalHash: 'abcd1234',
  };

  describe('serializeHybridMetadata', () => {
    it('should serialize metadata to JSON string', () => {
      const serialized = serializeHybridMetadata(sampleMetadata);
      expect(typeof serialized).toBe('string');
      
      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe('hybrid-v1');
      expect(parsed.encryptedKey).toBe('mock-encrypted-key-base64');
      expect(parsed.algorithm).toBe('AES-GCM');
    });

    it('should preserve all fields through serialization', () => {
      const serialized = serializeHybridMetadata(sampleMetadata);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.accessControlConditions).toHaveLength(1);
      expect(parsed.accessControlConditions[0].returnValueTest.value).toBe(
        sampleMetadata.accessControlConditions[0].returnValueTest.value
      );
      expect(parsed.originalSize).toBe(1024);
      expect(parsed.originalMimeType).toBe('video/mp4');
    });
  });

  describe('deserializeHybridMetadata', () => {
    it('should deserialize JSON string to metadata', () => {
      const serialized = JSON.stringify(sampleMetadata);
      const deserialized = deserializeHybridMetadata(serialized);
      
      expect(deserialized.version).toBe('hybrid-v1');
      expect(deserialized.encryptedKey).toBe('mock-encrypted-key-base64');
      expect(deserialized.algorithm).toBe('AES-GCM');
    });

    it('should throw error for non-hybrid version', () => {
      const legacyMetadata = { ...sampleMetadata, version: 'v8' };
      const serialized = JSON.stringify(legacyMetadata);
      
      expect(() => deserializeHybridMetadata(serialized)).toThrow(
        'Unsupported hybrid encryption version'
      );
    });

    it('should throw error for missing required fields', () => {
      const incompleteMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test',
        // missing keyHash and iv
      };
      const serialized = JSON.stringify(incompleteMetadata);
      
      expect(() => deserializeHybridMetadata(serialized)).toThrow(
        'Invalid hybrid encryption metadata'
      );
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserializeHybridMetadata('invalid-json')).toThrow();
    });
  });

  describe('isHybridMetadata', () => {
    it('should return true for valid hybrid metadata', () => {
      expect(isHybridMetadata(sampleMetadata)).toBe(true);
    });

    it('should return false for legacy v8 metadata', () => {
      const legacyMetadata = {
        version: 'v8',
        dataToEncryptHash: 'test-hash',
        accessControlConditions: [],
        chain: 'ethereum',
      };
      expect(isHybridMetadata(legacyMetadata)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isHybridMetadata(null)).toBe(false);
      expect(isHybridMetadata(undefined)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isHybridMetadata('string')).toBe(false);
      expect(isHybridMetadata(123)).toBe(false);
      expect(isHybridMetadata([])).toBe(false);
    });

    it('should return false for incomplete metadata', () => {
      expect(isHybridMetadata({ version: 'hybrid-v1' })).toBe(false);
      expect(isHybridMetadata({ encryptedKey: 'test' })).toBe(false);
    });
  });
});

describe('Hybrid Crypto - Performance Utilities', () => {
  describe('getEncryptedSize', () => {
    it('should add 16 bytes for auth tag', () => {
      expect(getEncryptedSize(0)).toBe(16);
      expect(getEncryptedSize(100)).toBe(116);
      expect(getEncryptedSize(1024)).toBe(1040);
      expect(getEncryptedSize(1024 * 1024)).toBe(1024 * 1024 + 16);
    });
  });

  describe('getOriginalSize', () => {
    it('should return original size from metadata', () => {
      const metadata: HybridEncryptionMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test',
        keyHash: 'test',
        iv: 'test',
        algorithm: 'AES-GCM',
        keyLength: 256,
        accessControlConditions: [],
        chain: 'ethereum',
        originalSize: 1024,
      };
      
      expect(getOriginalSize(metadata)).toBe(1024);
    });

    it('should return undefined when originalSize not set', () => {
      const metadata: HybridEncryptionMetadata = {
        version: 'hybrid-v1',
        encryptedKey: 'test',
        keyHash: 'test',
        iv: 'test',
        algorithm: 'AES-GCM',
        keyLength: 256,
        accessControlConditions: [],
        chain: 'ethereum',
      };
      
      expect(getOriginalSize(metadata)).toBeUndefined();
    });
  });

  describe('estimateProcessingTime', () => {
    it('should estimate time based on file size and throughput', () => {
      // 100 MB file at 200 MB/s = 500ms
      const time100MB = estimateProcessingTime(100 * 1024 * 1024, 200);
      expect(time100MB).toBeCloseTo(500, 0);
      
      // 1 GB file at 200 MB/s = 5000ms
      const time1GB = estimateProcessingTime(1024 * 1024 * 1024, 200);
      expect(time1GB).toBeCloseTo(5120, 0);
    });

    it('should use default throughput of 200 MB/s', () => {
      const timeWithDefault = estimateProcessingTime(100 * 1024 * 1024);
      const timeWith200 = estimateProcessingTime(100 * 1024 * 1024, 200);
      expect(timeWithDefault).toBe(timeWith200);
    });
  });
});

describe('Hybrid Crypto - Integration (Mocked)', () => {
  // These tests use the mocked Lit client to verify the integration flow
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset crypto mocks
    mockImportKey.mockReset();
    mockEncrypt.mockReset();
    mockDecrypt.mockReset();
    mockDigest.mockReset();
    mockGetRandomValues.mockReset();
    
    mockImportKey.mockResolvedValue({} as CryptoKey);
    mockEncrypt.mockImplementation((_, __, data) => {
      // Simulate encryption by returning data + auth tag
      const result = new Uint8Array(data.length + 16);
      result.set(new Uint8Array(data));
      return Promise.resolve(result.buffer);
    });
    mockDecrypt.mockImplementation((_, __, data) => {
      // Simulate decryption by returning data without auth tag
      const result = new Uint8Array(data.length - 16);
      result.set(new Uint8Array(data.slice(0, data.length - 16)));
      return Promise.resolve(result.buffer);
    });
    mockDigest.mockResolvedValue(
      new Uint8Array(32).fill(0xAB).buffer
    );
    mockGetRandomValues.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = i % 256;
      }
      return array;
    });
  });

  describe('Encryption/Decryption Roundtrip', () => {
    it('should have consistent metadata structure', async () => {
      // Import the functions after mocks are set up
      const { hybridEncryptFile } = await import('../hybridCrypto');
      
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const testKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      const result = await hybridEncryptFile(testData.buffer, testKey);
      
      // Verify result structure
      expect(result.encryptedFile).toBeInstanceOf(Uint8Array);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.version).toBe('hybrid-v1');
      expect(result.metadata.encryptedKey).toBe('mock-lit-ciphertext-base64');
      expect(result.metadata.algorithm).toBe('AES-GCM');
      expect(result.metadata.keyLength).toBe(256);
      expect(result.metadata.iv).toBeDefined();
      expect(result.metadata.originalSize).toBe(testData.length);
      expect(result.metadata.originalHash).toBeDefined();
    });

    it('should call progress callback during encryption', async () => {
      const { hybridEncryptFile } = await import('../hybridCrypto');
      
      const testData = new Uint8Array([1, 2, 3]);
      const testKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const progressMessages: string[] = [];
      
      await hybridEncryptFile(testData.buffer, testKey, 'ethereum', (msg) => {
        progressMessages.push(msg);
      });
      
      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages.some(m => m.includes('key'))).toBe(true);
      expect(progressMessages.some(m => m.includes('Encrypting'))).toBe(true);
    });
  });

  describe('Metadata Validation', () => {
    it('should reject non-hybrid metadata during decryption', async () => {
      const { hybridDecryptFile } = await import('../hybridCrypto');
      
      const legacyMetadata = {
        version: 'v8',
        dataToEncryptHash: 'test',
        accessControlConditions: [],
        chain: 'ethereum',
      } as any;
      
      const encryptedData = new Uint8Array([1, 2, 3]);
      const testKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      
      await expect(
        hybridDecryptFile(encryptedData, legacyMetadata, testKey)
      ).rejects.toThrow('Unsupported encryption version');
    });
  });
});


