#!/usr/bin/env python3
"""
Simple test script to verify the configuration API fix
"""

import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"

def test_config_api():
    """Test the configuration API endpoints"""
    print("🧪 Testing Configuration API Fix...")
    
    try:
        # Test GET config endpoint
        print("\n1. Testing GET /api/config/")
        response = requests.get(f"{BASE_URL}/api/config/")
        
        if response.status_code == 200:
            config_data = response.json()
            print(f"✅ GET Config Success: {config_data}")
        else:
            print(f"❌ GET Config Failed: {response.status_code} - {response.text}")
            return False
        
        # Test PUT config endpoint
        print("\n2. Testing PUT /api/config/")
        update_data = {
            "analysis_tags": "person,vehicle,animal,test",
            "llm_base_url": "http://localhost:8080",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct", 
            "max_batch_size": 3
        }
        
        response = requests.put(
            f"{BASE_URL}/api/config/",
            json=update_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            updated_config = response.json()
            print(f"✅ PUT Config Success: {updated_config}")
            
            # Verify the values were updated
            assert updated_config["analysis_tags"] == "person,vehicle,animal,test"
            assert updated_config["llm_base_url"] == "http://localhost:8080"
            assert updated_config["max_batch_size"] == 3
            print("✅ All values correctly updated")
            
        else:
            print(f"❌ PUT Config Failed: {response.status_code} - {response.text}")
            return False
        
        # Test GET available models endpoint
        print("\n3. Testing GET /api/config/available-models/")
        response = requests.get(f"{BASE_URL}/api/config/available-models/")
        
        if response.status_code == 200:
            models_data = response.json()
            print(f"✅ GET Available Models Success: {models_data}")
        else:
            print(f"❌ GET Available Models Failed: {response.status_code} - {response.text}")
            return False
        
        # Test validation errors
        print("\n4. Testing validation errors")
        invalid_data = {
            "analysis_tags": "",  # Invalid: empty tags
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = requests.put(
            f"{BASE_URL}/api/config/",
            json=invalid_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 422:
            print("✅ Validation error correctly returned for empty tags")
        else:
            print(f"❌ Expected validation error, got: {response.status_code}")
            return False
        
        print("\n🎉 All Configuration API tests passed!")
        return True
        
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend server. Make sure it's running on http://localhost:8000")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_simple_functionality():
    """Test basic functionality that was failing before"""
    print("\n🔧 Testing the original save functionality...")
    
    try:
        # This mimics what the frontend was doing
        config_update = {
            "analysis_tags": "person,car,bicycle,motorcycle,airplane,bus,train,truck,boat,traffic_light,stop_sign,walking,running,standing,sitting,talking,eating,drinking,phone,laptop,book,bag,umbrella,skateboard,surfboard,tennis_racket",
            "llm_base_url": "http://localhost:1234",
            "llm_model": "HuggingFaceTB/SmolVLM-Instruct",
            "max_batch_size": 1
        }
        
        response = requests.put(
            f"{BASE_URL}/api/config/",
            json=config_update,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            print("✅ Original save functionality now works!")
            data = response.json()
            print(f"   - Response is valid JSON")
            print(f"   - Updated at: {data.get('updated_at')}")
            return True
        else:
            print(f"❌ Save still failing: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error (the original issue): {e}")
        print(f"   Response text: {response.text[:200]}...")
        return False
    except Exception as e:
        print(f"❌ Other error: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting Configuration API Tests...")
    print("   Make sure the backend server is running!")
    
    # Wait a moment for server to be ready
    time.sleep(2)
    
    success1 = test_simple_functionality()
    success2 = test_config_api()
    
    if success1 and success2:
        print("\n🎊 All tests passed! The configuration API is working correctly.")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed. Check the output above.")
        sys.exit(1) 