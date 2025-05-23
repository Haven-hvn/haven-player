#!/usr/bin/env python3
"""
Test runner script for Haven Player Backend
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test all imports work correctly"""
    try:
        print("🔍 Testing imports...")
        
        # Test SQLAlchemy models
        from app.models.base import Base, init_db
        print("✓ Base model imports")
        
        from app.models.database import engine, get_db, SessionLocal
        print("✓ Database imports")
        
        from app.models.video import Video, Timestamp
        print("✓ Video model imports")
        
        # Test FastAPI app
        from app.main import app
        print("✓ FastAPI app imports")
        
        print("✅ All imports successful!")
        return True
        
    except Exception as e:
        print(f"❌ Import error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_database():
    """Test database operations"""
    try:
        print("\n🔍 Testing database...")
        
        from app.models.base import Base, init_db
        from app.models.database import engine, SessionLocal
        from app.models.video import Video
        
        # Create tables
        print("Creating test database...")
        Base.metadata.create_all(bind=engine)
        
        # Test database session
        db = SessionLocal()
        
        # Test creating a video
        test_video = Video(
            path="/test/video.mp4",
            title="Test Video",
            duration=120,
            has_ai_data=False,
            thumbnail_path="/test/thumb.jpg",
            position=0
        )
        
        db.add(test_video)
        db.commit()
        db.refresh(test_video)
        
        print(f"✓ Created video: {test_video.title}")
        
        # Clean up
        db.delete(test_video)
        db.commit()
        db.close()
        
        print("✅ Database operations successful!")
        return True
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_api():
    """Test API endpoints"""
    try:
        print("\n🔍 Testing API...")
        
        from fastapi.testclient import TestClient
        from app.main import app
        
        client = TestClient(app)
        
        # Test root endpoint
        response = client.get("/")
        assert response.status_code == 200
        print("✓ Root endpoint works")
        
        # Test video creation
        video_data = {
            "path": "/test/api_video.mp4",
            "title": "API Test Video",
            "duration": 60,
            "has_ai_data": False,
            "thumbnail_path": "/test/api_thumb.jpg"
        }
        
        response = client.post("/api/videos/", json=video_data)
        assert response.status_code == 200
        print("✓ Video creation works")
        
        # Test getting videos
        response = client.get("/api/videos/")
        assert response.status_code == 200
        videos = response.json()
        assert len(videos) >= 1
        print(f"✓ Video retrieval works ({len(videos)} videos)")
        
        print("✅ API tests successful!")
        return True
        
    except Exception as e:
        print(f"❌ API error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("🚀 Haven Player Backend Test Runner")
    print("=" * 40)
    
    success = True
    
    success &= test_imports()
    success &= test_database()
    success &= test_api()
    
    if success:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print("\n💥 Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 