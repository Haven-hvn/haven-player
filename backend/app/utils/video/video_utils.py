try:
    import cv2  # loads the video
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("Warning: cv2 (OpenCV) not available. Video duration will use fallback method.")

import os


def get_video_duration(video_path: str) -> float:
    """
    Get video duration in seconds.
    
    Uses cv2 if available, otherwise returns 0.

    Args:
        video_path: Path to the video file.

    Returns:
        Duration in seconds, or 0 if cv2 is not available or calculation fails.
    """
    if not CV2_AVAILABLE:
        # Fallback: try to get file size and estimate, or return 0
        # For now, just return 0 if cv2 is not available
        print(f"Warning: cv2 not available, cannot get duration for {video_path}")
        return 0
    
    try:
        # Check if file exists first
        if not os.path.exists(video_path):
            print(f"Warning: Video file does not exist: {video_path}")
            return 0
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Warning: Failed to open the video file: {video_path}")
            return 0
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        
        if fps <= 0 or frame_count <= 0:
            cap.release()
            return 0
        
        duration = frame_count / fps
        cap.release()
        return duration  # in seconds
    except FileNotFoundError as e:
        print(f"Error: Video file not found: {video_path} - {e}")
        return 0
    except PermissionError as e:
        print(f"Error: Permission denied accessing video file: {video_path} - {e}")
        return 0
    except OSError as e:
        print(f"Error: OS error accessing video file: {video_path} - {e}")
        return 0
    except Exception as e:
        print(f"Error getting video duration with cv2: {video_path} - {e}")
        return 0
