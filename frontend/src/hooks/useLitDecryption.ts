import { useState, useCallback, useEffect, useRef } from 'react';
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
  decryptVideo: (
    video: Video,
    loadEncryptedData: () => Promise<Uint8Array>
  ) => Promise<string | null>;
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

  // Use a ref to track decryptedUrl for cleanup without causing re-renders
  const decryptedUrlRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    decryptedUrlRef.current = decryptedUrl;
  }, [decryptedUrl]);

  /**
   * Clear the decrypted URL and revoke the blob URL
   * Uses ref to avoid changing function reference when decryptedUrl changes
   */
  const clearDecryptedUrl = useCallback(() => {
    if (decryptedUrlRef.current) {
      URL.revokeObjectURL(decryptedUrlRef.current);
    }
    setDecryptedUrl(null);
    setDecryptionStatus({ status: 'idle', progress: '' });
    setIsEncrypted(false);
  }, []);

  /**
   * Decrypt an encrypted video and return a blob URL for playback
   */
  const decryptVideo = useCallback(
    async (video: Video, loadEncryptedData: () => Promise<Uint8Array>): Promise<string | null> => {
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

        // Load encrypted data from provided source (local disk or remote gateway)
        setDecryptionStatus({
          status: 'decrypting',
          progress: 'Reading encrypted file...',
        });

        const encryptedData = await loadEncryptedData();

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
        let errorMessage = 'Decryption failed';
        
        if (error instanceof Error) {
          errorMessage = error.message;
          
          // Handle DOMException errors (like attenuation parsing errors)
          if (error.name === 'DOMException') {
            console.error('[Lit Decryption] DOMException:', error.message, error);
            errorMessage = `Decryption error: ${error.message}. Please check your wallet configuration and try again.`;
          } else if (error.message.includes('session key') || error.message.includes('signing shares')) {
            // Handle Lit Protocol session signature errors
            console.error('[Lit Decryption] Session signature error:', error.message, error);
            errorMessage = `Authentication failed: ${error.message}. Please verify your wallet private key matches the encryption key.`;
          } else {
            console.error('[Lit Decryption] Error:', errorMessage, error);
          }
        } else if (error && typeof error === 'object' && 'message' in error) {
          errorMessage = String(error.message);
          console.error('[Lit Decryption] Error:', errorMessage, error);
        } else {
          console.error('[Lit Decryption] Unknown error:', error);
        }
        
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

