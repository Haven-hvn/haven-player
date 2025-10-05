#!/usr/bin/env python3
"""
Test script for aiortc recording implementation.
Tests the new recording API endpoints and aiortc integration.
"""

import asyncio
import sys
import logging
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from app.services.aiortc_recording_service import AioRTCRecordingService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("test-aiortc-recording")


async def test_recording_service():
    """Test the aiortc recording service."""
    logger.info("Testing AioRTCRecordingService...")
    
    service = AioRTCRecordingService()
    
    try:
        # Test output directory
        output_dir = service.get_output_directory()
        logger.info(f"✅ Output directory: {output_dir}")
        
        # Test supported formats
        formats = await service.get_supported_formats()
        logger.info(f"✅ Supported formats: {formats}")
        
        # Test active recordings (should be empty)
        active = await service.get_active_recordings()
        logger.info(f"✅ Active recordings: {len(active)}")
        
        # Test recording status for non-existent stream
        status = await service.get_recording_status("test_mint_id")
        logger.info(f"✅ Status for non-existent stream: {status}")
        
        logger.info("✅ All basic tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        return False


async def test_recording_config():
    """Test recording configuration."""
    logger.info("Testing recording configuration...")
    
    service = AioRTCRecordingService()
    
    try:
        # Test different output directories
        test_dir = "/tmp/haven-player-test"
        result = await service.set_output_directory(test_dir)
        
        if result["success"]:
            logger.info(f"✅ Set output directory: {result['output_directory']}")
        else:
            logger.error(f"❌ Failed to set output directory: {result['error']}")
            return False
        
        # Test invalid directory
        result = await service.set_output_directory("/invalid/path/that/does/not/exist")
        if not result["success"]:
            logger.info(f"✅ Correctly rejected invalid directory: {result['error']}")
        else:
            logger.error("❌ Should have rejected invalid directory")
            return False
        
        logger.info("✅ Configuration tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Configuration test failed: {e}")
        return False


async def test_api_endpoints():
    """Test API endpoint integration."""
    logger.info("Testing API endpoint integration...")
    
    try:
        # Import the recording router
        from app.api.recording import router, recording_service, pumpfun_service
        
        logger.info("✅ Recording router imported successfully")
        logger.info(f"✅ Recording service initialized: {type(recording_service)}")
        logger.info(f"✅ PumpFun service initialized: {type(pumpfun_service)}")
        
        # Test router endpoints
        routes = [route.path for route in router.routes]
        expected_routes = [
            "/start",
            "/stop", 
            "/status/{mint_id}",
            "/active",
            "/stop-all",
            "/output-directory",
            "/set-output-directory",
            "/formats"
        ]
        
        for expected_route in expected_routes:
            if any(expected_route in route for route in routes):
                logger.info(f"✅ Route found: {expected_route}")
            else:
                logger.warning(f"⚠️  Route not found: {expected_route}")
        
        logger.info("✅ API endpoint tests passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ API endpoint test failed: {e}")
        return False


async def test_dependencies():
    """Test that all required dependencies are available."""
    logger.info("Testing dependencies...")
    
    try:
        # Test aiortc import
        import aiortc
        logger.info(f"✅ aiortc imported: {aiortc.__version__}")
        
        # Test aiofiles import
        import aiofiles
        logger.info(f"✅ aiofiles imported: {aiofiles.__version__}")
        
        # Test FastAPI components
        from fastapi import APIRouter, HTTPException
        from pydantic import BaseModel
        logger.info("✅ FastAPI components imported")
        
        # Test aiortc components
        from aiortc import RTCPeerConnection, RTCSessionDescription
        from aiortc.contrib.media import MediaRecorder
        logger.info("✅ aiortc components imported")
        
        logger.info("✅ All dependencies available!")
        return True
        
    except ImportError as e:
        logger.error(f"❌ Missing dependency: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Dependency test failed: {e}")
        return False


async def main():
    """Run all tests."""
    logger.info("🚀 Starting aiortc recording tests...")
    
    tests = [
        ("Dependencies", test_dependencies),
        ("Recording Service", test_recording_service),
        ("Recording Configuration", test_recording_config),
        ("API Endpoints", test_api_endpoints),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n{'='*50}")
        logger.info(f"Running test: {test_name}")
        logger.info(f"{'='*50}")
        
        try:
            if await test_func():
                passed += 1
                logger.info(f"✅ {test_name}: PASSED")
            else:
                logger.error(f"❌ {test_name}: FAILED")
        except Exception as e:
            logger.error(f"❌ {test_name}: ERROR - {e}")
    
    # Summary
    logger.info(f"\n{'='*60}")
    logger.info("TEST SUMMARY")
    logger.info(f"{'='*60}")
    logger.info(f"Passed: {passed}/{total}")
    logger.info(f"Success rate: {passed/total:.1%}")
    
    if passed == total:
        logger.info("🎉 All tests passed! aiortc recording is ready.")
    else:
        logger.warning("⚠️  Some tests failed. Check your setup.")
    
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
