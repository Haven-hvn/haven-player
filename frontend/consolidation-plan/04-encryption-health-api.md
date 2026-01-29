# Encryption Status & Backend Health API Plan

## Overview
Fix encryption status display in the Archive screen and implement a proper backend health API to provide accurate system status information.

## Current State

### Encryption Status Display
**Location:** `HealthPulseBar.tsx`

**Current Implementation:**
```tsx
<HealthIndicator
  icon={systemHealth.encryptionEnabled ? <EncryptedIcon /> : <UnencryptedIcon />}
  label="Encryption"
  status={systemHealth.encryptionEnabled ? 'connected' : 'warning'}
  tooltip={
    systemHealth.encryptionEnabled
      ? 'Content encryption enabled'
      : 'Encryption not configured'
  }
/>
```

**Problem:**
- The `encryptionEnabled` field is hardcoded to `false` in `useTransformationPipeline.ts`
- Encryption status doesn't reflect actual Lit Protocol configuration
- No green indicator when encryption is properly configured

### Backend Health API
**Location:** `useTransformationPipeline.ts`

**Current Implementation:**
```typescript
// Hardcoded values
const [systemHealth, setSystemHealth] = useState<SystemHealth>({
  backendConnected: true,
  walletConnected: false,
  walletAddress: undefined,
  encryptionEnabled: false, // Always false!
});
```

**Problem:**
- No actual backend health API endpoint
- Values are hardcoded
- No real-time health monitoring
- Encryption status never shows as enabled

## Target State

### Encryption Status
- Accurately reflects Lit Protocol configuration
- Shows green indicator when encryption is configured
- Shows warning when encryption is not configured
- Tooltip provides actionable information

### Backend Health API
- Real backend endpoint `/api/health`
- Returns accurate system status
- Includes encryption status from Filecoin config
- Includes wallet connection status
- Polls for updates periodically

## Implementation Plan

### Phase 1: Backend Health API

#### 1.1 Create Backend Health Endpoint
**Location:** Backend (Python/FastAPI)

**New Endpoint:** `GET /api/health`

**Response Schema:**
```python
{
  "backend_connected": true,
  "wallet_connected": bool,
  "wallet_address": Optional[str],
  "encryption_enabled": bool,
  "points": int,
  "streak": int,
  "level": int,
  "tier": str,
  "node_active": bool,
  "filecoin_configured": bool,
  "plugins": [
    {
      "name": str,
      "loaded": bool,
      "healthy": bool
    }
  ]
}
```

**Implementation:**
```python
# backend/main.py or backend/api/health.py
from fastapi import APIRouter
from typing import Optional, List

router = APIRouter()

@router.get("/api/health")
async def get_health():
    """Get system health status"""
    # Check backend components
    backend_connected = True  # We're responding, so we're connected
    
    # Check wallet connection
    wallet_connected = check_wallet_connection()
    wallet_address = get_wallet_address() if wallet_connected else None
    
    # Check encryption (from Filecoin config)
    filecoin_config = get_filecoin_config()
    encryption_enabled = filecoin_config.get("encryptionEnabled", False) if filecoin_config else False
    filecoin_configured = bool(filecoin_config)
    
    # Get DePin stats
    depin_stats = get_depin_stats()
    points = depin_stats.get("points", 0)
    streak = depin_stats.get("daily_streak", 0)
    level = points // 1000 + 1
    tier = calculate_tier(points)
    node_active = depin_stats.get("is_active", False)
    
    # Get plugin status
    plugins = get_plugin_status()
    
    return {
        "backend_connected": backend_connected,
        "wallet_connected": wallet_connected,
        "wallet_address": wallet_address,
        "encryption_enabled": encryption_enabled,
        "points": points,
        "streak": streak,
        "level": level,
        "tier": tier,
        "node_active": node_active,
        "filecoin_configured": filecoin_configured,
        "plugins": plugins
    }

def check_wallet_connection() -> bool:
    """Check if wallet is connected"""
    # Implement wallet connection check
    return False  # Placeholder

def get_wallet_address() -> Optional[str]:
    """Get connected wallet address"""
    # Implement wallet address retrieval
    return None  # Placeholder

def get_filecoin_config() -> Optional[dict]:
    """Get Filecoin configuration"""
    # Load from database or config file
    return None  # Placeholder

def get_depin_stats() -> dict:
    """Get DePin statistics"""
    # Query database for DePin stats
    return {
        "points": 0,
        "daily_streak": 0,
        "is_active": False
    }

def calculate_tier(points: int) -> str:
    """Calculate tier based on points"""
    if points >= 10000:
        return "Mythic Librarian"
    elif points >= 5000:
        return "Chronicle Guardian"
    elif points >= 2500:
        return "Signal Keeper"
    elif points >= 1000:
        return "Archivist"
    else:
        return "Observer"

def get_plugin_status() -> List[dict]:
    """Get plugin status"""
    # Query plugin manager for status
    return []
```

**Classification:** Backend change

#### 1.2 Update Frontend Health Hook
**Location:** `useTransformationPipeline.ts`

**Changes:**
```typescript
// Remove hardcoded values
const [systemHealth, setSystemHealth] = useState<SystemHealth>({
  backendConnected: false, // Start as false, update from API
  walletConnected: false,
  walletAddress: undefined,
  encryptionEnabled: false,
});

// Update fetchSystemHealth function
const fetchSystemHealth = useCallback(async () => {
  try {
    const response = await fetch('http://localhost:8000/api/health');
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    
    const data = await response.json();
    
    setSystemHealth({
      backendConnected: data.backend_connected,
      walletConnected: data.wallet_connected,
      walletAddress: data.wallet_address,
      encryptionEnabled: data.encryption_enabled,
    });
    
    // Update DePin stats if available
    if (data.points !== undefined) {
      // Update points, streak, etc.
    }
    
  } catch (error) {
    console.error('Failed to fetch system health:', error);
    setSystemHealth((prev: SystemHealth) => ({
      ...prev,
      backendConnected: false,
    }));
  }
}, []);

// Poll health status periodically
useEffect(() => {
  fetchSystemHealth();
  const interval = setInterval(fetchSystemHealth, 30000); // Every 30 seconds
  return () => clearInterval(interval);
}, [fetchSystemHealth]);
```

### Phase 2: Encryption Status Display

#### 2.1 Update Health Indicator Component
**Location:** `HealthPulseBar.tsx`

**Enhanced Implementation:**
```tsx
<HealthIndicator
  icon={systemHealth.encryptionEnabled ? <EncryptedIcon /> : <UnencryptedIcon />}
  label="Encryption"
  status={systemHealth.encryptionEnabled ? 'connected' : 'warning'}
  tooltip={
    systemHealth.encryptionEnabled
      ? 'Content encryption enabled (Lit Protocol)'
      : 'Encryption not configured - Configure in Settings > Filecoin'
  }
  onClick={() => {
    // Click to open settings to Filecoin tab
    if (!systemHealth.encryptionEnabled) {
      openSettings('filecoin');
    }
  }}
  clickable={!systemHealth.encryptionEnabled}
/>
```

#### 2.2 Add Clickable Indicator Style
**Location:** `HealthPulseBar.tsx`

**Update HealthIndicator Component:**
```tsx
interface HealthIndicatorProps {
  icon: React.ReactNode;
  label: string;
  status: 'connected' | 'warning' | 'disconnected';
  tooltip: string;
  onClick?: () => void;
  clickable?: boolean;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  icon,
  label,
  status,
  tooltip,
  onClick,
  clickable,
}) => {
  const statusColors = {
    connected: liquidGlassTokens.neon.success,
    warning: liquidGlassTokens.neon.amber,
    disconnected: liquidGlassTokens.neon.error,
  };

  const color = statusColors[status];

  return (
    <Tooltip title={tooltip}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          ...(clickable && {
            '&:hover': {
              opacity: 0.8,
              '& .MuiTypography-root': {
                textDecoration: 'underline',
              },
            },
          }),
        }}
        onClick={onClick}
      >
        <StatusDotIcon
          sx={{
            fontSize: 8,
            color: color,
            filter: `drop-shadow(0 0 3px ${color})`,
          }}
        />
        <Box
          sx={{
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            display: 'flex',
            alignItems: 'center',
            '& > svg': { fontSize: 16 },
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontSize: '12px',
            color: `rgba(255, 255, 255, ${liquidGlassTokens.text.secondary})`,
            fontWeight: 400,
          }}
        >
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
};
```

### Phase 3: Filecoin Config Integration

#### 3.1 Load Filecoin Config for Encryption Status
**Location:** `useTransformationPipeline.ts` or new hook

**Implementation:**
```typescript
// In useTransformationPipeline.ts
import { useState, useEffect, useCallback } from 'react';

const useFilecoinConfig = () => {
  const [config, setConfig] = useState<FilecoinConfig | null>(null);
  
  const fetchConfig = useCallback(async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const config = await ipcRenderer.invoke('get-filecoin-config');
      setConfig(config);
    } catch (error) {
      console.error('Failed to load Filecoin config:', error);
    }
  }, []);
  
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);
  
  return { config, refreshConfig: fetchConfig };
};

// Use in fetchSystemHealth
const { config: filecoinConfig } = useFilecoinConfig();

// Update encryption status based on config
useEffect(() => {
  if (filecoinConfig) {
    setSystemHealth((prev) => ({
      ...prev,
      encryptionEnabled: filecoinConfig.encryptionEnabled || false,
    }));
  }
}, [filecoinConfig]);
```

## Implementation Steps

### Phase 1: Backend Health API
1. Create `/api/health` endpoint in backend
2. Implement health check functions
3. Add encryption status from Filecoin config
4. Add wallet connection check
5. Add DePin stats
6. Add plugin status
7. Test endpoint returns correct data

### Phase 2: Frontend Health Integration
1. Update `useTransformationPipeline.ts` to call `/api/health`
2. Remove hardcoded values
3. Add polling for health updates
4. Test health updates correctly

### Phase 3: Encryption Status Display
1. Update `HealthPulseBar.tsx` to use real encryption status
2. Add clickable indicator for configuration
3. Add visual feedback (green when enabled)
4. Test encryption status displays correctly

### Phase 4: Filecoin Config Integration
1. Load Filecoin config on mount
2. Update encryption status when config changes
3. Listen for config updates
4. Test encryption status updates

## Backend Changes Required

### New Endpoint
- `GET /api/health` - System health status

### New Functions
- `check_wallet_connection()` - Check wallet connection
- `get_wallet_address()` - Get wallet address
- `get_filecoin_config()` - Get Filecoin configuration
- `get_depin_stats()` - Get DePin statistics
- `calculate_tier()` - Calculate tier from points
- `get_plugin_status()` - Get plugin status

**Classification:** Backend changes

## Frontend Changes Required

### Modified Components
- `useTransformationPipeline.ts` - Call `/api/health` endpoint
- `HealthPulseBar.tsx` - Update encryption indicator

### No New Components Required

## UX Considerations

### Encryption Status
- Green indicator when encryption is enabled
- Amber/warning when not configured
- Clickable to open settings
- Clear tooltip with actionable information

### Health Updates
- Poll every 30 seconds
- Show loading state on initial fetch
- Handle errors gracefully
- Don't spam the user with notifications

### Visual Feedback
- Smooth transitions between states
- Clear color coding (green = good, amber = warning, red = error)
- Pulse animation for active states

## Testing Checklist

### Backend
- [ ] `/api/health` endpoint exists
- [ ] Returns correct schema
- [ ] `backend_connected` is true
- [ ] `wallet_connected` reflects actual state
- [ ] `wallet_address` returns correct address
- [ ] `encryption_enabled` reflects Filecoin config
- [ ] `points` returns correct value
- [ ] `streak` returns correct value
- [ ] `level` calculated correctly
- [ ] `tier` calculated correctly
- [ ] `node_active` reflects actual state
- [ ] `filecoin_configured` reflects actual state
- [ ] `plugins` returns correct status

### Frontend
- [ ] Health API called on mount
- [ ] Health API polled every 30 seconds
- [ ] Encryption status shows green when enabled
- [ ] Encryption status shows amber when disabled
- [ ] Encryption indicator clickable when disabled
- [ ] Click opens Settings > Filecoin
- [ ] Tooltip shows correct information
- [ ] Status updates in real-time
- [ ] Errors handled gracefully
- [ ] No hardcoded values

## Migration Notes

### Data Migration
- No data migration needed

### API Changes
- New endpoint: `GET /api/health`

### Breaking Changes
- None - addition only

## Success Metrics

- [ ] Backend health API implemented
- [ ] Encryption status displays correctly
- [ ] Green indicator when encryption enabled
- [ ] Clickable to configure when disabled
- [ ] Real-time health updates
- [ ] No hardcoded values
- [ ] Accurate system status