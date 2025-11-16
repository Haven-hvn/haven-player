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
  // Store MediaStreams by participant SID (what backend provides)
  private mediaStreams: Map<string, MediaStream> = new Map();
  // Track which tracks belong to which participant SID
  private participantTracks: Map<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }> = new Map();

  constructor() {
    this.room = new Room();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.room) return;

    // Handle participant connections - subscribe to their tracks
    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`Participant connected: SID ${participant.sid}, identity: ${participant.identity}`);
      
      // Subscribe to all tracks from this participant
      participant.trackPublications.forEach((publication) => {
        if (publication.track) {
          // Track is already available
          console.log(`Track already available: ${publication.kind} from ${participant.sid}`);
        } else if (!publication.isSubscribed) {
          // Subscribe to the track
          publication.setSubscribed(true);
          console.log(`Subscribing to track: ${publication.kind} from ${participant.sid}`);
        }
      });
    });

    // Handle track subscriptions - combine video and audio into single MediaStream per participant
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(`Track subscribed: ${track.kind} from participant SID: ${participant.sid}, identity: ${participant.identity}`);
      
      if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
        const participantSid = participant.sid;
        
        // Get or create tracks map for this participant
        let tracks = this.participantTracks.get(participantSid);
        if (!tracks) {
          tracks = {};
          this.participantTracks.set(participantSid, tracks);
        }
        
        // Store the track
        if (track.kind === Track.Kind.Video) {
          tracks.video = track.mediaStreamTrack;
        } else if (track.kind === Track.Kind.Audio) {
          tracks.audio = track.mediaStreamTrack;
        }
        
        // Create or update MediaStream with both video and audio tracks
        const streamTracks: MediaStreamTrack[] = [];
        if (tracks.video) streamTracks.push(tracks.video);
        if (tracks.audio) streamTracks.push(tracks.audio);
        
        const mediaStream = new MediaStream(streamTracks);
        this.mediaStreams.set(participantSid, mediaStream);
        
        console.log(`✅ Created MediaStream for participant SID: ${participantSid} with ${streamTracks.length} tracks`);
        
        // Emit custom event for components to listen to
        this.emitStreamAvailable({
          stream: mediaStream,
          participantId: participantSid,
          trackKind: track.kind
        });
      }
    });

    // Handle track unsubscriptions
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(`Track unsubscribed: ${track.kind} from participant SID: ${participant.sid}`);
      
      const participantSid = participant.sid;
      const tracks = this.participantTracks.get(participantSid);
      
      if (tracks) {
        // Remove the specific track
        if (track.kind === Track.Kind.Video) {
          delete tracks.video;
        } else if (track.kind === Track.Kind.Audio) {
          delete tracks.audio;
        }
        
        // If no tracks left, remove the MediaStream
        if (!tracks.video && !tracks.audio) {
          this.mediaStreams.delete(participantSid);
          this.participantTracks.delete(participantSid);
          this.emitStreamRemoved(participantSid);
        } else {
          // Update MediaStream with remaining tracks
          const streamTracks: MediaStreamTrack[] = [];
          if (tracks.video) streamTracks.push(tracks.video);
          if (tracks.audio) streamTracks.push(tracks.audio);
          const mediaStream = new MediaStream(streamTracks);
          this.mediaStreams.set(participantSid, mediaStream);
        }
      }
    });

    // Handle participant disconnections
    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`Participant disconnected: SID ${participant.sid}, identity: ${participant.identity}`);
      const participantSid = participant.sid;
      this.mediaStreams.delete(participantSid);
      this.participantTracks.delete(participantSid);
      this.emitStreamRemoved(participantSid);
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
      
      // Subscribe to tracks from participants already in the room
      this.room.remoteParticipants.forEach((participant) => {
        console.log(`Found existing participant: SID ${participant.sid}, identity: ${participant.identity}`);
        participant.trackPublications.forEach((publication) => {
          if (publication.track) {
            // Track is already available
            console.log(`Track already available: ${publication.kind} from ${participant.sid}`);
          } else if (!publication.isSubscribed) {
            // Subscribe to the track
            publication.setSubscribed(true);
            console.log(`Subscribing to existing track: ${publication.kind} from ${participant.sid}`);
          }
        });
      });
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.mediaStreams.clear();
      this.participantTracks.clear();
      console.log('Disconnected from LiveKit room');
    }
  }

  /**
   * Get MediaStream for a participant by their SID (what backend provides)
   * @param participantSid - The participant SID from backend
   * @returns MediaStream or null if not found
   */
  getMediaStream(participantSid: string): MediaStream | null {
    const stream = this.mediaStreams.get(participantSid);
    if (!stream) {
      console.warn(`No MediaStream found for participant SID: ${participantSid}`);
      console.log(`Available participant SIDs: ${Array.from(this.mediaStreams.keys()).join(', ') || 'none'}`);
      
      // Debug: List all participants in the room
      if (this.room) {
        const allParticipants = Array.from(this.room.remoteParticipants.values());
        console.log(`Participants in room:`, allParticipants.map(p => ({
          sid: p.sid,
          identity: p.identity,
          tracks: p.trackPublications.size
        })));
      }
    }
    return stream || null;
  }
  
  /**
   * Find participant SID by looking for the participant with published tracks (the streamer)
   * This is a fallback if the backend-provided SID doesn't match
   * @returns Participant SID of the streamer, or null if not found
   */
  findStreamerParticipantSid(): string | null {
    if (!this.room) return null;
    
    // Find the participant with published tracks (the streamer)
    for (const participant of this.room.remoteParticipants.values()) {
      if (participant.trackPublications.size > 0) {
        console.log(`Found streamer participant: SID ${participant.sid}, identity: ${participant.identity}, tracks: ${participant.trackPublications.size}`);
        return participant.sid;
      }
    }
    
    console.warn('No participant with published tracks found in room');
    return null;
  }
  
  /**
   * Wait for MediaStream to become available for a participant
   * @param participantSid - The participant SID
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
   * @returns Promise that resolves with MediaStream or null if timeout
   */
  async waitForMediaStream(participantSid: string, timeoutMs: number = 10000): Promise<MediaStream | null> {
    // Check if already available
    const existing = this.getMediaStream(participantSid);
    if (existing) {
      return existing;
    }
    
    // Wait for stream to become available
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(() => {
        const stream = this.getMediaStream(participantSid);
        if (stream) {
          clearInterval(checkInterval);
          window.removeEventListener('livekit-stream-available', handler);
          resolve(stream);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          window.removeEventListener('livekit-stream-available', handler);
          console.warn(`Timeout waiting for MediaStream for participant SID: ${participantSid}`);
          resolve(null);
        }
      }, 100);
      
      const handler = (event: Event) => {
        const customEvent = event as CustomEvent<MediaStreamInfo>;
        if (customEvent.detail.participantId === participantSid) {
          clearInterval(checkInterval);
          window.removeEventListener('livekit-stream-available', handler);
          resolve(customEvent.detail.stream);
        }
      };
      
      window.addEventListener('livekit-stream-available', handler);
    });
  }

  /**
   * Get MediaStream for a participant by their identity (alternative lookup)
   * @param participantIdentity - The participant identity
   * @returns MediaStream or null if not found
   */
  getMediaStreamByIdentity(participantIdentity: string): MediaStream | null {
    if (!this.room) return null;
    
    // Find participant by identity
    const participant = Array.from(this.room.remoteParticipants.values())
      .find(p => p.identity === participantIdentity);
    
    if (participant) {
      return this.mediaStreams.get(participant.sid) || null;
    }
    
    return null;
  }

  getAllMediaStreams(): MediaStreamInfo[] {
    return Array.from(this.mediaStreams.entries()).map(([participantSid, stream]) => ({
      stream,
      participantId: participantSid,
      trackKind: Track.Kind.Video // Combined stream
    }));
  }

  getParticipantIds(): string[] {
    return Array.from(this.mediaStreams.keys());
  }
  
  /**
   * Get participant SID by identity (helper method)
   */
  getParticipantSidByIdentity(participantIdentity: string): string | null {
    if (!this.room) return null;
    
    const participant = Array.from(this.room.remoteParticipants.values())
      .find(p => p.identity === participantIdentity);
    
    return participant?.sid || null;
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
    this.participantTracks.clear();
  }
}

// Singleton instance for the app
export const liveKitClient = new LiveKitClient();
