import os
import cv2
import wave
import numpy as np
import subprocess
import threading
import queue
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from livekit import rtc

class RecordingShim:
    """
    Handles synchronized video and audio recording for LiveKit streams.
    Records to temporary files and combines them into a single AV1 video file.
    """

    def __init__(self, output_dir: str, participant_sid: str):
        self.output_dir = Path(output_dir).expanduser()
        self.participant_sid = participant_sid
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.start_time = time.time()

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Synchronized recording components
        self.video_frames: List[Tuple[float, np.ndarray]] = []  # (timestamp, frame)
        self.audio_frames: List[Tuple[float, bytes]] = []       # (timestamp, audio_data)
        
        # Threading for synchronized recording
        self.recording_lock = threading.Lock()
        self.is_recording = False
        
        # Final output path
        self.final_output_path: Optional[Path] = None
        
        # Audio parameters (will be set when first audio frame is received)
        self.audio_channels: int = 0
        self.audio_sample_width: int = 0
        self.audio_sample_rate: int = 0
        self.video_width: int = 0
        self.video_height: int = 0

    def _get_final_filename(self) -> str:
        """Generate final AV1 video filename."""
        return f"{self.participant_sid}_{self.timestamp}_recording.av1"

    def _initialize_parameters(self, video_frame: rtc.VideoFrame, audio_frame: rtc.AudioFrame) -> None:
        """Initialize video and audio parameters from first frames."""
        if self.video_width == 0:
            self.video_width = video_frame.width
            self.video_height = video_frame.height
            print(f"Initialized video: {self.video_width}x{self.video_height}")
        
        if self.audio_sample_rate == 0:
            self.audio_channels = len(audio_frame.data.channels)
            self.audio_sample_width = 2  # 16-bit audio
            self.audio_sample_rate = audio_frame.sample_rate
            print(f"Initialized audio: {self.audio_sample_rate}Hz, {self.audio_channels}ch")

    def record_video_frame(self, frame: rtc.VideoFrame) -> None:
        """Record a video frame with timestamp for synchronized playback."""
        try:
            with self.recording_lock:
                if not self.is_recording:
                    self.is_recording = True
                
                # Convert VideoFrame to numpy array (BGR format for OpenCV)
                frame_array = frame.buffer.to_ndarray(format="bgr24")
                
                # Store frame with timestamp
                timestamp = time.time() - self.start_time
                self.video_frames.append((timestamp, frame_array))
                
                # Initialize video parameters if first frame
                if self.video_width == 0:
                    self.video_width = frame.width
                    self.video_height = frame.height

        except Exception as e:
            print(f"Error recording video frame: {e}")

    def record_audio_frame(self, frame: rtc.AudioFrame) -> None:
        """Record an audio frame with timestamp for synchronized playback."""
        try:
            with self.recording_lock:
                if not self.is_recording:
                    self.is_recording = True
                
                # Store audio data with timestamp
                timestamp = time.time() - self.start_time
                audio_bytes = frame.data.tobytes()
                self.audio_frames.append((timestamp, audio_bytes))
                
                # Initialize audio parameters if first frame
                if self.audio_sample_rate == 0:
                    self.audio_channels = len(frame.data.channels)
                    self.audio_sample_width = 2  # 16-bit audio
                    self.audio_sample_rate = frame.sample_rate

        except Exception as e:
            print(f"Error recording audio frame: {e}")

    def _create_temp_video_file(self) -> Path:
        """Create temporary video file from recorded frames."""
        temp_video_path = self.output_dir / f"temp_{self.participant_sid}_video.mp4"
        
        if not self.video_frames:
            raise ValueError("No video frames recorded")
        
        # Sort frames by timestamp
        sorted_frames = sorted(self.video_frames, key=lambda x: x[0])
        
        # Calculate FPS from frame timestamps
        if len(sorted_frames) > 1:
            time_diff = sorted_frames[-1][0] - sorted_frames[0][0]
            fps = len(sorted_frames) / time_diff if time_diff > 0 else 30
        else:
            fps = 30
        
        # Initialize video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        video_writer = cv2.VideoWriter(
            str(temp_video_path),
            fourcc,
            fps,
            (self.video_width, self.video_height)
        )
        
        # Write all frames
        for _, frame_array in sorted_frames:
            video_writer.write(frame_array)
        
        video_writer.release()
        print(f"Created temporary video file: {temp_video_path}")
        return temp_video_path

    def _create_temp_audio_file(self) -> Path:
        """Create temporary audio file from recorded frames."""
        temp_audio_path = self.output_dir / f"temp_{self.participant_sid}_audio.wav"
        
        if not self.audio_frames:
            raise ValueError("No audio frames recorded")
        
        # Sort audio frames by timestamp
        sorted_audio = sorted(self.audio_frames, key=lambda x: x[0])
        
        # Initialize wave writer
        audio_writer = wave.open(str(temp_audio_path), 'wb')
        audio_writer.setnchannels(self.audio_channels)
        audio_writer.setsampwidth(self.audio_sample_width)
        audio_writer.setframerate(self.audio_sample_rate)
        
        # Write all audio data
        for _, audio_bytes in sorted_audio:
            audio_writer.writeframes(audio_bytes)
        
        audio_writer.close()
        print(f"Created temporary audio file: {temp_audio_path}")
        return temp_audio_path

    def _combine_with_ffmpeg(self, video_path: Path, audio_path: Path) -> Path:
        """Use FFmpeg to combine video and audio into AV1 format."""
        final_path = self.output_dir / self._get_final_filename()
        
        # FFmpeg command to combine video and audio into AV1
        cmd = [
            'ffmpeg',
            '-i', str(video_path),      # Input video
            '-i', str(audio_path),      # Input audio
            '-c:v', 'libaom-av1',       # AV1 video codec
            '-c:a', 'aac',              # AAC audio codec
            '-b:v', '2M',              # Video bitrate
            '-b:a', '128k',            # Audio bitrate
            '-shortest',               # End when shortest stream ends
            '-y',                      # Overwrite output file
            str(final_path)
        ]
        
        try:
            print(f"Running FFmpeg command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(f"FFmpeg output: {result.stdout}")
            print(f"Created final AV1 video: {final_path}")
            return final_path
        except subprocess.CalledProcessError as e:
            print(f"FFmpeg error: {e.stderr}")
            raise Exception(f"Failed to create AV1 video: {e.stderr}")
        except FileNotFoundError:
            raise Exception("FFmpeg not found. Please install FFmpeg to create AV1 videos.")

    def close(self) -> Dict[str, Any]:
        """Process recorded frames and create final AV1 video file."""
        recording_info = {
            "video_path": None,
            "audio_path": None,
            "final_path": None,
            "duration_seconds": 0,
            "frame_count": len(self.video_frames),
            "audio_frame_count": len(self.audio_frames)
        }
        
        try:
            if not self.is_recording or (not self.video_frames and not self.audio_frames):
                print("No frames recorded")
                return recording_info
            
            # Calculate duration
            if self.video_frames:
                recording_info["duration_seconds"] = max(frame[0] for frame in self.video_frames)
            elif self.audio_frames:
                recording_info["duration_seconds"] = max(frame[0] for frame in self.audio_frames)
            
            print(f"Processing {len(self.video_frames)} video frames and {len(self.audio_frames)} audio frames")
            
            # Create temporary files
            temp_video_path = None
            temp_audio_path = None
            
            if self.video_frames:
                temp_video_path = self._create_temp_video_file()
                recording_info["video_path"] = str(temp_video_path)
            
            if self.audio_frames:
                temp_audio_path = self._create_temp_audio_file()
                recording_info["audio_path"] = str(temp_audio_path)
            
            # Combine into final AV1 video
            if temp_video_path and temp_audio_path:
                # Both video and audio
                final_path = self._combine_with_ffmpeg(temp_video_path, temp_audio_path)
            elif temp_video_path:
                # Video only - convert to AV1
                final_path = self._convert_video_to_av1(temp_video_path)
            elif temp_audio_path:
                # Audio only - not supported for video output
                print("Audio-only recording not supported for video output")
                final_path = None
            else:
                final_path = None
            
            if final_path:
                recording_info["final_path"] = str(final_path)
                self.final_output_path = final_path
                print(f"✅ Final AV1 video created: {final_path}")
            
            # Clean up temporary files
            if temp_video_path and temp_video_path.exists():
                temp_video_path.unlink()
            if temp_audio_path and temp_audio_path.exists():
                temp_audio_path.unlink()
            
        except Exception as e:
            print(f"Error creating final video: {e}")
            recording_info["error"] = str(e)
        
        return recording_info

    def _convert_video_to_av1(self, video_path: Path) -> Path:
        """Convert existing video to AV1 format."""
        final_path = self.output_dir / self._get_final_filename()
        
        cmd = [
            'ffmpeg',
            '-i', str(video_path),
            '-c:v', 'libaom-av1',
            '-b:v', '2M',
            '-y',
            str(final_path)
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            return final_path
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to convert to AV1: {e.stderr}")

    def is_recording(self) -> bool:
        """Check if any recording is currently active."""
        return self.is_recording

    def get_recording_info(self) -> Dict[str, Any]:
        """Get current recording information."""
        return {
            "is_recording": self.is_recording,
            "video_frame_count": len(self.video_frames),
            "audio_frame_count": len(self.audio_frames),
            "video_dimensions": f"{self.video_width}x{self.video_height}" if self.video_width > 0 else "Not set",
            "audio_params": f"{self.audio_sample_rate}Hz, {self.audio_channels}ch" if self.audio_sample_rate > 0 else "Not set",
            "final_output_path": str(self.final_output_path) if self.final_output_path else None
        }
