import { LiveKitClient } from '@/services/livekitClient';
import { Room, RoomEvent, RemoteParticipant, RemoteTrack, Track, RemoteTrackPublication } from 'livekit-client';

// Mock LiveKit client
jest.mock('livekit-client', () => ({
  Room: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    state: 'disconnected',
  })),
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantDisconnected: 'participantDisconnected',
  },
  Track: {
    Kind: {
      Video: 'video',
      Audio: 'audio',
    },
  },
}));

describe('LiveKitClient', () => {
  let liveKitClient: LiveKitClient;
  let mockRoom: jest.Mocked<Room>;

  beforeEach(() => {
    jest.clearAllMocks();
    liveKitClient = new LiveKitClient();
    mockRoom = new Room() as jest.Mocked<Room>;
  });

  afterEach(() => {
    liveKitClient.destroy();
  });

  it('should initialize with a Room instance', () => {
    expect(liveKitClient).toBeDefined();
    expect(liveKitClient.isConnected()).toBe(false);
  });

  it('should connect to LiveKit room successfully', async () => {
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'test-token',
      roomName: 'test-room',
    };

    mockRoom.connect.mockResolvedValue(undefined);
    Object.defineProperty(mockRoom, 'state', {
      value: 'connected' as unknown as typeof mockRoom.state,
      writable: true,
      configurable: true,
    });

    await liveKitClient.connect(config);

    expect(mockRoom.connect).toHaveBeenCalledWith(config.url, config.token);
    expect(liveKitClient.isConnected()).toBe(true);
    expect(liveKitClient.getRoomName()).toBe('test-room');
  });

  it('should handle connection errors', async () => {
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'invalid-token',
      roomName: 'test-room',
    };

    mockRoom.connect.mockRejectedValue(new Error('Connection failed'));

    await expect(liveKitClient.connect(config)).rejects.toThrow('Connection failed');
    expect(liveKitClient.isConnected()).toBe(false);
  });

  it('should disconnect from room successfully', async () => {
    const config = {
      url: 'wss://test.livekit.cloud',
      token: 'test-token',
      roomName: 'test-room',
    };

    mockRoom.connect.mockResolvedValue(undefined);
    mockRoom.disconnect.mockResolvedValue(undefined);
    Object.defineProperty(mockRoom, 'state', {
      value: 'connected' as unknown as typeof mockRoom.state,
      writable: true,
      configurable: true,
    });

    await liveKitClient.connect(config);
    await liveKitClient.disconnect();

    expect(mockRoom.disconnect).toHaveBeenCalled();
    expect(liveKitClient.isConnected()).toBe(false);
    expect(liveKitClient.getParticipantIds()).toEqual([]);
  });

  it('should handle track subscription events', () => {
    const mockTrack = {
      kind: Track.Kind.Video,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const mockPublication = {} as RemoteTrackPublication;
    const mockParticipant = {
      identity: 'participant-1',
    } as RemoteParticipant;

    // Mock the event handler
    const trackSubscribedHandler = mockRoom.on.mock.calls.find(
      call => call[0] === RoomEvent.TrackSubscribed
    )?.[1];

    expect(trackSubscribedHandler).toBeDefined();

    if (trackSubscribedHandler) {
      (trackSubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void)(
        mockTrack,
        mockPublication,
        mockParticipant
      );
      
      const mediaStream = liveKitClient.getMediaStream('participant-1');
      expect(mediaStream).toBeInstanceOf(MediaStream);
      expect(liveKitClient.getParticipantIds()).toContain('participant-1');
    }
  });

  it('should handle track unsubscription events', () => {
    const mockTrack = {
      kind: Track.Kind.Video,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const mockPublication = {} as RemoteTrackPublication;
    const mockParticipant = {
      identity: 'participant-1',
    } as RemoteParticipant;

    // First subscribe a track
    const trackSubscribedHandler = mockRoom.on.mock.calls.find(
      call => call[0] === RoomEvent.TrackSubscribed
    )?.[1];

    if (trackSubscribedHandler) {
      (trackSubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void)(
        mockTrack,
        mockPublication,
        mockParticipant
      );
      expect(liveKitClient.getParticipantIds()).toContain('participant-1');

      // Then unsubscribe
      const trackUnsubscribedHandler = mockRoom.on.mock.calls.find(
        call => call[0] === RoomEvent.TrackUnsubscribed
      )?.[1];

      if (trackUnsubscribedHandler) {
        (trackUnsubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void)(
          mockTrack,
          mockPublication,
          mockParticipant
        );
        expect(liveKitClient.getParticipantIds()).not.toContain('participant-1');
      }
    }
  });

  it('should handle participant disconnection events', () => {
    const mockParticipant = {
      identity: 'participant-1',
    } as RemoteParticipant;

    // First add a participant
    const mockTrack = {
      kind: Track.Kind.Video,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const trackSubscribedHandler = mockRoom.on.mock.calls.find(
      call => call[0] === RoomEvent.TrackSubscribed
    )?.[1];

    if (trackSubscribedHandler) {
      (trackSubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void)(
        mockTrack,
        {} as RemoteTrackPublication,
        mockParticipant
      );
      expect(liveKitClient.getParticipantIds()).toContain('participant-1');

      // Then disconnect participant
      const participantDisconnectedHandler = mockRoom.on.mock.calls.find(
        call => call[0] === RoomEvent.ParticipantDisconnected
      )?.[1];

      if (participantDisconnectedHandler) {
        (participantDisconnectedHandler as (participant: RemoteParticipant) => void)(mockParticipant);
        expect(liveKitClient.getParticipantIds()).not.toContain('participant-1');
      }
    }
  });

  it('should emit custom events for stream availability', () => {
    const eventSpy = jest.spyOn(window, 'dispatchEvent');
    
    const mockTrack = {
      kind: Track.Kind.Video,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const mockParticipant = {
      identity: 'participant-1',
    } as RemoteParticipant;

    const trackSubscribedHandler = mockRoom.on.mock.calls.find(
      call => call[0] === RoomEvent.TrackSubscribed
    )?.[1];

    if (trackSubscribedHandler) {
      (trackSubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void)(
        mockTrack,
        {} as RemoteTrackPublication,
        mockParticipant
      );
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'livekit-stream-available',
          detail: expect.objectContaining({
            participantId: 'participant-1',
            trackKind: Track.Kind.Video,
          }),
        })
      );
    }

    eventSpy.mockRestore();
  });

  it('should return null for non-existent participant', () => {
    const mediaStream = liveKitClient.getMediaStream('non-existent-participant');
    expect(mediaStream).toBeNull();
  });

  it('should return all media streams', () => {
    const mockTrack1 = {
      kind: Track.Kind.Video,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const mockTrack2 = {
      kind: Track.Kind.Audio,
      mediaStreamTrack: new MediaStreamTrack(),
    } as unknown as RemoteTrack;

    const trackSubscribedHandler = mockRoom.on.mock.calls.find(
      call => call[0] === RoomEvent.TrackSubscribed
    )?.[1];

    if (trackSubscribedHandler) {
      const handler = trackSubscribedHandler as (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
      handler(mockTrack1, {} as RemoteTrackPublication, { identity: 'participant-1' } as RemoteParticipant);
      handler(mockTrack2, {} as RemoteTrackPublication, { identity: 'participant-2' } as RemoteParticipant);

      const allStreams = liveKitClient.getAllMediaStreams();
      expect(allStreams).toHaveLength(2);
      expect(allStreams[0].participantId).toBe('participant-1');
      expect(allStreams[1].participantId).toBe('participant-2');
    }
  });

  it('should destroy client and cleanup resources', () => {
    liveKitClient.destroy();
    
    expect(mockRoom.disconnect).toHaveBeenCalled();
    expect(liveKitClient.isConnected()).toBe(false);
    expect(liveKitClient.getParticipantIds()).toEqual([]);
  });
});
