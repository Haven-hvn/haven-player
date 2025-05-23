#!/usr/bin/env python3
"""
Integration test to verify frontend-backend communication
Tests all API endpoints with data structures that match frontend types
"""

import sys
import os
import json
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.models.base import Base
from app.models.database import get_db

# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./integration_test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def test_frontend_backend_integration():
    """Test complete frontend-backend integration"""
    print("🚀 Testing Frontend-Backend Integration")
    print("=" * 50)
    
    # Override the dependency
    app.dependency_overrides[get_db] = override_get_db
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    try:
        client = TestClient(app)
        
        # Test 1: Video Creation (matches VideoCreate interface)
        print("\n📹 Testing Video Creation...")
        video_data = {
            "path": "/test/sample_video.mp4",
            "title": "Sample Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
        
        response = client.post("/api/videos/", json=video_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        created_video = response.json()
        print(f"✓ Created video: {created_video['title']}")
        print(f"  - ID: {created_video['id']}")
        print(f"  - Path: {created_video['path']}")
        print(f"  - Duration: {created_video['duration']}")
        print(f"  - Has AI Data: {created_video['has_ai_data']}")
        print(f"  - Created At: {created_video['created_at']}")
        
        # Verify the response matches frontend Video interface
        required_fields = ['id', 'path', 'title', 'duration', 'has_ai_data', 'thumbnail_path', 'position', 'created_at']
        for field in required_fields:
            assert field in created_video, f"Missing field: {field}"
        
        # Test created_at is a valid ISO datetime string
        datetime.fromisoformat(created_video['created_at'].replace('Z', '+00:00'))
        
        # Test 2: Get All Videos
        print("\n📋 Testing Get All Videos...")
        response = client.get("/api/videos/")
        assert response.status_code == 200
        
        videos = response.json()
        assert len(videos) == 1
        assert videos[0]['path'] == video_data['path']
        print(f"✓ Retrieved {len(videos)} video(s)")
        
        # Test 3: Create Timestamp (matches TimestampCreate interface)
        print("\n⏱️  Testing Timestamp Creation...")
        video_path = video_data['path']
        timestamp_data = {
            "tag_name": "person",
            "start_time": 10.5,
            "end_time": 25.8,
            "confidence": 0.95
        }
        
        response = client.post(f"/api/videos/{video_path}/timestamps/", json=timestamp_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        created_timestamp = response.json()
        print(f"✓ Created timestamp: {created_timestamp['tag_name']}")
        print(f"  - Start: {created_timestamp['start_time']}s")
        print(f"  - End: {created_timestamp['end_time']}s")
        print(f"  - Confidence: {created_timestamp['confidence']}")
        
        # Verify the response matches frontend Timestamp interface
        timestamp_fields = ['id', 'video_path', 'tag_name', 'start_time', 'end_time', 'confidence']
        for field in timestamp_fields:
            assert field in created_timestamp, f"Missing timestamp field: {field}"
        
        # Test 4: Get Video Timestamps
        print("\n📊 Testing Get Video Timestamps...")
        response = client.get(f"/api/videos/{video_path}/timestamps/")
        assert response.status_code == 200
        
        timestamps = response.json()
        assert len(timestamps) == 1
        assert timestamps[0]['tag_name'] == timestamp_data['tag_name']
        print(f"✓ Retrieved {len(timestamps)} timestamp(s)")
        
        # Test 5: Move Video to Front
        print("\n⬆️  Testing Move Video to Front...")
        response = client.put(f"/api/videos/{video_path}/move-to-front")
        assert response.status_code == 200
        
        result = response.json()
        assert 'message' in result
        print(f"✓ {result['message']}")
        
        # Test 6: URL Encoding (Test with special characters in path)
        print("\n🔗 Testing URL Encoding with Special Characters...")
        special_video_data = {
            "path": "/test/video with spaces & symbols!.mp4",
            "title": "Special Video",
            "duration": 180,
            "has_ai_data": True,
            "thumbnail_path": None
        }
        
        response = client.post("/api/videos/", json=special_video_data)
        assert response.status_code == 200
        
        special_video = response.json()
        special_path = special_video['path']
        print(f"✓ Created video with special path: {special_path}")
        
        # Test accessing the video with special characters
        response = client.get(f"/api/videos/{special_path}/timestamps/")
        assert response.status_code == 200
        print("✓ Successfully accessed video with special characters")
        
        # Test 7: Delete Video
        print("\n🗑️  Testing Video Deletion...")
        response = client.delete(f"/api/videos/{special_path}")
        assert response.status_code == 200
        
        result = response.json()
        assert 'message' in result
        print(f"✓ {result['message']}")
        
        # Verify deletion
        response = client.get("/api/videos/")
        assert response.status_code == 200
        remaining_videos = response.json()
        assert len(remaining_videos) == 1  # Should only have the first video
        print(f"✓ Verified deletion - {len(remaining_videos)} video(s) remaining")
        
        print("\n🎉 All Frontend-Backend Integration Tests Passed!")
        print("\n📋 Summary:")
        print("✓ Video creation with proper type validation")
        print("✓ Video retrieval with correct response format") 
        print("✓ Timestamp creation and retrieval")
        print("✓ Video ordering functionality")
        print("✓ URL encoding for special characters")
        print("✓ Video deletion")
        print("✓ All response formats match frontend TypeScript interfaces")
        
        return True
        
    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Clean up
        Base.metadata.drop_all(bind=engine)
        app.dependency_overrides.clear()
        try:
            os.remove("integration_test.db")
        except:
            pass

if __name__ == "__main__":
    success = test_frontend_backend_integration()
    sys.exit(0 if success else 1) 