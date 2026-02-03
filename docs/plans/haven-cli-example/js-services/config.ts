/**
 * Configuration utilities for Haven CLI JavaScript runtime.
 */

import * as path from "https://deno.land/std@0.200.0/path/mod.ts";

/**
 * Get the configuration directory for Haven CLI.
 * Follows XDG Base Directory Specification.
 */
export function getConfigDir(): string {
    const xdgConfig = Deno.env.get("XDG_CONFIG_HOME");
    if (xdgConfig) {
        return path.join(xdgConfig, "haven-cli");
    }
    
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (home) {
        return path.join(home, ".config", "haven-cli");
    }
    
    return path.join(Deno.cwd(), ".haven-cli");
}

/**
 * Get the cache directory for Haven CLI.
 */
export function getCacheDir(): string {
    const xdgCache = Deno.env.get("XDG_CACHE_HOME");
    if (xdgCache) {
        return path.join(xdgCache, "haven-cli");
    }
    
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (home) {
        return path.join(home, ".cache", "haven-cli");
    }
    
    return path.join(Deno.cwd(), ".haven-cli", "cache");
}

/**
 * Get path to Lit storage file.
 */
export function getLitStoragePath(): string {
    return path.join(getConfigDir(), "lit-auth.json");
}
