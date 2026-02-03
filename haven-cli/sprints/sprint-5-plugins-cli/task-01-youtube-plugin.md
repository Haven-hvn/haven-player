# Task 01: YouTube Archiver Plugin

## Assignee
Plugin Developer

## Priority
Critical

## Estimated Effort
4 days

## Description
Implement a fully functional YouTube archiver plugin that can discover videos from channels/playlists and archive them using yt-dlp.

## Current State
- `haven_cli/plugins/base.py` - Plugin base class exists
- `haven_cli/plugins/builtin/` - Directory exists but empty
- No actual plugin implementations

## Requirements

### 1. Plugin Implementation
Create the YouTube plugin:

```python
# haven_cli/plugins/builtin/youtube.py

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pathlib import Path
import asyncio
import json

from haven_cli.plugins.base import ArchiverPlugin, PluginInfo, MediaSource, ArchiveResult


@dataclass
class YouTubeConfig:
    """YouTube plugin configuration."""
    channel_ids: List[str] = None
    playlist_ids: List[str] = None
    max_videos: int = 10
    quality: str = "best"
    output_dir: Path = None
    cookies_file: Optional[Path] = None


class YouTubePlugin(ArchiverPlugin):
    """YouTube video archiver plugin using yt-dlp."""
    
    @property
    def info(self) -> PluginInfo:
        return PluginInfo(
            name="YouTubePlugin",
            version="1.0.0",
            description="Archive videos from YouTube channels and playlists",
            author="Haven Team",
            capabilities=["discover", "archive", "metadata"],
        )
    
    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Verify yt-dlp is available
        try:
            proc = await asyncio.create_subprocess_exec(
                "yt-dlp", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError("yt-dlp not found")
        except FileNotFoundError:
            raise RuntimeError("yt-dlp not installed")
        
        self._initialized = True
    
    async def health_check(self) -> bool:
        """Check if plugin is healthy."""
        if not self._initialized:
            return False
        
        # Check yt-dlp is still available
        try:
            proc = await asyncio.create_subprocess_exec(
                "yt-dlp", "--version",
                stdout=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            return proc.returncode == 0
        except Exception:
            return False
    
    async def discover_sources(self) -> List[MediaSource]:
        """Discover videos from configured channels/playlists."""
        sources = []
        config = self._get_config()
        
        # Discover from channels
        for channel_id in config.channel_ids or []:
            channel_sources = await self._discover_channel(channel_id, config.max_videos)
            sources.extend(channel_sources)
        
        # Discover from playlists
        for playlist_id in config.playlist_ids or []:
            playlist_sources = await self._discover_playlist(playlist_id, config.max_videos)
            sources.extend(playlist_sources)
        
        return sources
    
    async def archive(self, source: MediaSource) -> ArchiveResult:
        """Archive a YouTube video."""
        config = self._get_config()
        output_dir = config.output_dir or Path("./downloads")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        output_template = str(output_dir / "%(id)s.%(ext)s")
        
        cmd = [
            "yt-dlp",
            "-f", config.quality,
            "-o", output_template,
            "--write-info-json",
            "--no-playlist",
        ]
        
        if config.cookies_file:
            cmd.extend(["--cookies", str(config.cookies_file)])
        
        cmd.append(source.uri)
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            
            if proc.returncode != 0:
                return ArchiveResult(
                    success=False,
                    error=stderr.decode() or "yt-dlp failed",
                )
            
            # Find the downloaded file
            output_path = await self._find_output_file(output_dir, source.source_id)
            
            if not output_path:
                return ArchiveResult(
                    success=False,
                    error="Output file not found",
                )
            
            # Get file info
            file_size = output_path.stat().st_size
            duration = await self._get_duration(output_path)
            
            return ArchiveResult(
                success=True,
                output_path=str(output_path),
                file_size=file_size,
                duration=duration,
                metadata=source.metadata,
            )
            
        except Exception as e:
            return ArchiveResult(
                success=False,
                error=str(e),
            )
    
    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        pass
    
    # Private methods
    
    def _get_config(self) -> YouTubeConfig:
        """Get plugin configuration."""
        return YouTubeConfig(
            channel_ids=self._config.get("channel_ids", []),
            playlist_ids=self._config.get("playlist_ids", []),
            max_videos=self._config.get("max_videos", 10),
            quality=self._config.get("quality", "best"),
            output_dir=Path(self._config.get("output_dir", "./downloads")),
            cookies_file=Path(self._config["cookies_file"]) if self._config.get("cookies_file") else None,
        )
    
    async def _discover_channel(self, channel_id: str, max_videos: int) -> List[MediaSource]:
        """Discover videos from a YouTube channel."""
        url = f"https://www.youtube.com/channel/{channel_id}/videos"
        return await self._extract_video_list(url, max_videos)
    
    async def _discover_playlist(self, playlist_id: str, max_videos: int) -> List[MediaSource]:
        """Discover videos from a YouTube playlist."""
        url = f"https://www.youtube.com/playlist?list={playlist_id}"
        return await self._extract_video_list(url, max_videos)
    
    async def _extract_video_list(self, url: str, max_videos: int) -> List[MediaSource]:
        """Extract video list from URL using yt-dlp."""
        cmd = [
            "yt-dlp",
            "--flat-playlist",
            "--dump-json",
            "--playlist-end", str(max_videos),
            url,
        ]
        
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        
        sources = []
        for line in stdout.decode().strip().split("\n"):
            if not line:
                continue
            try:
                data = json.loads(line)
                sources.append(MediaSource(
                    source_id=data.get("id", ""),
                    media_type="youtube",
                    uri=f"https://www.youtube.com/watch?v={data.get('id', '')}",
                    priority="medium",
                    metadata={
                        "title": data.get("title", ""),
                        "uploader": data.get("uploader", ""),
                        "duration": data.get("duration"),
                    },
                ))
            except json.JSONDecodeError:
                continue
        
        return sources
    
    async def _find_output_file(self, output_dir: Path, video_id: str) -> Optional[Path]:
        """Find the downloaded video file."""
        for ext in ["mp4", "webm", "mkv"]:
            path = output_dir / f"{video_id}.{ext}"
            if path.exists():
                return path
        return None
    
    async def _get_duration(self, video_path: Path) -> float:
        """Get video duration using ffprobe."""
        try:
            from haven_cli.media.metadata import extract_video_metadata
            metadata = await extract_video_metadata(video_path)
            return metadata.duration
        except Exception:
            return 0.0
```

### 2. Register as Builtin
Create builtin module init:

```python
# haven_cli/plugins/builtin/__init__.py

from haven_cli.plugins.builtin.youtube import YouTubePlugin

__all__ = ["YouTubePlugin"]
```

### 3. Plugin Configuration
Support configuration via config file:

```toml
# In haven config file
[plugins.YouTubePlugin]
channel_ids = ["UCxxxxxx", "UCyyyyyy"]
playlist_ids = ["PLxxxxxx"]
max_videos = 20
quality = "best[height<=1080]"
output_dir = "~/haven/downloads"
cookies_file = "~/.config/haven/youtube_cookies.txt"
```

### 4. Plugin Manager Integration
Ensure plugin loads via manager:

```python
# In haven_cli/plugins/manager.py

def _load_builtin_plugins(self) -> None:
    """Load built-in plugins."""
    from haven_cli.plugins.builtin import YouTubePlugin
    self.register(YouTubePlugin)
```

## Files to Create/Modify

### Create
- `haven_cli/plugins/builtin/__init__.py`
- `haven_cli/plugins/builtin/youtube.py`

### Modify
- `haven_cli/plugins/manager.py` - Load builtin plugins
- `pyproject.toml` - Ensure yt-dlp is optional dependency

## Acceptance Criteria
- [ ] Plugin initializes and passes health check
- [ ] Can discover videos from YouTube channels
- [ ] Can discover videos from playlists
- [ ] Can archive videos using yt-dlp
- [ ] Returns proper metadata (title, duration, etc.)
- [ ] Handles errors gracefully
- [ ] Configuration via config file works
- [ ] Integration test with real YouTube content

## Technical Notes
- yt-dlp must be installed separately
- Consider rate limiting for API calls
- Handle age-restricted content with cookies
- Support quality selection

## Code Reuse from Electron App

### HIGH REUSE - Complete Production Implementation Available
The electron app has a **complete, production-tested YouTube plugin** (~800 lines):

#### Source Files to Reference:
1. **`backend/app/plugins/builtin/youtube_plugin.py`** - Complete YouTubePlugin
   - Full ArchiverPlugin implementation
   - Channel subscription management (subscribe, unsubscribe, list)
   - Video discovery with yt-dlp
   - Download with quality/format selection
   - JavaScript runtime detection (Deno/Node.js)
   - Cookie support for age-gated content
   - Retry logic with RetryableMixin
   - **Reuse Level: 85%** - Nearly direct port

2. **`backend/app/plugins/plugin_interface.py`** - Plugin base classes
   - ArchiverPlugin abstract base class
   - MediaSource, ArchiveResult, PluginMetadata dataclasses
   - DefaultJobConfig for scheduled jobs
   - **Reuse Level: 95%** - Direct port

3. **`backend/app/plugins/mixins.py`** - Plugin mixins
   - CollectionPluginMixin (subscribe/unsubscribe)
   - ConfigurablePluginMixin
   - RetryableMixin
   - **Reuse Level: 80%** - Adapt for CLI

#### Key Code to Port:

```python
# From backend/app/plugins/builtin/youtube_plugin.py - Plugin structure
class YouTubePlugin(ArchiverPlugin, CollectionPluginMixin, ConfigurablePluginMixin, RetryableMixin):
    def get_metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="YouTubePlugin",
            version="1.0.0",
            description="Archives YouTube videos from subscribed channels using yt-dlp",
            media_types=[MediaType.YOUTUBE],
            default_jobs=[
                DefaultJobConfig(
                    job_name="poll_channels",
                    schedule="15 * * * *",  # Every hour at :15
                    method="discover_sources",
                    on_success="archive_all",
                )
            ]
        )
```

```python
# From backend/app/plugins/builtin/youtube_plugin.py - JS runtime detection
def _detect_js_runtime(self) -> Tuple[Optional[str], Optional[str]]:
    """Detect Deno or Node.js for yt-dlp signature decryption."""
    # Check Deno first (preferred)
    try:
        result = subprocess.run(["deno", "--version"], capture_output=True, timeout=5)
        if result.returncode == 0:
            return ("deno", "deno")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # Check Node.js as fallback
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, timeout=5)
        if result.returncode == 0:
            return ("nodejs", "node")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    return (None, None)
```

```python
# From backend/app/plugins/builtin/youtube_plugin.py - Download command building
def _build_download_command(self, source, output_template, video_format, video_quality, ffmpeg_available):
    if video_quality == "best":
        if ffmpeg_available:
            format_str = f"bestvideo[ext={video_format}]+bestaudio/bestvideo+bestaudio/best"
        else:
            format_str = f"best[vcodec!=none][acodec!=none][ext={video_format}]/best[vcodec!=none][acodec!=none]"
    else:
        height = video_quality.replace("p", "")
        format_str = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
    
    cmd = ["yt-dlp", "--format", format_str, "--output", output_template, source.uri]
    
    if self._is_js_runtime_available():
        cmd.extend(["--remote-components", "ejs:github", "--js-runtimes", self.js_runtime_type])
    
    return cmd
```

### Implementation Strategy
1. **Copy** `backend/app/plugins/plugin_interface.py` → `haven_cli/plugins/base.py`
2. **Copy** `backend/app/plugins/builtin/youtube_plugin.py` → `haven_cli/plugins/builtin/youtube.py`
3. **Adapt** database access (use CLI's repository pattern)
4. **Remove** FastAPI-specific patterns
5. **Keep** all yt-dlp logic, JS runtime detection, retry logic

### What's NOT Reusable
- FastAPI dependency injection
- SQLAlchemy session management (use CLI's pattern)
- Upload coordinator integration

### What's NEW for CLI
- CLI-specific configuration loading
- Integration with CLI pipeline

## Dependencies
- Sprint 1: Video metadata extraction
- yt-dlp installed on system

## Blocking
- Task 02: Plugin CLI commands (needs working plugin)
