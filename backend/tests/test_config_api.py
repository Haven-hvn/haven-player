import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_GATEWAY_DIR = tempfile.mkdtemp(prefix="haven-gateway-test-")
os.environ["HAVEN_PLAYER_CONFIG_DIR"] = TEST_GATEWAY_DIR
GATEWAY_CONFIG_PATH = Path(TEST_GATEWAY_DIR) / "ipfs-gateway.json"

from app.main import app
from app.models.base import Base
from app.models.database import get_db
from app.models.config import AppConfig

# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_config.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def client():
    # Create tables
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    # Drop tables after test
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Provide a database session for tests that need direct DB access"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(autouse=True)
def reset_gateway_config_dir():
    """Ensure gateway config directory is clean for each test."""
    os.makedirs(TEST_GATEWAY_DIR, exist_ok=True)
    if GATEWAY_CONFIG_PATH.exists():
        GATEWAY_CONFIG_PATH.unlink()
    yield
    if GATEWAY_CONFIG_PATH.exists():
        GATEWAY_CONFIG_PATH.unlink()
    os.makedirs(TEST_GATEWAY_DIR, exist_ok=True)

class TestConfigAPI:
    """Test suite for Configuration API endpoints"""

    def test_get_config_creates_default(self, client: TestClient):
        """Test that GET /config/ creates default config if none exists"""
        response = client.get("/api/config/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == 1
        assert "person,car,bicycle" in data["analysis_tags"]
        assert data["llm_base_url"] == "http://localhost:1234"
        assert data["llm_model"] == "HuggingFaceTB/SmolVLM-Instruct"
        assert data["max_batch_size"] == 1
        assert "updated_at" in data
        
        # Verify the datetime is properly formatted
        updated_at = datetime.fromisoformat(data["updated_at"].replace('Z', '+00:00'))
        assert isinstance(updated_at, datetime)

    def test_get_config_returns_existing(self, client: TestClient, db_session):
        """Test that GET /config/ returns existing config"""
        # Create a config directly in database
        config = AppConfig(
            analysis_tags="custom,tags,test",
            llm_base_url="http://custom:5000",
            llm_model="custom-model",
            max_batch_size=5,
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(config)
        db_session.commit()
        
        response = client.get("/api/config/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["analysis_tags"] == "custom,tags,test"
        assert data["llm_base_url"] == "http://custom:5000"
        assert data["llm_model"] == "custom-model"
        assert data["max_batch_size"] == 5

    def test_update_config_success(self, client: TestClient):
        """Test successful configuration update"""
        update_data = {
            "analysis_tags": "person,vehicle,animal",
            "llm_base_url": "http://localhost:8080",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 3
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["analysis_tags"] == "person,vehicle,animal"
        assert data["llm_base_url"] == "http://localhost:8080"
        assert data["llm_model"] == "HuggingFaceTB/SmolVLM-Instruct"
        assert data["max_batch_size"] == 3
        
        # Verify updated_at was set
        updated_at = datetime.fromisoformat(data["updated_at"].replace('Z', '+00:00'))
        assert isinstance(updated_at, datetime)

    def test_update_config_normalizes_tags(self, client: TestClient):
        """Test that tags are properly normalized (whitespace removed)"""
        update_data = {
            "analysis_tags": " person , vehicle,  animal , ",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["analysis_tags"] == "person,vehicle,animal"

    def test_update_config_normalizes_url(self, client: TestClient):
        """Test that URL is properly normalized (whitespace removed)"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "  http://localhost:1234  ",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["llm_base_url"] == "http://localhost:1234"

    def test_update_config_normalizes_model(self, client: TestClient):
        """Test that model name is properly normalized (whitespace removed)"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "  HuggingFaceTB/SmolVLM-Instruct  ",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["llm_model"] == "HuggingFaceTB/SmolVLM-Instruct"

    def test_update_config_validation_empty_tags(self, client: TestClient):
        """Test validation error for empty analysis tags"""
        update_data = {
            "analysis_tags": "",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "At least one analysis tag is required" in response.text

    def test_update_config_validation_whitespace_only_tags(self, client: TestClient):
        """Test validation error for whitespace-only analysis tags"""
        update_data = {
            "analysis_tags": "   ,  ,   ",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "At least one analysis tag is required" in response.text

    def test_update_config_validation_empty_url(self, client: TestClient):
        """Test validation error for empty LLM base URL"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "LLM base URL cannot be empty" in response.text

    def test_update_config_validation_whitespace_only_url(self, client: TestClient):
        """Test validation error for whitespace-only LLM base URL"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "   ",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "LLM base URL cannot be empty" in response.text

    def test_update_config_validation_empty_model(self, client: TestClient):
        """Test validation error for empty LLM model"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "LLM model cannot be empty" in response.text

    def test_update_config_validation_whitespace_only_model(self, client: TestClient):
        """Test validation error for whitespace-only LLM model"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "   ",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "LLM model cannot be empty" in response.text

    def test_update_config_validation_batch_size_too_small(self, client: TestClient):
        """Test validation error for batch size too small"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 0
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "Max batch size must be between 1 and 10" in response.text

    def test_update_config_validation_batch_size_too_large(self, client: TestClient):
        """Test validation error for batch size too large"""
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 11
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422
        assert "Max batch size must be between 1 and 10" in response.text

    def test_update_config_validation_batch_size_boundaries(self, client: TestClient):
        """Test that batch size boundary values (1 and 10) are accepted"""
        # Test min boundary
        update_data = {
            "analysis_tags": "person",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        assert response.json()["max_batch_size"] == 1
        
        # Test max boundary
        update_data["max_batch_size"] = 10
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        assert response.json()["max_batch_size"] == 10

    def test_update_config_invalid_json(self, client: TestClient):
        """Test error handling for invalid JSON"""
        response = client.put(
            "/api/config/",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422

    def test_update_config_missing_fields(self, client: TestClient):
        """Test validation error for missing required fields"""
        update_data = {
            "analysis_tags": "person"
            # Missing other required fields
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 422

    def test_get_available_models(self, client: TestClient):
        """Test GET /config/available-models/ endpoint"""
        response = client.get("/api/config/available-models/")
        assert response.status_code == 200
        
        data = response.json()
        assert "models" in data
        assert isinstance(data["models"], list)
        assert "HuggingFaceTB/SmolVLM-Instruct" in data["models"]
        assert len(data["models"]) > 0

    def test_config_persistence(self, client: TestClient):
        """Test that configuration changes are persisted"""
        # Create initial config
        update_data = {
            "analysis_tags": "test,persistence",
            "llm_base_url": "http://test:9999",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 7
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        # Verify it persists by retrieving it again
        response = client.get("/api/config/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["analysis_tags"] == "test,persistence"
        assert data["llm_base_url"] == "http://test:9999"
        assert data["max_batch_size"] == 7

    def test_config_update_timestamp(self, client: TestClient, db_session):
        """Test that updated_at timestamp is properly updated"""
        # Create initial config
        initial_time = datetime.now(timezone.utc)
        config = AppConfig(updated_at=initial_time)
        db_session.add(config)
        db_session.commit()
        config_id = config.id
        
        # Update config after a small delay
        import time
        time.sleep(0.1)  # Ensure timestamp difference
        
        update_data = {
            "analysis_tags": "updated,tags",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = client.put("/api/config/", json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        updated_time = datetime.fromisoformat(data["updated_at"].replace('Z', '+00:00'))
        
        # Verify the timestamp was actually updated
        assert updated_time > initial_time 

    def test_gateway_config_defaults(self, client: TestClient):
        """Gateway config should return default when no file exists."""
        if GATEWAY_CONFIG_PATH.exists():
            GATEWAY_CONFIG_PATH.unlink()

        response = client.get("/api/config/gateway")
        assert response.status_code == 200
        data = response.json()
        assert data["base_url"].endswith("/ipfs/")

    def test_gateway_config_update_and_persist(self, client: TestClient):
        """Gateway config should normalize and persist custom base URLs."""
        response = client.put(
            "/api/config/gateway",
            json={"base_url": "https://custom.gateway"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["base_url"] == "https://custom.gateway/ipfs/"

        # Verify persisted value
        follow_up = client.get("/api/config/gateway")
        assert follow_up.status_code == 200
        assert follow_up.json()["base_url"] == "https://custom.gateway/ipfs/"
        assert GATEWAY_CONFIG_PATH.exists()
        stored = json.loads(GATEWAY_CONFIG_PATH.read_text())
        assert stored["base_url"] == "https://custom.gateway/ipfs/"

    def test_gateway_config_validation(self, client: TestClient):
        """Gateway config should validate scheme."""
        response = client.put(
            "/api/config/gateway",
            json={"base_url": "ftp://invalid-gateway"},
        )
        assert response.status_code == 422