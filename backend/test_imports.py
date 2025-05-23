#!/usr/bin/env python3

try:
    print("Testing imports...")
    
    # Test basic imports
    from app.models.base import Base, init_db
    print("✓ Base imports working")
    
    # Test database imports
    from app.models.database import engine, get_db
    print("✓ Database imports working")
    
    # Test video model imports
    from app.models.video import Video, Timestamp
    print("✓ Video model imports working")
    
    # Test API imports
    from app.api import videos
    print("✓ API imports working")
    
    # Test main app import
    from app.main import app
    print("✓ Main app imports working")
    
    print("✅ All imports successful!")
    
except Exception as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc() 