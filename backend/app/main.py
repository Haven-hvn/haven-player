"""
FastAPI application with shared stream management.
"""

# CRITICAL: Disable CUDA/NVDEC before any imports that load FFmpeg
# This prevents NVDEC errors when FFmpeg initializes
import os
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['NVIDIA_VISIBLE_DEVICES'] = ''
os.environ['DISABLE_HWACCEL'] = '1'

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import videos, config, jobs, pumpfun_streams, live_sessions, recording
from app.models.base import init_db
from app.models.database import SessionLocal
from app.models.config import AppConfig
from app.services.webrtc_recording_service import WebRTCRecordingService

app = FastAPI(
    title="Haven Player API",
    description="API for Haven Player with FFmpeg-based recording",
    version="2.0.0"
)

# Reference to recording service for shutdown cleanup
recording_service: WebRTCRecordingService = recording.recording_service

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure database tables exist on startup
@app.on_event("startup")
async def on_startup() -> None:
    # Initialize database tables
    init_db()
    
    # Create default configuration if none exists
    db = SessionLocal()
    try:
        config = db.query(AppConfig).first()
        if not config:
            print("Creating default AppConfig...")
            config = AppConfig()
            db.add(config)
            db.commit()
            db.refresh(config)
            print(f"✅ Created default config with ID: {config.id}")
        else:
            print(f"✅ AppConfig already exists with ID: {config.id}")
    except Exception as e:
        print(f"❌ Error initializing config: {e}")
    finally:
        db.close()

# Graceful shutdown handler
@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully stop all recordings on shutdown to ensure videos are saved."""
    print("🛑 Shutting down - stopping all active recordings...")
    try:
        # Get all active recordings
        result = await recording_service.get_all_recordings()
        if result.get("success") and result.get("recordings"):
            print(f"📹 Found {len(result['recordings'])} active recordings to stop")
            
            # Stop each recording
            for mint_id in list(result['recordings'].keys()):
                print(f"  Stopping recording for {mint_id}...")
                stop_result = await recording_service.stop_recording(mint_id)
                if stop_result.get("success"):
                    print(f"  ✅ Successfully stopped recording for {mint_id}")
                else:
                    print(f"  ⚠️  Failed to stop recording for {mint_id}: {stop_result.get('error')}")
        else:
            print("📹 No active recordings to stop")
    except Exception as e:
        print(f"❌ Error during shutdown cleanup: {e}")
    
    print("✅ Shutdown cleanup complete")

# Include routers
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(pumpfun_streams.router, prefix="/api/live", tags=["live"])
app.include_router(live_sessions.router, prefix="/api/live-sessions", tags=["live-sessions"])
app.include_router(recording.router, prefix="/api/recording", tags=["recording"])


@app.get("/")
async def root():
    return {
        "message": "Haven Player API with Shared Stream Management",
        "version": "2.0.0",
        "features": [
            "Shared WebRTC connection management",
            "Live streaming with WebSocket",
            "FFmpeg-based recording with direct disk writes",
            "Pump.fun integration"
        ]
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}