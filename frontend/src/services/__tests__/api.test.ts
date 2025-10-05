import axios from 'axios';
import { streamService, recordingService } from '../api';
import { StreamInfo, RecordingStatus, StartRecordingRequest, StopRecordingRequest, StartSessionRequest, StopSessionRequest } from '../../types/video';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('streamService', () => {
    it('getPopular calls correct endpoint with default limit', async () => {
      const mockStreams: StreamInfo[] = [
        {
          mint_id: 'mint-1',
          name: 'Test Stream',
          symbol: 'TST',
          num_participants: 123,
          is_currently_live: true,
          nsfw: false,
          recording: false,
        },
      ];

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStreams }),
      } as any);

      const result = await streamService.getPopular();

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live/popular?limit=20');
      expect(result).toEqual(mockStreams);
    });

    it('getPopular calls correct endpoint with custom limit', async () => {
      const mockStreams: StreamInfo[] = [];
      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStreams }),
      } as any);

      await streamService.getPopular(10);

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live/popular?limit=10');
    });

    it('getLive calls correct endpoint with parameters', async () => {
      const mockStreams: StreamInfo[] = [];
      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStreams }),
      } as any);

      await streamService.getLive(10, 30, false);

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live?offset=10&limit=30&include_nsfw=false');
    });

    it('getStreamInfo calls correct endpoint', async () => {
      const mockStream: StreamInfo = {
        mint_id: 'mint-1',
        name: 'Test Stream',
        symbol: 'TST',
        num_participants: 123,
        is_currently_live: true,
        nsfw: false,
        recording: false,
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStream }),
      } as any);

      const result = await streamService.getStreamInfo('mint-1');

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live/stream/mint-1');
      expect(result).toEqual(mockStream);
    });

    it('validateStream calls correct endpoint', async () => {
      const mockResponse = {
        mint_id: 'mint-1',
        is_valid: true,
        is_live: true,
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await streamService.validateStream('mint-1');

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live/validate/mint-1');
      expect(result).toEqual(mockResponse);
    });

    it('getStats calls correct endpoint', async () => {
      const mockStats = {
        total_live_streams: 5,
        total_participants: 1000,
        nsfw_streams: 1,
        sfw_streams: 4,
        top_stream: null,
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStats }),
      } as any);

      const result = await streamService.getStats();

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/live/stats');
      expect(result).toEqual(mockStats);
    });
  });

  describe('recordingService', () => {
    it('startSession calls correct endpoint', async () => {
      const mockResponse = {
        success: true,
        session_id: 'session-123',
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.startSession('mint-1');

      expect(mockedAxios.create().post).toHaveBeenCalledWith('/live-sessions/start', { mint_id: 'mint-1' });
      expect(result).toEqual(mockResponse);
    });

    it('stopSession calls correct endpoint', async () => {
      const mockResponse = {
        success: true,
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.stopSession('mint-1');

      expect(mockedAxios.create().post).toHaveBeenCalledWith('/live-sessions/stop', { mint_id: 'mint-1' });
      expect(result).toEqual(mockResponse);
    });

    it('startRecording calls correct endpoint with request', async () => {
      const request: StartRecordingRequest = {
        mint_id: 'mint-1',
        output_format: 'av1',
        video_quality: 'medium',
      };

      const mockResponse = {
        success: true,
        recording_id: 'recording-123',
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.startRecording(request);

      expect(mockedAxios.create().post).toHaveBeenCalledWith('/recording/start', request);
      expect(result).toEqual(mockResponse);
    });

    it('stopRecording calls correct endpoint with request', async () => {
      const request: StopRecordingRequest = {
        mint_id: 'mint-1',
      };

      const mockResponse = {
        success: true,
      };

      mockedAxios.create.mockReturnValue({
        post: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.stopRecording(request);

      expect(mockedAxios.create().post).toHaveBeenCalledWith('/recording/stop', request);
      expect(result).toEqual(mockResponse);
    });

    it('getRecordingStatus calls correct endpoint', async () => {
      const mockStatus: RecordingStatus = {
        mint_id: 'mint-1',
        is_recording: true,
        duration_seconds: 30,
        output_format: 'av1',
        video_quality: 'medium',
        started_at: '2023-01-01T00:00:00Z',
        file_path: '/path/to/recording.mp4',
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockStatus }),
      } as any);

      const result = await recordingService.getRecordingStatus('mint-1');

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/recording/status/mint-1');
      expect(result).toEqual(mockStatus);
    });

    it('getActiveRecordings calls correct endpoint', async () => {
      const mockResponse = {
        success: true,
        recordings: [
          {
            mint_id: 'mint-1',
            is_recording: true,
            duration_seconds: 30,
            output_format: 'av1',
            video_quality: 'medium',
          },
        ],
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.getActiveRecordings();

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/recording/active');
      expect(result).toEqual(mockResponse);
    });

    it('getSupportedFormats calls correct endpoint', async () => {
      const mockResponse = {
        success: true,
        formats: {
          av1: {
            description: 'AV1 codec (recommended)',
            codec: 'libaom-av1',
            container: 'mp4',
          },
        },
        quality_presets: {
          low: {
            video_bitrate: '1000k',
            audio_bitrate: '64k',
          },
        },
      };

      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockResolvedValue({ data: mockResponse }),
      } as any);

      const result = await recordingService.getSupportedFormats();

      expect(mockedAxios.create().get).toHaveBeenCalledWith('/recording/formats');
      expect(result).toEqual(mockResponse);
    });
  });
});
