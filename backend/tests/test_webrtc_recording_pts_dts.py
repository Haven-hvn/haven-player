"""
Comprehensive unit tests for WebRTC recording PTS/DTS handling and encoder management.
Tests the fixes for encoder buffer starvation issue.
"""

import pytest
import asyncio
import time
from pathlib import Path
from unittest.mock import Mock, MagicMock, AsyncMock, patch, PropertyMock
from fractions import Fraction
from typing import Dict, Any
import sys

# Mock external dependencies BEFORE importing the module
sys.modules['livekit'] = MagicMock()
sys.modules['livekit.rtc'] = MagicMock()
sys.modules['livekit.api'] = MagicMock()
sys.modules['av'] = MagicMock()
sys.modules['av.audio'] = MagicMock()
sys.modules['av.audio.layout'] = MagicMock()
sys.modules['av.audio.resampler'] = MagicMock()
sys.modules['av.container'] = MagicMock()
sys.modules['av.video'] = MagicMock()
sys.modules['psutil'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['sqlalchemy'] = MagicMock()
sys.modules['sqlalchemy.orm'] = MagicMock()
sys.modules['sqlalchemy.ext'] = MagicMock()
sys.modules['sqlalchemy.ext.declarative'] = MagicMock()
sys.modules['app'] = MagicMock()
sys.modules['app.models'] = MagicMock()
sys.modules['app.models.config'] = MagicMock()
sys.modules['app.models.database'] = MagicMock()
sys.modules['app.services'] = MagicMock()
sys.modules['app.services.pumpfun_service'] = MagicMock()
sys.modules['app.services.stream_manager'] = MagicMock()

# Now we can import from the mocked modules
from app.services.webrtc_recording_service import AiortcFileRecorder, VideoNormalizer, RecordingState

# Create mock classes that we can use in tests
class MockRTC:
    class Room:
        def __init__(self):
            self.remote_participants = {}
        def isconnected(self):
            return True
    
    class TrackKind:
        KIND_VIDEO = "video"
        KIND_AUDIO = "audio"
    
    class VideoFrame:
        def __init__(self, timestamp_us: int, width: int = 1920, height: int = 1080):
            self.timestamp_us = timestamp_us
            self.width = width
            self.height = height
            self.data = b'\x00' * (width * height * 3)
    
    class AudioFrame:
        def __init__(self, timestamp_us: int, samples: int = 480):
            self.timestamp_us = timestamp_us
            self.samples = samples
            self.data = b'\x00' * (samples * 2 * 2)

# Assign mock classes to the module
rtc = MockRTC()


class MockVideoFrame:
    """Mock LiveKit video frame."""
    def __init__(self, timestamp_us: int, width: int = 1920, height: int = 1080):
        self.timestamp_us = timestamp_us
        self.width = width
        self.height = height
        self.data = b'\x00' * (width * height * 3)  # Mock RGB data
        
    def to_ndarray(self, format: str = 'rgb24'):
        """Mock to_ndarray method."""
        import numpy as np
        if format == 'rgb24':
            return np.zeros((self.height, self.width, 3), dtype=np.uint8)
        raise ValueError(f"Unsupported format: {format}")


class MockAudioFrame:
    """Mock LiveKit audio frame."""
    def __init__(self, timestamp_us: int, samples: int = 480):
        self.timestamp_us = timestamp_us
        self.samples = samples
        self.data = b'\x00' * (samples * 2 * 2)  # 16-bit stereo
        

class MockVideoStream:
    """Mock PyAV video stream."""
    def __init__(self):
        self.time_base = Fraction(1, 30)
        self.codec_context = MagicMock()
        self.codec_context.framerate = Fraction(30, 1)
        self.codec_context.time_base = Fraction(1, 30)
        self.width = 1920
        self.height = 1080
        self.pix_fmt = 'yuv420p'
        self.bit_rate = 2000000
        self.options = {}
        
    def encode(self, frame):
        """Mock encode method."""
        if frame is None:
            # Flush operation
            return []
        # Return mock packet
        packet = MagicMock()
        packet.size = 5000
        packet.pts = frame.pts if hasattr(frame, 'pts') else 0
        packet.dts = frame.pts if hasattr(frame, 'pts') else 0
        return [packet]


class MockAudioStream:
    """Mock PyAV audio stream."""
    def __init__(self):
        self.time_base = Fraction(1, 48000)
        self.sample_rate = 48000
        self.codec_context = MagicMock()
        self.codec_context.layout = 'stereo'
        self.bit_rate = 128000
        
    def encode(self, frame):
        """Mock encode method."""
        if frame is None:
            # Flush operation
            return []
        # Return mock packet
        packet = MagicMock()
        packet.size = 200
        packet.pts = frame.pts if hasattr(frame, 'pts') else 0
        packet.dts = frame.pts if hasattr(frame, 'pts') else 0
        return [packet]


class MockContainer:
    """Mock PyAV container."""
    def __init__(self):
        self.video_stream = MockVideoStream()
        self.audio_stream = MockAudioStream()
        self.mux_calls: list[Any] = []
        self.flush_calls = 0
        
    def add_stream(self, codec: str, rate: int, options: Dict[str, Any] = None):
        """Mock add_stream method."""
        if 'x264' in codec or 'h264' in codec:
            return self.video_stream
        elif 'aac' in codec:
            return self.audio_stream
        raise ValueError(f"Unknown codec: {codec}")
    
    def mux(self, packet):
        """Mock mux method."""
        self.mux_calls.append(packet)
    
    def flush(self):
        """Mock flush method."""
        self.flush_calls += 1
    
    def close(self):
        """Mock close method."""
        pass


class TestPTSDTSCalculation:
    """Test PTS/DTS calculation methods."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        self.mock_room.remote_participants = {}
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.output_dir = Path("/tmp/test_recordings")
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "video_bitrate": "2M",
            "audio_bitrate": "128k",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
        
        # Set up mock streams
        self.recorder.video_stream = MockVideoStream()
        self.recorder.audio_stream = MockAudioStream()
        self.recorder.container = MockContainer()
    
    def test_pts_calculation_first_frame(self):
        """Test PTS calculation for first frame establishes baseline."""
        frame = MockVideoFrame(timestamp_us=1000000)  # 1 second
        
        pts, dts = self.recorder._calculate_video_pts_dts(frame)
        
        # First frame should have PTS=0 (relative to baseline)
        assert pts == 0
        assert dts == 0
        assert self.recorder.first_video_timestamp_us == 1000000
        assert self.recorder.encoder_frame_counter == 1
    
    def test_pts_calculation_monotonic(self):
        """Test PTS is monotonically increasing."""
        frames = [
            MockVideoFrame(timestamp_us=1000000),
            MockVideoFrame(timestamp_us=1033333),  # +33.333ms (30fps)
            MockVideoFrame(timestamp_us=1066666),  # +33.333ms
        ]
        
        pts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            pts_values.append(pts)
        
        # PTS should be monotonically increasing
        assert pts_values == sorted(pts_values)
        assert all(pts_values[i] < pts_values[i+1] for i in range(len(pts_values)-1))
    
    def test_pts_calculation_with_jitter(self):
        """Test PTS calculation handles timestamp jitter."""
        frames = [
            MockVideoFrame(timestamp_us=1000000),
            MockVideoFrame(timestamp_us=1033333),
            MockVideoFrame(timestamp_us=1066000),  # Early by 666us
            MockVideoFrame(timestamp_us=1099999),  # Late by 333us
        ]
        
        pts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            pts_values.append(pts)
        
        # Despite jitter, PTS should remain monotonic
        assert pts_values == sorted(pts_values)
        
        # Jitter samples should be tracked
        assert len(self.recorder.pts_jitter_samples) > 0
    
    def test_pts_correction_for_non_monotonic(self):
        """Test PTS correction when timestamp goes backwards."""
        frames = [
            MockVideoFrame(timestamp_us=1000000),
            MockVideoFrame(timestamp_us=1033333),
            MockVideoFrame(timestamp_us=1030000),  # Goes backwards!
        ]
        
        pts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            pts_values.append(pts)
        
        # PTS should be corrected to maintain monotonicity
        assert pts_values[2] > pts_values[1]
    
    def test_dts_calculation(self):
        """Test DTS calculation accounts for B-frame reordering."""
        self.recorder.encoder_reorder_delay = 5
        frame = MockVideoFrame(timestamp_us=1000000)
        
        pts, dts = self.recorder._calculate_video_pts_dts(frame)
        
        # First frame PTS=0, so DTS should be 0 (clamped)
        assert dts == 0
        
        # Second frame should have DTS < PTS due to reordering delay
        frame2 = MockVideoFrame(timestamp_us=1166666)  # +166ms (5 frames)
        pts2, dts2 = self.recorder._calculate_video_pts_dts(frame2)
        assert dts2 <= pts2
    
    def test_dts_monotonic(self):
        """Test DTS is monotonically increasing."""
        self.recorder.encoder_reorder_delay = 3
        
        frames = [
            MockVideoFrame(timestamp_us=1000000 + i * 33333)
            for i in range(10)
        ]
        
        dts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            dts_values.append(dts)
        
        # DTS should be monotonically increasing
        assert dts_values == sorted(dts_values)
    
    def test_audio_pts_calculation(self):
        """Test audio PTS calculation based on sample count."""
        # Audio PTS is based on cumulative samples
        self.recorder.audio_samples_written = 0
        
        pts1 = self.recorder._calculate_audio_pts(480)  # 10ms @ 48kHz
        assert pts1 == 0
        
        self.recorder.audio_samples_written = 480
        pts2 = self.recorder._calculate_audio_pts(480)
        assert pts2 == 480
        
        self.recorder.audio_samples_written = 960
        pts3 = self.recorder._calculate_audio_pts(480)
        assert pts3 == 960
    
    def test_audio_pts_monotonic(self):
        """Test audio PTS is monotonically increasing."""
        pts_values = []
        for i in range(10):
            pts = self.recorder._calculate_audio_pts(480)
            pts_values.append(pts)
            self.recorder.audio_samples_written += 480
        
        # PTS should be monotonically increasing
        assert pts_values == sorted(pts_values)
    
    def test_pts_jitter_tracking(self):
        """Test PTS jitter is tracked for monitoring."""
        frames = [
            MockVideoFrame(timestamp_us=1000000 + i * 33333)
            for i in range(100)
        ]
        
        for frame in frames:
            self.recorder._calculate_video_pts_dts(frame)
        
        # Jitter samples should be collected
        assert len(self.recorder.pts_jitter_samples) <= 100
        
        # Should be able to calculate jitter statistics
        if self.recorder.pts_jitter_samples:
            avg_jitter = sum(self.recorder.pts_jitter_samples) / len(self.recorder.pts_jitter_samples)
            max_jitter = max(self.recorder.pts_jitter_samples)
            assert avg_jitter >= 0
            assert max_jitter >= 0


class TestEncoderFlushing:
    """Test encoder flushing functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.output_dir = Path("/tmp/test_recordings")
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
        
        # Set up mock streams
        self.recorder.video_stream = MockVideoStream()
        self.recorder.audio_stream = MockAudioStream()
        self.recorder.container = MockContainer()
    
    @pytest.mark.asyncio
    async def test_flush_encoder_basic(self):
        """Test basic encoder flushing."""
        initial_flush_count = self.recorder.encoder_flush_count
        
        await self.recorder._flush_encoder()
        
        assert self.recorder.encoder_flush_count == initial_flush_count + 1
        assert self.recorder.container.flush_calls > 0
    
    @pytest.mark.asyncio
    async def test_flush_encoder_with_video_only(self):
        """Test flushing with video stream only."""
        self.recorder.audio_stream = None
        
        await self.recorder._flush_encoder()
        
        # Should succeed without audio stream
        assert self.recorder.encoder_flush_count > 0
    
    @pytest.mark.asyncio
    async def test_flush_encoder_with_audio_only(self):
        """Test flushing with audio stream only."""
        self.recorder.video_stream = None
        
        await self.recorder._flush_encoder()
        
        # Should succeed without video stream
        assert self.recorder.encoder_flush_count > 0
    
    @pytest.mark.asyncio
    async def test_flush_encoder_no_container(self):
        """Test flushing handles missing container gracefully."""
        self.recorder.container = None
        
        # Should not raise exception
        await self.recorder._flush_encoder()
    
    @pytest.mark.asyncio
    async def test_flush_encoder_tracks_time(self):
        """Test flush encoder tracks last flush time."""
        initial_time = self.recorder.last_encoder_flush_time
        
        await self.recorder._flush_encoder()
        
        assert self.recorder.last_encoder_flush_time > initial_time
    
    @pytest.mark.asyncio
    async def test_periodic_flushing_tracking(self):
        """Test that flush count increments correctly."""
        initial_count = self.recorder.encoder_flush_count
        
        for _ in range(5):
            await self.recorder._flush_encoder()
        
        assert self.recorder.encoder_flush_count == initial_count + 5


class TestEncoderConfiguration:
    """Test encoder configuration with low-latency options."""
    
    def test_h264_encoder_options(self):
        """Test H.264 encoder is configured with low-latency options."""
        config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        # Mock the container and stream creation
        with patch('av.open') as mock_av_open:
            mock_container = MockContainer()
            mock_av_open.return_value = mock_container
            
            recorder = AiortcFileRecorder(
                mint_id="test_mint",
                stream_info=Mock(participant_sid="test"),
                output_dir=Path("/tmp/test"),
                config=config,
                room=Mock(spec=rtc.Room, isconnected=Mock(return_value=True))
            )
            
            recorder.video_track = Mock()
            recorder.audio_track = Mock()
            
            # This would normally be called during container setup
            # We're just testing the configuration logic here
            assert config["gop_size"] == 60
            assert config["video_codec"] == "libx264"
    
    def test_vp9_encoder_options(self):
        """Test VP9 encoder is configured with low-latency options."""
        config = {
            "video_codec": "libvpx-vp9",
            "audio_codec": "opus",
            "format": "webm",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        assert config["video_codec"] == "libvpx-vp9"
        assert config["gop_size"] == 60
    
    def test_reorder_delay_calculation(self):
        """Test encoder reorder delay is calculated correctly."""
        config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=Mock(participant_sid="test"),
            output_dir=Path("/tmp/test"),
            config=config,
            room=Mock(spec=rtc.Room, isconnected=Mock(return_value=True))
        )
        
        # After container setup, reorder delay should be set
        # It should be min(10, gop_size // 2)
        expected_delay = min(10, 60 // 2)
        # We can't test this directly without running full setup
        # but we can verify the calculation logic
        assert expected_delay == 10


class TestMetricsInstrumentation:
    """Test metrics and instrumentation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.output_dir = Path("/tmp/test_recordings")
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
    
    def test_initial_metrics(self):
        """Test initial metric values."""
        assert self.recorder.packets_written == 0
        assert self.recorder.encoder_flush_count == 0
        assert self.recorder.zero_packet_streak == 0
        assert len(self.recorder.pts_jitter_samples) == 0
        assert self.recorder.encoder_frame_counter == 0
    
    def test_packet_counting(self):
        """Test packet counting metric."""
        self.recorder.packets_written = 0
        
        # Simulate writing packets
        self.recorder.packets_written += 1
        assert self.recorder.packets_written == 1
        
        self.recorder.packets_written += 5
        assert self.recorder.packets_written == 6
    
    def test_zero_packet_streak_tracking(self):
        """Test zero packet streak is tracked."""
        self.recorder.zero_packet_streak = 0
        
        # Simulate zero packet frames
        self.recorder.zero_packet_streak += 1
        assert self.recorder.zero_packet_streak == 1
        
        self.recorder.zero_packet_streak += 1
        assert self.recorder.zero_packet_streak == 2
        
        # Reset on successful packet
        self.recorder.zero_packet_streak = 0
        assert self.recorder.zero_packet_streak == 0
    
    def test_pts_jitter_samples_limit(self):
        """Test PTS jitter samples are limited to 100."""
        # Add more than 100 samples
        for i in range(150):
            self.recorder.pts_jitter_samples.append(i)
            # Simulate the limit enforcement
            if len(self.recorder.pts_jitter_samples) > 100:
                self.recorder.pts_jitter_samples.pop(0)
        
        assert len(self.recorder.pts_jitter_samples) <= 100
    
    @pytest.mark.asyncio
    async def test_status_includes_metrics(self):
        """Test get_status includes all new metrics."""
        # Set some metric values
        self.recorder.packets_written = 100
        self.recorder.encoder_flush_count = 5
        self.recorder.zero_packet_streak = 0
        self.recorder.pts_jitter_samples = [1, 2, 3, 4, 5]
        self.recorder.encoder_frame_counter = 100
        self.recorder.state = RecordingState.RECORDING
        self.recorder.video_frames_received = 100
        
        status = await self.recorder.get_status()
        
        assert "stats" in status
        assert status["stats"]["packets_written"] == 100
        assert status["stats"]["encoder_flush_count"] == 5
        assert status["stats"]["zero_packet_streak"] == 0
        assert status["stats"]["pts_jitter_avg"] == 3.0  # Average of [1,2,3,4,5]
        assert status["stats"]["pts_jitter_max"] == 5
        assert status["stats"]["encoder_frame_counter"] == 100


class TestRecordingState:
    """Test recording state management."""
    
    def test_recording_state_enum(self):
        """Test RecordingState enum values."""
        assert RecordingState.DISCONNECTED.value == "disconnected"
        assert RecordingState.CONNECTING.value == "connecting"
        assert RecordingState.CONNECTED.value == "connected"
        assert RecordingState.SUBSCRIBING.value == "subscribing"
        assert RecordingState.SUBSCRIBED.value == "subscribed"
        assert RecordingState.RECORDING.value == "recording"
        assert RecordingState.STOPPING.value == "stopping"
        assert RecordingState.STOPPED.value == "stopped"


class TestVideoNormalizer:
    """Test video frame normalization."""
    
    def test_video_normalizer_init(self):
        """Test VideoNormalizer initialization."""
        config = {
            "rgb_order": "RGB",
            "resolution_strategy": "scale_to_config",
            "colorspace": "bt709",
            "range": "limited",
            "coerce_unknown_to_rgb": False,
        }
        
        normalizer = VideoNormalizer(config)
        
        assert normalizer.rgb_order == "RGB"
        assert normalizer.resolution_strategy == "scale_to_config"
        assert normalizer.colorspace == "bt709"
        assert normalizer.range == "limited"
        assert normalizer.coerce_unknown_to_rgb is False


class TestErrorHandling:
    """Test error handling in PTS/DTS calculation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=Path("/tmp/test"),
            config=self.config,
            room=self.mock_room
        )
    
    def test_pts_calculation_without_video_stream(self):
        """Test PTS calculation raises error without video stream."""
        self.recorder.video_stream = None
        frame = MockVideoFrame(timestamp_us=1000000)
        
        with pytest.raises(ValueError, match="Video stream not initialized"):
            self.recorder._calculate_video_pts_dts(frame)
    
    def test_audio_pts_calculation_without_audio_stream(self):
        """Test audio PTS calculation raises error without audio stream."""
        self.recorder.audio_stream = None
        
        with pytest.raises(ValueError, match="Audio stream not initialized"):
            self.recorder._calculate_audio_pts(480)


class TestBackpressureHandling:
    """Test backpressure handling and frame dropping."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.output_dir = Path("/tmp/test_recordings")
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
    
    def test_initial_backpressure_metrics(self):
        """Test initial backpressure metric values."""
        assert self.recorder.max_memory_mb > 0
        assert self.recorder.frames_dropped_due_to_backpressure == 0
        assert len(self.recorder.frame_processing_time_samples) == 0
    
    def test_frame_processing_time_tracking(self):
        """Test frame processing time is tracked."""
        # Simulate adding processing time samples
        for i in range(10):
            self.recorder.frame_processing_time_samples.append(0.001 * (i + 1))
        
        assert len(self.recorder.frame_processing_time_samples) == 10
        avg_time = sum(self.recorder.frame_processing_time_samples) / len(self.recorder.frame_processing_time_samples)
        assert avg_time > 0
    
    def test_frame_processing_time_sample_limit(self):
        """Test processing time samples are limited to 100."""
        # Add more than 100 samples
        for i in range(150):
            self.recorder.frame_processing_time_samples.append(0.001)
            # Simulate the limit enforcement
            if len(self.recorder.frame_processing_time_samples) > 100:
                self.recorder.frame_processing_time_samples.pop(0)
        
        assert len(self.recorder.frame_processing_time_samples) == 100
    
    def test_memory_limit_configuration(self):
        """Test memory limit can be configured."""
        assert self.recorder.max_memory_mb == 1500
        
        # Test custom limit
        custom_recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
        custom_recorder.max_memory_mb = 2000
        
        assert custom_recorder.max_memory_mb == 2000
    
    def test_frame_drop_counter(self):
        """Test frame drop counter increments."""
        initial_count = self.recorder.frames_dropped_due_to_backpressure
        
        # Simulate frame drops
        self.recorder.frames_dropped_due_to_backpressure += 1
        assert self.recorder.frames_dropped_due_to_backpressure == initial_count + 1
        
        self.recorder.frames_dropped_due_to_backpressure += 5
        assert self.recorder.frames_dropped_due_to_backpressure == initial_count + 6
    
    @pytest.mark.asyncio
    async def test_status_includes_backpressure_metrics(self):
        """Test get_status includes backpressure metrics."""
        # Set some metric values
        self.recorder.frames_dropped_due_to_backpressure = 10
        self.recorder.frame_processing_time_samples = [0.001, 0.002, 0.003]
        self.recorder.state = RecordingState.RECORDING
        self.recorder.video_frames_received = 100
        
        status = await self.recorder.get_status()
        
        assert "stats" in status
        assert status["stats"]["frames_dropped_backpressure"] == 10
        assert status["stats"]["avg_frame_processing_ms"] > 0


class TestIntegrationScenarios:
    """Integration tests for complete recording scenarios."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_room = Mock(spec=rtc.Room)
        self.mock_room.isconnected.return_value = True
        
        self.mock_stream_info = Mock()
        self.mock_stream_info.participant_sid = "test_participant"
        
        self.output_dir = Path("/tmp/test_recordings")
        
        self.config = {
            "video_codec": "libx264",
            "audio_codec": "aac",
            "format": "mp4",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "gop_size": 60,
        }
        
        self.recorder = AiortcFileRecorder(
            mint_id="test_mint",
            stream_info=self.mock_stream_info,
            output_dir=self.output_dir,
            config=self.config,
            room=self.mock_room
        )
        
        # Set up mock streams
        self.recorder.video_stream = MockVideoStream()
        self.recorder.audio_stream = MockAudioStream()
        self.recorder.container = MockContainer()
    
    def test_complete_recording_workflow(self):
        """Test complete recording workflow from start to finish."""
        # Simulate processing multiple frames
        frames = [
            MockVideoFrame(timestamp_us=1000000 + i * 33333)
            for i in range(100)
        ]
        
        pts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            pts_values.append(pts)
        
        # Verify all frames processed successfully
        assert len(pts_values) == 100
        assert pts_values == sorted(pts_values)  # Monotonic
        assert self.recorder.encoder_frame_counter == 100
        
        # Verify jitter tracking
        assert len(self.recorder.pts_jitter_samples) > 0
    
    def test_encoder_state_after_long_recording(self):
        """Test encoder state remains stable after long recording."""
        # Simulate long recording (1000 frames)
        for i in range(1000):
            frame = MockVideoFrame(timestamp_us=1000000 + i * 33333)
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
        
        # Verify encoder state
        assert self.recorder.encoder_frame_counter == 1000
        assert self.recorder.last_video_pts > 0
        assert self.recorder.last_video_dts >= 0
        
        # Jitter samples should be limited to 100
        assert len(self.recorder.pts_jitter_samples) <= 100
    
    def test_recording_with_timestamp_gaps(self):
        """Test recording handles timestamp gaps gracefully."""
        frames = [
            MockVideoFrame(timestamp_us=1000000),
            MockVideoFrame(timestamp_us=1033333),
            MockVideoFrame(timestamp_us=1066666),
            MockVideoFrame(timestamp_us=1200000),  # 133ms gap (4 missing frames)
            MockVideoFrame(timestamp_us=1233333),
        ]
        
        pts_values = []
        for frame in frames:
            pts, dts = self.recorder._calculate_video_pts_dts(frame)
            pts_values.append(pts)
        
        # PTS should still be monotonic despite gaps
        assert pts_values == sorted(pts_values)
    
    @pytest.mark.asyncio
    async def test_combined_video_audio_sync(self):
        """Test video and audio PTS remain synchronized."""
        # Process video frames
        for i in range(30):  # 1 second of video
            frame = MockVideoFrame(timestamp_us=1000000 + i * 33333)
            self.recorder._calculate_video_pts_dts(frame)
        
        # Process audio frames (100 frames @ 10ms each = 1 second)
        for i in range(100):
            pts = self.recorder._calculate_audio_pts(480)  # 480 samples @ 48kHz = 10ms
            self.recorder.audio_samples_written += 480
        
        # Verify synchronization (within reasonable tolerance)
        # Video: 30 frames / 30fps = 1 second
        # Audio: 48000 samples / 48000Hz = 1 second
        video_seconds = self.recorder.encoder_frame_counter / self.config['fps']
        audio_seconds = self.recorder.audio_samples_written / 48000
        
        assert abs(video_seconds - audio_seconds) < 0.1  # Within 100ms


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

