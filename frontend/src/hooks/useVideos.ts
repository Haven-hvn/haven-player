import { useState, useEffect, useCallback } from 'react';
import { Video, VideoCreate, Timestamp, VideoGroup } from '@/types/video';
import { videoService } from '@/services/api';

export const useVideos = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoTimestamps, setVideoTimestamps] = useState<Record<string, Timestamp[]>>({});

  const fetchTimestampsForVideo = useCallback(async (video: Video) => {
    if (!video.has_ai_data) {
      console.log(`⏭️ Skipping timestamp fetch for ${video.title} - no AI data`);
      return;
    }
    
    try {
      console.log(`🔍 Fetching timestamps for video: ${video.title}`);
      const timestamps = await videoService.getTimestamps(video.path);
      console.log(`✅ Fetched ${timestamps.length} timestamps for ${video.title}:`, timestamps);
      setVideoTimestamps(prev => ({ ...prev, [video.path]: timestamps }));
    } catch (err) {
      console.error(`❌ Failed to fetch timestamps for video ${video.path}:`, err);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch grouped videos
      const groups = await videoService.getGrouped();
      console.log(`📋 Fetched ${groups.length} video groups from API`);
      setVideoGroups(groups);
      
      // Flatten groups to maintain backward compatibility with existing code
      const allVideos: Video[] = [];
      for (const group of groups) {
        allVideos.push(...group.videos);
      }
      setVideos(allVideos);
      
      // Fetch timestamps for videos that have AI data
      for (const video of allVideos) {
        if (video.has_ai_data) {
          console.log(`🤖 Video ${video.title} has AI data, fetching timestamps...`);
          await fetchTimestampsForVideo(video);
        }
      }
      
      setError(null);
    } catch (err) {
      setError('Failed to fetch videos');
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchTimestampsForVideo]);

  const addVideo = useCallback(async (video: VideoCreate) => {
    try {
      console.log(`➕ Adding video: ${video.title}`);
      const newVideo = await videoService.create(video);
      console.log(`✅ Video created:`, newVideo);
      console.log(`🤖 Has AI data: ${newVideo.has_ai_data}`);
      
      setVideos(prev => [newVideo, ...prev]);
      
      // If the newly created video has AI data, fetch its timestamps
      if (newVideo.has_ai_data) {
        console.log(`🔍 New video has AI data, fetching timestamps...`);
        await fetchTimestampsForVideo(newVideo);
      } else {
        console.log(`⏭️ New video has no AI data`);
      }
      
      setError(null);
      return newVideo;
    } catch (err: unknown) {
      // Extract error message from axios error response
      let errorMessage = 'Failed to add video';
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string }; status?: number } };
        if (axiosError.response?.data?.detail) {
          errorMessage = axiosError.response.data.detail;
        } else if (axiosError.response?.status === 409) {
          errorMessage = 'Duplicate video detected! Video was skipped.';
        } else if (axiosError.response?.status === 402) {
          // Payment Required - insufficient gas (shouldn't happen on create, but handle it)
          errorMessage = axiosError.response.data?.detail || 'Insufficient gas funds';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
        // Log gas error with wallet address and token info if present
        // Works across all EVM chains (Ethereum, Polygon, BSC, Avalanche, etc.)
        if (errorMessage.includes('address:')) {
          // Extract token symbol (e.g., "ETH", "MATIC", "BNB", "AVAX")
          const tokenMatch = errorMessage.match(/Insufficient\s+(\w+)\s+for\s+gas/i);
          const tokenSymbol = tokenMatch ? tokenMatch[1] : 'gas tokens';
          
          const addressMatch = errorMessage.match(/address:\s*([0-9a-fA-Fx]{42,})/i);
          if (addressMatch) {
            const walletAddress = addressMatch[1];
            console.error(
              `❌ Arkiv sync failed due to insufficient gas funds (${tokenSymbol}) | ` +
              `Wallet Address: ${walletAddress} | ` +
              `Please send ${tokenSymbol} to this address`
            );
          }
        }
      
      setError(errorMessage);
      console.error('Error adding video:', err);
      
      // Create a new error with the extracted message for the caller
      const error = new Error(errorMessage);
      if (err && typeof err === 'object' && 'response' in err) {
        (error as { response?: unknown }).response = (err as { response?: unknown }).response;
      }
      throw error;
    }
  }, [fetchTimestampsForVideo]);

  const updateVideoSharePreference = useCallback(
    async (videoPath: string, shareToArkiv: boolean) => {
      try {
        const updated = await videoService.updateSharePreference(videoPath, shareToArkiv);
        setVideos(prev => prev.map(v => (v.path === videoPath ? updated : v)));
        setVideoGroups(prev =>
          prev.map(group => ({
            ...group,
            videos: group.videos.map(v => (v.path === videoPath ? updated : v)),
          }))
        );
        setError(null);
        return updated;
      } catch (err: unknown) {
        // Extract error message from axios error response
        let errorMessage = 'Failed to update share preference';
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosError = err as { response?: { data?: { detail?: string }; status?: number } };
          if (axiosError.response?.data?.detail) {
            errorMessage = axiosError.response.data.detail;
          } else if (axiosError.response?.status === 402) {
            // Payment Required - insufficient gas
            errorMessage = axiosError.response.data?.detail || 'Insufficient gas funds';
          }
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
        
        // Log gas error with wallet address and token info if present
        // Works across all EVM chains (Ethereum, Polygon, BSC, Avalanche, etc.)
        if (errorMessage.includes('address:')) {
          // Extract token symbol (e.g., "ETH", "MATIC", "BNB", "AVAX")
          const tokenMatch = errorMessage.match(/Insufficient\s+(\w+)\s+for\s+gas/i);
          const tokenSymbol = tokenMatch ? tokenMatch[1] : 'gas tokens';
          
          const addressMatch = errorMessage.match(/address:\s*([0-9a-fA-Fx]{42,})/i);
          if (addressMatch) {
            const walletAddress = addressMatch[1];
            console.error(
              `❌ Arkiv sync failed due to insufficient gas funds (${tokenSymbol}) | ` +
              `Wallet Address: ${walletAddress} | ` +
              `Please send ${tokenSymbol} to this address`
            );
          }
        }
        
        setError(errorMessage);
        console.error('Error updating share preference:', err);
        throw new Error(errorMessage);
      }
    },
    []
  );

  const deleteVideo = useCallback(async (videoPath: string) => {
    try {
      await videoService.delete(videoPath);
      setVideos(prev => prev.filter(v => v.path !== videoPath));
      
      // Remove timestamps from local state
      setVideoTimestamps(prev => {
        const updated = { ...prev };
        delete updated[videoPath];
        return updated;
      });
      
      setError(null);
    } catch (err) {
      setError('Failed to delete video');
      console.error('Error deleting video:', err);
      throw err;
    }
  }, []);

  const moveToFront = useCallback(async (videoPath: string) => {
    try {
      await videoService.moveToFront(videoPath);
      await fetchVideos(); // Refresh the list to get the new order
      setError(null);
    } catch (err) {
      setError('Failed to move video to front');
      console.error('Error moving video to front:', err);
      throw err;
    }
  }, [fetchVideos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Debug: Log videoTimestamps changes
  useEffect(() => {
    console.log(`📊 VideoTimestamps updated:`, videoTimestamps);
  }, [videoTimestamps]);

  return {
    videos,
    videoGroups,
    loading,
    error,
    videoTimestamps,
    addVideo,
    updateVideoSharePreference,
    deleteVideo,
    moveToFront,
    refreshVideos: fetchVideos,
    fetchTimestampsForVideo,
  };
}; 