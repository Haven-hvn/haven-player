"""
Python-to-JavaScript Bridge using JSON-RPC over stdio.

This module provides a bridge to execute JavaScript code in a subprocess
(Deno or Node.js) with browser environment shims. Based on yt-dlp's
JavaScript Challenge Provider architecture.
"""

import json
import subprocess
import sys
import tempfile
import os
from pathlib import Path
from typing import Any, Dict, Optional, List, Callable
from dataclasses import dataclass
from threading import Lock


class JSRuntimeError(Exception):
    """Error from JavaScript runtime."""
    pass


@dataclass
class JSRuntimeConfig:
    """Configuration for JavaScript runtime."""
    runtime: str = "deno"  # "deno" or "node"
    runtime_path: Optional[str] = None
    debug: bool = False
    timeout: float = 300.0  # 5 minutes default timeout
    
    def get_runtime_cmd(self) -> str:
        """Get the runtime command path."""
        if self.runtime_path:
            return self.runtime_path
        return self.runtime


class JSRuntimeBridge:
    """
    Manages a JavaScript runtime subprocess for executing browser-based code.
    
    Communication protocol: JSON-RPC 2.0 over stdin/stdout
    
    Inspired by yt-dlp's JavaScript Challenge Provider (JSC) architecture.
    """
    
    def __init__(self, config: JSRuntimeConfig):
        self.config = config
        self._process: Optional[subprocess.Popen] = None
        self._request_id = 0
        self._lock = Lock()
        self._js_services_path = self._get_js_services_path()
        
    def _get_js_services_path(self) -> Path:
        """Get the path to JavaScript services."""
        # In production, this would be bundled with the package
        # For development, use relative path
        current_file = Path(__file__).resolve()
        cli_root = current_file.parent.parent.parent
        return cli_root / "js-services"
    
    def start(self) -> None:
        """Start the JS runtime subprocess with browser shim."""
        if self._process is not None:
            return  # Already started
            
        if self.config.runtime == "deno":
            cmd = self._build_deno_command()
        elif self.config.runtime == "node":
            cmd = self._build_node_command()
        else:
            raise ValueError(f"Unknown runtime: {self.config.runtime}")
        
        if self.config.debug:
            print(f"[JSRuntime] Starting: {' '.join(cmd)}", file=sys.stderr)
        
        try:
            self._process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                cwd=str(self._js_services_path),
            )
        except FileNotFoundError as e:
            raise JSRuntimeError(
                f"JavaScript runtime '{self.config.get_runtime_cmd()}' not found. "
                f"Please install {self.config.runtime} and ensure it's in PATH."
            ) from e
        
        # Wait for ready signal
        self._wait_for_ready()
    
    def _build_deno_command(self) -> List[str]:
        """Build Deno command with appropriate permissions."""
        return [
            self.config.get_runtime_cmd(),
            "run",
            "--ext=ts",
            "--no-prompt",
            "--allow-read",           # Read files (config, temp)
            "--allow-write",          # Write temp files, CAR creation
            "--allow-net",            # Network access for Lit/Synapse
            "--allow-env",            # Environment variables
            "--allow-sys",            # System info
            "--unstable-bare-node-builtins",  # Node.js compatibility
            "main.ts",                # Entry point
        ]
    
    def _build_node_command(self) -> List[str]:
        """Build Node.js command."""
        return [
            self.config.get_runtime_cmd(),
            "--experimental-vm-modules",
            "--no-warnings",
            "main.mjs",               # Entry point (compiled)
        ]
    
    def _wait_for_ready(self) -> None:
        """Wait for the JS runtime to signal ready."""
        ready_line = self._read_line()
        if ready_line is None:
            raise JSRuntimeError("JS runtime failed to start (no ready signal)")
        
        try:
            ready_msg = json.loads(ready_line)
            if ready_msg.get("status") != "ready":
                raise JSRuntimeError(f"Unexpected ready signal: {ready_line}")
        except json.JSONDecodeError:
            raise JSRuntimeError(f"Invalid ready signal: {ready_line}")
        
        if self.config.debug:
            print(f"[JSRuntime] Ready: {ready_msg}", file=sys.stderr)
    
    def call(self, method: str, *params) -> Any:
        """
        Call a JavaScript service method via JSON-RPC.
        
        Args:
            method: Method name in format "service.method"
            params: Positional arguments for the method
            
        Returns:
            The result from the JavaScript method
            
        Raises:
            JSRuntimeError: If the method call fails
        """
        with self._lock:
            self._request_id += 1
            request_id = self._request_id
        
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": self._serialize_params(params),
        }
        
        if self.config.debug:
            print(f"[JSRuntime] Request: {method}", file=sys.stderr)
        
        self._send(json.dumps(request))
        response = self._read_response()
        
        if "error" in response:
            error = response["error"]
            raise JSRuntimeError(f"{error.get('message', 'Unknown error')}")
        
        return self._deserialize_result(response.get("result"))
    
    def _serialize_params(self, params: tuple) -> List[Any]:
        """Serialize Python parameters for JSON-RPC."""
        result = []
        for param in params:
            if isinstance(param, bytes):
                # Convert bytes to base64 string
                import base64
                result.append({"__type__": "bytes", "data": base64.b64encode(param).decode()})
            elif isinstance(param, Path):
                result.append(str(param))
            else:
                result.append(param)
        return result
    
    def _deserialize_result(self, result: Any) -> Any:
        """Deserialize JavaScript result."""
        if isinstance(result, dict) and result.get("__type__") == "bytes":
            import base64
            return base64.b64decode(result["data"])
        elif isinstance(result, dict):
            return {k: self._deserialize_result(v) for k, v in result.items()}
        elif isinstance(result, list):
            return [self._deserialize_result(item) for item in result]
        return result
    
    def _send(self, data: str) -> None:
        """Send data to the JS subprocess."""
        if self._process is None or self._process.stdin is None:
            raise JSRuntimeError("JS runtime not started")
        
        try:
            self._process.stdin.write(data + "\n")
            self._process.stdin.flush()
        except BrokenPipeError as e:
            raise JSRuntimeError("JS runtime process terminated unexpectedly") from e
    
    def _read_line(self) -> Optional[str]:
        """Read a line from stdout."""
        if self._process is None or self._process.stdout is None:
            return None
        
        try:
            return self._process.stdout.readline().strip()
        except Exception:
            return None
    
    def _read_response(self) -> Dict:
        """Read and parse a JSON-RPC response."""
        line = self._read_line()
        if line is None:
            raise JSRuntimeError("No response from JS runtime")
        
        try:
            return json.loads(line)
        except json.JSONDecodeError as e:
            raise JSRuntimeError(f"Invalid JSON response: {line}") from e
    
    def stop(self) -> None:
        """Stop the JS runtime subprocess."""
        if self._process is None:
            return
        
        try:
            # Try graceful shutdown
            self._send(json.dumps({"jsonrpc": "2.0", "method": "shutdown"}))
            self._process.wait(timeout=5)
        except (TimeoutError, subprocess.TimeoutExpired):
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._process.kill()
        except Exception:
            pass
        finally:
            self._process = None
    
    def __enter__(self):
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        return False
