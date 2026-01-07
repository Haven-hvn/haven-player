# Control/Data Plane Frontend Guide

## Overview

The good news: **The existing frontend works perfectly without any changes**! The control/data plane implementation is internal backend architecture that doesn't change the API surface.

However, we can **enhance** the frontend to expose and visualize the new control/data plane features for better monitoring and management.

## What Works Now (No Changes Needed)

### ✅ Existing Functionality

All existing frontend features continue to work seamlessly:

1. **Plugin Loading/Unloading**
   - Plugins load correctly whether they run in control plane or data plane
   - No code changes needed in `usePlugins` hook

2. **Plugin Configuration**
   - Configuration API unchanged
   - `updatePluginConfig` works for both control and data plane plugins

3. **Source Discovery**
   - `getPluginSources` works identically
   - Workers handle heavy I/O transparently

4. **Archiving Operations**
   - `archiveSource` API unchanged
   - Workers handle long-running operations transparently

5. **Health Checks**
   - `getPluginHealth` includes worker health
   - Frontend displays same response format

### Why No Changes Required

The control/data plane separation is **internal backend architecture**:
- API endpoints remain the same
- Request/response formats unchanged
- Worker processes are transparent to the frontend
- The frontend doesn't need to know about workers

## Optional Enhancements

While the existing frontend works, adding these enhancements would improve visibility and monitoring of the control/data plane architecture:

### 1. Type Definitions (`src/types/plugin.ts`)

Add new types for control/data plane features:

```typescript
// Add to frontend/src/types/plugin.ts

export interface WorkerStatus {
  plugin_name: string;
  pid: number;
  is_alive: boolean;
  tasks_queued: number;
  active_tasks: number;
  created_at?: string;
}

export interface WorkersResponse {
  workers: WorkerStatus[];
  count: number;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  error?: string;
}

export interface WorkerModeConfig {
  worker_plugins: string[];
  max_workers: number;
}

export interface EnhancedPluginMetadata extends PluginMetadata {
  // Add to existing PluginMetadata
  is_worker_plugin?: boolean;
  execution_mode?: 'control_plane' | 'data_plane';
  worker_status?: WorkerStatus;
}
```

### 2. API Service Enhancements (`src/services/api.ts`)

Add methods for worker and task management:

```typescript
// Add to pluginService in frontend/src/services/api.ts

// Get all workers
export const getWorkers = async (): Promise<WorkersResponse> => {
  const response = await axios.get(`${API_URL}/plugins/workers`);
  return response.data;
};

// Get specific worker status
export const getWorkerStatus = async (pluginName: string): Promise<WorkerStatus> => {
  const response = await axios.get(`${API_URL}/plugins/${pluginName}/worker`);
  return response.data;
};

// Get task status
export const getTaskStatus = async (taskId: string): Promise<TaskStatus> => {
  const response = await axios.get(`${API_URL}/plugins/tasks/${taskId}`);
  return response.data;
};

// Set worker mode configuration
export const setWorkerMode = async (pluginNames: string[]): Promise<void> => {
  await axios.post(`${API_URL}/plugins/worker-mode`, {
    plugin_names: pluginNames
  });
};

// Get worker mode configuration
export const getWorkerMode = async (): Promise<WorkerModeConfig> => {
  const response = await axios.get(`${API_URL}/plugins/worker-mode`);
  return response.data;
};
```

### 3. Enhanced Health Check Response

Update the health check parsing:

```typescript
// In frontend/src/services/api.ts

export const getPluginHealth = async (): Promise<Record<string, boolean> & { workers?: Record<string, boolean> }> => {
  const response = await axios.get<{ status: string; version: string; plugins?: Record<string, boolean>; workers?: Record<string, boolean> }>(
    `${API_URL}/plugins/health`
  );
  
  return {
    ...response.data.plugins || {},
    workers: response.data.workers
  };
};
```

### 4. Hook Enhancements (`src/hooks/usePlugins.ts`)

Add worker monitoring to the existing hook:

```typescript
// Add to usePlugins hook

const [workers, setWorkers] = useState<WorkerStatus[]>([]);
const [workersLoading, setWorkersLoading] = useState(false);

// Get worker statuses
const refreshWorkers = async () => {
  setWorkersLoading(true);
  try {
    const response = await pluginService.getWorkers();
    setWorkers(response.workers);
  } catch (error) {
    console.error('Failed to fetch workers:', error);
  } finally {
    setWorkersLoading(false);
  }
};

// Get specific worker status
const getWorkerStatus = async (pluginName: string): Promise<WorkerStatus | null> => {
  try {
    return await pluginService.getWorkerStatus(pluginName);
  } catch (error) {
    console.error(`Failed to get worker status for ${pluginName}:`, error);
    return null;
  }
};

// Track task status (for long-running operations)
const trackTask = async (taskId: string, onUpdate?: (status: TaskStatus) => void): Promise<TaskStatus> => {
  return new Promise((resolve, reject) => {
