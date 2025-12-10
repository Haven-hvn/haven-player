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
    } catch (err) {
      setError('Failed to add video');
      console.error('Error adding video:', err);
      throw err;
    }
  }, [fetchTimestampsForVideo]);

  const updateVideoSharePreference = useCallback(
    async (videoPath: string, shareToArkiv: boolean) => {
      const updated = await videoService.updateSharePreference(videoPath, shareToArkiv);
      setVideos(prev => prev.map(v => (v.path === videoPath ? updated : v)));
      setVideoGroups(prev =>
        prev.map(group => ({
          ...group,
          videos: group.videos.map(v => (v.path === videoPath ? updated : v)),
        }))
      );
      return updated;
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