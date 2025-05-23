import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.models.base import Base
from app.models.database import get_db

# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def setup_database():
    # Override the dependency
    app.dependency_overrides[get_db] = override_get_db
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    yield
    
    # Clean up
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

@pytest.fixture
def client():
    """Create a test client for each test"""
    return TestClient(app)

def test_create_video(client):
    response = client.post(
        "/api/videos/",
        json={
            "path": "/test/video.mp4",
            "title": "Test Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["path"] == "/test/video.mp4"
    assert data["title"] == "Test Video"
    assert data["duration"] == 120
    assert data["has_ai_data"] is False
    assert data["thumbnail_path"] == "/test/thumbnail.jpg"
    assert "created_at" in data
    # Verify created_at is a valid datetime string in ISO format
    datetime.fromisoformat(data["created_at"].replace('Z', '+00:00'))

def test_get_videos(client):
    # Create a test video
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video.mp4",
            "title": "Test Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
    )

    response = client.get("/api/videos/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["path"] == "/test/video.mp4"

def test_create_timestamp(client):
    # Create a test video first
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video.mp4",
            "title": "Test Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
    )

    response = client.post(
        "/api/videos/%2Ftest%2Fvideo.mp4/timestamps/",
        json={
            "tag_name": "test_tag",
            "start_time": 10.0,
            "end_time": 20.0,
            "confidence": 0.95
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tag_name"] == "test_tag"
    assert data["start_time"] == 10.0
    assert data["end_time"] == 20.0
    assert data["confidence"] == 0.95

def test_get_video_timestamps(client):
    # Create a test video
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video.mp4",
            "title": "Test Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
    )

    # Create a timestamp
    client.post(
        "/api/videos/%2Ftest%2Fvideo.mp4/timestamps/",
        json={
            "tag_name": "test_tag",
            "start_time": 10.0,
            "end_time": 20.0,
            "confidence": 0.95
        }
    )

    response = client.get("/api/videos/%2Ftest%2Fvideo.mp4/timestamps/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["tag_name"] == "test_tag"

def test_delete_video(client):
    # Create a test video
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video.mp4",
            "title": "Test Video",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail.jpg"
        }
    )

    response = client.delete("/api/videos/%2Ftest%2Fvideo.mp4")
    assert response.status_code == 200
    assert response.json()["message"] == "Video deleted successfully"

    # Verify video is deleted
    response = client.get("/api/videos/")
    assert response.status_code == 200
    assert len(response.json()) == 0

def test_move_to_front(client):
    # Create two test videos
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video1.mp4",
            "title": "Test Video 1",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail1.jpg"
        }
    )
    client.post(
        "/api/videos/",
        json={
            "path": "/test/video2.mp4",
            "title": "Test Video 2",
            "duration": 120,
            "has_ai_data": False,
            "thumbnail_path": "/test/thumbnail2.jpg"
        }
    )

    response = client.put("/api/videos/%2Ftest%2Fvideo1.mp4/move-to-front")
    assert response.status_code == 200
    assert response.json()["message"] == "Video moved to front successfully"

    # Verify order
    response = client.get("/api/videos/")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["path"] == "/test/video1.mp4"
    assert data[1]["path"] == "/test/video2.mp4" 