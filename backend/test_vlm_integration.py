#!/usr/bin/env python3
"""
Test script to verify VLM engine integration
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models.database import SessionLocal, engine
from app.models.base import Base
from app.models.config import AppConfig
from app.services.vlm_config import get_vlm_config, create_engine_config

def test_database_connection():
    """Test database connection and tables"""
    print("Testing database connection...")
    try:
        # Create tables
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
        
        # Test session
        db = SessionLocal()
        config = db.query(AppConfig).first()
        if config:
            print(f"✅ Found config: LLM Model: {config.llm_model}, Base URL: {config.llm_base_url}")
        else:
            print("⚠️  No configuration found in database")
        db.close()
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        return False
    return True

def test_vlm_config():
    """Test VLM configuration loading"""
    print("\nTesting VLM configuration...")
    try:
        config_dict = get_vlm_config()
        print("✅ VLM config dictionary created")
        print(f"   - Active models: {config_dict['active_ai_models']}")
        print(f"   - Tag list: {config_dict['models']['vlm_nsfw_model']['tag_list'][:3]}...")
        
        engine_config = create_engine_config()
        print("✅ VLM EngineConfig object created")
        
    except Exception as e:
        print(f"❌ VLM config error: {e}")
        return False
    return True

async def test_vlm_engine():
    """Test VLM engine initialization"""
    print("\nTesting VLM engine initialization...")
    try:
        from vlm_engine import VLMEngine
        config = create_engine_config()
        engine = VLMEngine(config=config)
        await engine.initialize()
        print("✅ VLM engine initialized successfully")
        
    except ImportError:
        print("⚠️  VLM engine not installed. Run: pip install vlm-engine")
        return False
    except Exception as e:
        print(f"❌ VLM engine error: {e}")
        return False
    return True

async def main():
    print("=== VLM Integration Test ===\n")
    
    # Run tests
    db_ok = test_database_connection()
    config_ok = test_vlm_config() if db_ok else False
    engine_ok = await test_vlm_engine() if config_ok else False
    
    print("\n=== Test Summary ===")
    print(f"Database: {'✅ PASS' if db_ok else '❌ FAIL'}")
    print(f"Config: {'✅ PASS' if config_ok else '❌ FAIL'}")
    print(f"Engine: {'✅ PASS' if engine_ok else '❌ FAIL'}")
    
    if all([db_ok, config_ok, engine_ok]):
        print("\n✅ All tests passed! VLM integration is ready.")
    else:
        print("\n❌ Some tests failed. Please check the errors above.")

if __name__ == "__main__":
    asyncio.run(main())
