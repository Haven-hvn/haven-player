import { useState, useCallback, useEffect } from 'react';
import { Video } from '@/types/video';
import type { FilecoinConfig } from '@/types/filecoin';
import {
  decryptFileFromStorage,
  deserializeEncryptionMetadata,
  type LitEncryptionMetadata,
} from '@/services/litService';

const { ipcRenderer } = require('electron');

export interface DecryptionStatus {
  status: 'idle' | 'loading' | 'decrypting' | 'completed' | 'error';
  progress: string;
  error?: string;
}

export interface UseLitDecryptionReturn {
  decryptedUrl: string | null;
  decryptionStatus: DecryptionStatus;
  decryptVideo: (video: Video) => Promise<string | null>;
  clearDecryptedUrl: () => void;
  isEncrypted: boolean;
}

/**
 * Hook for decrypting Lit Protocol encrypted videos during playback
 */
export const useLitDecryption = (): UseLitDecryptionReturn => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [decryptionStatus, setDecryptionStatus] = useState<DecryptionStatus>({
    status: 'idle',
    progress: '',
  });
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false);

  // Clean up blob URL when component unmounts or when decryption is cleared
  useEffect(() => {
    return () => {
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
  }, [decryptedUrl]);

  /**
   * Clear the decrypted URL and revoke the blob URL
   */
  const clearDecryptedUrl = useCallback(() => {
    if (decryptedUrl) {
      URL.revokeObjectURL(decryptedUrl);
    }
    setDecryptedUrl(null);
    setDecryptionStatus({ status: 'idle', progress: '' });
    setIsEncrypted(false);
  }, [decryptedUrl]);

  /**
   * Decrypt an encrypted video and return a blob URL for playback
   */
  const decryptVideo = useCallback(
    async (video: Video): Promise<string | null> => {
      // Check if video is encrypted
      if (!video.is_encrypted || !video.lit_encryption_metadata) {
        setIsEncrypted(false);
        setDecryptionStatus({ status: 'idle', progress: '' });
        return null;
      }

      setIsEncrypted(true);
      setDecryptionStatus({
        status: 'loading',
        progress: 'Loading encryption configuration...',
      });

      try {
        // Get the Filecoin config (which contains the private key)
        const config: FilecoinConfig | null = await ipcRenderer.invoke('get-filecoin-config');
        
        if (!config || !config.privateKey) {
          throw new Error('Private key not configured. Please configure your wallet in Filecoin settings.');
        }

        setDecryptionStatus({
          status: 'decrypting',
          progress: 'Connecting to Lit Protocol...',
        });

        // Parse the encryption metadata
        let metadata: LitEncryptionMetadata;
        try {
          metadata = deserializeEncryptionMetadata(video.lit_encryption_metadata);
        } catch (parseError) {
          throw new Error('Invalid encryption metadata. The video may be corrupted.');
        }

        // Read the encrypted file from disk
        // The file on disk is the encrypted version
        setDecryptionStatus({
          status: 'decrypting',
          progress: 'Reading encrypted file...',
        });

        const fileData = await ipcRenderer.invoke('read-video-file', video.path);
        const encryptedData = new Uint8Array(fileData.data);

        // Decrypt the file using Lit Protocol
        const decryptedBlob = await decryptFileFromStorage(
          encryptedData,
          metadata,
          config.privateKey,
          'video/mp4',
          (message: string) => {
            setDecryptionStatus({
              status: 'decrypting',
              progress: message,
            });
          }
        );

        // Create a blob URL for playback
        const blobUrl = URL.createObjectURL(decryptedBlob);
        
        setDecryptedUrl(blobUrl);
        setDecryptionStatus({
          status: 'completed',
          progress: 'Decryption complete',
        });

        return blobUrl;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Decryption failed';
        console.error('[Lit Decryption] Error:', errorMessage);
        
        setDecryptionStatus({
          status: 'error',
          progress: '',
          error: errorMessage,
        });

        return null;
      }
    },
    []
  );

  return {
    decryptedUrl,
    decryptionStatus,
    decryptVideo,
    clearDecryptedUrl,
    isEncrypted,
  };
};

export default useLitDecryption;

