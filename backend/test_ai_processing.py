#!/usr/bin/env python3
"""
Test script to verify AI analysis file processing
"""

import sys
import os
import json
import tempfile
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.models.base import Base
from app.models.database import get_db

# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_ai_processing.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def test_ai_file_processing():
    """Test that AI analysis files are correctly processed"""
    print("🧪 Testing AI Analysis File Processing")
    print("=" * 50)
    
    # Override the dependency
    app.dependency_overrides[get_db] = override_get_db
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    try:
        client = TestClient(app)
        
        # Create a temporary directory for test files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a mock video file path
            video_path = os.path.join(temp_dir, "test_video.mp4")
            ai_file_path = f"{video_path}.AI.json"
            
            # Create mock AI analysis data
            ai_data = {
                "video_metadata": {
                    "video_id": 1001,
                    "duration": 180.5,
                    "phash": "abc123def456",
                    "models": {
                        "actiondetection": {
                            "version": 1.0,
                            "ai_model_config": {
                                "frame_interval": 2.0,
                                "threshold": 0.3
                            }
                        }
                    }
                },
                "tags": {
                    "ShakingHands": {
                        "ai_model_name": "actiondetection",
                        "time_frames": [
                            {"start": 10.5, "confidence": 0.91},
                            {"start": 45.2, "end": 48.7, "confidence": 0.85}
                        ]
                    },
                    "Walking": {
                        "ai_model_name": "actiondetection", 
                        "time_frames": [
                            {"start": 5.0, "end": 25.0, "confidence": 0.92},
                            {"start": 60.0, "confidence": 0.78}
                        ]
                    },
                    "Talking": {
                        "ai_model_name": "actiondetection",
                        "time_frames": [
                            {"start": 15.5, "end": 30.2, "confidence": 0.89}
                        ]
                    }
                }
            }
            
            # Write the AI analysis file
            with open(ai_file_path, 'w', encoding='utf-8') as f:
                json.dump(ai_data, f, indent=2)
            
            print(f"📁 Created AI file: {ai_file_path}")
            
            # Test video creation with AI file
            print("\n🎬 Testing Video Creation with AI File...")
            video_data = {
                "path": video_path,
                "title": "Test Video with AI",
                "duration": 180,
                "has_ai_data": False,  # Should be overridden to True
                "thumbnail_path": None
            }
            
            response = client.post("/api/videos/", json=video_data)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            created_video = response.json()
            print(f"✓ Created video: {created_video['title']}")
            print(f"  - Has AI Data: {created_video['has_ai_data']}")
            assert created_video['has_ai_data'] is True, "Video should have AI data marked as True"
            
            # Test retrieving timestamps
            print("\n📊 Testing Timestamp Retrieval...")
            response = client.get(f"/api/videos/{video_path}/timestamps/")
            assert response.status_code == 200
            
            timestamps = response.json()
            print(f"✓ Retrieved {len(timestamps)} timestamps")
            
            # Verify the timestamps match our AI data
            expected_timestamps = []
            for tag_name, tag_data in ai_data["tags"].items():
                for frame in tag_data["time_frames"]:
                    expected_timestamps.append({
                        "tag_name": tag_name,
                        "start_time": frame["start"],
                        "end_time": frame.get("end"),
                        "confidence": frame["confidence"]
                    })
            
            assert len(timestamps) == len(expected_timestamps), f"Expected {len(expected_timestamps)} timestamps, got {len(timestamps)}"
            
            # Check each timestamp
            for i, timestamp in enumerate(timestamps):
                print(f"  - {timestamp['tag_name']}: {timestamp['start_time']}s-{timestamp['end_time']}s (confidence: {timestamp['confidence']})")
            
            # Verify specific timestamps
            shaking_hands_timestamps = [t for t in timestamps if t['tag_name'] == 'ShakingHands']
            walking_timestamps = [t for t in timestamps if t['tag_name'] == 'Walking']
            talking_timestamps = [t for t in timestamps if t['tag_name'] == 'Talking']
            
            assert len(shaking_hands_timestamps) == 2, f"Expected 2 ShakingHands timestamps, got {len(shaking_hands_timestamps)}"
            assert len(walking_timestamps) == 2, f"Expected 2 Walking timestamps, got {len(walking_timestamps)}"
            assert len(talking_timestamps) == 1, f"Expected 1 Talking timestamp, got {len(talking_timestamps)}"
            
            print("\n✓ All timestamps correctly processed")
            
            # Test video without AI file
            print("\n🎬 Testing Video Creation without AI File...")
            video_path_no_ai = os.path.join(temp_dir, "video_no_ai.mp4")
            video_data_no_ai = {
                "path": video_path_no_ai,
                "title": "Video without AI",
                "duration": 120,
                "has_ai_data": False,
                "thumbnail_path": None
            }
            
            response = client.post("/api/videos/", json=video_data_no_ai)
            assert response.status_code == 200
            
            created_video_no_ai = response.json()
            print(f"✓ Created video: {created_video_no_ai['title']}")
            print(f"  - Has AI Data: {created_video_no_ai['has_ai_data']}")
            assert created_video_no_ai['has_ai_data'] is False, "Video without AI file should have has_ai_data as False"
            
            # Verify no timestamps for video without AI
            response = client.get(f"/api/videos/{video_path_no_ai}/timestamps/")
            assert response.status_code == 200
            timestamps_no_ai = response.json()
            assert len(timestamps_no_ai) == 0, f"Expected 0 timestamps for video without AI, got {len(timestamps_no_ai)}"
            
            print("✓ Video without AI file correctly processed")
            
            print("\n🎉 All AI Processing Tests Passed!")
            print("\n📋 Summary:")
            print("✓ AI analysis files are automatically detected")
            print("✓ AI data is correctly parsed and stored as timestamps")
            print("✓ Videos are marked with has_ai_data = True when AI file exists")
            print("✓ Multiple tags and time frames are processed correctly")
            print("✓ Videos without AI files work normally")
            
            return True
        
    except Exception as e:
        print(f"❌ AI processing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Clean up
        Base.metadata.drop_all(bind=engine)
        app.dependency_overrides.clear()
        try:
            os.remove("test_ai_processing.db")
        except:
            pass

if __name__ == "__main__":
    success = test_ai_file_processing()
    sys.exit(0 if success else 1) 