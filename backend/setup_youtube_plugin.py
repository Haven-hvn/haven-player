#!/usr/bin/env python3
"""
Setup script for YouTube Plugin.

This script helps users set up the YouTube plugin by:
1. Installing yt-dlp if not already installed
2. Enabling the YouTube plugin in the database
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


def check_yt_dlp():
    """Check if yt-dlp is installed."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            print(f"✅ yt-dlp found (version: {version})")
            return True
        else:
            print("❌ yt-dlp not found")
            return False
    except FileNotFoundError:
        print("❌ yt-dlp not found")
        return False
    except subprocess.TimeoutExpired:
        print("❌ yt-dlp command timed out")
        return False
    except Exception as e:
        print(f"❌ Error checking yt-dlp: {e}")
        return False


def install_yt_dlp():
    """Install yt-dlp using pip."""
    print("📦 Installing yt-dlp...")
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            check=True,
            timeout=300
        )
        print("✅ yt-dlp installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install yt-dlp: {e}")
        return False
    except subprocess.TimeoutExpired:
        print("❌ Installation timed out")
        return False
    except Exception as e:
        print(f"❌ Error installing yt-dlp: {e}")
        return False


def enable_youtube_plugin():
    """Enable the YouTube plugin in the database."""
    print("🔌 Enabling YouTube plugin...")
    
    db = SessionLocal()
    try:
        # Check if plugin already exists
        existing_plugin = db.query(PluginModel).filter(
            PluginModel.name == "YouTubePlugin"
        ).first()
        
        if existing_plugin:
            # Update existing plugin
            existing_plugin.enabled = True
            existing_plugin.version = "1.0.0"
            db.commit()
            print("✅ YouTube plugin enabled in database")
        else:
            # Create new plugin entry
            plugin = PluginModel(
                name="YouTubePlugin",
                enabled=True,
                version="1.0.0",
                config={
                    "download_directory": "downloads/youtube",
                    "max_concurrent_downloads": 3,
                    "max_videos_per_channel": 50,
                },
                priority=0
            )
            db.add(plugin)
            db.commit()
            print("✅ YouTube plugin added to database")
        
        return True
    
    except Exception as e:
        print(f"❌ Error enabling YouTube plugin: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def create_download_directory():
    """Create the download directory for YouTube videos."""
    download_dir = "downloads/youtube"
    print(f"📁 Creating download directory: {download_dir}")
    
    try:
        os.makedirs(download_dir, exist_ok=True)
        print(f"✅ Download directory created: {os.path.abspath(download_dir)}")
        return True
    except Exception as e:
        print(f"❌ Error creating download directory: {e}")
        return False


def print_usage_instructions():
    """Print usage instructions for the YouTube plugin."""
    print("\n" + "="*60)
    print("📖 YouTube Plugin Usage Instructions")
    print("="*60)
    
    print("\n1. Start the Haven Player backend:")
    print("   cd backend")
    print("   uvicorn app.main:app --reload")
    
    print("\n2. Subscribe to a YouTube channel:")
    print('   curl -X POST http://localhost:8000/api/youtube/channels/subscribe \\')
    print('     -H "Content-Type: application/json" \\')
    print('     -d \'{"channel_url": "https://www.youtube.com/@channelname"}\'')
    
    print("\n3. List subscribed channels:")
    print("   curl http://localhost:8000/api/youtube/channels")
    
    print("\n4. Poll channels for new videos:")
    print("   curl -X POST http://localhost:8000/api/youtube/channels/poll")
    
    print("\n5. Download a specific video:")
    print('   curl -X POST http://localhost:8000/api/youtube/videos/{video_id}/download')
    
    print("\n6. List all videos:")
    print("   curl http://localhost:8000/api/youtube/videos")
    
    print("\n7. Get plugin statistics:")
    print("   curl http://localhost:8000/api/youtube/stats")
    
    print("\n8. View API documentation:")
    print("   Open http://localhost:8000/docs in your browser")
    
    print("\n" + "="*60)
    print("🔗 API Endpoints")
    print("="*60)
    print("""
    GET    /api/youtube/channels                    - List channels
    POST   /api/youtube/channels/subscribe           - Subscribe to channel
    GET    /api/youtube/channels/{channel_id}        - Get channel info
    PUT    /api/youtube/channels/{channel_id}        - Update channel
    DELETE /api/youtube/channels/{channel_id}        - Unsubscribe
    GET    /api/youtube/channels/{channel_id}/videos - Get channel videos
    
    GET    /api/youtube/videos                       - List all videos
    GET    /api/youtube/videos/{video_id}            - Get video info
    POST   /api/youtube/videos/download              - Download video by URL
    POST   /api/youtube/videos/{video_id}/download    - Download video by ID
    
    POST   /api/youtube/channels/poll                - Poll for new videos
    GET    /api/youtube/stats                        - Get statistics
    """)
    
    print("="*60)
    print("📅 Setting Up Recurring Jobs")
    print("="*60)
    print("""
    To automatically poll channels for new videos, create a recurring job:
    
    curl -X POST http://localhost:8000/api/jobs/recurring \\
      -H "Content-Type: application/json" \\
      -d '{
        "plugin_name": "YouTubePlugin",
        "job_name": "poll_youtube_channels",
        "schedule": "0 * * * *",
        "method": "discover_sources",
        "on_success": "archive_all"
      }'
    
    This will poll all channels every hour and automatically download new videos.
    """)


def main():
    """Main setup function."""
    print("\n" + "="*60)
    print("🎬 Haven Player - YouTube Plugin Setup")
    print("="*60 + "\n")
    
    # Step 1: Check/install yt-dlp
    if not check_yt_dlp():
        print("\n⚠️  yt-dlp is required but not found.")
        response = input("Would you like to install yt-dlp? (y/n): ")
        if response.lower() == 'y':
            if not install_yt_dlp():
                print("❌ Cannot proceed without yt-dlp. Exiting.")
                sys.exit(1)
        else:
            print("❌ Cannot proceed without yt-dlp. Exiting.")
            sys.exit(1)
    
    # Step 2: Enable plugin in database
    if not enable_youtube_plugin():
        print("❌ Failed to enable YouTube plugin. Exiting.")
        sys.exit(1)
    
    # Step 3: Create download directory
    if not create_download_directory():
        print("⚠️  Warning: Could not create download directory")
        print("   You may need to create it manually: downloads/youtube")
    
    # Step 4: Print usage instructions
    print_usage_instructions()
    
    print("\n✅ YouTube plugin setup complete!")
    print("\nNext steps:")
    print("1. Start the Haven Player backend")
    print("2. Subscribe to YouTube channels using the API")
    print("3. Set up recurring jobs for automatic polling")
    print()


if __name__ == "__main__":
    main()