/**
 * Browser Environment Shim for Deno
 * 
 * Provides browser globals that Lit Protocol and Synapse SDK expect.
 * Based on yt-dlp's browser simulation approach.
 */

import { ensureDir } from "https://deno.land/std@0.200.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.200.0/path/mod.ts";
import { getConfigDir } from "./config.ts";

// ============================================================================
// File-backed localStorage Implementation
// ============================================================================

class FileStorage {
    private data: Map<string, string> = new Map();
    private loaded: boolean = false;
    private filePath: string;
    private saveTimeout: number | null = null;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const content = await Deno.readTextFile(this.filePath);
            const parsed = JSON.parse(content);
            this.data = new Map(Object.entries(parsed));
        } catch {
            // File doesn't exist or is corrupt, start fresh
            this.data = new Map();
        }
        this.loaded = true;
    }

    async save(): Promise<void> {
        const obj = Object.fromEntries(this.data);
        await Deno.writeTextFile(this.filePath, JSON.stringify(obj, null, 2));
    }

    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value);
        this.debouncedSave();
    }

    removeItem(key: string): void {
        this.data.delete(key);
        this.debouncedSave();
    }

    clear(): void {
        this.data.clear();
        this.debouncedSave();
    }

    key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null;
    }

    get length(): number {
        return this.data.size;
    }

    private debouncedSave(): void {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.save(), 100);
    }
}

// ============================================================================
// Environment Setup
// ============================================================================

export async function setupBrowserEnvironment(): Promise<void> {
    const configDir = getConfigDir();
    await ensureDir(configDir);
    
    const storageFile = path.join(configDir, "localStorage.json");
    const storage = new FileStorage(storageFile);
    await storage.load();

    // localStorage
    (globalThis as any).localStorage = storage;

    // window object
    const window = {
        location: {
            href: "https://haven-player.local",
            origin: "https://haven-player.local",
            protocol: "https:",
            host: "haven-player.local",
            hostname: "haven-player.local",
            port: "",
            pathname: "/",
            search: "",
            hash: "",
        },
        navigator: {
            userAgent: `Haven-CLI/1.0 (Deno/${Deno.version.deno})`,
            language: Deno.env.get("LANG")?.split(".")[0] || "en-US",
            platform: Deno.build.os,
            onLine: true,
        },
        crypto: globalThis.crypto, // Deno has Web Crypto API
        localStorage: storage,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
    };

    (globalThis as any).window = window;

    // document object
    const document = {
        createElement: (tag: string) => ({
            tagName: tag.toUpperCase(),
            style: {} as Record<string, string>,
            setAttribute: () => {},
            getAttribute: () => null,
            appendChild: () => {},
        }),
        head: {
            appendChild: () => {},
        },
        body: {
            appendChild: () => {},
        },
        documentElement: {
            style: {} as Record<string, string>,
        },
        location: window.location,
        addEventListener: () => {},
        removeEventListener: () => {},
    };

    (globalThis as any).document = document;

    // navigator
    (globalThis as any).navigator = window.navigator;

    // self
    (globalThis as any).self = globalThis;

    // top (for iframe simulation)
    (globalThis as any).top = window;

    // parent
    (globalThis as any).parent = window;

    // XMLHttpRequest stub
    class XMLHttpRequest {
        readyState = 0;
        status = 0;
        responseText = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onloadend: (() => void) | null = null;
        
        open() { this.readyState = 1; }
        send() { 
            this.readyState = 4;
            this.status = 0;
            if (this.onerror) this.onerror();
            if (this.onloadend) this.onloadend();
        }
        setRequestHeader() {}
        getResponseHeader() { return null; }
        getAllResponseHeaders() { return ""; }
    }

    (globalThis as any).XMLHttpRequest = XMLHttpRequest;

    // btoa/atob (Deno has these, but ensure they're available)
    if (typeof (globalThis as any).btoa === "undefined") {
        (globalThis as any).btoa = (str: string) => btoa(str);
        (globalThis as any).atob = (str: string) => atob(str);
    }

    console.log("[BrowserShim] Environment initialized");
}
