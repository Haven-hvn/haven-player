declare module 'recordrtc' {
  interface RecordRTCOptions {
    type?: 'video' | 'audio' | 'canvas' | 'gif';
    mimeType?: string;
    disableLogs?: boolean;
    timeSlice?: number;
    ondataavailable?: (blob: Blob) => void;
    [key: string]: unknown;
  }

  class RecordRTC {
    constructor(stream: MediaStream | HTMLCanvasElement | HTMLVideoElement, options?: RecordRTCOptions);
    startRecording(): void;
    stopRecording(callback?: () => void): void;
    pauseRecording(): void;
    resumeRecording(): void;
    getBlob(): Blob;
    getDataURL(callback: (dataURL: string) => void): void;
    reset(): void;
    destroy(): void;
    getState(): string;
    getInternalRecorder(): unknown;
    setRecordingDuration(duration: number): void;
    getRecordingDuration(): number;
  }

  export default RecordRTC;
}

