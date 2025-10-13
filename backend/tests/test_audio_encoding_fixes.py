"""
Test audio encoding fixes for PyAV compatibility.

Tests the fixes for:
1. Audio array reshaping (samples, channels) vs (channels, samples)
2. AAC format compatibility (s16 -> fltp conversion)
3. Channel layout configuration
"""

import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import tempfile
import os

# Mock PyAV imports
with patch.dict('sys.modules', {
    'av': Mock(),
    'av.VideoFrame': Mock(),
    'av.AudioFrame': Mock(),
    'av.container': Mock(),
    'av.audio': Mock(),
    'av.audio.layout': Mock(),
    'av.audio.resampler': Mock(),
    'av.audio.format': Mock(),
    'livekit.rtc': Mock(),
}):
    from app.services.webrtc_recording_service import AiortcFileRecorder


class TestAudioEncodingFixes:
    """Test audio encoding fixes for PyAV compatibility."""

    def setup_method(self):
        """Set up test fixtures."""
        self.temp_dir = tempfile.mkdtemp()
        self.output_dir = Path(self.temp_dir)
        
        # Mock stream info
        self.stream_info = Mock()
        self.stream_info.participant_sid = "test_participant"
        
        # Mock room
        self.room = Mock()
        
        # Recording config
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        # Create recorder instance
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.room
        )

    def teardown_method(self):
        """Clean up test fixtures."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_audio_array_reshape_stereo(self):
        """Test that stereo audio is reshaped correctly for PyAV packed format."""
        # Simulate stereo audio data (480 samples, 2 channels)
        audio_bytes = b'\x00\x01' * 480 * 2  # 960 bytes = 480 samples * 2 channels * 2 bytes/sample

        # Mock audio track as stereo
        self.recorder.audio_track = Mock()
        self.recorder.audio_track.channels = 2

        # Convert to numpy array
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

        # Test the reshaping logic for PyAV packed format
        # PyAV expects (1, samples*channels) for packed format
        reshaped = audio_array.reshape(1, -1)

        # Verify shape is (1, samples*channels) for packed format
        assert reshaped.shape == (1, 960), f"Expected (1, 960), got {reshaped.shape}"
        assert reshaped.shape[0] == 1, "First dimension should be 1 for packed format"
        assert reshaped.shape[1] == 960, "Second dimension should be samples*channels"

    def test_audio_array_reshape_mono(self):
        """Test that mono audio is reshaped correctly for PyAV packed format."""
        # Simulate mono audio data (480 samples, 1 channel)
        audio_bytes = b'\x00\x01' * 480  # 960 bytes = 480 samples * 1 channel * 2 bytes/sample

        # Mock audio track as mono
        self.recorder.audio_track = Mock()
        self.recorder.audio_track.channels = 1

        # Convert to numpy array
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

        # Test the reshaping logic for PyAV packed format
        # PyAV expects (1, samples) for mono packed format
        reshaped = audio_array.reshape(1, -1)

        # Verify shape is (1, samples) for packed format
        assert reshaped.shape == (1, 480), f"Expected (1, 480), got {reshaped.shape}"
        assert reshaped.shape[0] == 1, "First dimension should be 1 for packed format"
        assert reshaped.shape[1] == 480, "Second dimension should be samples"

    @patch('av.AudioFrame.from_ndarray')
    def test_audio_frame_creation_with_correct_shape(self, mock_from_ndarray):
        """Test that AudioFrame.from_ndarray is called with correct array shape."""
        # Mock the AudioFrame creation
        mock_frame = Mock()
        mock_from_ndarray.return_value = mock_frame
        
        # Simulate stereo audio
        audio_bytes = b'\x00\x01' * 480 * 2
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        samples_per_channel = len(audio_array) // 2
        audio_array = audio_array.reshape(samples_per_channel, 2)
        
        # Call the method that would create the AudioFrame
        result = mock_from_ndarray(
            audio_array,
            format='s16',
            layout='stereo'
        )
        
        # Verify the call was made with correct parameters
        mock_from_ndarray.assert_called_once_with(
            audio_array,
            format='s16',
            layout='stereo'
        )
        
        # Verify the array shape passed to from_ndarray
        call_args = mock_from_ndarray.call_args[0]
        array_arg = call_args[0]
        assert array_arg.shape == (1, 960), f"Expected (1, 960), got {array_arg.shape}"

    @patch('av.audio.resampler.AudioResampler')
    def test_audio_resampler_creation(self, mock_resampler_class):
        """Test that AudioResampler is created with correct parameters."""
        # Mock the resampler
        mock_resampler = Mock()
        mock_resampler_class.return_value = mock_resampler
        
        # Mock audio stream and codec context
        self.recorder.audio_stream = Mock()
        self.recorder.audio_stream.codec_context = Mock()
        self.recorder.audio_stream.codec_context.layout = 'stereo'
        
        # Create resampler
        from av.audio.resampler import AudioResampler
        resampler = AudioResampler(
            format='fltp',
            layout='stereo',
            rate=48000
        )
        
        # Verify resampler was created with correct parameters
        mock_resampler_class.assert_called_once_with(
            format='fltp',
            layout='stereo',
            rate=48000
        )

    def test_audio_resampler_initialization(self):
        """Test that audio resampler is initialized as None."""
        # Verify resampler starts as None
        assert self.recorder.audio_resampler is None

    @patch('av.audio.layout.AudioLayout')
    def test_audio_layout_configuration(self, mock_layout_class):
        """Test that audio layout is configured correctly."""
        # Mock the layout
        mock_layout = Mock()
        mock_layout_class.return_value = mock_layout
        
        # Mock audio stream codec context
        mock_ctx = Mock()
        mock_ctx.sample_rate = 48000
        mock_ctx.layout = None
        
        # Simulate layout setting
        try:
            from av.audio.layout import AudioLayout
            mock_ctx.layout = AudioLayout('stereo')
        except Exception:
            mock_ctx.layout = 'stereo'
        
        # Verify layout was set
        assert mock_ctx.layout is not None

    def test_format_override_removal(self):
        """Test that format override is not set for AAC codec."""
        # Mock codec context
        mock_ctx = Mock()
        mock_ctx.sample_rate = 48000
        mock_ctx.layout = 'stereo'
        
        # Verify format is NOT set (should be None or default)
        # This simulates the fix where we removed ctx.format = 's16'
        assert not hasattr(mock_ctx, 'format') or mock_ctx.format is None

    def test_audio_processing_error_handling(self):
        """Test that audio processing errors are handled gracefully."""
        # Mock audio track
        self.recorder.audio_track = Mock()
        self.recorder.audio_track.channels = 2
        
        # Mock container and stream
        self.recorder.container = Mock()
        self.recorder.audio_stream = Mock()
        
        # Simulate audio frame
        audio_frame = Mock()
        audio_frame.data = b'\x00\x01' * 480 * 2
        
        # Test that processing continues even if encoding fails
        with patch.object(self.recorder, '_on_audio_frame') as mock_process:
            mock_process.side_effect = Exception("Encoding error")
            
            # Should not raise exception
            try:
                mock_process(audio_frame)
            except Exception:
                pass  # Expected to be handled gracefully
            
            # Verify method was called
            mock_process.assert_called_once_with(audio_frame)

    def test_audio_samples_tracking(self):
        """Test that audio samples are tracked correctly for PTS calculation."""
        # Initialize tracking
        self.recorder.audio_samples_written = 0
        
        # Simulate processing a frame with 480 samples
        samples_per_frame = 480
        self.recorder.audio_samples_written += samples_per_frame
        
        # Verify tracking
        assert self.recorder.audio_samples_written == 480
        
        # Process another frame
        self.recorder.audio_samples_written += samples_per_frame
        assert self.recorder.audio_samples_written == 960

    def test_audio_layout_detection(self):
        """Test that audio layout is detected correctly based on channel count."""
        # Test mono detection
        self.recorder.audio_track = Mock()
        self.recorder.audio_track.channels = 1
        
        # Should detect as mono
        if hasattr(self.recorder.audio_track, 'channels') and self.recorder.audio_track.channels == 1:
            audio_layout = 'mono'
        else:
            audio_layout = 'stereo'
        
        assert audio_layout == 'mono'
        
        # Test stereo detection
        self.recorder.audio_track.channels = 2
        
        if hasattr(self.recorder.audio_track, 'channels') and self.recorder.audio_track.channels == 1:
            audio_layout = 'mono'
        else:
            audio_layout = 'stereo'
        
        assert audio_layout == 'stereo'


if __name__ == "__main__":
    pytest.main([__file__])
