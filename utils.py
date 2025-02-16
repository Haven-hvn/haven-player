import av
from pathlib import Path
from moviepy.editor import VideoFileClip

def check_av1_codec(file_path: str) -> bool:
    """Checks if the input file is already encoded with AV1."""
    try:
        clip = VideoFileClip(file_path)
        # Check if the codec is 'av1'
        if clip.codec.lower() == 'av1':
            return True
        else:
            return False
    except Exception as e:
        print(f"Error checking codec on {file_path}: {e}")
        return False

def get_video_duration(file_path: str) -> int:
    """Get video duration in seconds."""
    try:
        container = av.open(file_path)
        stream = container.streams.video[0]
        duration = int(stream.frames / stream.rate)
        return duration
    except Exception as e:
        print(f"Error getting duration: {e}")
        return 0

def generate_thumbnail(file_path: str, output_path: str = None, size: tuple = (320, 180)) -> str:
    """Generate a thumbnail from the first frame of the video."""
    try:
        container = av.open(file_path)
        stream = container.streams.video[0]
        
        # Get the first frame
        for frame in container.decode(video=0):
            img = frame.to_ndarray(format='rgb24')
            
            # Convert to PIL Image for easy resizing
            from PIL import Image
            pil_image = Image.fromarray(img)
            pil_image.thumbnail(size)
            
            # Save thumbnail
            if output_path is None:
                output_path = str(Path(file_path).with_suffix('.thumb.jpg'))
            pil_image.save(output_path, 'JPEG')
            return output_path
            
    except Exception as e:
        print(f"Error generating thumbnail: {e}")
        return None

def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS string."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

def parse_ai_data(json_data: dict) -> dict:
    """Parse and validate AI data from JSON file."""
    required_keys = ["video_metadata", "tags"]
    if not all(key in json_data for key in required_keys):
        raise ValueError("Invalid AI data format: missing required keys")
        
    metadata = json_data["video_metadata"]
    if "duration" not in metadata:
        raise ValueError("Invalid AI data format: missing duration in metadata")
        
    tags = json_data["tags"]
    for tag_name, tag_data in tags.items():
        if "time_frames" not in tag_data:
            raise ValueError(f"Invalid AI data format: missing time_frames for tag {tag_name}")
            
        for frame in tag_data["time_frames"]:
            if "start" not in frame:
                raise ValueError(f"Invalid AI data format: missing start time in frame for tag {tag_name}")
                
    return json_data
