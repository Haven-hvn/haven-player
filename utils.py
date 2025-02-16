from pathlib import Path
import subprocess
import json

def check_av1_codec(file_path: str) -> bool:
    """Checks if the input file is already encoded with AV1."""
    ffprobe_command = [
    "ffprobe",
    "-v", "quiet",
    "-print_format", "json",
    "-show_streams",
    file_path
    ]
    try:
        ffprobe_output = subprocess.run(ffprobe_command, capture_output=True, check=True)
        ffprobe_data = json.loads(ffprobe_output.stdout)
        for stream in ffprobe_data.get('streams', []):
            if stream.get('codec_type') == 'video' and stream.get('codec_name') == 'av1':
                return True
        return False
    except subprocess.CalledProcessError as e:
        logging.error(f"Error running ffprobe on {file_path}: {e}")
        logging.error(f"FFprobe stdout: {e.stdout.decode()}")
        logging.error(f"FFprobe stderr: {e.stderr.decode()}")
        return False

def get_video_duration(file_path: str) -> int:
    """Get video duration in seconds using ffprobe."""
    ffprobe_command = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_entries", "format=duration",
        file_path
    ]

    try:
        ffprobe_output = subprocess.run(ffprobe_command, capture_output=True, check=True, text=True)
        ffprobe_data = json.loads(ffprobe_output.stdout)
        duration = ffprobe_data.get('format', {}).get('duration', '0')
        return int(float(duration))  # Convert duration to int in seconds
    except subprocess.CalledProcessError as e:
        logging.error(f"Error running ffprobe on {file_path}: {e}")
        logging.error(f"FFprobe stdout: {e.stdout}")
        logging.error(f"FFprobe stderr: {e.stderr}")
        return 0
    except ValueError as ve:
        logging.error(f"Error parsing duration: {ve}")
        return 0

def generate_thumbnail(file_path: str, output_path: str = None, size: tuple = (320, 180)) -> str:
    """Generate a thumbnail from the first frame of the video using ffmpeg."""
    
    # Ensure output path has a .jpg extension, defaults to renaming input path with .thumb.jpg suffix
    if output_path is None:
        output_path = str(Path(file_path).with_suffix('.thumb.jpg'))

    # Construct the ffmpeg command for thumbnail generation
    ffmpeg_cmd = [
        "ffmpeg",
        "-i", file_path,  # Input file
        "-vframes", "1",  # Capture only the first frame
        "-vf", f"scale={size[0]}:{size[1]}",  # Specify the scale (size)
        output_path  # Output file path
    ]
    
    try:
        # Execute the command in subprocess
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return output_path
    
    except subprocess.CalledProcessError as e:
        print(f"Error generating thumbnail: {e}")
        return ""

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
