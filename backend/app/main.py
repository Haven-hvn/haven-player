from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import videos
from app.models.base import Base, init_db
from app.models.database import engine

app = FastAPI(title="Haven Player API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db(engine)

# Include routers
app.include_router(videos.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Haven Player API"} 