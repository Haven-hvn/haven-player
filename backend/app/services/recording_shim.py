import os
import cv2
import wave
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from livekit import rtc

class RecordingShim:
    """
    Handles video and audio recording for LiveKit streams.
    Supports MP4 video recording with OpenCV and WAV audio recording with wave module.
    """

    def __init__(self, output_dir: str, participant_sid: str):
        self.output_dir = Path(output_dir).expanduser()
        self.participant_sid = participant_sid
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Video recording components
        self.video_writer: Optional[cv2.VideoWriter] = None
        self.video_path: Optional[Path] = None

        # Audio recording components
        self.audio_writer: Optional[wave.Wave_write] = None
        self.audio_path: Optional[Path] = None

        # Audio parameters (will be set when first audio frame is received)
        self.audio_channels: int = 0
        self.audio_sample_width: int = 0
        self.audio_sample_rate: int = 0

    def _get_video_filename(self) -> str:
        """Generate video filename based on participant SID and timestamp."""
        return f"{self.participant_sid}_{self.timestamp}_video.mp4"

    def _get_audio_filename(self) -> str:
        """Generate audio filename based on participant SID and timestamp."""
        return f"{self.participant_sid}_{self.timestamp}_audio.wav"

    def _setup_video_writer(self, frame: rtc.VideoFrame) -> None:
        """Initialize video writer with appropriate parameters."""
        if self.video_writer is not None:
            return

        # Get frame dimensions
        height, width = frame.height, frame.width

        # Generate video path
        self.video_path = self.output_dir / self._get_video_filename()

        # Initialize VideoWriter with MP4 format
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        fps = 30  # Default FPS, could be made configurable

        self.video_writer = cv2.VideoWriter(
            str(self.video_path),
            fourcc,
            fps,
            (width, height)
        )

        print(f"Initialized video recording: {self.video_path}")

    def _setup_audio_writer(self, frame: rtc.AudioFrame) -> None:
        """Initialize audio writer with appropriate parameters."""
        if self.audio_writer is not None:
            return

        # Get audio parameters from frame
        self.audio_channels = len(frame.data.channels)
        self.audio_sample_width = 2  # 16-bit audio
        self.audio_sample_rate = frame.sample_rate

        # Generate audio path
        self.audio_path = self.output_dir / self._get_audio_filename()

        # Initialize wave writer
        self.audio_writer = wave.open(str(self.audio_path), 'wb')
        self.audio_writer.setnchannels(self.audio_channels)
        self.audio_writer.setsampwidth(self.audio_sample_width)
        self.audio_writer.setframerate(self.audio_sample_rate)

        print(f"Initialized audio recording: {self.audio_path}")

    def record_video_frame(self, frame: rtc.VideoFrame) -> None:
        """Record a video frame to the MP4 file."""
        try:
            # Initialize video writer if not already done
            self._setup_video_writer(frame)

            # Convert VideoFrame to numpy array (BGR format for OpenCV)
            frame_array = frame.buffer.to_ndarray(format="bgr24")

            # Write frame to video file
            self.video_writer.write(frame_array)

        except Exception as e:
            print(f"Error recording video frame: {e}")

    def record_audio_frame(self, frame: rtc.AudioFrame) -> None:
        """Record an audio frame to the WAV file."""
        try:
            # Initialize audio writer if not already done
            self._setup_audio_writer(frame)

            # Write audio data directly to wave file
            audio_bytes = frame.data.tobytes()
            self.audio_writer.writeframes(audio_bytes)

        except Exception as e:
            print(f"Error recording audio frame: {e}")

    def close(self) -> Dict[str, Any]:
        """Close all recording streams and return recording info."""
        recording_info = {
            "video_path": None,
            "audio_path": None,
            "duration_seconds": 0
        }

        # Close video writer
        if self.video_writer is not None:
            self.video_writer.release()
            self.video_writer = None
            recording_info["video_path"] = str(self.video_path) if self.video_path else None
            print(f"Closed video recording: {self.video_path}")

        # Close audio writer
        if self.audio_writer is not None:
            self.audio_writer.close()
            self.audio_writer = None
            recording_info["audio_path"] = str(self.audio_path) if self.audio_path else None
            print(f"Closed audio recording: {self.audio_path}")

        return recording_info

    def is_recording(self) -> bool:
        """Check if any recording is currently active."""
        return self.video_writer is not None or self.audio_writer is not None

    def get_recording_paths(self) -> Dict[str, Optional[str]]:
        """Get current recording file paths."""
        return {
            "video_path": str(self.video_path) if self.video_path else None,
            "audio_path": str(self.audio_path) if self.audio_path else None
        }
