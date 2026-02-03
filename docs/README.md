# Haven Player Documentation

This directory contains architecture documentation for the Haven Player system, including a formal specification in the P programming language.

## Files

### HavenPlayer.p
A complete P language specification modeling the Haven Player distributed system.

**Contents:**
- **Event Definitions**: All inter-component communication events
- **Data Types**: Video metadata, AI analysis results, upload configurations, etc.
- **State Machines**:
  - `ElectronMainProcess`: Main Electron entry point
  - `RenderProcess`: UI state management
  - `VideoPlayer`: Playback control
  - `FastAPIServer`: Backend HTTP server
  - `PluginManager`: Plugin lifecycle with control/data plane
  - `VideoPipeline`: Main data processing pipeline
  - `VLMAnalysisWorker`: AI analysis worker
  - `UploadCoordinator`: Upload queue management
  - `ArkivSyncWorker`: Blockchain sync worker
  - `EncryptionService`: Lit Protocol encryption
  - `RecordingService`: WebRTC recording management
- **Specifications**: Safety and liveness properties
- **Test Scenarios**: Example test cases

### ARCHITECTURE.md
Human-readable architecture documentation describing:
- System component diagram
- Frontend/Backend interactions
- Data processing pipeline
- Security features
- Communication patterns

## What is P?

P is a domain-specific language for modeling and specifying asynchronous event-driven systems. It allows programmers to:

1. **Model systems as state machines**: Each component is a state machine with explicit states and transitions
2. **Specify properties**: Define safety (nothing bad happens) and liveness (something good eventually happens) properties
3. **Test scenarios**: Write test cases that exercise different system behaviors
4. **Verify correctness**: Use model checking to find bugs before implementation

### Key P Language Concepts

**Events**: Typed messages sent between state machines
```p
event e_video_ingested: VideoMetadata;
```

**State Machines**: Components with states, entry actions, and event handlers
```p
machine VideoPipeline {
    start state Idle {
        on e_video_ingested do (meta: VideoMetadata) {
            // Handle event
        }
    }
}
```

**Specifications**: Properties that must hold during execution
```p
spec DuplicatePrevention observes e_video_ingested {
    // Safety property
}
```

## Haven Player System Design

### Architecture Overview

Haven Player uses a client-server architecture with:

- **Frontend**: Electron + React application
- **Backend**: FastAPI Python server
- **Plugins**: Modular archivers for different media sources
- **Pipeline**: Async data processing with optional stages

### Data Processing Pipeline

The video pipeline is the core of Haven Player's data flow:

```
Ingest → Check Duplicate → Analyze? → Encrypt? → Upload? → Sync? → Complete
```

Each stage is optional (except Ingest and Duplicate Check), creating a flexible processing flow.

### Control/Data Plane Separation

Plugins are separated into:
- **Control Plane**: Run in main process (lightweight operations)
- **Data Plane**: Run in worker processes (heavy I/O like BitTorrent)

This isolation prevents heavy operations from blocking the main backend.

### Security Model

- **Encryption**: Client-side via Lit Protocol
- **Storage**: Encrypted keys in Electron safeStorage
- **Network**: HTTPS for all external communication
- **Access Control**: Address-based, group-based, or credential-based

## Using This Documentation

### For Developers

1. Read ARCHITECTURE.md for high-level understanding
2. Study HavenPlayer.p for detailed state machine behavior
3. Reference specific state machines when implementing features

### For Model Checking

To use P tools for verification:

```bash
# Install P compiler
npm install -g p-lang

# Compile the specification
pc HavenPlayer.p

# Run model checker
pmc HavenPlayer.p
```

Note: This is a specification model. Some implementation details may differ from the actual codebase while maintaining the same behavioral properties.

## Key Design Patterns

### 1. Event-Driven Architecture
All components communicate via events, enabling:
- Loose coupling
- Async processing
- Easy testing

### 2. State Machine Pattern
Each component has explicit states:
- Prevents invalid state transitions
- Makes behavior predictable
- Enables formal verification

### 3. Pipeline Pattern
Data flows through sequential stages:
- Each stage is independent
- Stages can be skipped based on configuration
- Error handling at each stage

### 4. Worker Pattern
Background tasks use dedicated workers:
- VLMAnalysisWorker for AI processing
- ArkivSyncWorker for blockchain sync
- PluginWorkerProcess for isolated plugins

## Interactions Between Frontend and Backend

### Starting the Backend
```
Frontend IPC (start-backend) → ElectronMainProcess → Spawn Python → FastAPIServer
                                                            ↓
                                              Health Check Polling
                                                            ↓
                                              e_backend_ready → Frontend
```

### Uploading a Video
```
User selects video → Frontend HTTP POST /api/videos → Backend
                                                        ↓
                                        VideoPipeline: Ingest → Check Duplicate
                                                        ↓
                                        VLMAnalysisWorker (optional)
                                                        ↓
                                        EncryptionService (optional)
                                                        ↇ
                                        UploadCoordinator → Filecoin
                                                        ↓
                                        ArkivSyncWorker (optional)
                                                        ↓
                                        WebSocket/HTTP progress → Frontend
```

### Plugin Execution
```
Frontend HTTP POST /api/plugins/execute → FastAPIServer
                                                        ↓
                                        PluginManager routes to:
                                            - Control plane: direct execution
                                            - Data plane: worker process
                                                        ↓
                                        Result → Frontend
```

## Contributing

When adding features:

1. Update the P specification to model new behavior
2. Add safety/liveness properties for critical invariants
3. Update this documentation with design decisions
4. Ensure frontend-backend interactions are documented

## References

- [P Language Documentation](http://p-org.github.io/P/)
- [P GitHub Repository](https://github.com/p-org/P)
- [Haven Player README](../README.md)
