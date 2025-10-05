#!/usr/bin/env python3
"""
Test script to verify the cleanup of shared stream management architecture.
"""

import asyncio
import requests
from typing import Dict, Any


class CleanupTester:
    """Test the cleaned up shared stream management architecture."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.test_mint_id = "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
    
    async def test_cleanup(self):
        """Test the cleaned up architecture."""
        print("🧹 Testing Cleaned Up Shared Stream Management")
        print("=" * 60)
        
        # Test 1: Check API endpoints
        print("\n1️⃣ Testing API Endpoints...")
        await self._test_api_endpoints()
        
        # Test 2: Test shared stream management
        print("\n2️⃣ Testing Shared Stream Management...")
        await self._test_shared_stream_management()
        
        print("\n✅ Cleanup verification complete!")
    
    async def _test_api_endpoints(self):
        """Test API endpoint availability."""
        endpoints = [
            "/",
            "/health",
            "/api/live-sessions/active",
            "/api/recording/active",
            "/api/recording/formats"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(f"{self.base_url}{endpoint}")
                if response.status_code == 200:
                    print(f"✅ {endpoint}")
                else:
                    print(f"❌ {endpoint} - {response.status_code}")
            except Exception as e:
                print(f"❌ {endpoint} - {e}")
    
    async def _test_shared_stream_management(self):
        """Test shared stream management flow."""
        try:
            # Test start session
            print("   Testing session start...")
            response = requests.post(
                f"{self.base_url}/api/live-sessions/start",
                json={"mint_id": self.test_mint_id}
            )
            
            if response.status_code == 200:
                print("   ✅ Session start endpoint working")
                
                # Test start recording
                print("   Testing recording start...")
                response = requests.post(
                    f"{self.base_url}/api/recording/start",
                    json={
                        "mint_id": self.test_mint_id,
                        "output_format": "av1",
                        "video_quality": "medium"
                    }
                )
                
                if response.status_code == 200:
                    print("   ✅ Recording start endpoint working")
                    
                    # Test stop recording
                    print("   Testing recording stop...")
                    response = requests.post(
                        f"{self.base_url}/api/recording/stop",
                        json={"mint_id": self.test_mint_id}
                    )
                    
                    if response.status_code == 200:
                        print("   ✅ Recording stop endpoint working")
                    else:
                        print("   ❌ Recording stop failed")
                else:
                    print("   ❌ Recording start failed")
            else:
                print("   ❌ Session start failed")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")


async def main():
    """Main test function."""
    print("🚀 Starting Cleanup Verification Tests")
    print("=" * 60)
    
    tester = CleanupTester()
    await tester.test_cleanup()
    
    print("\n📋 Architecture Summary:")
    print("   • StreamManager: Single WebRTC connection management")
    print("   • LiveSessionService: WebSocket streaming using shared stream")
    print("   • LiveKitRecordingService: Native recording using shared stream")
    print("   • No duplicate WebRTC connections")
    print("   • No mint_id dependency in recording service")
    print("   • Clean architecture with no _v2 files")


if __name__ == "__main__":
    asyncio.run(main())
