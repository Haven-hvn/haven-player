from dataclasses import dataclass
from typing import Optional, Literal

from sqlalchemy.orm import Session

from app.models.upload_queue import UploadQueue
from app.models.video import Video
from app.utils.video.video_file_validator import is_video_content


EnqueueStatus = Literal[
    "created",
    "requeued",
    "already_completed",
    "already_processing",
    "already_uploaded",
    "video_missing",
]


@dataclass
class EnqueueUploadResult:
    status: EnqueueStatus
    queue_entry: Optional[UploadQueue]


def _set_vlm_status(entry: UploadQueue, video: Optional[Video], video_path: str) -> None:
    enable_vlm = bool(video.enable_vlm_analysis) if video else False
    entry.vlm_analysis_status = "pending" if enable_vlm else "skipped"
    if enable_vlm and not is_video_content(video_path):
        entry.vlm_analysis_status = "skipped"
        entry.vlm_analysis_error = "File contains audio-only content (no video streams)"


def enqueue_video_for_upload(
    db: Session,
    video_path: str,
    priority: int,
    source: str,
    require_video: bool = False,
) -> EnqueueUploadResult:
    video = db.query(Video).filter(Video.path == video_path).first()
    if require_video and not video:
        return EnqueueUploadResult(status="video_missing", queue_entry=None)
    if require_video and video and video.filecoin_root_cid:
        return EnqueueUploadResult(status="already_uploaded", queue_entry=None)

    existing = db.query(UploadQueue).filter(
        UploadQueue.video_path == video_path
    ).first()
    if existing:
        if existing.is_completed():
            return EnqueueUploadResult(status="already_completed", queue_entry=existing)
        if existing.is_processing():
            return EnqueueUploadResult(status="already_processing", queue_entry=existing)

        existing.status = "pending"
        existing.priority = priority
        existing.error_message = None
        existing.attempts = 0
        _set_vlm_status(existing, video, video_path)
        db.commit()
        db.refresh(existing)
        return EnqueueUploadResult(status="requeued", queue_entry=existing)

    queue_entry = UploadQueue(
        video_path=video_path,
        priority=priority,
        source=source,
        status="pending",
    )
    _set_vlm_status(queue_entry, video, video_path)
    db.add(queue_entry)
    db.commit()
    db.refresh(queue_entry)
    return EnqueueUploadResult(status="created", queue_entry=queue_entry)
