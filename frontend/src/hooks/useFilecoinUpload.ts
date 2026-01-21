import { useState, useCallback, useEffect, useRef } from 'react';
import { videoService } from '@/services/api';
import type { FilecoinUploadStatus, FilecoinConfig, FilecoinUploadResult } from '@/types/filecoin';
import type { UploadProgress } from '@/services/filecoinService';

const { ipcRenderer } = require('electron');

export interface UseFilecoinUploadReturn {
  uploadStatus: Record<string, FilecoinUploadStatus>;
  uploadVideo: (videoPath: string, config: FilecoinConfig, onProgressLog?: (message: string) => void) => Promise<FilecoinUploadResult>;
  cancelUpload: (videoPath: string) => void;
  clearStatus: (videoPath: string) => void;
}

export const useFilecoinUpload = (): UseFilecoinUploadReturn => {
  const [uploadStatus, setUploadStatus] = useState<Record<string, FilecoinUploadStatus>>({});
  const [uploadControllers, setUploadControllers] = useState<Record<string, AbortController>>({});

  // Track active listeners for cleanup on unmount
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeListenersRef = useRef<Map<string, (...args: any[]) => void>>(new Map());
  const isMountedRef = useRef(true);

  // Cleanup all listeners on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Clean up all active listeners
      activeListenersRef.current.forEach((handler, videoPath) => {
        ipcRenderer.removeListener('filecoin-upload-progress', handler);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[IPC] Cleaned up orphaned listener for upload: ${videoPath}`);
        }
      });
      activeListenersRef.current.clear();
    };
  }, []);

  const uploadVideo = useCallback(
    async (videoPath: string, config: FilecoinConfig, onProgressLog?: (message: string) => void): Promise<FilecoinUploadResult> => {
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
        if (!isMountedRef.current) return; // Don't update state if unmounted

        setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
          ...prev,
          [videoPath]: {
            status: payload.progress.stage === 'completed' ? 'completed' : 'uploading',
            progress: payload.progress.progress,
          },
        }));

        // Log detailed progress messages if callback provided
        if (onProgressLog && payload.progress.message) {
          // Only log significant stage changes to avoid spam
          const stage = payload.progress.stage;
          const message = payload.progress.message;

          // Log stage transitions and important messages
          if (stage === 'encrypting' || stage === 'creating-car' || stage === 'checking-payments' ||
              stage === 'uploading' || stage === 'validating' || stage === 'completed') {
            // Format progress percentage for display
            const progressPercent = Math.round(payload.progress.progress);
            onProgressLog(`📤 ${message} (${progressPercent}%)`);
          }
        }
      };

      // Track this listener for cleanup
      activeListenersRef.current.set(videoPath, handleProgress);
      ipcRenderer.on('filecoin-upload-progress', handleProgress);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[IPC] Added upload progress listener for: ${videoPath}`);
      }

      const cleanupListener = () => {
        ipcRenderer.removeListener('filecoin-upload-progress', handleProgress);
        activeListenersRef.current.delete(videoPath);

        if (process.env.NODE_ENV === 'development') {
          console.log(`[IPC] Removed upload progress listener for: ${videoPath}`);
        }
      };

      try {
        // Delegate upload to main process to keep heavy work out of renderer
        const result: FilecoinUploadResult = await ipcRenderer.invoke('upload-to-filecoin', {
          videoPath,
          config,
        });

        // Only update state if still mounted
        if (isMountedRef.current) {
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
        }

        // Save Filecoin metadata to backend (can happen even if unmounted)
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
            cid_encryption_metadata: result.cidEncryptionMetadata,
          });
          console.log(`✅ Saved Filecoin metadata for ${videoPath}${result.isEncrypted ? ' (encrypted)' : ''}`);
        } catch (error) {
          // Check if this is a gas error (works across all EVM chains)
          if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error as { response?: { data?: { detail?: string }; status?: number } };
            if (axiosError.response?.status === 402) {
              // Payment Required - insufficient gas
              const errorMessage = axiosError.response.data?.detail || 'Insufficient gas funds';
              if (errorMessage.includes('address:')) {
                // Extract token symbol (e.g., "ETH", "MATIC", "BNB", "AVAX")
                const tokenMatch = errorMessage.match(/Insufficient\s+(\w+)\s+for\s+gas/i);
                const tokenSymbol = tokenMatch ? tokenMatch[1] : 'gas tokens';

                const addressMatch = errorMessage.match(/address:\s*([0-9a-fA-Fx]{42,})/i);
                if (addressMatch) {
                  const walletAddress = addressMatch[1];
                  console.error(
                    `❌ Arkiv sync failed due to insufficient gas funds (${tokenSymbol}) after Filecoin upload | ` +
                    `Wallet Address: ${walletAddress} | ` +
                    `Please send ${tokenSymbol} to this address`
                  );
                }
              }
            }
          }
          console.error(`❌ Failed to save Filecoin metadata for ${videoPath}:`, error);
          // Don't throw - upload was successful, just metadata save failed
        }

        // Clean up
        cleanupListener();
        if (isMountedRef.current) {
          setUploadControllers((prev: Record<string, AbortController>) => {
            const updated = { ...prev };
            delete updated[videoPath];
            return updated;
          });
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';

        // Clean up error message by removing "Filecoin upload failed: " prefix if present
        const cleanedErrorMessage = errorMessage.startsWith('Filecoin upload failed: ')
          ? errorMessage.substring('Filecoin upload failed: '.length)
          : errorMessage;

        // Ensure errors surface in logs for debugging instead of failing silently in the renderer.
        // eslint-disable-next-line no-console
        console.error('[Filecoin Upload] Upload failed', {
          videoPath,
          error: error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error,
        });

        if (isMountedRef.current) {
          setUploadStatus((prev: Record<string, FilecoinUploadStatus>) => ({
            ...prev,
            [videoPath]: {
              status: 'error',
              progress: 0,
              error: cleanedErrorMessage,
            },
          }));

          setUploadControllers((prev: Record<string, AbortController>) => {
            const updated = { ...prev };
            delete updated[videoPath];
            return updated;
          });
        }

        cleanupListener();
        throw error;
      }
    },
    [uploadControllers]
  );

  const cancelUpload = useCallback((videoPath: string) => {
    if (uploadControllers[videoPath]) {
      uploadControllers[videoPath].abort();

      // Clean up the listener for this upload
      const handler = activeListenersRef.current.get(videoPath);
      if (handler) {
        ipcRenderer.removeListener('filecoin-upload-progress', handler);
        activeListenersRef.current.delete(videoPath);

        if (process.env.NODE_ENV === 'development') {
          console.log(`[IPC] Removed listener on cancel for: ${videoPath}`);
        }
      }

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
