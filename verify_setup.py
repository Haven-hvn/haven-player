#!/usr/bin/env python3
"""
Verification script to check if Haven Player is properly set up
Checks both frontend and backend configurations
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def check_file_exists(file_path: str, description: str) -> bool:
    """Check if a file exists and report the result."""
    if os.path.exists(file_path):
        print(f"✅ {description}: {file_path}")
        return True
    else:
        print(f"❌ {description}: {file_path} (MISSING)")
        return False

def check_backend() -> bool:
    """Verify backend setup."""
    print("\n🔧 Checking Backend Setup...")
    success = True
    
    # Check backend files
    backend_files = [
        ("backend/app/main.py", "FastAPI main application"),
        ("backend/app/models/video.py", "Video database models"),
        ("backend/app/api/videos.py", "Video API endpoints"),
        ("backend/requirements.txt", "Python dependencies"),
        ("backend/tests/test_videos_api.py", "Unit tests"),
    ]
    
    for file_path, description in backend_files:
        success &= check_file_exists(file_path, description)
    
    # Check if we can import the backend
    try:
        sys.path.insert(0, 'backend')
        from app.main import app
        from app.models.video import Video, Timestamp
        print("✅ Backend imports work correctly")
    except Exception as e:
        print(f"❌ Backend import error: {e}")
        success = False
    
    return success

def check_frontend() -> bool:
    """Verify frontend setup."""
    print("\n⚛️  Checking Frontend Setup...")
    success = True
    
    # Check frontend files
    frontend_files = [
        ("frontend/package.json", "Node.js dependencies"),
        ("frontend/src/App.tsx", "Main React application"),
        ("frontend/src/services/api.ts", "API service layer"),
        ("frontend/src/types/video.ts", "TypeScript type definitions"),
        ("frontend/src/hooks/useVideos.ts", "Video management hook"),
    ]
    
    for file_path, description in frontend_files:
        success &= check_file_exists(file_path, description)
    
    # Check package.json for required dependencies
    try:
        with open("frontend/package.json", "r") as f:
            package_data = json.load(f)
        
        required_deps = ["react", "axios", "@mui/material", "electron"]
        missing_deps = []
        
        dependencies = {**package_data.get("dependencies", {}), **package_data.get("devDependencies", {})}
        
        for dep in required_deps:
            if dep not in dependencies:
                missing_deps.append(dep)
        
        if missing_deps:
            print(f"❌ Missing dependencies: {', '.join(missing_deps)}")
            success = False
        else:
            print("✅ All required dependencies present")
            
    except Exception as e:
        print(f"❌ Error reading package.json: {e}")
        success = False
    
    return success

def check_integration() -> bool:
    """Verify integration between frontend and backend."""
    print("\n🔗 Checking Frontend-Backend Integration...")
    
    # Read frontend API configuration
    try:
        with open("frontend/src/services/api.ts", "r") as f:
            api_content = f.read()
        
        if "http://localhost:8000/api" in api_content:
            print("✅ Frontend configured to connect to backend on localhost:8000")
        else:
            print("❌ Frontend API base URL not configured correctly")
            return False
            
    except Exception as e:
        print(f"❌ Error reading API configuration: {e}")
        return False
    
    # Check if type definitions match
    try:
        with open("frontend/src/types/video.ts", "r") as f:
            types_content = f.read()
        
        required_interfaces = ["Video", "VideoCreate", "Timestamp", "TimestampCreate"]
        missing_interfaces = []
        
        for interface in required_interfaces:
            if f"interface {interface}" not in types_content:
                missing_interfaces.append(interface)
        
        if missing_interfaces:
            print(f"❌ Missing TypeScript interfaces: {', '.join(missing_interfaces)}")
            return False
        else:
            print("✅ All required TypeScript interfaces present")
            
    except Exception as e:
        print(f"❌ Error reading TypeScript types: {e}")
        return False
    
    return True

def main():
    """Run all verification checks."""
    print("🚀 Haven Player Setup Verification")
    print("=" * 50)
    
    backend_ok = check_backend()
    frontend_ok = check_frontend()
    integration_ok = check_integration()
    
    all_ok = backend_ok and frontend_ok and integration_ok
    
    print("\n" + "=" * 50)
    print("📋 VERIFICATION SUMMARY")
    print(f"Backend Setup: {'✅ PASS' if backend_ok else '❌ FAIL'}")
    print(f"Frontend Setup: {'✅ PASS' if frontend_ok else '❌ FAIL'}")
    print(f"Integration: {'✅ PASS' if integration_ok else '❌ FAIL'}")
    
    if all_ok:
        print("\n🎉 ALL CHECKS PASSED!")
        print("\n🚀 Ready to run:")
        print("   Backend:  cd backend && python -m uvicorn app.main:app --reload")
        print("   Frontend: cd frontend && npm run dev")
        print("   Tests:    cd backend && python -m pytest")
        return 0
    else:
        print("\n💥 SOME CHECKS FAILED!")
        print("Please fix the issues above before running the application.")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 