"""
Video file validation utilities.

Uses decord library to validate that files actually contain video streams.
This is a defensive check to prevent processing audio-only files as video.
"""
import logging
import os
from typing import Optional

# Import decord at module level so it can be mocked in tests
try:
    import decord
    DECORD_AVAILABLE = True
except ImportError:
    # decord may not be available in all environments (e.g., test environments)
    DECORD_AVAILABLE = False

logger = logging.getLogger(__name__)

# Known audio-only format codes from yt-dlp (for quick skip)
AUDIO_FORMAT_CODES = {'.f140', '.f251', '.f137', '.f138', '.f139', '.f160', '.f249', '.f250'}


def has_video_stream(file_path: str) -> bool:
    """
    Check if a file contains a video stream using decord.

    This is a defensive check that actually opens the file with decord
    to verify it has video streams. Used to filter out audio-only files
    that shouldn't be processed by VLM analysis.

    Args:
        file_path: Path to the file to check

    Returns:
        True if file contains video streams, False if audio-only or error

    Note:
        Audio-only files will raise a DECORDError when accessed via decord,
        which we catch and return False for.
    """
    if not DECORD_AVAILABLE:
        logger.warning(f"decord not available, cannot verify video stream for {file_path}")
        return True  # Conservatively assume it's video if we can't verify

    try:
        # Try to create a video reader - this will fail for audio-only files
        vr = decord.VideoReader(file_path, ctx=decord.cpu(0))
        # If we get here, file has video streams
        return True
    except Exception as e:
        error_str = str(e)
        # Check for decord-specific errors
        if "cannot find video stream" in error_str or "DECORDError" in error_str:
            logger.debug(f"File {file_path} does not contain video stream (audio-only)")
            return False
        # Log other errors but return False to be safe
        logger.warning(f"Error checking video stream in {file_path}: {e}")
        return False


def skip_quick_audio_files(file_path: str) -> bool:
    """
    Quick skip for known audio-only format patterns.

    This is a fast check that looks for yt-dlp format codes that are
    known to be audio-only. Used as an optimization before attempting
    the decord-based verification.

    Args:
        file_path: Path to the file

    Returns:
        True if file should be skipped (known audio pattern), False otherwise
    """
    filename = os.path.basename(file_path)

    # Check for yt-dlp audio format codes (e.g., .f251.webm, .f140.m4a)
    for format_code in AUDIO_FORMAT_CODES:
        if format_code in filename:
            logger.info(f"Skipping known audio-only format code {format_code} in {filename}")
            return True

    return False


def is_video_content(file_path: str) -> bool:
    """
    Check if a file should be processed as video content.

    Combines quick format code checks with decord verification for
    accurate detection. Uses a two-step approach for efficiency:
    1. Quick skip for known audio format codes
    2. Decord-based verification for everything else

    Args:
        file_path: Path to the file

    Returns:
        True if file contains video content, False if audio-only
    """
    # Quick skip for known audio-only patterns
    if skip_quick_audio_files(file_path):
        return False

    # Use decord to actually check for video streams
    return has_video_stream(file_path)
