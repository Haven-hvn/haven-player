import { useState, useEffect, useCallback } from 'react';
import { Video, VideoCreate } from '@/types/video';
import { videoService } from '@/services/api';

export const useVideos = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await videoService.getAll();
      setVideos(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch videos');
      console.error('Error fetching videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const addVideo = useCallback(async (video: VideoCreate) => {
    try {
      const newVideo = await videoService.create(video);
      setVideos(prev => [newVideo, ...prev]);
      setError(null);
      return newVideo;
    } catch (err) {
      setError('Failed to add video');
      console.error('Error adding video:', err);
      throw err;
    }
  }, []);

  const deleteVideo = useCallback(async (videoPath: string) => {
    try {
      await videoService.delete(videoPath);
      setVideos(prev => prev.filter(v => v.path !== videoPath));
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

  return {
    videos,
    loading,
    error,
    addVideo,
    deleteVideo,
    moveToFront,
    refreshVideos: fetchVideos,
  };
}; 