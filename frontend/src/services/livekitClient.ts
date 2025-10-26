import { Room, RoomEvent, RemoteParticipant, RemoteTrack, Track, RemoteTrackPublication } from 'livekit-client';

export interface LiveKitConnectionConfig {
  url: string;
  token: string;
  roomName: string;
}

export interface MediaStreamInfo {
  stream: MediaStream;
  participantId: string;
  trackKind: Track.Kind;
}

export class LiveKitClient {
  private room: Room | null = null;
  private config: LiveKitConnectionConfig | null = null;
  private mediaStreams: Map<string, MediaStreamInfo> = new Map();

  constructor() {
    this.room = new Room();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.room) return;

    // Handle track subscriptions - this is where we get MediaStreams
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(`Track subscribed: ${track.kind} from ${participant.identity}`);
      
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
        // Get the MediaStream from the LiveKit track
        const mediaStream = new MediaStream([track.mediaStreamTrack]);
        
        const streamInfo: MediaStreamInfo = {
          stream: mediaStream,
          participantId: participant.identity,
          trackKind: track.kind
        };
        
        this.mediaStreams.set(participant.identity, streamInfo);
        
        // Emit custom event for components to listen to
        this.emitStreamAvailable(streamInfo);
      }
    });

    // Handle track unsubscriptions
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(`Track unsubscribed: ${track.kind} from ${participant.identity}`);
      
      this.mediaStreams.delete(participant.identity);
      this.emitStreamRemoved(participant.identity);
    });

    // Handle participant disconnections
    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`Participant disconnected: ${participant.identity}`);
      this.mediaStreams.delete(participant.identity);
      this.emitStreamRemoved(participant.identity);
    });
  }

  private emitStreamAvailable(streamInfo: MediaStreamInfo): void {
    const event = new CustomEvent('livekit-stream-available', {
      detail: streamInfo
    });
    window.dispatchEvent(event);
  }

  private emitStreamRemoved(participantId: string): void {
    const event = new CustomEvent('livekit-stream-removed', {
      detail: { participantId }
    });
    window.dispatchEvent(event);
  }

  async connect(config: LiveKitConnectionConfig): Promise<void> {
    if (!this.room) {
      throw new Error('Room not initialized');
    }

    this.config = config;
    
    try {
      await this.room.connect(config.url, config.token);
      console.log(`Connected to LiveKit room: ${config.roomName}`);
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.mediaStreams.clear();
      console.log('Disconnected from LiveKit room');
    }
  }

  getMediaStream(participantId: string): MediaStream | null {
    const streamInfo = this.mediaStreams.get(participantId);
    return streamInfo?.stream || null;
  }

  getAllMediaStreams(): MediaStreamInfo[] {
    return Array.from(this.mediaStreams.values());
  }

  getParticipantIds(): string[] {
    return Array.from(this.mediaStreams.keys());
  }

  isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  getRoomName(): string | null {
    return this.config?.roomName || null;
  }

  // Cleanup method
  destroy(): void {
    this.disconnect();
    this.room = null;
    this.config = null;
    this.mediaStreams.clear();
  }
}

// Singleton instance for the app
export const liveKitClient = new LiveKitClient();
