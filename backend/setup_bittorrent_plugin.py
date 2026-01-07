#!/usr/bin/env python3
"""
Setup script for BitTorrent Plugin.

This script helps users set up the BitTorrent plugin by:
1. Checking for necessary dependencies (libtorrent, requests)
2. Enabling the BitTorrent plugin in the database
3. Creating the download directory
4. Providing usage instructions
"""

import subprocess
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.database import SessionLocal
from app.models.plugin import Plugin as PluginModel


def check_dependency(name: str, install_command: list):
    """Check if a dependency is installed and offer to install it."""
    print(f"🔎 Checking for {name}...")
    try:
        # For Python packages, try importing
        if name in ["libtorrent", "requests"]:
            __import__(name)
            print(f"✅ {name} found")
            return True
        else:
            # For system commands, check if executable
            result = subprocess.run(
                install_command + ["--version"], # Assuming --version is common for many tools
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0] # Get first line of version
                print(f"✅ {name} found (version: {version})")
                return True
            else:
                print(f"❌ {name} not found")
                return False
    except ImportError:
        print(f"❌ {name} not found (Python package)")
        return False
    except FileNotFoundError:
        print(f"❌ {name} not found (executable)")
        return False
    except subprocess.TimeoutExpired:
        print(f"❌ {name} command timed out")
        return False
    except Exception as e:
        print(f"❌ Error checking {name}: {e}")
        return False


def install_dependency(name: str, install_command: list):
    """Install a dependency."""
    print(f"📦 Installing {name}...")
    try:
        subprocess.run(
            install_command,
            check=True,
            timeout=300
        )
        print(f"✅ {name} installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install {name}: {e}")
        return False
    except subprocess.TimeoutExpired:
        print(f"❌ Installation of {name} timed out")
        return False
    except Exception as e:
        print(f"❌ Error installing {name}: {e}")
        return False


def enable_bittorrent_plugin():
    """Enable the BitTorrent plugin in the database."""
    print("🔌 Enabling BitTorrent plugin...")
    
    db = SessionLocal()
    try:
        existing_plugin = db.query(PluginModel).filter(
            PluginModel.name == "BitTorrentPlugin"
        ).first()
        
        if existing_plugin:
            existing_plugin.enabled = True
            existing_plugin.version = "1.0.0"
            db.commit()
            print("✅ BitTorrent plugin enabled in database")
        else:
            plugin = PluginModel(
                name="BitTorrentPlugin",
                enabled=True,
                version="1.0.0",
                config={
                    "download_dir": "downloads/bittorrent",
                    "max_concurrent_downloads": 3,
                },
                priority=0
            )
            db.add(plugin)
            db.commit()
            print("✅ BitTorrent plugin added to database")
        
        return True
    
    except Exception as e:
        print(f"❌ Error enabling BitTorrent plugin: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def create_download_directory():
    """Create the download directory for BitTorrent files."""
    download_dir = "downloads/bittorrent"
    print(f"📁 Creating download directory: {download_dir}")
    
    try:
        os.makedirs(download_dir, exist_ok=True)
        print(f"✅ Download directory created: {os.path.abspath(download_dir)}")
        return True
    except Exception as e:
        print(f"❌ Error creating download directory: {e}")
        return False


def print_usage_instructions():
    """Print usage instructions for the BitTorrent plugin."""
    print("\n" + "="*60)
    print("📖 BitTorrent Plugin Usage Instructions")
    print("="*60)
    
    print("\n1. Start the Haven Player backend:")
    print("   cd backend")
    print("   uvicorn app.main:app --reload")
    
    print("\n2. Subscribe to a BitTorrent search term:")
    print('   curl -X POST http://localhost:8000/api/bittorrent/subscriptions \')
    print('     -H "Content-Type: application/json" \')
    print('     -d '{'search_term': 'ubuntu iso', 'auto_archive': true}''')
    
    print("\n3. List BitTorrent subscriptions:")
    print("   curl http://localhost:8000/api/bittorrent/subscriptions")
    
    print("\n4. Poll for new torrents based on subscriptions:")
    print("   curl -X POST http://localhost:8000/api/bittorrent/poll")
    
    print("\n5. Download a specific torrent:")
    print('   curl -X POST http://localhost:8000/api/bittorrent/torrents/{infohash}/download')
    
    print("\n6. List all torrents:")
    print("   curl http://localhost:8000/api/bittorrent/torrents")
    
    print("\n7. View API documentation:")
    print("   Open http://localhost:8000/docs in your browser")
    
    print("\n" + "="*60)
    print("🔗 API Endpoints")
    print("="*60)
    print("""
    GET    /api/bittorrent/subscriptions              - List subscriptions
    POST   /api/bittorrent/subscriptions              - Create subscription
    GET    /api/bittorrent/subscriptions/{subscription_id} - Get subscription info
    PUT    /api/bittorrent/subscriptions/{subscription_id} - Update subscription
    DELETE /api/bittorrent/subscriptions/{subscription_id} - Delete subscription
    
    GET    /api/bittorrent/torrents                   - List all torrents
    GET    /api/bittorrent/torrents/{infohash}        - Get torrent info
    POST   /api/bittorrent/torrents/download          - Download torrent by magnet URI
    POST   /api/bittorrent/torrents/{infohash}/download - Download torrent by infohash
    
    POST   /api/bittorrent/poll                       - Poll for new torrents
    """)
    
    print("="*60)
    print("📅 Setting Up Recurring Jobs")
    print("="*60)
    print("""
    To automatically poll for new torrents, create a recurring job:
    
    curl -X POST http://localhost:8000/api/jobs/recurring \
      -H "Content-Type: application/json" \
      -d '{
        "plugin_name": "BitTorrentPlugin",
        "job_name": "poll_bittorrent_subscriptions",
        "schedule": "0 * * * *",
        "method": "discover_sources",
        "on_success": "archive_all"
      }'
    
    This will poll all subscriptions every hour and automatically download new torrents.
    """)


def main():
    """Main setup function."""
    print("\n" + "="*60)
    print("🎬 Haven Player - BitTorrent Plugin Setup")
    print("="*60 + "\n")
    
    # Step 1: Check/install dependencies
    dependencies = {
        "libtorrent": [sys.executable, "-m", "pip", "install", "libtorrent==2.0.10"],
        "requests": [sys.executable, "-m", "pip", "install", "requests==2.32.3"],
    }

    for dep_name, install_cmd in dependencies.items():
        if not check_dependency(dep_name, install_cmd):
            print(f"\n⚠️  {dep_name} is required but not found.")
            response = input(f"Would you like to install {dep_name}? (y/n): ")
            if response.lower() == 'y':
                if not install_dependency(dep_name, install_cmd):
                    print(f"❌ Cannot proceed without {dep_name}. Exiting.")
                    sys.exit(1)
            else:
                print(f"❌ Cannot proceed without {dep_name}. Exiting.")
                sys.exit(1)
    
    # Step 2: Enable plugin in database
    if not enable_bittorrent_plugin():
        print("❌ Failed to enable BitTorrent plugin. Exiting.")
        sys.exit(1)
    
    # Step 3: Create download directory
    if not create_download_directory():
        print("⚠️  Warning: Could not create download directory")
        print("   You may need to create it manually: downloads/bittorrent")
    
    # Step 4: Print usage instructions
    print_usage_instructions()
    
    print("\n✅ BitTorrent plugin setup complete!")
    print("\nNext steps:")
    print("1. Start the Haven Player backend")
    print("2. Subscribe to BitTorrent search terms using the API")
    print("3. Set up recurring jobs for automatic polling")
    print()


if __name__ == "__main__":
    main()