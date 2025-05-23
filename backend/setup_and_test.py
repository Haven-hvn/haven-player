#!/usr/bin/env python3
"""
Setup and test script for Haven Player Backend
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and return success status"""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✓ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"   stdout: {e.stdout}")
        print(f"   stderr: {e.stderr}")
        return False

def main():
    """Main setup and test routine"""
    print("🚀 Haven Player Backend Setup & Test")
    print("=" * 50)
    
    # Change to backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    print(f"📁 Working directory: {backend_dir}")
    
    # Install dependencies
    if not run_command("pip install -r requirements.txt", "Installing dependencies"):
        return 1
    
    # Run our custom test runner first
    print("\n🧪 Running custom tests...")
    try:
        exec(open('run_tests.py').read())
        print("✅ Custom tests passed!")
    except Exception as e:
        print(f"❌ Custom tests failed: {e}")
        return 1
    
    # Run pytest
    if not run_command("python -m pytest -v --tb=short", "Running pytest"):
        return 1
    
    print("\n🎉 All setup and tests completed successfully!")
    return 0

if __name__ == "__main__":
    sys.exit(main()) 