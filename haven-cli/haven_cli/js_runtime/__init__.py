"""JS Runtime Bridge for communicating with Deno/Node subprocess.

The JS Runtime Bridge enables Python to communicate with JavaScript
SDKs (Lit Protocol, Synapse) running in a Deno subprocess using
JSON-RPC over stdio.
"""

from haven_cli.js_runtime.bridge import JSRuntimeBridge
from haven_cli.js_runtime.discovery import RuntimeDiscovery, RuntimeInfo
from haven_cli.js_runtime.protocol import JSONRPCError, JSONRPCProtocol

__all__ = [
    "JSRuntimeBridge",
    "JSONRPCError",
    "JSONRPCProtocol",
    "RuntimeDiscovery",
    "RuntimeInfo",
]
