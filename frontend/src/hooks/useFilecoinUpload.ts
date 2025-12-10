import { useState, useCallback } from 'react';
import { videoService } from '@/services/api';
import type { FilecoinUploadStatus, FilecoinConfig, FilecoinUploadResult } from '@/types/filecoin';
import type { UploadProgress } from '@/services/filecoinService';

const { ipcRenderer } = require('electron');

export interface UseFilecoinUploadReturn {
  uploadStatus: Record<string, FilecoinUploadStatus>;
  uploadVideo: (videoPath: string, config: FilecoinConfig) => Promise<FilecoinUploadResult>;
  cancelUpload: (videoPath: string) => void;
  clearStatus: (videoPath: string) => void;
}

export const useFilecoinUpload = (): UseFilecoinUploadReturn => {
  const [uploadStatus, setUploadStatus] = useState<Record<string, FilecoinUploadStatus>>({});
  const [uploadControllers, setUploadControllers] = useState<Record<string, AbortController>>({});

  const uploadVideo = useCallback(
    async (videoPath: string, config: FilecoinConfig): Promise<FilecoinUploadResult> => {
      // Cancel any existing upload for this video
      if (uploadControllers[videoPath]) {
        uploadControllers[videoPath].abort();
      }

      const controller = new AbortController();
      setUploadControllers((prev: Record<string, AbortController>) => ({ ...prev, [videoPath]: controller }));

      // Set initial status
      setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
        ...prev,
        [videoPath]: {
          status: 'uploading',
          progress: 0,
        },
      }));

      const handleProgress = (_: unknown, payload: { videoPath: string; progress: UploadProgress }) => {
        if (payload.videoPath !== videoPath) return;
        if (controller.signal.aborted) return;

        setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
          ...prev,
          [videoPath]: {
            status: payload.progress.stage === 'completed' ? 'completed' : 'uploading',
            progress: payload.progress.progress,
          },
        }));
      };

      ipcRenderer.on('filecoin-upload-progress', handleProgress);

      try {
        // Delegate upload to main process to keep heavy work out of renderer
        const result: FilecoinUploadResult = await ipcRenderer.invoke('upload-to-filecoin', {
          videoPath,
          config,
        });

        // Update status with result
        setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
          ...prev,
          [videoPath]: {
            status: 'completed',
            progress: 100,
            rootCid: result.rootCid,
            pieceCid: result.pieceCid,
            pieceId: result.pieceId,
            dataSetId: result.dataSetId,
            transactionHash: result.transactionHash,
            isEncrypted: result.isEncrypted,
          },
        }));

        // Save Filecoin metadata to backend (including encryption metadata if present)
        try {
          await videoService.updateFilecoinMetadata(videoPath, {
            root_cid: result.rootCid,
            piece_cid: result.pieceCid,
            piece_id: result.pieceId,
            data_set_id: result.dataSetId,
            transaction_hash: result.transactionHash,
            is_encrypted: result.isEncrypted ?? false,
            lit_encryption_metadata: result.encryptionMetadata,
            encrypted_root_cid: result.encryptedRootCid,
          });
          console.log(`✅ Saved Filecoin metadata for ${videoPath}${result.isEncrypted ? ' (encrypted)' : ''}`);
        } catch (error) {
          console.error(`❌ Failed to save Filecoin metadata for ${videoPath}:`, error);
          // Don't throw - upload was successful, just metadata save failed
        }

        // Clean up controller
        setUploadControllers((prev: Record<string, AbortController>) => {
          const updated = { ...prev };
          delete updated[videoPath];
          return updated;
        });

        ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
        return result;
      } catch (error) {
        let errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        // Clean up error message by removing "Filecoin upload failed: " prefix if present
        if (errorMessage.startsWith('Filecoin upload failed: ')) {
          errorMessage = errorMessage.substring('Filecoin upload failed: '.length);
        }
        
        // Ensure errors surface in logs for debugging instead of failing silently in the renderer.
        // eslint-disable-next-line no-console
        console.error('[Filecoin Upload] Upload failed', {
          videoPath,
          error: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error,
        });

        setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
          ...prev,
          [videoPath]: {
            status: 'error',
            progress: 0,
            error: errorMessage,
          },
        }));

        // Clean up controller
        setUploadControllers((prev: Record<string, AbortController>) => {
          const updated = { ...prev };
          delete updated[videoPath];
          return updated;
        });

        ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
        throw error;
      }
    },
    [uploadControllers]
  );

  const cancelUpload = useCallback((videoPath: string) => {
    if (uploadControllers[videoPath]) {
      uploadControllers[videoPath].abort();
      setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
        ...prev,
        [videoPath]: {
          status: 'error',
          progress: 0,
          error: 'Upload cancelled',
        },
      }));
      setUploadControllers((prev: Record<string, AbortController>) => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });
    }
  }, [uploadControllers]);

  const clearStatus = useCallback((videoPath: string) => {
    setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => {
      const updated = { ...prev };
      delete updated[videoPath];
      return updated;
    });
  }, []);

  return {
    uploadStatus,
    uploadVideo,
    cancelUpload,
    clearStatus,
  };
};

