from app.services.pumpfun_service import PumpFunService


def test_ingest_priority_high_then_default_then_low_then_vod_then_mp4():
    svc = PumpFunService()
    stream = {
        "playlist_url_high": "https://example.com/high.m3u8",
        "playlist_url": "https://example.com/default.m3u8",
        "playlist_url_low": "https://example.com/low.m3u8",
        "vod_playlist_url": "https://example.com/vod.m3u8",
        "video_uri": "https://example.com/fallback.mp4",
    }
    result = svc.format_stream_for_ui(stream)
    assert result["ingest_url"] == "https://example.com/high.m3u8"


def test_ingest_fallback_to_default_playlist():
    svc = PumpFunService()
    stream = {
        "playlist_url": "https://example.com/default.m3u8",
        "vod_playlist_url": "https://example.com/vod.m3u8",
        "video_uri": "https://example.com/fallback.mp4",
    }
    result = svc.format_stream_for_ui(stream)
    assert result["ingest_url"] == "https://example.com/default.m3u8"


def test_ingest_fallback_to_vod_then_mp4():
    svc = PumpFunService()
    stream = {
        "vod_playlist_url": "https://example.com/vod.m3u8",
        "video_uri": "https://example.com/fallback.mp4",
    }
    result = svc.format_stream_for_ui(stream)
    assert result["ingest_url"] == "https://example.com/vod.m3u8"


def test_ingest_fallback_to_mp4():
    svc = PumpFunService()
    stream = {
        "video_uri": "https://example.com/fallback.mp4",
    }
    result = svc.format_stream_for_ui(stream)
    assert result["ingest_url"] == "https://example.com/fallback.mp4"

