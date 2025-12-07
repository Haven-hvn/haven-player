import { uploadVideoToFilecoin } from '../filecoinService';

const buildCarMock = jest.fn<
  Promise<{ carPath: string; rootCid: string; size?: number }>,
  [string, { logger?: unknown }?]
>(async () => ({
  carPath: '/tmp/test.car',
  rootCid: 'bafyRootCid',
  size: 3,
}));

const cleanupCarMock = jest.fn<Promise<void>, [string, unknown?]>(async () => undefined);

jest.mock('filecoin-pin/core/unixfs', () => ({
  createUnixfsCarBuilder: () => ({
    buildCar: (...args: Parameters<typeof buildCarMock>) => buildCarMock(...args),
    cleanup: (...args: Parameters<typeof cleanupCarMock>) => cleanupCarMock(...args),
  }),
}));

const readFileMock = jest.fn<Promise<Buffer>, [string]>(async () => Buffer.from([1, 2, 3]));
const mkdtempMock = jest.fn<Promise<string>, [string]>(async (prefix: string) => `${prefix}temp`);
const writeFileMock = jest.fn<Promise<void>, [string, Buffer]>(async () => undefined);
const rmMock = jest.fn<Promise<void>, [string, { recursive?: boolean; force?: boolean }?]>(async () => undefined);

jest.mock('fs/promises', () => ({
  readFile: (...args: Parameters<typeof readFileMock>) => readFileMock(...args),
  mkdtemp: (...args: Parameters<typeof mkdtempMock>) => mkdtempMock(...args),
  writeFile: (...args: Parameters<typeof writeFileMock>) => writeFileMock(...args),
  rm: (...args: Parameters<typeof rmMock>) => rmMock(...args),
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
      filePath: '/tmp/video.mp4',
      config: {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: false,
      },
      onProgress: () => undefined,
    });

    expect(buildCarMock).toHaveBeenCalledWith(
      '/tmp/video.mp4',
      expect.objectContaining({ logger: expect.any(Object) })
    );
    expect(readFileMock).toHaveBeenCalledWith('/tmp/test.car');
    expect(cleanupCarMock).toHaveBeenCalledTimes(1);
    expect(mkdtempMock).not.toHaveBeenCalled();

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
      filePath: '/tmp/video.mp4',
      config: {
        privateKey: `0x${'a'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: false,
      },
      onProgress: () => undefined,
    });

    expect(buildCarMock).toHaveBeenCalledWith(
      '/tmp/video.mp4',
      expect.objectContaining({ logger: expect.any(Object) })
    );

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

  it('writes encrypted uploads to a temp path and cleans up artifacts', async () => {
    mkdtempMock.mockResolvedValueOnce('/tmp/haven-filecoin-src-temp');
    const file = new File([new Uint8Array([9, 8, 7])], 'video.mp4', { type: 'video/mp4' });

    await uploadVideoToFilecoin({
      file,
      config: {
        privateKey: `0x${'b'.repeat(64)}`,
        rpcUrl: 'http://localhost:8545',
        encryptionEnabled: true,
      },
      onProgress: () => undefined,
    });

    expect(mkdtempMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(buildCarMock).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/haven-filecoin-src-temp'),
      expect.objectContaining({ logger: expect.any(Object) })
    );
    expect(cleanupCarMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalledWith('/tmp/haven-filecoin-src-temp', expect.objectContaining({ force: true, recursive: true }));
  });
});

