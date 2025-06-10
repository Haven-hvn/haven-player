from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import videos, config, jobs
from app.models.base import init_db

app = FastAPI(title="Haven Player API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(videos.router, prefix="/api", tags=["videos"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(jobs.router, prefix="/api", tags=["jobs"])

@app.on_event("startup")
async def startup_event():
    init_db()

@app.get("/")
async def root():
    return {"message": "Haven Player API is running"}
