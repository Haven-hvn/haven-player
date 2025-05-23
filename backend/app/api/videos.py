from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.video import Video, Timestamp
from pydantic import BaseModel, ConfigDict

router = APIRouter()

class VideoCreate(BaseModel):
    path: str
    title: str
    duration: int
    has_ai_data: bool = False
    thumbnail_path: Optional[str] = None

class TimestampCreate(BaseModel):
    tag_name: str
    start_time: float
    end_time: Optional[float] = None
    confidence: float

class VideoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    path: str
    title: str
    duration: int
    has_ai_data: bool
    thumbnail_path: Optional[str]
    position: int
    created_at: datetime

class TimestampResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    video_path: str
    tag_name: str
    start_time: float
    end_time: Optional[float]
    confidence: float

@router.get("/videos/", response_model=List[VideoResponse])
def get_videos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> List[Video]:
    videos = db.query(Video).order_by(Video.position.desc(), Video.created_at.desc()).offset(skip).limit(limit).all()
    return videos

@router.post("/videos/", response_model=VideoResponse)
def create_video(video: VideoCreate, db: Session = Depends(get_db)) -> Video:
    # Get max position
    max_position = db.query(Video).order_by(Video.position.desc()).first()
    position = (max_position.position + 1) if max_position else 0

    db_video = Video(
        path=video.path,
        title=video.title,
        duration=video.duration,
        has_ai_data=video.has_ai_data,
        thumbnail_path=video.thumbnail_path,
        position=position
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video

@router.post("/videos/{video_path:path}/timestamps/", response_model=TimestampResponse)
def create_timestamp(
    video_path: str,
    timestamp: TimestampCreate,
    db: Session = Depends(get_db)
) -> Timestamp:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    db_timestamp = Timestamp(
        video_path=video_path,
        tag_name=timestamp.tag_name,
        start_time=timestamp.start_time,
        end_time=timestamp.end_time,
        confidence=timestamp.confidence
    )
    db.add(db_timestamp)
    db.commit()
    db.refresh(db_timestamp)
    return db_timestamp

@router.get("/videos/{video_path:path}/timestamps/", response_model=List[TimestampResponse])
def get_video_timestamps(
    video_path: str,
    db: Session = Depends(get_db)
) -> List[Timestamp]:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return db.query(Timestamp).filter(Timestamp.video_path == video_path).all()

@router.delete("/videos/{video_path:path}")
def delete_video(video_path: str, db: Session = Depends(get_db)) -> dict:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    db.delete(video)
    db.commit()
    return {"message": "Video deleted successfully"}

@router.put("/videos/{video_path:path}/move-to-front")
def move_to_front(video_path: str, db: Session = Depends(get_db)) -> dict:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    max_position = db.query(Video).order_by(Video.position.desc()).first()
    video.position = (max_position.position + 1) if max_position else 0
    db.commit()
    return {"message": "Video moved to front successfully"} 