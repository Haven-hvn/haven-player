/**
 * Main entry point for Haven CLI JavaScript runtime.
 * 
 * This runs inside Deno/Node.js and provides JSON-RPC services
 * for Lit Protocol encryption and Synapse/Filecoin uploads.
 */

import { LitService } from "./lit-wrapper.ts";
import { SynapseService } from "./synapse-wrapper.ts";
import { setupBrowserEnvironment } from "./browser-shim.ts";

// Setup browser environment first
await setupBrowserEnvironment();

// Initialize services
const litService = new LitService();
const synapseService = new SynapseService();

interface JSONRPCRequest {
    jsonrpc: "2.0";
    id?: number;
    method: string;
    params?: any[];
}

interface JSONRPCResponse {
    jsonrpc: "2.0";
    id?: number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

// Service registry
const services: Record<string, any> = {
    lit: litService,
    synapse: synapseService,
};

async function handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { id, method, params = [] } = request;
    
    // Special methods
    if (method === "shutdown") {
        Deno.exit(0);
    }
    
    // Parse service.method format
    const parts = method.split(".");
    if (parts.length !== 2) {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32601,
                message: `Method not found: ${method}`,
            },
        };
    }
    
    const [serviceName, methodName] = parts;
    const service = services[serviceName];
    
    if (!service) {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32601,
                message: `Service not found: ${serviceName}`,
            },
        };
    }
    
    const fn = service[methodName];
    if (typeof fn !== "function") {
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32601,
                message: `Method not found: ${serviceName}.${methodName}`,
            },
        };
    }
    
    try {
        const result = await fn.apply(service, params);
        return {
            jsonrpc: "2.0",
            id,
            result,
        };
    } catch (error: any) {
        console.error(`[Error] ${serviceName}.${methodName}:`, error);
        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: -32000,
                message: error.message || String(error),
                data: error.stack,
            },
        };
    }
}

async function main() {
    // Signal ready
    console.log(JSON.stringify({
        status: "ready",
        runtime: "deno",
        version: Deno.version.deno,
        services: Object.keys(services),
    }));
    
    // Read from stdin
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(1024 * 1024); // 1MB buffer
    
    let line = "";
    
    while (true) {
        try {
            const n = await Deno.stdin.read(buffer);
            if (n === null) {
                break; // EOF
            }
            
            const chunk = decoder.decode(buffer.subarray(0, n));
            line += chunk;
            
            // Process complete lines
            const lines = line.split("\n");
            line = lines.pop() || ""; // Keep incomplete line
            
            for (const l of lines) {
                if (!l.trim()) continue;
                
                try {
                    const request: JSONRPCRequest = JSON.parse(l);
                    const response = await handleRequest(request);
                    console.log(JSON.stringify(response));
                } catch (e) {
                    console.log(JSON.stringify({
                        jsonrpc: "2.0",
                        error: {
                            code: -32700,
                            message: "Parse error",
                        },
                    }));
                }
            }
        } catch (error) {
            console.error("[Runtime Error]", error);
            break;
        }
    }
}

main();
