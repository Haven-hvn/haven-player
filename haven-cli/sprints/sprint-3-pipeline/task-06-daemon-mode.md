# Task 06: Daemon Mode Implementation

## Assignee
Backend Developer

## Priority
High

## Estimated Effort
3 days

## Description
Implement the daemon mode for `haven run` command that starts the scheduler and processes pipelines continuously in the background.

## Current State
- `haven_cli/cli/run.py` has placeholder implementation:
  - Creates PipelineManager and JobScheduler
  - Prints "Daemon startup not yet implemented"
  - No actual daemon logic

## Requirements

### 1. Daemon Service Implementation
Create main daemon service class:

```python
# haven_cli/daemon/service.py

class HavenDaemon:
    """Main daemon service for Haven CLI."""
    
    def __init__(
        self,
        config: HavenConfig,
        max_concurrent: int = 4,
    ):
        self._config = config
        self._max_concurrent = max_concurrent
        self._pipeline_manager: Optional[PipelineManager] = None
        self._scheduler: Optional[JobScheduler] = None
        self._running = False
        self._shutdown_event = asyncio.Event()
    
    async def start(self) -> None:
        """Start the daemon services."""
        logger.info("Starting Haven daemon...")
        
        # Initialize JS bridge
        from haven_cli.js_runtime.manager import JSBridgeManager
        await JSBridgeManager.get_instance().get_bridge()
        
        # Initialize pipeline manager
        self._pipeline_manager = PipelineManager(
            max_concurrent=self._max_concurrent,
            config=self._config,
        )
        
        # Register default steps
        self._pipeline_manager = create_default_pipeline(
            max_concurrent=self._max_concurrent,
            config=self._config.__dict__,
        )
        
        # Initialize scheduler
        self._scheduler = JobScheduler(
            pipeline_manager=self._pipeline_manager,
            config=self._config.__dict__,
        )
        
        # Start scheduler
        await self._scheduler.start()
        
        self._running = True
        logger.info("Haven daemon started successfully")
    
    async def stop(self) -> None:
        """Stop the daemon services."""
        logger.info("Stopping Haven daemon...")
        
        self._running = False
        
        if self._scheduler:
            await self._scheduler.stop()
        
        # Shutdown JS bridge
        from haven_cli.js_runtime.manager import JSBridgeManager
        await JSBridgeManager.get_instance().shutdown()
        
        logger.info("Haven daemon stopped")
    
    async def run_until_shutdown(self) -> None:
        """Run daemon until shutdown signal received."""
        await self._shutdown_event.wait()
    
    def request_shutdown(self) -> None:
        """Request daemon shutdown."""
        self._shutdown_event.set()
```

### 2. Signal Handling
Handle SIGTERM and SIGINT for graceful shutdown:

```python
async def run_daemon(config: HavenConfig, options: dict) -> None:
    """Run the Haven daemon with signal handling."""
    daemon = HavenDaemon(config, max_concurrent=options.get("max_concurrent", 4))
    
    # Set up signal handlers
    loop = asyncio.get_event_loop()
    
    def handle_signal(sig):
        logger.info(f"Received signal {sig.name}, initiating shutdown...")
        daemon.request_shutdown()
    
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: handle_signal(s))
    
    try:
        await daemon.start()
        await daemon.run_until_shutdown()
    finally:
        await daemon.stop()
```

### 3. Background Daemon Mode
Support running as a background process:

```python
def daemonize() -> None:
    """Fork process to run as daemon."""
    import os
    
    # First fork
    pid = os.fork()
    if pid > 0:
        sys.exit(0)
    
    # Create new session
    os.setsid()
    
    # Second fork
    pid = os.fork()
    if pid > 0:
        sys.exit(0)
    
    # Redirect standard file descriptors
    sys.stdout.flush()
    sys.stderr.flush()
    
    with open('/dev/null', 'r') as devnull:
        os.dup2(devnull.fileno(), sys.stdin.fileno())
    
    # Redirect stdout/stderr to log file
    log_file = config.data_dir / "daemon.log"
    with open(log_file, 'a+') as f:
        os.dup2(f.fileno(), sys.stdout.fileno())
        os.dup2(f.fileno(), sys.stderr.fileno())
```

### 4. PID File Management
Track daemon process:

```python
class PIDFile:
    """Manage daemon PID file."""
    
    def __init__(self, path: Path):
        self.path = path
    
    def create(self) -> None:
        """Create PID file with current process ID."""
        self.path.write_text(str(os.getpid()))
    
    def remove(self) -> None:
        """Remove PID file."""
        if self.path.exists():
            self.path.unlink()
    
    def read(self) -> Optional[int]:
        """Read PID from file."""
        if self.path.exists():
            return int(self.path.read_text().strip())
        return None
    
    def is_running(self) -> bool:
        """Check if daemon process is running."""
        pid = self.read()
        if pid is None:
            return False
        
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False
```

### 5. Update CLI Command
Complete the run command:

```python
@app.callback(invoke_without_command=True)
def run(
    config_file: Optional[Path] = ...,
    daemon: bool = ...,
    max_concurrent: int = ...,
    verbose: bool = ...,
) -> None:
    """Start the Haven daemon."""
    import asyncio
    from haven_cli.daemon.service import HavenDaemon, run_daemon, daemonize
    from haven_cli.daemon.pid import PIDFile
    
    config = load_config(config_file)
    pid_file = PIDFile(config.data_dir / "haven.pid")
    
    # Check if already running
    if pid_file.is_running():
        console.print("[red]Daemon is already running[/red]")
        raise typer.Exit(code=1)
    
    console.print("[bold green]Starting Haven daemon...[/bold green]")
    
    if daemon:
        # Fork to background
        daemonize()
    
    # Create PID file
    pid_file.create()
    
    try:
        asyncio.run(run_daemon(config, {
            "max_concurrent": max_concurrent,
            "verbose": verbose,
        }))
    finally:
        pid_file.remove()
```

### 6. Status Command
Add status checking:

```python
@app.command()
def status() -> None:
    """Check daemon status."""
    config = load_config()
    pid_file = PIDFile(config.data_dir / "haven.pid")
    
    if pid_file.is_running():
        pid = pid_file.read()
        console.print(f"[green]Daemon is running[/green] (PID: {pid})")
    else:
        console.print("[yellow]Daemon is not running[/yellow]")

@app.command()
def stop() -> None:
    """Stop the daemon."""
    config = load_config()
    pid_file = PIDFile(config.data_dir / "haven.pid")
    
    pid = pid_file.read()
    if pid and pid_file.is_running():
        os.kill(pid, signal.SIGTERM)
        console.print("[green]Shutdown signal sent[/green]")
    else:
        console.print("[yellow]Daemon is not running[/yellow]")
```

## Files to Create/Modify

### Create
- `haven_cli/daemon/__init__.py`
- `haven_cli/daemon/service.py` - Main daemon service
- `haven_cli/daemon/pid.py` - PID file management

### Modify
- `haven_cli/cli/run.py` - Complete implementation

## Acceptance Criteria
- [ ] `haven run` starts daemon in foreground
- [ ] `haven run --daemon` starts in background
- [ ] SIGTERM/SIGINT handled gracefully
- [ ] PID file created and managed
- [ ] `haven run status` shows daemon status
- [ ] `haven run stop` stops the daemon
- [ ] Multiple daemon instances prevented
- [ ] Logs written to file in daemon mode

## Technical Notes
- Use `atexit` for cleanup on unexpected exit
- Consider systemd service file for production
- Implement health endpoint for monitoring
- Handle daemon restart scenarios

## Dependencies
- Sprint 3: All pipeline steps
- Sprint 4: Scheduler (for job processing)

## Blocking
- None (enables full CLI functionality)
