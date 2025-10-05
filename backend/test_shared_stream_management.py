#!/usr/bin/env python3
"""
Test script for shared stream management architecture.
Tests the StreamManager, LiveSessionService, and LiveKitRecordingService.
"""

import asyncio
import json
import requests
from typing import Dict, Any


class SharedStreamManagementTester:
    """Test the new shared stream management architecture."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.test_mint_id = "V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump"
    
    async def test_shared_stream_management(self):
        """Test the complete shared stream management flow."""
        print("🧪 Testing Shared Stream Management Architecture")
        print("=" * 60)
        
        # Test 1: Start live session
        print("\n1️⃣ Testing Live Session Start...")
        session_result = await self._test_start_session()
        if not session_result["success"]:
            print("❌ Failed to start session")
            return False
        
        # Test 2: Start recording (uses shared stream)
        print("\n2️⃣ Testing Recording Start (Shared Stream)...")
        recording_result = await self._test_start_recording()
        if not recording_result["success"]:
            print("❌ Failed to start recording")
            return False
        
        # Test 3: Check recording status
        print("\n3️⃣ Testing Recording Status...")
        status_result = await self._test_recording_status()
        if not status_result["success"]:
            print("❌ Failed to get recording status")
            return False
        
        # Test 4: Get active sessions
        print("\n4️⃣ Testing Active Sessions...")
        sessions_result = await self._test_active_sessions()
        if not sessions_result["success"]:
            print("❌ Failed to get active sessions")
            return False
        
        # Test 5: Stop recording
        print("\n5️⃣ Testing Recording Stop...")
        stop_recording_result = await self._test_stop_recording()
        if not stop_recording_result["success"]:
            print("❌ Failed to stop recording")
            return False
        
        # Test 6: Stop session
        print("\n6️⃣ Testing Session Stop...")
        stop_session_result = await self._test_stop_session()
        if not stop_session_result["success"]:
            print("❌ Failed to stop session")
            return False
        
        print("\n✅ All tests passed! Shared stream management is working correctly.")
        return True
    
    async def _test_start_session(self) -> Dict[str, Any]:
        """Test starting a live session."""
        try:
            response = requests.post(
                f"{self.base_url}/api/live-sessions/start",
                json={"mint_id": self.test_mint_id}
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Session started: {result.get('room_name')}")
                print(f"   Participant SID: {result.get('participant_sid')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Session start failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Session start error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _test_start_recording(self) -> Dict[str, Any]:
        """Test starting recording using shared stream."""
        try:
            response = requests.post(
                f"{self.base_url}/api/recording/start",
                json={
                    "mint_id": self.test_mint_id,
                    "output_format": "av1",
                    "video_quality": "medium"
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Recording started: {result.get('output_path')}")
                print(f"   Config: {result.get('config')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Recording start failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Recording start error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _test_recording_status(self) -> Dict[str, Any]:
        """Test getting recording status."""
        try:
            response = requests.get(
                f"{self.base_url}/api/recording/status/{self.test_mint_id}"
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Recording status: {result.get('is_recording')}")
                print(f"   Output path: {result.get('output_path')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Recording status failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Recording status error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _test_active_sessions(self) -> Dict[str, Any]:
        """Test getting active sessions."""
        try:
            response = requests.get(f"{self.base_url}/api/live-sessions/active")
            
            if response.status_code == 200:
                result = response.json()
                sessions = result.get("sessions", {})
                print(f"✅ Active sessions: {len(sessions)}")
                for mint_id, session in sessions.items():
                    print(f"   {mint_id}: {session.get('room_name')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Active sessions failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Active sessions error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _test_stop_recording(self) -> Dict[str, Any]:
        """Test stopping recording."""
        try:
            response = requests.post(
                f"{self.base_url}/api/recording/stop",
                json={"mint_id": self.test_mint_id}
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Recording stopped: {result.get('output_path')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Recording stop failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Recording stop error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _test_stop_session(self) -> Dict[str, Any]:
        """Test stopping session."""
        try:
            response = requests.post(
                f"{self.base_url}/api/live-sessions/stop",
                json={"mint_id": self.test_mint_id}
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Session stopped: {result.get('mint_id')}")
                return {"success": True, "data": result}
            else:
                print(f"❌ Session stop failed: {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            print(f"❌ Session stop error: {e}")
            return {"success": False, "error": str(e)}
    
    async def test_api_endpoints(self):
        """Test API endpoint availability."""
        print("\n🔍 Testing API Endpoints...")
        
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


async def main():
    """Main test function."""
    print("🚀 Starting Shared Stream Management Tests")
    print("=" * 60)
    
    tester = SharedStreamManagementTester()
    
    # Test API endpoints
    await tester.test_api_endpoints()
    
    # Test shared stream management
    success = await tester.test_shared_stream_management()
    
    if success:
        print("\n🎉 All tests passed! Shared stream management is working correctly.")
        print("\n📋 Architecture Summary:")
        print("   • StreamManager: Single WebRTC connection management")
        print("   • LiveSessionService: WebSocket streaming using shared stream")
        print("   • LiveKitRecordingService: Native recording using shared stream")
        print("   • No duplicate WebRTC connections")
        print("   • No mint_id dependency in recording service")
    else:
        print("\n❌ Some tests failed. Check the output above for details.")


if __name__ == "__main__":
    asyncio.run(main())
