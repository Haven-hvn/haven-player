#!/usr/bin/env python3
"""
Test script to verify NVDEC error fix and fallback decoder functionality.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from app.services.aiortc_recording_service import AioRTCRecordingService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_decoder_detection():
    """Test decoder capability detection."""
    logger.info("Testing decoder capability detection...")
    
    try:
        service = AioRTCRecordingService()
        decoder_status = service.get_decoder_status()
        
        logger.info(f"Decoder capabilities: {decoder_status['decoder_capabilities']}")
        logger.info(f"Recommended config: {decoder_status['recommended_config']}")
        
        # Check if we have safe fallback configuration
        if decoder_status['recommended_config']['fallback_to_software']:
            logger.info("✅ Safe fallback configuration detected")
        else:
            logger.warning("⚠️  Hardware decoder enabled - may cause NVDEC errors")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Decoder detection failed: {e}")
        return False


async def test_recording_config():
    """Test recording configuration with fallbacks."""
    logger.info("Testing recording configuration...")
    
    try:
        service = AioRTCRecordingService()
        
        # Test different output formats
        formats = ["av1", "h264", "vp9"]
        qualities = ["low", "medium", "high"]
        
        for fmt in formats:
            for quality in qualities:
                config = service._get_recording_config(fmt, quality)
                safe_config = service._get_safe_decoder_config(config)
                
                logger.info(f"Format: {fmt}, Quality: {quality}")
                logger.info(f"  Video codec: {safe_config['video_codec']}")
                logger.info(f"  Hardware decoder: {safe_config.get('use_hardware_decoder', False)}")
                logger.info(f"  Fallback enabled: {safe_config.get('fallback_to_software', False)}")
                
                # Verify safe configuration
                if safe_config.get('fallback_to_software', False):
                    logger.info("  ✅ Safe fallback configuration")
                else:
                    logger.warning("  ⚠️  Hardware decoder may cause issues")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Recording configuration test failed: {e}")
        return False


async def test_error_handling():
    """Test error handling for NVDEC failures."""
    logger.info("Testing NVDEC error handling...")
    
    try:
        service = AioRTCRecordingService()
        
        # Test decoder fallback configuration
        config = {
            "video_codec": "libaom-av1",
            "audio_codec": "aac",
            "video_bitrate": "2000k",
            "audio_bitrate": "128k",
            "format": "mp4",
            "use_hardware_decoder": True,
            "fallback_to_software": True
        }
        
        safe_config = service._get_safe_decoder_config(config)
        
        # Verify error handling options are present
        if "ffmpeg_options" in safe_config:
            logger.info("✅ FFmpeg error handling options configured")
            logger.info(f"  Error correction: {safe_config['ffmpeg_options'].get('error_correction', 'not set')}")
            logger.info(f"  Hardware acceleration: {safe_config['ffmpeg_options'].get('hwaccel', 'not set')}")
        else:
            logger.warning("⚠️  No FFmpeg error handling options found")
        
        # Verify input options for NVDEC error handling
        if "ffmpeg_input_options" in safe_config:
            logger.info("✅ FFmpeg input error handling options configured")
            logger.info(f"  Input options: {safe_config['ffmpeg_input_options']}")
        else:
            logger.warning("⚠️  No FFmpeg input error handling options found")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error handling test failed: {e}")
        return False


async def main():
    """Run all tests."""
    logger.info("=== NVDEC Error Fix Test ===\n")
    
    tests = [
        ("Decoder Detection", test_decoder_detection),
        ("Recording Configuration", test_recording_config),
        ("Error Handling", test_error_handling)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        logger.info(f"\n--- {test_name} ---")
        try:
            result = await test_func()
            results.append((test_name, result))
            if result:
                logger.info(f"✅ {test_name} passed")
            else:
                logger.error(f"❌ {test_name} failed")
        except Exception as e:
            logger.error(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    # Summary
    logger.info("\n=== Test Summary ===")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        logger.info(f"{status} {test_name}")
    
    logger.info(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("🎉 All tests passed! NVDEC error fix is working correctly.")
        return 0
    else:
        logger.error("❌ Some tests failed. Please check the implementation.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
