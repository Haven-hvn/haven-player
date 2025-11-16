from typing import List, Optional
import os
import json
import uuid
import aiofiles
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.video import Video, Timestamp
from pydantic import BaseModel, ConfigDict
from app.lib.phash_generator.phash_calculator import calculate_phash
from app.lib.phash_generator.phash_calculator import get_video_duration
from imagehash import hex_to_hash
import asyncio

router = APIRouter()

class VideoCreate(BaseModel):
    path: str
    title: str
    duration: int
    has_ai_data: bool = False
    thumbnail_path: Optional[str] = None
    phash: Optional[str] = None

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
    phash: Optional[str] = None

class TimestampResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    video_path: str
    tag_name: str
    start_time: float
    end_time: Optional[float]
    confidence: float

def process_ai_analysis_file(video_path: str, db: Session) -> bool:
    """
    Check for and process AI analysis file (.AI.json) for the given video.
    Returns True if AI data was found and processed, False otherwise.
    """
    try:
        # Construct the AI analysis file path
        ai_file_path = f"{video_path}.AI.json"
        
        if not os.path.exists(ai_file_path):
            return False
        
        # Read and parse the AI analysis file
        with open(ai_file_path, 'r', encoding='utf-8') as f:
            ai_data = json.load(f)
        
        # Extract tags and process them
        tags = ai_data.get('tags', {})
        processed_count = 0
        
        for tag_name, tag_data in tags.items():
            ai_model_name = tag_data.get('ai_model_name', 'unknown')
            time_frames = tag_data.get('time_frames', [])
            
            for frame in time_frames:
                start_time = frame.get('start', 0.0)
                end_time = frame.get('end')  # May be None
                confidence = frame.get('confidence', 0.0)
                
                # Create timestamp entry
                db_timestamp = Timestamp(
                    video_path=video_path,
                    tag_name=tag_name,
                    start_time=start_time,
                    end_time=end_time,
                    confidence=confidence
                )
                db.add(db_timestamp)
                processed_count += 1
        
        if processed_count > 0:
            db.commit()
            print(f"✅ Processed {processed_count} AI timestamps from {ai_file_path}")
            return True
        
    except Exception as e:
        print(f"❌ Error processing AI file {ai_file_path}: {e}")
        db.rollback()
    
    return False

@router.get("/", response_model=List[VideoResponse])
def get_videos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> List[Video]:
    videos = db.query(Video).order_by(Video.position.desc(), Video.created_at.desc()).offset(skip).limit(limit).all()
    return videos

@router.post("/", response_model=VideoResponse)
async def create_video(video: VideoCreate, db: Session = Depends(get_db)) -> Video:
    # Get max position
    max_position = db.query(Video).order_by(Video.position.desc()).first()
    position = (max_position.position + 1) if max_position else 0

    # Check for and process AI analysis file
    has_ai_data = process_ai_analysis_file(video.path, db)
    
    # Override the has_ai_data field if AI data was found
    if has_ai_data:
        video.has_ai_data = True

    # Get video duration 
    try:
        duration = int(get_video_duration(video.path))
    except Exception as e:
        print(f"Error getting video duration: {e}")
        duration = 0  # Default to 0 if there's an error

    # Calculate phash asynchronously
    try:
        phash = await asyncio.to_thread(
        calculate_phash, video.path
        )
    except Exception as e:
       print(f"Error calculating phash: {e}")
       phash = None

   # Check for duplicates using pHash
    if phash:
       existing_phashes = db.query(Video.id, Video.phash).filter(Video.phash.isnot(None)).all()
       for vid_id, existing in existing_phashes:
              distance = hex_to_hash(phash) - hex_to_hash(existing)
              print(f"Comparing to video ID {vid_id} | distance: {distance}")
              if distance <= 5:
                   print(f"⚠️ Duplicate detected (Video ID {vid_id}, distance {distance}). Skipping insert.")
                   raise HTTPException(
                        status_code=409,
                        detail=f"⚠️ Duplicate video detected! . Video was skipped."
      )
   


    db_video = Video(
        path=video.path,
        title=video.title,
        duration=duration,
        has_ai_data=video.has_ai_data,
        thumbnail_path=video.thumbnail_path,
        position=position,
        phash=phash
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video

@router.post("/{video_path:path}/timestamps/", response_model=TimestampResponse)
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

@router.get("/{video_path:path}/timestamps/", response_model=List[TimestampResponse])
def get_video_timestamps(
    video_path: str,
    db: Session = Depends(get_db)
) -> List[Timestamp]:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return db.query(Timestamp).filter(Timestamp.video_path == video_path).all()

@router.delete("/{video_path:path}")
def delete_video(video_path: str, db: Session = Depends(get_db)) -> dict:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    db.delete(video)
    db.commit()
    return {"message": "Video deleted successfully"}

@router.put("/{video_path:path}/move-to-front")
def move_to_front(video_path: str, db: Session = Depends(get_db)) -> dict:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    max_position = db.query(Video).order_by(Video.position.desc()).first()
    video.position = (max_position.position + 1) if max_position else 0
    db.commit()
    return {"message": "Video moved to front successfully"}

@router.post("/upload")
async def upload_livekit_recording(
    video_file: UploadFile = File(...),
    participant_id: str = Form(...),
    mint_id: str = Form(...),
    source: str = Form("livekit"),
    mime_type: str = Form("video/webm;codecs=vp9"),
    db: Session = Depends(get_db)
) -> dict:
    """
    Upload a recorded blob from LiveKit frontend recording.
    This endpoint receives pre-recorded video blobs from RecordRTC.js
    and stores them for analysis.
    """
    try:
        # Generate unique upload ID
        upload_id = str(uuid.uuid4())
        
        # Create recordings directory if it doesn't exist
        recordings_dir = "recordings"
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Generate filepath
        file_extension = "webm" if "webm" in mime_type else "mp4"
        filename = f"livekit_{mint_id}_{participant_id}_{upload_id}.{file_extension}"
        filepath = os.path.join(recordings_dir, filename)
        
        # Save the uploaded file
        async with aiofiles.open(filepath, 'wb') as f:
            content = await video_file.read()
            await f.write(content)
        
        file_size = len(content)
        print(f"✅ Uploaded LiveKit recording: {filename} ({file_size} bytes)")
        
        # Validate file size - reject empty or very small files
        if file_size == 0:
            # Clean up empty file
            try:
                os.remove(filepath)
            except:
                pass
            raise HTTPException(
                status_code=400,
                detail="Recording file is empty (0 bytes). The recording may not have captured any data."
            )
        
        if file_size < 100:  # Very small files are likely invalid
            print(f"⚠️ Warning: Recording file is very small ({file_size} bytes), may be invalid")
        
        # Get video duration
        duration = 0
        try:
            duration = int(get_video_duration(filepath))
            if duration <= 0:
                print(f"⚠️ Warning: Could not determine video duration, defaulting to 0")
        except Exception as e:
            print(f"Error getting video duration: {e}")
            duration = 0
        
        # Calculate phash asynchronously (skip for empty/invalid files)
        phash = None
        if file_size > 100:  # Only calculate phash for files that seem valid
            try:
                phash = await asyncio.to_thread(calculate_phash, filepath)
            except Exception as e:
                print(f"Error calculating phash: {e}")
                phash = None
        
        # Check for duplicates using pHash (only if we have a valid phash)
        if phash:
            existing_phashes = db.query(Video.id, Video.phash).filter(Video.phash.isnot(None)).all()
            for vid_id, existing in existing_phashes:
                distance = hex_to_hash(phash) - hex_to_hash(existing)
                if distance <= 5:
                    print(f"⚠️ Duplicate detected (Video ID {vid_id}, distance {distance}). Skipping insert.")
                    # Clean up the uploaded file
                    try:
                        os.remove(filepath)
                    except:
                        pass
                    raise HTTPException(
                        status_code=409,
                        detail="Duplicate video detected! Recording was skipped."
                    )
        
        # Get max position
        max_position = db.query(Video).order_by(Video.position.desc()).first()
        position = (max_position.position + 1) if max_position else 0
        
        # Create video entry
        db_video = Video(
            path=filepath,
            title=f"LiveKit Recording - {participant_id}",
            duration=duration,
            has_ai_data=False,  # Will be set to True after analysis
            thumbnail_path=None,
            position=position,
            phash=phash
        )
        db.add(db_video)
        db.commit()
        db.refresh(db_video)
        
        # TODO: Trigger analysis pipeline on uploaded blob
        # This would start the AI analysis process for the uploaded recording
        # await start_analysis_pipeline(upload_id, filepath)
        
        return {
            "status": "uploaded",
            "upload_id": upload_id,
            "video_id": db_video.id,
            "filepath": filepath,
            "duration": duration,
            "message": "LiveKit recording uploaded and queued for analysis"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error uploading LiveKit recording: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload recording: {str(e)}") 
