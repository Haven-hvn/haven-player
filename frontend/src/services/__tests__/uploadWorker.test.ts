/**
 * Unit tests for UploadWorker
 * Tests cover all major scenarios including bug fixes for null queue entries
 */

import {
  UploadWorker,
  UploadQueueEntry,
  getUploadWorker,
  startUploadWorker,
  stopUploadWorker,
} from '../uploadWorker';
import type { UploadWorkerConfig } from '../../types/plugin';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../filecoinService');
jest.mock('electron', () => ({
  default: {
    getPath: jest.fn(),
  },
  app: {
    getPath: jest.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(),
    decryptString: jest.fn(),
  },
}));

const fs = require('fs');
const path = require('path');
const { uploadVideoToFilecoin } = require('../filecoinService');

describe('UploadWorker', () => {
  let worker: UploadWorker;
  let mockFetch: jest.Mock;
  let mockUploadVideoToFilecoin: jest.Mock;

  beforeEach(() => {
    // Reset modules
    jest.clearAllMocks();
    jest.resetModules();

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Mock filecoin service
    mockUploadVideoToFilecoin = jest.fn();
    jest.doMock('../filecoinService', () => ({
      uploadVideoToFilecoin: mockUploadVideoToFilecoin,
    }));
    (require('../filecoinService') as any).uploadVideoToFilecoin = mockUploadVideoToFilecoin;

    // Mock fs methods
    fs.existsSync = jest.fn();
    fs.statSync = jest.fn();
    fs.readFileSync = jest.fn();

    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 1000000 });
    fs.readFileSync.mockReturnValue(Buffer.from('test video data'));

    // Mock path methods
    path.basename = jest.fn(() => 'test-video.mp4');
    path.join = jest.fn((...args: string[]) => args.join('/'));
    path.extname = jest.fn(() => '.mp4');

    // Mock electron safeStorage
    const { safeStorage } = require('electron');
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.decryptString.mockReturnValue('mock-private-key');

    // Mock electron app
    const { app } = require('electron');
    app.getPath.mockReturnValue('/mock/user/data');

    worker = new UploadWorker({
      enabled: true,
      pollInterval: 100,
    });
  });

  afterEach(() => {
    worker.stop();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration when no config provided', () => {
      const defaultWorker = new UploadWorker();
      const config = defaultWorker.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.pollInterval).toBe(300000);
      expect(config.maxConcurrentUploads).toBe(1);
      expect(config.retryAttempts).toBe(3);
    });

    it('should merge provided config with defaults', () => {
      const customWorker = new UploadWorker({
        enabled: true,
        pollInterval: 5000,
      });
      const config = customWorker.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.pollInterval).toBe(5000);
      expect(config.maxConcurrentUploads).toBe(1); // Default value
      expect(config.retryAttempts).toBe(3); // Default value
    });

    it('should start in stopped state', () => {
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe('start', () => {
    it('should not start if disabled in config', async () => {
      const disabledWorker = new UploadWorker({ enabled: false });
      await disabledWorker.start();

      expect(disabledWorker.isWorkerRunning()).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start();
      await worker.start(); // Try to start again

      expect(worker.isWorkerRunning()).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should start when config is enabled', async () => {
      // Mock no pending uploads
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start();

      expect(worker.isWorkerRunning()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/upload-queue/pop');
    });

    it('should update config when provided as parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start({ pollInterval: 5000 });

      expect(worker.getConfig().pollInterval).toBe(5000);
    });

    it('should process queue immediately on start', async () => {
      const mockQueueEntry: UploadQueueEntry = {
        id: 1,
        video_path: '/test/video.mp4',
        status: 'pending',
        priority: 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        attempts: 0,
        max_attempts: 3,
        error_message: null,
        source: 'plugin',
        arkiv_sync_status: null,
        arkiv_sync_started_at: null,
        arkiv_sync_completed_at: null,
        arkiv_sync_error: null,
        vlm_analysis_status: null,
        vlm_analysis_started_at: null,
        vlm_analysis_completed_at: null,
        vlm_analysis_error: null,
        vlm_json_upload_status: null,
        vlm_json_upload_started_at: null,
        vlm_json_upload_completed_at: null,
        vlm_json_upload_error: null,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockQueueEntry,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockQueueEntry,
        });

      mockUploadVideoToFilecoin.mockResolvedValue({
        rootCid: 'test-cid',
        pieceCid: 'test-piece-cid',
        pieceId: 'test-piece-id',
        dataSetId: 'test-dataset',
        transactionHash: 'test-tx-hash',
        isEncrypted: false,
      });

      await worker.start();

      expect(mockUploadVideoToFilecoin).toHaveBeenCalled();
    });
  });

  describe('processQueue', () => {
    beforeEach(() => {
      worker = new UploadWorker({ enabled: true });
    });

    it('should return early if already processing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      // Force processing state
      (worker as any).isProcessing = true;

      await (worker as any).processQueue();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return early if config is disabled', async () => {
      worker.updateConfig({ enabled: false });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await (worker as any).processQueue();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle no pending uploads (204 status)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await (worker as any).processQueue();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/upload-queue/pop');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await (worker as any).processQueue();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle null queue entry - BUG FIX TEST', async () => {
      // Simulate API returning null
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await (worker as any).processQueue();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[UploadWorker] Invalid queue entry received:',
        null
      );
      expect(mockUploadVideoToFilecoin).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle queue entry with missing video_path - BUG FIX TEST', async () => {
      // Simulate API returning entry without video_path
      const invalidEntry = {
        id: 1,
        video_path: null as any,
        status: 'pending',
        priority: 0,
        created_at: new Date().toISOString(),
        source: 'plugin',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidEntry,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await (worker as any).processQueue();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[UploadWorker] Invalid queue entry received:',
        invalidEntry
      );
      expect(mockUploadVideoToFilecoin).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle queue entry with missing id - BUG FIX TEST', async () => {
      // Simulate API returning entry without id
      const invalidEntry = {
        id: null as any,
        video_path: '/test/video.mp4',
        status: 'pending',
        priority: 0,
        created_at: new Date().toISOString(),
        source: 'plugin',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidEntry,
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await (worker as any).processQueue();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[UploadWorker] Invalid queue entry received:',
        invalidEntry
      );
      expect(mockUploadVideoToFilecoin).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should successfully process valid queue entry', async () => {
      const validEntry: UploadQueueEntry = {
        id: 1,
        video_path: '/test/video.mp4',
        status: 'pending',
        priority: 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        attempts: 0,
        max_attempts: 3,
        error_message: null,
        source: 'plugin',
        arkiv_sync_status: null,
        arkiv_sync_started_at: null,
        arkiv_sync_completed_at: null,
        arkiv_sync_error: null,
        vlm_analysis_status: null,
        vlm_analysis_started_at: null,
        vlm_analysis_completed_at: null,
        vlm_analysis_error: null,
        vlm_json_upload_status: null,
        vlm_json_upload_started_at: null,
        vlm_json_upload_completed_at: null,
        vlm_json_upload_error: null,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => validEntry,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      mockUploadVideoToFilecoin.mockResolvedValue({
        rootCid: 'test-cid',
        pieceCid: 'test-piece-cid',
        pieceId: 'test-piece-id',
        dataSetId: 'test-dataset',
        transactionHash: 'test-tx-hash',
        isEncrypted: false,
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await (worker as any).processQueue();

      expect(mockUploadVideoToFilecoin).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: validEntry.video_path,
        })
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Upload complete:')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('processUpload', () => {
    const validQueueEntry: UploadQueueEntry = {
      id: 1,
      video_path: '/test/video.mp4',
      status: 'pending',
      priority: 0,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      source: 'plugin',
      arkiv_sync_status: null,
      arkiv_sync_started_at: null,
      arkiv_sync_completed_at: null,
      arkiv_sync_error: null,
      vlm_analysis_status: null,
      vlm_analysis_started_at: null,
      vlm_analysis_completed_at: null,
      vlm_analysis_error: null,
      vlm_json_upload_status: null,
      vlm_json_upload_started_at: null,
      vlm_json_upload_completed_at: null,
      vlm_json_upload_error: null,
    };

    it('should handle missing Filecoin config', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await (worker as any).processUpload(validQueueEntry);

      expect(result).toBe(false);
      expect(mockUploadVideoToFilecoin).not.toHaveBeenCalled();
    });

    it('should throw error if video file does not exist', async () => {
      fs.existsSync.mockImplementation((filePath: string) => {
        // Filecoin config exists
        if (typeof filePath === 'string' && filePath.includes('filecoin-config.json')) {
          return true;
        }
        // Video file doesn't exist
        return false;
      });

      const result = await (worker as any).processUpload(validQueueEntry);

      expect(result).toBe(false);
      expect(mockUploadVideoToFilecoin).not.toHaveBeenCalled();
    });

    it('should successfully upload and update status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      mockUploadVideoToFilecoin.mockResolvedValue({
        rootCid: 'bafy-test-cid',
        pieceCid: 'baga-test-piece-cid',
        pieceId: 'test-piece-id',
        dataSetId: 'test-dataset',
        transactionHash: 'test-tx-hash',
        isEncrypted: true,
        encryptionMetadata: { test: 'metadata' },
        encryptedRootCid: 'bafy-encrypted',
        cidEncryptionMetadata: { test: 'cid-metadata' },
      });

      const result = await (worker as any).processUpload(validQueueEntry);

      expect(result).toBe(true);
      expect(mockUploadVideoToFilecoin).toHaveBeenCalled();

      // Verify update status call
      const updateCall = mockFetch.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('/upload-queue/1/status')
      );
      expect(updateCall).toBeDefined();

      const updateBody = JSON.parse(updateCall[1].body);
      expect(updateBody.status).toBe('completed');
      expect(updateBody.filecoin_metadata).toBeDefined();
    });

    it('should handle upload failure and update status to failed', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockUploadVideoToFilecoin.mockRejectedValue(new Error('Upload failed'));

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await (worker as any).processUpload(validQueueEntry);

      expect(result).toBe(false);

      // Verify failed status update
      const updateCall = mockFetch.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('/upload-queue/1/status')
      );
      expect(updateCall).toBeDefined();

      const updateBody = JSON.parse(updateCall[1].body);
      expect(updateBody.status).toBe('failed');
      expect(updateBody.error).toContain('Upload failed');

      errorSpy.mockRestore();
    });

    it('should handle update status failure', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockUploadVideoToFilecoin.mockRejectedValue(new Error('Upload failed'));

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await (worker as any).processUpload(validQueueEntry);

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update failed status:')
      );

      errorSpy.mockRestore();
    });
  });

  describe('loadFilecoinConfig', () => {
    it('should return null if config file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const config = await (worker as any).loadFilecoinConfig();

      expect(config).toBeNull();
    });

    it('should return null if encryption is not available', async () => {
      const { safeStorage } = require('electron');
      safeStorage.isEncryptionAvailable.mockReturnValue(false);

      const config = await (worker as any).loadFilecoinConfig();

      expect(config).toBeNull();
    });

    it('should successfully load and decrypt Filecoin config', async () => {
      fs.existsSync.mockImplementation((filePath: string) => {
        return typeof filePath === 'string' && filePath.includes('filecoin-config.json');
      });

      const mockConfig = {
        encryptedPrivateKey: 'base64-encrypted-key',
        rpcUrl: 'https://test-rpc.com',
        dataSetId: 'test-dataset',
        encryptionEnabled: true,
      };

      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const config = await (worker as any).loadFilecoinConfig();

      expect(config).toEqual({
        privateKey: 'mock-private-key',
        rpcUrl: mockConfig.rpcUrl,
        dataSetId: mockConfig.dataSetId,
        encryptionEnabled: true,
      });
    });

    it('should return null on JSON parse error', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{invalid json}');

      const config = await (worker as any).loadFilecoinConfig();

      expect(config).toBeNull();
    });
  });

  describe('readFileAsFile', () => {
    it('should create File object from video file', async () => {
      const mockStats = { size: 1024000 };
      fs.statSync.mockReturnValue(mockStats);
      fs.readFileSync.mockReturnValue(Buffer.from('test video data'));

      const result = await (worker as any).readFileAsFile('/test/video.mp4');

      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe('test-video.mp4');
      expect(result.type).toBe('video/mp4');
    });

    it('should detect video/webm mimetype', async () => {
      path.extname.mockReturnValue('.webm');
      path.basename.mockReturnValue('test-video.webm');

      const result = await (worker as any).readFileAsFile('/test/video.webm');

      expect(result.type).toBe('video/webm');
    });

    it('should default to application/octet-stream for unknown extensions', async () => {
      path.extname.mockReturnValue('.unknown');
      path.basename.mockReturnValue('test-video.unknown');

      const result = await (worker as any).readFileAsFile('/test/video.unknown');

      expect(result.type).toBe('application/octet-stream');
    });
  });

  describe('stop', () => {
    it('should stop the worker if running', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);

      worker.stop();
      expect(worker.isWorkerRunning()).toBe(false);
    });

    it('should do nothing if not running', () => {
      worker = new UploadWorker();
      expect(worker.isWorkerRunning()).toBe(false);
      worker.stop();
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      worker.updateConfig({
        enabled: true,
        pollInterval: 5000,
      });

      const config = worker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.pollInterval).toBe(5000);
    });

    it('should restart worker when pollInterval changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);

      worker.updateConfig({ pollInterval: 5000 });
      expect(worker.isWorkerRunning()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const originalConfig = worker.getConfig();
      originalConfig.enabled = true;
      originalConfig.pollInterval = 99999;

      const newConfig = worker.getConfig();
      expect(newConfig.enabled).toBe(false);
      expect(newConfig.pollInterval).not.toBe(99999);
    });
  });

  describe('isWorkerRunning', () => {
    it('should return true when worker is running', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);
    });

    it('should return false when worker is stopped', () => {
      worker = new UploadWorker();
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe('Singleton functions', () => {
    beforeEach(() => {
      // Reset singleton instance
      jest.resetModules();
    });

    it('getUploadWorker should return singleton instance', () => {
      const worker1 = getUploadWorker();
      const worker2 = getUploadWorker();

      expect(worker1).toBe(worker2);
    });

    it('startUploadWorker should start the worker', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const instance = startUploadWorker({ enabled: true });

      expect(instance).toBeInstanceOf(UploadWorker);
      expect(instance.isWorkerRunning()).toBe(true);
    });

    it('stopUploadWorker should stop the worker', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      startUploadWorker({ enabled: true });
      stopUploadWorker();

      const instance = getUploadWorker();
      expect(instance.isWorkerRunning()).toBe(false);
    });
  });
});
