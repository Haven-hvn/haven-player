import { uploadVideoToFilecoin } from '../filecoinService';

jest.mock('filecoin-pin/core', () => ({
  createCarFromFile: jest.fn(async () => ({
    carBytes: new Uint8Array([1, 2, 3]),
    rootCid: { toString: () => 'bafyRootCid' },
  })),
}));

const initSynapseMock = jest.fn(async (..._args: unknown[]) => ({ synapse: 'synapse-instance' }));
const createStorageContextMock = jest.fn(async (..._args: unknown[]) => ({
  storage: 'storage-context',
  providerInfo: {},
}));
const cleanupSynapseServiceMock = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('filecoin-pin/core/synapse', () => ({
  initializeSynapse: (...args: unknown[]) => initSynapseMock(...args),
  createStorageContext: (...args: unknown[]) => createStorageContextMock(...args),
  cleanupSynapseService: (...args: unknown[]) => cleanupSynapseServiceMock(...args),
}));

const checkUploadReadinessMock = jest.fn(async (..._args: unknown[]) => ({
  status: 'ready',
  validation: {},
  suggestions: [],
}));
const executeUploadMock = jest.fn(async (..._args: unknown[]) => ({
  pieceCid: 'pieceCid',
  pieceId: 42,
  dataSetId: 'dataSet',
  transactionHash: '0xtx',
  providerInfo: {},
}));

jest.mock('filecoin-pin/core/upload', () => ({
  checkUploadReadiness: (...args: unknown[]) => checkUploadReadinessMock(...args),
  executeUpload: (...args: unknown[]) => executeUploadMock(...args),
}));

jest.mock('@/services/litService', () => ({
  encryptFileForStorage: jest.fn(async (buffer: ArrayBuffer) => ({
    encryptedData: new Uint8Array(buffer),
    metadata: {
      ciphertext: 'cipher',
      dataToEncryptHash: 'hash',
      accessControlConditions: [],
      chain: 'ethereum',
    },
  })),
  serializeEncryptionMetadata: jest.fn(() => 'metadata-json'),
}));

describe('filecoinService initializeSynapseSDK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls initSynapse with the new single-object signature', async () => {
    const file = new File([new Uint8Array([1, 2])], 'video.mp4', { type: 'video/mp4' });

    await uploadVideoToFilecoin({
      file,
      config: {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: false,
      },
      onProgress: () => undefined,
    });

    expect(initSynapseMock).toHaveBeenCalledTimes(1);
    const callArg = initSynapseMock.mock.calls[0][0] as { config: { privateKey: string; rpcUrl: string }; logger?: unknown };
    expect(callArg.config.privateKey).toBe(`0x${'a'.repeat(64)}`);
    expect(callArg.config.rpcUrl).toBe('http://localhost:8545');
    expect(callArg.logger).toBeDefined();
  });

  it('falls back to legacy signature when new signature throws synchronously', async () => {
    initSynapseMock
      .mockImplementationOnce(() => {
        throw new Error('new signature fail');
      })
      .mockImplementationOnce(async (..._args: unknown[]) => ({ synapse: 'legacy-instance' }))
      .mockImplementation(async (..._args: unknown[]) => ({ synapse: 'synapse-instance' }));

    const file = new File([new Uint8Array([1, 2])], 'video.mp4', { type: 'video/mp4' });

    await uploadVideoToFilecoin({
      file,
      config: {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: false,
      },
      onProgress: () => undefined,
    });

    // First call uses new signature, second call falls back to legacy (config, logger)
    expect(initSynapseMock).toHaveBeenCalledTimes(2);
    const legacyCallArgs = initSynapseMock.mock.calls[1];
    expect(legacyCallArgs[0]).toEqual({
      privateKey: `0x${'a'.repeat(64)}`,
      rpcUrl: 'http://localhost:8545',
      telemetry: {
        sentryInitOptions: {
          enabled: false,
        },
      },
    });
    expect(legacyCallArgs[1]).toBeDefined();
  });
});

