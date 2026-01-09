"""
FastAPI application with shared stream management.
"""

# CRITICAL: Disable CUDA/NVDEC before any imports that load FFmpeg
# This prevents NVDEC errors when FFmpeg initializes
import os
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['NVIDIA_VISIBLE_DEVICES'] = ''
os.environ['DISABLE_HWACCEL'] = '1'

import logging

# Configure logging - set to INFO level to see all recording logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

from fastapi import FastAPI
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware

from app.api import videos, config, jobs, pumpfun_streams, live_sessions, recording, depin, restore, plugins, recurring_jobs, upload_queue
from app.models.base import init_db
from app.models.database import SessionLocal
from app.models.config import AppConfig
from app.models.plugin import Plugin as PluginModel
from app.services.webrtc_recording_service import WebRTCRecordingService
from app.services.job_scheduler import JobScheduler
from app.plugins.plugin_manager import PluginManager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Starting Haven Player Backend...")
    
    # Initialize database tables
    init_db()
    print("✅ Database initialized")
    
    db = SessionLocal()
    try:
        # Create default configuration if none exists
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
        db.rollback()
    finally:
        db.close()
    
    # Initialize plugin manager with control/data plane support
    global plugin_manager
    plugin_dirs = [
        str(Path(__file__).parent / "plugins" / "builtin"),
    ]
    
    print(f"🔌 Initializing plugin manager with directories: {plugin_dirs}")
    print(f"🔧 Control/Data Plane: Max workers = 4")
    
    # Initialize plugin manager with worker support for control/data plane separation
    plugin_manager = PluginManager(
        plugin_dirs=plugin_dirs,
        max_workers=4  # Maximum number of worker processes for data plane
    )
    
    # Configure worker plugins (plugins that should run in separate processes)
    # These plugins do heavy I/O operations and benefit from isolation
    worker_plugins = [
        "BitTorrentPlugin",
        "YouTubePlugin",
    ]
    plugin_manager.set_worker_plugins(worker_plugins)
    print(f"🔧 Worker mode enabled for plugins: {', '.join(worker_plugins)}")
    
    # Discover all plugins
    discovered = plugin_manager.discover_plugins()
    print(f"✅ Discovered {discovered} plugins")
    
    # Load plugins from database configuration
    enabled_plugins = db.query(PluginModel).filter(
        PluginModel.enabled == True
    ).all()
    
    loaded_count = 0
    worker_count = 0
    
    for db_plugin in enabled_plugins:
        try:
            config = db_plugin.config or {}
            success = await plugin_manager.load_plugin(db_plugin.name, config)
            
            if success:
                is_worker = plugin_manager.is_worker_plugin(db_plugin.name)
                mode = "🔧 Data Plane (Worker)" if is_worker else "🎛️  Control Plane"
                
                print(f"  ✅ Loaded plugin: {db_plugin.name} ({mode})")
                loaded_count += 1
                if is_worker:
                    worker_count += 1
            else:
                print(f"  ⚠️  Failed to load plugin: {db_plugin.name}")
        except Exception as e:
            print(f"  ❌ Error loading plugin {db_plugin.name}: {e}")
    
    db.close()
    
    # Set plugin manager in API module
    plugins.plugin_manager = plugin_manager
    
    print(f"✅ Plugin manager initialized with {loaded_count} loaded plugins ({worker_count} in data plane)")
    
    # List active workers
    workers = plugin_manager.list_workers()
    if workers:
        print(f"🔧 Active worker processes:")
        for worker in workers:
            print(f"  - {worker['plugin_name']}: PID={worker['pid']}, Alive={worker['is_alive']}")
    
    # Initialize job scheduler
    global job_scheduler
    job_scheduler = JobScheduler(plugin_manager)
    await job_scheduler.start()
    recurring_jobs.job_scheduler = job_scheduler
    
    print(f"✅ Job scheduler initialized")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down Haven Player Backend...")
    
    # Shut down job scheduler
    await job_scheduler.stop()
    print("✅ Job scheduler stopped")
    
    # Gracefully stop all recordings
    print("📹 Stopping all active recordings...")
    try:
        result = await recording_service.get_all_recordings()
        if result.get("success") and result.get("recordings"):
            print(f"  Found {len(result['recordings'])} active recordings to stop")
            
            for mint_id in list(result['recordings'].keys()):
                print(f"  Stopping recording for {mint_id}...")
                stop_result = await recording_service.stop_recording(mint_id)
                if stop_result.get("success"):
                    print(f"  ✅ Successfully stopped recording for {mint_id}")
                else:
                    print(f"  ⚠️  Failed to stop recording for {mint_id}: {stop_result.get('error')}")
        else:
            print("  📹 No active recordings to stop")
    except Exception as e:
        print(f"  ❌ Error during shutdown cleanup: {e}")
    
    # Shutdown plugin manager (includes stopping all workers)
    if plugin_manager:
        print("🔌 Shutting down plugin manager...")
        workers = plugin_manager.list_workers()
        if workers:
            print(f"  Stopping {len(workers)} worker processes...")
        
        await plugin_manager.shutdown()
        print("  ✅ Plugin manager shutdown complete (all workers stopped)")
    
    print("✅ Shutdown complete")

app = FastAPI(
    title="Haven Player API",
    description="API for Haven Player with plugin system and control/data plane separation",
    version="2.2.0",
    lifespan=lifespan
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

# Include routers
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(pumpfun_streams.router, prefix="/api/live", tags=["live"])
app.include_router(live_sessions.router, prefix="/api/live-sessions", tags=["live-sessions"])
app.include_router(recording.router, prefix="/api/recording", tags=["recording"])
app.include_router(depin.router, prefix="/api/depin", tags=["depin"])
app.include_router(restore.router, prefix="/api/restore", tags=["restore"])
app.include_router(plugins.router, prefix="/api/plugins", tags=["plugins"])
app.include_router(recurring_jobs.router, prefix="/api/recurring-jobs", tags=["recurring-jobs"])
app.include_router(upload_queue.router, prefix="/api", tags=["upload-queue"])


@app.get("/")
async def root():
    workers = plugin_manager.list_workers() if plugin_manager else []
    return {
        "message": "Haven Player API with Shared Stream Management",
        "version": "2.2.0",
        "features": [
            "Shared WebRTC connection management",
            "Live streaming with WebSocket",
            "FFmpeg-based recording with direct disk writes",
            "Pump.fun integration",
            "Control/Data Plane Plugin System with worker processes"
        ],
        "plugin_system": {
            "loaded_plugins": len(plugin_manager.get_loaded_plugins()) if plugin_manager else 0,
            "active_workers": len(workers),
            "workers": [w["plugin_name"] for w in workers] if workers else []
        }
    }


@app.get("/health")
async def health_check():
    health_status = {
        "status": "healthy",
        "version": "2.2.0",
    }
    
    if plugin_manager:
        # Check plugin health
        plugin_health = await plugin_manager.health_check_all()
        health_status["plugins"] = plugin_health
        
        # Check worker health
        worker_health = await plugin_manager.worker_manager.health_check_all_workers()
        health_status["workers"] = worker_health
    
    return health_status
