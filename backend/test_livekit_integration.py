#!/usr/bin/env python3
"""
Test script for LiveKit integration in Haven Player.

This script tests the basic LiveKit functionality without requiring
a full frontend setup. Run this to verify your LiveKit configuration.
"""

import asyncio
import os
import sys
import logging
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent / "app"))

from app.services.live_session_service import LiveSessionService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("test-livekit")


async def test_basic_connection():
    """Test basic LiveKit room connection."""
    logger.info("Testing basic LiveKit connection...")

    service = LiveSessionService()
    await service.initialize()

    try:
        # Test with a mint_id that should be live
        mint_id = "JCXMR4uW9aGDgqEvzSJcZ88iCtsm8MM2tQqk7P4Ppump"

        logger.info(f"Starting session for mint_id: {mint_id}")
        result = await service.start_session(mint_id, record_session=False)

        if result["success"]:
            logger.info("✅ Connection successful!")
            logger.info(f"Participant SID: {result['participant_sid']}")

            # Wait a bit to see if we get any events
            await asyncio.sleep(5)

            # Stop the session
            logger.info("Stopping session...")
            stop_result = await service.stop_session(mint_id)
            logger.info(f"Stop result: {stop_result}")

        else:
            logger.error(f"❌ Connection failed: {result['error']}")
            return False

    except Exception as e:
        logger.error(f"❌ Test failed with exception: {e}")
        return False
    finally:
        await service.shutdown()

    return True


async def test_token_generation():
    """Test token generation without connecting."""
    logger.info("Testing token generation...")

    service = LiveSessionService()
    await service.initialize()

    try:
        mint_id = "JCXMR4uW9aGDgqEvzSJcZ88iCtsm8MM2tQqk7P4Ppump"
        token = service._generate_token(mint_id)

        if token and "token_for_" not in token:
            logger.info("✅ Token generation successful!")
            logger.info(f"Token length: {len(token)} characters")
            return True
        else:
            logger.error("❌ Token generation failed or using placeholder")
            return False

    except Exception as e:
        logger.error(f"❌ Token generation test failed: {e}")
        return False


async def test_active_sessions():
    """Test active sessions retrieval."""
    logger.info("Testing active sessions...")

    service = LiveSessionService()
    await service.initialize()

    try:
        sessions = service.get_active_sessions()
        logger.info(f"✅ Active sessions retrieved: {len(sessions)} sessions")
        logger.info(f"Sessions: {sessions}")
        return True

    except Exception as e:
        logger.error(f"❌ Active sessions test failed: {e}")
        return False


async def main():
    """Run all tests."""
    logger.info("🚀 Starting LiveKit integration tests...")

    # Check environment variables
    required_vars = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    if missing_vars:
        logger.warning(f"⚠️  Missing environment variables: {missing_vars}")
        logger.warning("Using default/placeholder values for testing")

        # Set some defaults for testing
        os.environ.setdefault("LIVEKIT_URL", "ws://pump-prod-tg2x8veh.livekit.cloud")
        os.environ.setdefault("LIVEKIT_API_KEY", "test-key")
        os.environ.setdefault("LIVEKIT_API_SECRET", "test-secret")

    # Run tests
    tests = [
        ("Token Generation", test_token_generation),
        ("Active Sessions", test_active_sessions),
        ("Basic Connection", test_basic_connection),
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
    logger.info(".1f")

    if passed == total:
        logger.info("🎉 All tests passed! LiveKit integration is working.")
    else:
        logger.warning("⚠️  Some tests failed. Check your configuration.")

    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
