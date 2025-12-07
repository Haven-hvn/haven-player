"""
Lightweight validation of recording configuration defaults.
"""

from pathlib import Path

from app.services.webrtc_recording_service import WebRTCRecordingService


def test_default_config_values(tmp_path: Path):
    service = WebRTCRecordingService(output_dir=str(tmp_path))
    config = service.default_config
    assert config["format"] == "mp4"
    assert config["video_codec"] == "h264"
    assert config["audio_codec"] == "aac"
    assert config["video_bitrate"].endswith("M")
    assert config["audio_bitrate"].endswith("k")


