from typing import List, Optional, Dict
import os
import json
import uuid
import aiofiles
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.video import Video, Timestamp
from app.models.pumpfun_coin import PumpFunCoin
from app.services.arkiv_sync import ArkivSyncClient, ArkivSyncConfig, build_arkiv_config
from app.services.evm_utils import InsufficientGasError
from collections import defaultdict
from pydantic import BaseModel, ConfigDict
from app.lib.phash_generator.phash_calculator import calculate_phash
from app.lib.phash_generator.phash_calculator import get_video_duration
from app.lib.thumbnail_generator import generate_video_thumbnail
from imagehash import hex_to_hash
import asyncio

logger = logging.getLogger(__name__)
router = APIRouter()

def _is_valid_phash(phash: Optional[str]) -> bool:
    """
    Validate that a phash string is in the correct format for hex_to_hash.
    Returns True if valid, False otherwise.
    """
    if not phash:
        return False
    
    try:
        # Try to convert to hash to validate format
        hex_to_hash(phash)
        return True
    except (ValueError, TypeError):
        # Invalid format - likely a random number string or malformed hash
        return False

class VideoCreate(BaseModel):
    path: str
    title: str
    duration: int
    has_ai_data: bool = False
    thumbnail_path: Optional[str] = None
    phash: Optional[str] = None
    share_to_arkiv: Optional[bool] = None
    creator_handle: Optional[str] = None
    source_uri: Optional[str] = None

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
    updated_at: Optional[datetime] = None
    file_size: Optional[int] = None
    file_extension: Optional[str] = None
    mime_type: Optional[str] = None
    codec: Optional[str] = None
    creator_handle: Optional[str] = None
    source_uri: Optional[str] = None
    analysis_model: Optional[str] = None
    share_to_arkiv: bool
    arkiv_entity_key: Optional[str] = None
    mint_id: Optional[str] = None
    filecoin_root_cid: Optional[str] = None
    filecoin_piece_cid: Optional[str] = None
    filecoin_piece_id: Optional[int] = None
    filecoin_data_set_id: Optional[str] = None
    filecoin_uploaded_at: Optional[datetime] = None
    cid_hash: Optional[str] = None
    # Lit Protocol encryption metadata
    is_encrypted: bool = False
    lit_encryption_metadata: Optional[str] = None

class TimestampResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    video_path: str
    tag_name: str
    start_time: float
    end_time: Optional[float]
    confidence: float

class TokenGroupInfo(BaseModel):
    """Token information for a group"""
    mint_id: str
    name: Optional[str] = None
    symbol: Optional[str] = None
    image_uri: Optional[str] = None
    thumbnail: Optional[str] = None

class VideoGroupResponse(BaseModel):
    """Response model for grouped videos"""
    token_info: Optional[TokenGroupInfo] = None  # None for "Other Videos" group
    videos: List[VideoResponse]
    recording_count: int
    latest_recording_date: Optional[datetime] = None

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

@router.get("/grouped", response_model=List[VideoGroupResponse])
def get_grouped_videos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
) -> List[VideoGroupResponse]:
    """
    Get videos grouped by mint_id (token).
    Videos with the same mint_id are grouped together.
    Videos without mint_id are grouped in an "Other Videos" group.
    Groups with only one video are still shown as groups (automatic grouping).
    """
    # Get all videos
    all_videos = db.query(Video).order_by(Video.position.desc(), Video.created_at.desc()).offset(skip).limit(limit).all()
    
    # Group videos by mint_id
    videos_by_mint: Dict[Optional[str], list[Video]] = defaultdict(list)
    for video in all_videos:
        videos_by_mint[video.mint_id].append(video)
    
    # Get token info for each mint_id
    mint_ids = [mint_id for mint_id in videos_by_mint.keys() if mint_id is not None]
    token_info_map: dict[str, TokenGroupInfo] = {}
    
    if mint_ids:
        coins = db.query(PumpFunCoin).filter(PumpFunCoin.mint_id.in_(mint_ids)).all()
        for coin in coins:
            token_info_map[coin.mint_id] = TokenGroupInfo(
                mint_id=coin.mint_id,
                name=coin.name,
                symbol=coin.symbol,
                image_uri=coin.image_uri,
                thumbnail=coin.thumbnail
            )
    
    # Build response groups
    groups: list[VideoGroupResponse] = []
    
    # Process token groups (with mint_id)
    for mint_id in sorted(mint_ids, key=lambda m: m or ""):
        videos = videos_by_mint[mint_id]
        if not videos:
            continue
        
        # Get token info or create default
        token_info = token_info_map.get(mint_id)
        if not token_info:
            # Create default token info if not found in database
            token_info = TokenGroupInfo(
                mint_id=mint_id,
                name=None,
                symbol=None,
                image_uri=None,
                thumbnail=None
            )
        
        # Find latest recording date
        latest_date = max((v.created_at for v in videos), default=None)
        
        groups.append(VideoGroupResponse(
            token_info=token_info,
            videos=[VideoResponse.model_validate(v) for v in videos],
            recording_count=len(videos),
            latest_recording_date=latest_date
        ))
    
    # Process "Other Videos" group (videos without mint_id)
    other_videos = videos_by_mint.get(None, [])
    if other_videos:
        latest_date = max((v.created_at for v in other_videos), default=None)
        groups.append(VideoGroupResponse(
            token_info=None,  # No token info for "Other Videos"
            videos=[VideoResponse.model_validate(v) for v in other_videos],
            recording_count=len(other_videos),
            latest_recording_date=latest_date
        ))
    
    return groups

def _build_file_metadata(file_path: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    """Return file size, extension, and mime type for a given path."""
    try:
        file_size = os.path.getsize(file_path)
    except OSError:
        file_size = None
    extension = Path(file_path).suffix.replace(".", "") if file_path else None
    mime_type, _ = mimetypes.guess_type(file_path)
    return file_size, extension, mime_type


def _should_share_to_arkiv(requested: Optional[bool], config: ArkivSyncConfig) -> bool:
    if requested is not None:
        return requested
    return config.enabled


@router.post("/", response_model=VideoResponse)
async def create_video(video: VideoCreate, db: Session = Depends(get_db)) -> Video:
    # Get max position
    max_position = db.query(Video).order_by(Video.position.desc()).first()
    position = (max_position.position + 1) if max_position else 0
    arkiv_config = build_arkiv_config()

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
    # Note: If phash calculation fails or returns None, the video will still be added
    # (duplicate detection will be skipped, but the video will be created with phash=None)
    try:
        phash = await asyncio.to_thread(calculate_phash, video.path)
    except Exception as e:
        print(f"Error calculating phash: {e}")
        phash = None

    # Check for duplicates using pHash (only if we have a valid phash)
    # If phash is None, skip duplicate detection and proceed with video creation
    if phash and _is_valid_phash(phash):
        existing_phashes = (
            db.query(Video.id, Video.phash).filter(Video.phash.isnot(None)).all()
        )
        for vid_id, existing in existing_phashes:
            # Skip invalid phash values in database
            if not _is_valid_phash(existing):
                continue
            
            try:
                distance = hex_to_hash(phash) - hex_to_hash(existing)
                print(f"Comparing to video ID {vid_id} | distance: {distance}")
                if distance <= 5:
                    print(
                        f"⚠️ Duplicate detected (Video ID {vid_id}, distance {distance}). Skipping insert."
                    )
                    raise HTTPException(
                        status_code=409,
                        detail="⚠️ Duplicate video detected! . Video was skipped.",
                    )
            except (ValueError, TypeError) as e:
                # Skip comparison if phash conversion fails
                print(f"Warning: Invalid phash format for video ID {vid_id}, skipping comparison: {e}")
                continue

    file_size, file_extension, mime_type = _build_file_metadata(video.path)
    share_to_arkiv = _should_share_to_arkiv(video.share_to_arkiv, arkiv_config)

    db_video = Video(
        path=video.path,
        title=video.title,
        duration=duration,
        has_ai_data=video.has_ai_data,
        thumbnail_path=video.thumbnail_path,
        position=position,
        phash=phash,
        file_size=file_size,
        file_extension=file_extension,
        mime_type=mime_type,
        creator_handle=video.creator_handle,
        source_uri=video.source_uri,
        share_to_arkiv=share_to_arkiv,
    )
    db.add(db_video)
    db.commit()
    db.refresh(db_video)

    # Log Arkiv sync attempt status
    logger.info(
        "📋 Arkiv sync check for video %s | "
        "share_to_arkiv: %s | "
        "config.enabled: %s | "
        "has_private_key: %s",
        db_video.path,
        share_to_arkiv,
        arkiv_config.enabled,
        bool(arkiv_config.private_key)
    )
    
    arkiv_client = ArkivSyncClient(arkiv_config)
    try:
        arkiv_client.sync_video(db, db_video, [])
    except InsufficientGasError as gas_err:
        # Log the gas error with wallet address and chain info
        logger.error(
            "❌ Arkiv sync failed due to insufficient gas for video %s | "
            "Chain: %s | "
            "Wallet Address: %s | "
            "User needs to send %s to this address",
            db_video.path,
            gas_err.chain_name or "EVM Chain",
            gas_err.wallet_address,
            gas_err.native_token_symbol,
            exc_info=True
        )
        # Note: We don't raise HTTPException here to avoid breaking video creation
        # The video is still created, but Arkiv sync failed
    except Exception as err:
        logger.error("❌ Arkiv sync failed for video %s: %s", db_video.path, err, exc_info=True)

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

class FilecoinMetadataUpdate(BaseModel):
    root_cid: str
    piece_cid: str
    piece_id: Optional[int] = None
    data_set_id: str
    transaction_hash: Optional[str] = None
    # Lit Protocol encryption metadata
    is_encrypted: bool = False
    lit_encryption_metadata: Optional[str] = None
    encrypted_root_cid: Optional[str] = None
    cid_encryption_metadata: Optional[str] = None  # Metadata to decrypt encrypted_root_cid

class SharePreferenceUpdate(BaseModel):
    share_to_arkiv: bool

@router.put("/{video_path:path}/share", response_model=VideoResponse)
def update_share_preference(
    video_path: str, preference: SharePreferenceUpdate, db: Session = Depends(get_db)
) -> Video:
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.share_to_arkiv = preference.share_to_arkiv
    db.commit()
    db.refresh(video)

    if video.share_to_arkiv:
        arkiv_client = ArkivSyncClient(build_arkiv_config())
        try:
            arkiv_client.sync_video(db, video, video.timestamps)
        except InsufficientGasError as gas_err:
            logger.error(
                "❌ Arkiv sync failed due to insufficient gas after enabling share for video %s | "
                "Chain: %s | "
                "Wallet Address: %s | "
                "User needs to send %s to this address",
                video.path,
                gas_err.chain_name or "EVM Chain",
                gas_err.wallet_address,
                gas_err.native_token_symbol,
                exc_info=True
            )
            # Raise HTTPException to notify the user
            raise HTTPException(
                status_code=402,  # Payment Required
                detail=f"Insufficient {gas_err.native_token_symbol} for gas. Please send {gas_err.native_token_symbol} to address: {gas_err.wallet_address}"
            )
        except Exception as err:
            logger.error("❌ Arkiv sync failed after enabling share for video %s: %s", video.path, err, exc_info=True)

    return video

@router.get("/needing-cid-decryption", response_model=List[dict])
def get_videos_needing_cid_decryption(db: Session = Depends(get_db)) -> List[dict]:
    """
    Get all videos that have encrypted_filecoin_cid but no filecoin_root_cid.
    These need to be decrypted after restore from Arkiv.
    """
    videos = db.query(Video).filter(
        Video.encrypted_filecoin_cid.isnot(None),
        Video.filecoin_root_cid.is_(None)
    ).all()
    
    return [
        {
            "path": video.path,
            "encrypted_filecoin_cid": video.encrypted_filecoin_cid,
            "cid_encryption_metadata": video.cid_encryption_metadata,
        }
        for video in videos
        if video.cid_encryption_metadata  # Only return if we have metadata to decrypt
    ]

class CidDecryptionUpdate(BaseModel):
    decrypted_cid: str

@router.patch("/{video_path:path}/decrypt-cid", response_model=VideoResponse)
def decrypt_video_cid(
    video_path: str,
    update: CidDecryptionUpdate,
    db: Session = Depends(get_db)
) -> Video:
    """
    Update video with decrypted filecoin_root_cid after decrypting encrypted_filecoin_cid.
    Used after restoring from Arkiv.
    """
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if not video.encrypted_filecoin_cid:
        raise HTTPException(status_code=400, detail="Video does not have an encrypted CID to decrypt")
    
    # Update with decrypted CID
    video.filecoin_root_cid = update.decrypted_cid
    # Compute CID hash for deduplication
    if update.decrypted_cid:
        video.cid_hash = hashlib.sha256(update.decrypted_cid.encode("utf-8")).hexdigest()
    
    db.commit()
    db.refresh(video)
    
    logger.info("✅ Decrypted and updated CID for video %s", video.path)
    return video

@router.put("/{video_path:path}/filecoin-metadata", response_model=VideoResponse)
def update_filecoin_metadata(
    video_path: str,
    metadata: FilecoinMetadataUpdate,
    db: Session = Depends(get_db)
) -> Video:
    """
    Update Filecoin storage metadata for a video after successful upload.
    Includes optional Lit Protocol encryption metadata.
    """
    video = db.query(Video).filter(Video.path == video_path).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    video.filecoin_root_cid = metadata.root_cid
    video.filecoin_piece_cid = metadata.piece_cid
    video.filecoin_piece_id = metadata.piece_id
    video.filecoin_data_set_id = metadata.data_set_id
    video.filecoin_uploaded_at = datetime.now(timezone.utc)
    
    # Compute and store CID hash for Arkiv dedupe (SHA256 of root CID)
    # metadata.root_cid is the exact CID string returned by the Filecoin network
    # (from rootCid.toString() in the upload result, which comes from the CAR builder)
    # This ensures we use the same CID that the decentralized Filecoin network recognizes
    if metadata.root_cid:
        video.cid_hash = hashlib.sha256(metadata.root_cid.encode("utf-8")).hexdigest()
    # Store encrypted CID for Arkiv sync (used only when encrypted)
    if metadata.encrypted_root_cid:
        video.encrypted_filecoin_cid = metadata.encrypted_root_cid
    # Store CID encryption metadata (needed to decrypt encrypted CID during restore)
    if metadata.cid_encryption_metadata:
        video.cid_encryption_metadata = metadata.cid_encryption_metadata
    
    # Update Lit Protocol encryption metadata if provided
    video.is_encrypted = metadata.is_encrypted
    if metadata.lit_encryption_metadata:
        video.lit_encryption_metadata = metadata.lit_encryption_metadata
    
    db.commit()
    db.refresh(video)

    arkiv_config = build_arkiv_config()
    logger.info(
        "📋 Arkiv sync check after Filecoin upload for video %s | "
        "share_to_arkiv: %s | "
        "config.enabled: %s | "
        "has_private_key: %s | "
        "has_filecoin_cid: %s",
        video.path,
        video.share_to_arkiv,
        arkiv_config.enabled,
        bool(arkiv_config.private_key),
        bool(video.filecoin_root_cid)
    )
    
    arkiv_client = ArkivSyncClient(arkiv_config)
    try:
        arkiv_client.sync_video(db, video, video.timestamps)
    except InsufficientGasError as gas_err:
        logger.error(
            "❌ Arkiv sync failed due to insufficient gas after Filecoin update for video %s | "
            "Chain: %s | "
            "Wallet Address: %s | "
            "User needs to send %s to this address",
            video.path,
            gas_err.chain_name or "EVM Chain",
            gas_err.wallet_address,
            gas_err.native_token_symbol,
            exc_info=True
        )
        # Raise HTTPException to notify the user
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient {gas_err.native_token_symbol} for gas. Please send {gas_err.native_token_symbol} to address: {gas_err.wallet_address}"
        )
    except Exception as err:
        logger.error("❌ Arkiv sync failed after Filecoin update for video %s: %s", video.path, err, exc_info=True)
    return video

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
        # Note: If phash calculation fails or returns None, the video will still be added
        # (duplicate detection will be skipped, but the video will be created with phash=None)
        phash = None
        if file_size > 100:  # Only calculate phash for files that seem valid
            try:
                phash = await asyncio.to_thread(calculate_phash, filepath)
            except Exception as e:
                print(f"Error calculating phash: {e}")
                phash = None

        # Check for duplicates using pHash (only if we have a valid phash)
        # If phash is None, skip duplicate detection and proceed with video creation
        if phash and _is_valid_phash(phash):
            existing_phashes = db.query(Video.id, Video.phash).filter(Video.phash.isnot(None)).all()
            for vid_id, existing in existing_phashes:
                # Skip invalid phash values in database
                if not _is_valid_phash(existing):
                    continue
                
                try:
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
                except (ValueError, TypeError) as e:
                    # Skip comparison if phash conversion fails
                    print(f"Warning: Invalid phash format for video ID {vid_id}, skipping comparison: {e}")
                    continue
        
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
            phash=phash,
            mint_id=mint_id  # Associate with pump.fun token
        )
        db.add(db_video)
        db.commit()
        db.refresh(db_video)
        
        # Generate thumbnail after video file is saved
        try:
            thumbnail_path = await asyncio.to_thread(generate_video_thumbnail, filepath)
            if thumbnail_path:
                db_video.thumbnail_path = thumbnail_path
                db.commit()
                db.refresh(db_video)
                print(f"✅ Thumbnail generated and saved for uploaded recording: {thumbnail_path}")
            else:
                print(f"⚠️ Thumbnail generation failed for {filepath}, continuing without thumbnail")
        except Exception as e:
            print(f"⚠️ Error generating thumbnail for {filepath}: {e}, continuing without thumbnail")
            # Don't fail the upload process if thumbnail generation fails
        
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
