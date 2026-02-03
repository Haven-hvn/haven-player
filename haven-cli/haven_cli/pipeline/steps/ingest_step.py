"""Ingest step - Video ingestion, pHash calculation, and database entry.

This step is the entry point for videos into the pipeline. It:
1. Validates the video file exists and is readable
2. Extracts video metadata (duration, size, mime type)
3. Calculates perceptual hash (pHash) for deduplication
4. Creates a database entry for the video
5. Checks for duplicates based on pHash
"""

from pathlib import Path
from typing import Any, Dict, Optional

from haven_cli.pipeline.context import PipelineContext, VideoMetadata
from haven_cli.pipeline.events import Event, EventType
from haven_cli.pipeline.results import StepError, StepResult
from haven_cli.pipeline.step import PipelineStep


class IngestStep(PipelineStep):
    """Pipeline step for video ingestion and metadata extraction.
    
    This step is always executed (cannot be skipped) as it's the
    foundation for all subsequent processing.
    
    Emits:
        - VIDEO_INGESTED event on successful ingestion
    
    Output data:
        - phash: Perceptual hash of the video
        - file_size: Size in bytes
        - duration: Duration in seconds
        - mime_type: MIME type of the video
        - is_duplicate: Whether this video is a duplicate
    """
    
    @property
    def name(self) -> str:
        """Step identifier."""
        return "ingest"
    
    async def process(self, context: PipelineContext) -> StepResult:
        """Process video ingestion.
        
        Args:
            context: Pipeline context with source_path
            
        Returns:
            StepResult with video metadata
        """
        video_path = context.source_path
        
        # Validate file exists
        if not video_path.exists():
            return StepResult.fail(
                self.name,
                StepError.permanent(
                    code="FILE_NOT_FOUND",
                    message=f"Video file not found: {video_path}",
                    path=str(video_path),
                ),
            )
        
        # Validate file is readable
        if not video_path.is_file():
            return StepResult.fail(
                self.name,
                StepError.permanent(
                    code="NOT_A_FILE",
                    message=f"Path is not a file: {video_path}",
                    path=str(video_path),
                ),
            )
        
        try:
            # Extract basic file metadata
            file_size = video_path.stat().st_size
            mime_type = self._detect_mime_type(video_path)
            
            # Calculate perceptual hash
            # TODO: Implement actual pHash calculation
            phash = await self._calculate_phash(video_path)
            
            # Extract video duration
            # TODO: Implement actual duration extraction
            duration = await self._extract_duration(video_path)
            
            # Check for duplicates
            # TODO: Implement actual duplicate check against database
            is_duplicate = await self._check_duplicate(phash)
            
            if is_duplicate:
                # Log duplicate but continue (let pipeline decide what to do)
                context.set_step_data(self.name, "is_duplicate", True)
            
            # Create video metadata
            video_metadata = VideoMetadata(
                path=str(video_path),
                title=video_path.stem,
                duration=duration,
                file_size=file_size,
                mime_type=mime_type,
                phash=phash,
            )
            
            # Store in context
            context.video_metadata = video_metadata
            
            # Emit video ingested event
            await self._emit_event(EventType.VIDEO_INGESTED, context, {
                "path": str(video_path),
                "phash": phash,
                "file_size": file_size,
                "duration": duration,
                "is_duplicate": is_duplicate,
            })
            
            # Save to database
            # TODO: Implement actual database save
            await self._save_to_database(video_metadata)
            
            return StepResult.ok(
                self.name,
                phash=phash,
                file_size=file_size,
                duration=duration,
                mime_type=mime_type,
                is_duplicate=is_duplicate,
            )
            
        except Exception as e:
            return StepResult.fail(
                self.name,
                StepError.from_exception(e, code="INGEST_ERROR"),
            )
    
    def _detect_mime_type(self, path: Path) -> str:
        """Detect MIME type from file extension.
        
        TODO: Use python-magic or similar for accurate detection.
        """
        extension_map = {
            ".mp4": "video/mp4",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".avi": "video/x-msvideo",
            ".mov": "video/quicktime",
            ".wmv": "video/x-ms-wmv",
            ".flv": "video/x-flv",
            ".m4v": "video/x-m4v",
        }
        return extension_map.get(path.suffix.lower(), "video/mp4")
    
    async def _calculate_phash(self, path: Path) -> str:
        """Calculate perceptual hash for the video.
        
        TODO: Implement actual pHash calculation using videohash or similar.
        
        The pHash should be calculated from video frames to enable
        content-based deduplication regardless of encoding differences.
        """
        # Placeholder implementation
        import hashlib
        
        # For skeleton, use file hash as placeholder
        # Real implementation would use perceptual hashing
        hasher = hashlib.sha256()
        with open(path, "rb") as f:
            # Read first 1MB for quick hash
            hasher.update(f.read(1024 * 1024))
        
        return hasher.hexdigest()[:16]
    
    async def _extract_duration(self, path: Path) -> float:
        """Extract video duration in seconds.
        
        TODO: Implement using ffprobe or similar.
        """
        # Placeholder - return 0 until implemented
        return 0.0
    
    async def _check_duplicate(self, phash: str) -> bool:
        """Check if a video with this pHash already exists.
        
        TODO: Implement database lookup.
        """
        # Placeholder - always return False
        return False
    
    async def _save_to_database(self, metadata: VideoMetadata) -> None:
        """Save video metadata to database.
        
        TODO: Implement database persistence.
        """
        # Placeholder - no-op until database is implemented
        pass
    
    async def on_complete(
        self,
        context: PipelineContext,
        result: StepResult,
    ) -> None:
        """Log successful ingestion."""
        # Could add logging here
        pass
