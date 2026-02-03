# Haven Player Architecture Documentation

## Overview

Haven Player is a distributed video management application with a modern architecture separating frontend, backend, and data processing pipelines. This document describes the system using the P programming language model as a formal specification.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ELECTRON FRONTEND                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ ElectronMain │  │  Renderer    │  │ VideoPlayer  │  │   UI Components  │ │
│  │   Process    │  │   Process    │  │              │  │                  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ IPC / HTTP
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FASTAPI BACKEND                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ FastAPI      │  │   Plugin     │  │    Job       │  │  Upload          │ │
│  │   Server     │  │   Manager    │  │  Scheduler   │  │  Coordinator     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   VLM        │  │    Arkiv     │  │  Recording   │  │   Encryption     │ │
│  │   Worker     │  │    Worker    │  │   Service    │  │    Service       │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Control/Data Plane
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PLUGIN WORKERS                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  YouTube Plugin  │  │ BitTorrent Plugin│  │     OpenRing Plugin      │   │
│  │  (Data Plane)    │  │   (Data Plane)   │  │     (Control Plane)      │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Storage / Network
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Filecoin   │  │    Arkiv     │  │     Lit      │  │      IPFS        │ │
│  │   Network    │  │   Network    │  │   Protocol   │  │    Gateway       │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Frontend Components

### ElectronMainProcess
- **Purpose**: Main entry point for the Electron application
- **Responsibilities**:
  - Backend lifecycle management (start/stop/restart)
  - IPC handler registration (30+ handlers)
  - Memory monitoring
  - Python process spawning
- **States**: Init → Idle → BackendStarting → BackendRunning

### RenderProcess
- **Purpose**: Manages renderer window and UI state
- **Views**: VideoGridView, VideoPlayerView
- **Responsibilities**: Video list display, upload progress, health monitoring

### VideoPlayer
- **Purpose**: Video playback and timeline management
- **Features**: AI timestamp navigation, playback control

## Backend Components

### FastAPIServer
- **Purpose**: Main HTTP server and service coordinator
- **Routes**: /api/videos, /api/plugins, /api/recording, /api/health, etc.
- **Services**: Database, PluginManager, JobScheduler, UploadCoordinator

### PluginManager
- **Architecture**: Control Plane / Data Plane separation
- **Worker Plugins**: YouTubePlugin, BitTorrentPlugin (isolated processes)
- **Control Plane**: OpenRingPlugin (in-process)

### JobScheduler
- **Purpose**: Cron-like recurring job execution
- **Features**: Plugin discovery scheduling, auto-archive rules

## Data Processing Pipeline

### Pipeline Stages
1. **Ingest** → Check Duplicate (pHash)
2. **Analysis** → VLM Worker (optional)
3. **Encryption** → Lit Protocol (optional)
4. **Upload** → Filecoin Network (optional)
5. **Sync** → Arkiv Blockchain (optional)

### Key Workers

**VLMAnalysisWorker**
- Background AI video analysis
- Frame sampling and tag detection
- Timestamp generation

**UploadCoordinator**
- Queue-based upload management
- VLM integration before upload
- Retry logic and progress tracking

**ArkivSyncWorker**
- Blockchain metadata sync
- Deduplication via CID hash
- Configurable expiration

**EncryptionService**
- Client-side encryption (Lit Protocol)
- Access control conditions
- Threshold cryptography

## Frontend-Backend Interaction

### IPC Handlers (Electron)
- select-video: File dialog
- start-backend / stop-backend / restart-backend
- upload-to-filecoin: Direct upload from renderer
- get-filecoin-config / save-filecoin-config: Encrypted storage
- decrypt-text-with-lit: Decryption via main process

### HTTP API
- GET /api/videos: List videos
- POST /api/videos: Create video entry
- POST /api/plugins/execute: Run plugin operations
- GET /api/health: System health status

## Security Features

### Encryption
- **Lit Protocol**: Threshold encryption for access control
- **Client-side**: Encryption before any network transmission
- **Access Policies**: Address-based, group membership, credentials

### Storage
- **Encrypted Private Keys**: Electron safeStorage
- **Environment Variables**: Backend configuration
- **IPFS**: Ciphertext storage (not in database)

## Data Flow Examples

### Video Ingestion Flow
```
User selects video → Frontend IPC → Backend API → Database
                                            ↓
                              Plugin (if applicable)
                                            ↓
                              VideoPipeline → pHash check
                                            ↓
                              VLM Analysis (optional)
                                            ↓
                              Encryption (optional)
                                            ↓
                              Filecoin Upload (optional)
                                            ↓
                              Arkiv Sync (optional)
                                            ↓
                              Frontend notification
```

### Live Recording Flow
```
WebRTC source → RecordingService → Chunk processing (30s)
                                            ↓
                              VideoPipeline for each chunk
                                            ↓
                              Analysis/Upload/Sync
```

### Restore Flow
```
Arkiv query → Fetch entities → Download from IPFS
                                            ↓
                              Decrypt (if encrypted)
                                            ↓
                              Recalculate metadata
                                            ↓
                              Restore to database
```

## Specifications in P Language

The P specification in HavenPlayer.p includes:

### State Machines
- Frontend: ElectronMainProcess, RenderProcess, VideoPlayer
- Backend: FastAPIServer, PluginManager, PluginWorkerProcess
- Pipeline: VideoPipeline, VLMAnalysisWorker, UploadCoordinator
- Services: ArkivSyncWorker, EncryptionService, FilecoinService

### Safety Properties
- DuplicatePrevention: Ensures pHash-based deduplication
- EncryptionOrdering: Upload only after encryption completes
- WorkerIsolation: Data plane plugins run in separate processes

### Liveness Properties
- PipelineCompletion: Videos eventually complete the pipeline

### Test Scenarios
- BasicIngestionScenario: Standard video flow
- EncryptedUploadScenario: Full pipeline with encryption
- PluginWorkerIsolationScenario: Control/data plane separation
- DuplicateDetectionScenario: Deduplication verification
