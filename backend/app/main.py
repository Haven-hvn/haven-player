"""
FastAPI application with shared stream management.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import videos, config, jobs, pumpfun_streams, live_sessions, recording
from app.models.base import init_db
from app.models.database import SessionLocal
from app.models.config import AppConfig

app = FastAPI(
    title="Haven Player API",
    description="API for Haven Player with shared stream management",
    version="2.0.0"
)

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
            "Native LiveKit recording with PyAV",
            "Pump.fun integration"
        ]
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}