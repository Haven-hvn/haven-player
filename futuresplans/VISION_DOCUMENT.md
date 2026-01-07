# Haven Player: Next-Generation DePIN Media Archiver
## Strategic Vision Document

**Version:** 1.0  
**Date:** January 2026  
**Status:** DRAFT

---

## Executive Summary

This document outlines the strategic vision for transforming Haven Player from a functional LiveKit recording prototype into a globally distributed, plugin-powered Decentralized Physical Infrastructure Network (DePIN) for media archiving. The proposed architecture supports heterogeneous media sources (WebRTC, BitTorrent, YouTube, IPTV, HTTP streaming) through a unified abstract interface, enabling a worldwide network of autonomous nodes to archive, process, and preserve digital media infrastructure.

### Key Objectives
1. **Extensibility:** Support unlimited media source types through a plugin ecosystem
2. **Decentralization:** Enable true peer-to-peer operation with node autonomy
3. **Resilience:** Gracefully handle node churn, network partitions, and partial failures
4. **Observability:** Provide comprehensive visibility into distributed operations
5. **Resource Efficiency:** Optimize for heterogeneous hardware profiles

---

## 1. Current State Analysis

### 1.1 Existing Architecture
The current Haven Player implementation is a **monolithic FastAPI application** with the following characteristics:

**Strengths:**
- Functional WebRTC recording via LiveKit SDK
- Clean service layer (StreamManager, RecordingService, LiveSessionService)
- Filecoin integration for long-term storage
- Arkiv SDK for metadata synchronization
- Basic DePIN tick mechanism for automated recording decisions

**Limitations:**
- **Monolithic Design:** All functionality tightly coupled in single FastAPI app
- **Single Media Source:** Only supports PumpFun (via LiveKit WebRTC)
- **Centralized Decision Making:** DePIN tick runs on single node, not distributed
- **No Plugin System:** Adding new media sources requires core code changes
- **State Management:** Local state only; no distributed coordination
- **Resource Allocation:** No scheduling framework; plugins manage their own resources
- **Isolation:** Plugins would run in same process as core (security risk)

### 1.2 Current Service Patterns

The codebase demonstrates several patterns worth preserving or evolving:

**Positive Patterns:**
```
StreamManager (Singleton) 
  ├── Manages shared WebRTC connections
  ├── Avoids duplicate connections
  └── Handles connection lifecycle

ParticipantRecorderWrapper
  ├── Wraps third-party SDK (LiveKit)
  ├── Adds state machine (DISCONNECTED → RECORDING → STOPPED)
  ├── Implements health checking
  └── Handles resource cleanup
```

**Patterns requiring evolution:**
- Service initialization: Currently manual startup, needs distributed orchestration
- State persistence: Local database only, needs distributed consensus
- Error handling: Local logging only, needs network-wide visibility
- Resource management: No limits enforced, needs global scheduling

---

## 2. Architectural Paradigm: Microkernel with Distributed Services

### 2.1 Core Recommendation: Microkernel Architecture

**Decision:** Pivot from monolithic **to** microkernel architecture with distributed microservices.

**Rationale:**
1. **DePIN Alignment:** Microkernel's small, privileged core maps naturally to network orchestration
2. **Plugin Safety:** Plugins run in isolated contexts (containers/WASM), cannot compromise node
3. **Network Resilience:** Services can fail independently; network continues operating
4. **Heterogeneous Hardware:** Different services can target different node capabilities
5. **Evolutionary Path:** Allows gradual migration; existing code becomes initial plugins

### 2.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEPIN NETWORK                             │
│                    (Global Coordination Layer)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
│  (High Perf)    │  │   (Storage)     │  │   (Gateway)     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌────────────────────────────────────────────────────────────────┐
│                      MICROKERNEL CORE                           │
│  • Node Discovery & Gossip                                      │
│  • Distributed Consensus (Leader Election)                      │
│  • Global State Replication                                     │
│  • Resource Accounting                                          │
│  • Plugin Lifecycle Manager                                     │
│  • Task Scheduler (Distributed)                                 │
│  • Health Monitoring & Heartbeats                               │
└────────────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    ▼         ▼          ▼         ▼          ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│WebRTC  │ │YouTube │ │Bittorent│ │ IPTV   │ │HTTP    │ │Custom  │
│Plugin  │ │Plugin  │ │Plugin   │ │ Plugin │ │Plugin  │ │Plugin  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
  (WASM)    (WASM)     (WASM)     (WASM)     (WASM)     (WASM)
```

### 2.3 Core Components

#### 2.3.1 Microkernel (The "Orchestrator")

**Responsibilities:**
- **Node Discovery:** Gossip protocol to discover network peers
- **Leader Election:** Raft-based consensus for distributed decisions
- **Global State:** Replicated state machine (Node Registry, Task Queue, Plugin Catalog)
- **Resource Accounting:** Track CPU, memory, bandwidth, storage per node
- **Plugin Lifecycle:** Install, update, health-check, isolate plugins
- **Task Scheduling:** Assign tasks to nodes based on capacity and locality
- **Failure Recovery:** Detect node failures, redistribute tasks

**Implementation Notes:**
- Must be lightweight (< 100MB memory footprint)
- Written in Rust for performance and safety (or Go for development velocity)
- Uses libp2p for peer-to-peer networking
- Uses etcd/Consul for distributed coordination (or custom Raft)

#### 2.3.2 Plugin Runtime (The "Executor")

**Responsibilities:**
- **Sandboxing:** Execute plugins in isolated environments
- **Resource Limits:** Enforce CPU, memory, network quotas
- **Lifecycle Management:** Start, stop, monitor plugin processes
- **IPC Bridge:** Facilitate communication between Core and Plugin

**Execution Models:**

| Model | Isolation | Performance | Use Case |
|-------|-----------|-------------|----------|
| **Same Process** | None | ⭐⭐⭐⭐⭐ | Trusted, low-latency operations (current StreamManager pattern) |
| **Container (Docker)** | Process + Filesystem | ⭐⭐⭐⭐ | General use; third-party plugins |
| **WebAssembly (WASI)** | Sandboxed byte code | ⭐⭐⭐ | Browser plugins, portable logic |
| **Process Isolation** | Process only | ⭐⭐⭐⭐ | Legacy code, heavy SDKs |

**Recommendation:** Start with **Container isolation** for plugins, support **WASM** for future web-first plugins.

#### 2.3.3 State Layer (The "Truth")

**Responsibilities:**
- **Distributed Storage:** Replicate critical state across nodes
- **Event Sourcing:** Log all state changes for auditability
- **Conflict Resolution:** Handle concurrent updates
- **Snapshots:** Periodic state snapshots for fast recovery

**State Categories:**

1. **Global State (Network-wide)**
   - Node Registry (ID, capabilities, health status)
   - Task Queue (pending, in-progress, completed)
   - Plugin Catalog (versions, manifests, signatures)
   - Media Index (catalog of archived media)

2. **Node State (Local, replicated)**
   - Active plugin instances
   - Resource utilization metrics
   - Local task execution history
   - Hardware profile

3. **Plugin State (Plugin-managed)**
   - Subscriptions (e.g., YouTube channels)
   - Download queues (e.g., BitTorrent seed states)
   - Processing pipelines (e.g., transcoding, thumbnail generation)

**Implementation:** Use **CRDTs (Conflict-Free Replicated Data Types)** for state replication to avoid single point of failure.

---

## 3. Plugin Model & Interface Design

### 3.1 Abstract Plugin Contract

Every plugin must implement the **ArchiverPlugin** interface:

```rust
// Pseudocode (would be language-agnostic)

trait ArchiverPlugin {
    // Plugin metadata
    fn metadata(&self) -> PluginMetadata;
    
    // Lifecycle hooks
    async fn initialize(&mut self, config: PluginConfig) -> Result<(), PluginError>;
    async fn start(&mut self) -> Result<(), PluginError>;
    async fn stop(&mut self) -> Result<(), PluginError>;
    async fn health_check(&mut self) -> HealthStatus;
    
    // Core functionality
    async fn discover_sources(&mut self) -> Result<Vec<MediaSource>, PluginError>;
    async fn archive(&mut self, source: MediaSource) -> ArchiveResult;
    
    // State management (persistence)
    async fn save_state(&mut self, state: StateSnapshot) -> Result<(), PluginError>;
    async fn load_state(&mut self) -> Result<StateSnapshot, PluginError>;
    
    // Observability
    async fn get_metrics(&mut self) -> Metrics;
}
```

### 3.2 Media Source Abstraction

All media sources are unified through a common interface:

```rust
struct MediaSource {
    source_id: String,              // Unique identifier (YouTube channel, magnet link, etc.)
    source_type: SourceType,        // Enum: WEBRTC, YOUTUBE, BITTORRENT, IPTV, HTTP, CUSTOM
    uri: String,                    // Source URI (URL, magnet link, etc.)
    metadata: SourceMetadata,       // Type-specific metadata (title, quality, etc.)
    priority: Priority,             // Scheduling priority (CRITICAL, HIGH, NORMAL, LOW)
    estimated_size: Option<u64>,    // Estimated download size (bytes)
    estimated_duration: Option<Duration>, // Estimated duration (for streams)
}

enum SourceType {
    WebRTC { room_name: String, participant_id: String },
    YouTube { channel_id: String, video_id: Option<String> },
    BitTorrent { magnet_link: String, info_hash: Vec<u8> },
    IPTV { stream_url: String, provider: String },
    HTTP { url: String, headers: HashMap<String, String> },
    Custom { plugin_name: String, custom_data: HashMap<String, String> },
}
```

### 3.3 Plugin Communication Architecture

```
┌──────────────────┐         IPC/GRPC          ┌──────────────────┐
│   MICROKERNEL    │ ◄─────────────────────► │   PLUGIN RUNTIME │
│     CORE         │                          │   (Sandbox)      │
└──────────────────┘                          └──────────────────┘
         │                                            │
         │                                            │
         ▼                                            ▼
┌──────────────────┐                          ┌──────────────────┐
│  PLUGIN MANAGER  │                          │  PLUGIN INSTANCE │
│                  │                          │   (e.g., YouTube)│
│  - Load Plugin   │                          └──────────────────┘
│  - Spawn Process │                                    │
│  - IPC Bridge    │                                    │
│  - Resource Lims │                                    ▼
└──────────────────┘                          ┌──────────────────┐
                                            │   PLUGIN SDK     │
                                            │                  │
                                            │  - State Store   │
                                            │  - Logger        │
                                            │  - Metrics       │
                                            │  - HTTP Client   │
                                            └──────────────────┘
```

### 3.4 Plugin Safety & Isolation

**Security Guarantees:**
1. **Sandboxed Filesystem:** Plugins only see their designated directory
2. **Network Firewall:** Plugins can only access whitelisted domains (configurable)
3. **Resource Caps:** CPU quotas, memory limits, I/O throttling
4. **Signature Verification:** Plugins must be cryptographically signed
5. **Capability-Based Security:** Plugins request capabilities; Core grants based on trust

**Implementation:** Use **gVisor** or **Firecracker** for strong isolation, or **Docker** for moderate isolation with better tooling.

---

## 4. State, Scheduling, and the Job System

### 4.1 The Challenge: Persistent State in Distributed Systems

#### Scenario A: YouTube Plugin Channel Subscriptions

**Current Approach (Local-Only):**
- Plugin stores subscriptions in local SQLite database
- Node restart → subscriptions lost unless backed up manually
- No coordination between nodes (multiple nodes might subscribe to same channels)
- No global view of which subscriptions are active across network

**Proposed Approaches:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Local State + Periodic Sync** | Simple, works offline | Stale data, conflicts, eventual consistency only | ❌ Not for critical state |
| **Distributed KV Store (etcd)** | Strong consistency, watch API | Single cluster (SPOF), complex setup | ⚠️ Good for control plane |
| **CRDT-based Replication** | Conflict-free, offline-first, eventual consistency | Requires careful conflict resolution | ✅ **Recommended** |
| **State Sharding by Plugin** | Scales well, isolated failures | Cross-plugin coordination hard | ⚠️ Use with CRDTs |

**Recommended Solution: CRDT-Based State Replication**

```
┌─────────────────────────────────────────────────────────────┐
│                   DISTRIBUTED STATE LAYER                    │
│                   (CRDT Implementation)                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ NODE ALPHA    │    │ NODE BETA     │    │ NODE GAMMA    │
│               │    │               │    │               │
│ • CRDT Replica │    │ • CRDT Replica │    │ • CRDT Replica │
│ • YouTube     │    │ • YouTube     │    │ • BitTorrent   │
│   Subs G-Map  │    │   Subs G-Map  │    │   Queue LWW-   │
│ • BitTorrent  │    │ • BitTorrent  │    │   Element Reg  │
│   Queue...   │    │   Queue...   │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌───────────────┐
                    │ GOSSIP PROTOCOL│
                    │ (Anti-Entropy) │
                    └───────────────┘
```

**Why CRDTs?**
- **Conflict-Free:** No need for distributed transactions
- **Offline-First:** Nodes continue operating during network partitions
- **Eventual Consistency:** State converges when nodes reconnect
- **Scalable:** No central coordinator

**CRDT Types by Use Case:**
- **G-Counter (Grow-Only Counter):** Tasks completed, bytes downloaded
- **PN-Counter (Positive-Negative Counter):** Active connections
- **LWW-Register (Last-Write-Wins):** Plugin state snapshots
- **OR-Map (Observed-Remove Map):** Media catalog (supports deletions)
- **G-Map (Grow-Only Map):** Plugin configurations

**YouTube Plugin Example:**
```rust
// G-Map: Channel ID → Subscription State
struct YouTubeSubscriptions(GMap<ChannelId, SubscriptionState>);

// Add subscription (merge-based, idempotent)
plugin_state.subscriptions.insert(channel_id, SubscriptionState {
    subscribed_at: now(),
    auto_archive: true,
    quality: "1080p".to_string(),
    last_check: now(),
});

// Node restart: Load from persistent CRDT snapshot
let state = crdt_store.load::<YouTubeSubscriptions>();
plugin.initialize(state);

// Multi-node scenario: Both nodes add same subscription
// → CRDT merge deduplicates automatically
```

#### Scenario B: BitTorrent Plugin Distributed Scanning

**Challenge:** How to efficiently scan web pages for magnet links without exhausting node resources?

**Current Approach (Local-Only):**
- Plugin crawls pages sequentially
- No resource management → can saturate network/CPU
- No coordination → multiple nodes crawl same pages
- No progress tracking → wasted resources on re-scans

**Proposed Solution: Distributed Task Queue with Work Stealing**

```
┌─────────────────────────────────────────────────────────────┐
│                  GLOBAL TASK QUEUE (CRDT)                    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│   TASK SHARD  │                           │   TASK SHARD  │
│   A (URLs     │                           │   B (URLs     │
│   0-999999)   │                           │   1000000-    │
│               │                           │   1999999)    │
└───────┬───────┘                           └───────┬───────┘
        │                                           │
        │ ASSIGNED                                   │ ASSIGNED
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│ NODE ALPHA    │                           │ NODE BETA     │
│ (High BW)     │                           │ (Storage)     │
│               │                           │               │
│ • BitTorrent  │                           │ • BitTorrent  │
│   Plugin      │                           │   Plugin      │
│ • Scanning 100│                           │ • Scanning    │
│   URLs/sec    │                           │   50 URLs/sec │
│ • Reporting   │                           │ • Reporting   │
│   progress    │                           │   progress    │
│   to CRDT     │                           │   to CRDT     │
└───────────────┘                           └───────────────┘
        │                                           │
        │ WORK STEALING                             │ WORK STEALING
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│ IF FINISHED:  │                           │ IF FINISHED:  │
│ CLAIM NEXT    │                           │ CLAIM NEXT    │
│ TASK FROM     │                           │ TASK FROM     │
│ SHARD B       │                           │ SHARD A       │
└───────────────┘                           └───────────────┘
```

**Optimization Strategies:**

1. **URL Sharding by Hash:** Distribute URLs across nodes using consistent hashing (minimizes rescheduling on node churn)

2. **Progress Tracking:** CRDT tracks which URLs have been scanned:
   ```rust
   struct ScannedUrls(GMap<UrlHash, ScanTimestamp>);
   ```

3. **Rate Limiting:** Each plugin instance enforces local rate limits (e.g., 100 requests/sec)

4. **Exponential Backoff:** On 429 errors, increase backoff exponentially (with random jitter)

5. **Deduplication:** Store magnet links in global set to avoid re-processing:
   ```rust
   struct MagnetLinks(GSet<MagnetHash>);
   ```

6. **Work Stealing:** When a node completes its shard, it claims work from underloaded nodes

### 4.2 Scheduling Paradigm: Centralized vs. Decentralized

#### Option 1: Centralized Task Scheduler

**Design:**
- Core maintains global task queue
- Scheduler assigns tasks to nodes based on:
  - Resource availability (CPU, memory, bandwidth)
  - Locality (e.g., node on same continent as stream server)
  - Affinity (e.g., node with GPU for transcoding)
  - Priority (critical tasks get first pick)

**Pros:**
- Global optimization (no wasted resources)
- Fair allocation (nodes get balanced load)
- Priority enforcement (critical tasks always run)

**Cons:**
- Single point of failure (requires replicated scheduler via Raft)
- Scalability bottleneck (scheduler must know all state)
- Network latency (round-trip for each task assignment)

**Implementation:** Use **Kubernetes-style scheduler** adapted for DePIN:
- Leader-elected scheduler (via Raft)
- Node resources advertised via CRDT
- Tasks scheduled via "optimistic locking" (avoid starvation)

#### Option 2: Decentralized/Autonomous Plugins

**Design:**
- Plugins manage their own scheduling (cron jobs, event-driven)
- Core provides resource limits only (enforces caps)
- Plugins compete for resources (free-for-all)

**Pros:**
- Simple (no complex scheduler logic)
- Resilient (no SPOF)
- Fast (no coordination overhead)

**Cons:**
- Resource starvation (no fairness)
- No global optimization (inefficient resource usage)
- Difficult to prioritize (critical tasks blocked by greedy plugins)

**Scenario:** YouTube set to auto-check every 5 minutes, BitTorrent set to max-bandwidth crawl. Result: BitTorrent saturates network, YouTube misses streams.

**Not recommended** for production DePIN network.

#### Option 3: Hybrid: Centralized Coordination + Local Autonomy

**Recommended Approach**

**Design:**
- **Core Responsibilities:**
  - Global task queue (CRDT-based)
  - Resource accounting (what's available on each node)
  - Priority enforcement (critical tasks get slots)
  - Fair allocation (anti-starvation mechanisms)

- **Plugin Responsibilities:**
  - Local execution (run tasks from queue)
  - Resource accounting (report usage)
  - Backpressure (slow down if overwhelmed)
  - Local optimization (reorder tasks for efficiency)

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                  CORE: TASK ORCHESTRATOR                   │
│  • Global Task Queue (CRDT)                                 │
│  • Node Resource Tracker                                    │
│  • Priority Scheduler (Weighted Fair Queuing)               │
│  • Anti-Starvation Monitor                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  TASK ALLOCATION LOGIC                      │
│                                                              │
│  FOR EACH TASK IN QUEUE (ORDERED BY PRIORITY):              │
│    1. Check task requirements (CPU, memory, bandwidth)      │
│    2. Find eligible nodes (sufficient resources)            │
│    3. Pick node with:                                       │
│       - Lowest current load                                │
│       - Best locality (network proximity)                   │
│       - Plugin affinity (node has plugin installed)         │
│    4. Assign task (write to node's task CRDT)               │
│    5. Set timeout (if task fails, reassign)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    NODE: TASK EXECUTER                      │
│  • Watch local task CRDT for new assignments                │
│  • Execute tasks when resources available                   │
│  • Report progress (heartbeat to core)                      │
│  • Enforce local backpressure (slow down if overloaded)     │
└─────────────────────────────────────────────────────────────┘
```

**Example: Resource Allocation**

```rust
// Node advertises resources (CRDT)
struct NodeResources {
    cpu_cores: u8,
    memory_gb: u16,
    bandwidth_mbps: u32,
    storage_gb: u32,
    plugins_installed: Vec<PluginId>,
};

// Task declares requirements
struct TaskRequirements {
    plugin_id: PluginId,
    cpu_min: u8,           // Minimum CPU cores
    memory_min_mb: u32,    // Minimum memory
    bandwidth_min_mbps: u32, // Minimum bandwidth
    priority: Priority,
    deadline: Option<DateTime>,  // Optional deadline
};

// Scheduler assignment logic (pseudocode)
fn assign_task(task: Task, nodes: Vec<Node>) -> Option<NodeId> {
    let eligible: Vec<Node> = nodes
        .filter(|n| n.has_plugin(&task.plugin_id))
        .filter(|n| n.resources.cpu >= task.cpu_min)
        .filter(|n| n.resources.memory >= task.memory_min)
        .filter(|n| n.resources.bandwidth >= task.bandwidth_min)
        .filter(|n| !n.is_overloaded())
        .collect();
    
    // Sort by: (1) load (ascending), (2) locality (network latency)
    eligible.sort_by_key(|n| (n.load(), n.network_latency()));
    
    eligible.first().map(|n| n.id)
}
```

**Anti-Starvation Mechanisms:**

1. **Weighted Fair Queuing:** Each priority class gets guaranteed CPU/bandwidth share
2. **Age-Based Boost:** Low-priority tasks that wait too long get temporary priority bump
3. **Preemption:** High-priority tasks can preempt low-priority (if feasible)
4. **Deadlines:** Tasks with approaching deadlines get prioritized

**Resource Starvation Detection:**

```rust
// Monitor for resource starvation (runs every minute)
async fn detect_starvation() {
    for node in nodes {
        if node.current_tasks > 10 {
            // Node has too many tasks → redistribute
            redistribute_tasks(node);
        }
        
        if node.cpu_usage > 95% {
            // Node CPU bound → throttle new task assignments
            throttle_node(node);
        }
        
        if node.bandwidth_usage > 95% {
            // Node network bound → throttle bandwidth-intensive plugins
            throttle_plugin(node, "bittorrent");
        }
    }
}
```

**Observability & Monitoring:**

Core provides global dashboard showing:
- Node health (last heartbeat, resource usage)
- Task queue depth (by priority)
- Plugin performance (tasks completed, failures)
- Network throughput (total bandwidth)
- Geographic distribution (map of nodes)

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Months 1-3)
**Goal:** Extract microkernel core from existing monolith

**Deliverables:**
1. **Microkernel Core (Rust/Go)**
   - Node discovery (gossip protocol)
   - Basic health monitoring (heartbeats)
   - Plugin runtime manager (Docker container support)
   - IPC bridge (gRPC communication)
   - Local state persistence (CRDT library integration)

2. **Plugin SDK (initial)**
   - Rust SDK for plugin development
   - Hello World plugin (echo server)
   - State management interface (CRDT persistence)
   - Logging and metrics integration

3. **Migration of Existing Services to Plugins**
   - WebRTC plugin (from webrtc_recording_service.py)
   - PumpFun plugin (from pumpfun_service.py)
   - Arkiv sync plugin (from arkiv_sync.py)

**Success Criteria:**
- Microkernel boots and manages plugins
- Existing functionality preserved (no regression)
- Plugins run in isolated containers
- Basic monitoring dashboard operational

### Phase 2: Distributed Coordination (Months 4-6)
**Goal:** Enable multi-node operation with global state

**Deliverables:**
1. **Distributed State Layer**
   - CRDT implementation (use existing library: Automerge or Yjs)
   - Gossip protocol for anti-entropy
   - Snapshot/restore mechanism
   - Conflict resolution policies

2. **Global Resource Tracking**
   - Node registry (capabilities, health status)
   - Resource accounting (CPU, memory, bandwidth)
   - Geographic location mapping

3. **Leader Election**
   - Raft implementation (or etcd integration)
   - Leader failover testing
   - Split-brain prevention

**Success Criteria:**
- Multiple nodes can join network
- State replicates automatically
- Leader failover works (no data loss)
- Network partitions handled gracefully

### Phase 3: Task Scheduling (Months 7-9)
**Goal:** Implement global task scheduler

**Deliverables:**
1. **Task Queue**
   - Global task queue (CRDT-based)
   - Priority-based ordering
   - Task lifecycle (pending → assigned → in-progress → completed/failed)

2. **Scheduler**
   - Resource-aware assignment logic
   - Fair allocation algorithm
   - Anti-starvation mechanisms
   - Work stealing for load balancing

3. **Plugin Scheduler Integration**
   - Plugins subscribe to task topics
   - Automatic task execution
   - Progress reporting
   - Failure handling (retry/backoff)

**Success Criteria:**
- Tasks distribute across nodes automatically
- Resource starvation prevented
- Critical tasks get priority
- Failed tasks reassign automatically

### Phase 4: Plugin Ecosystem (Months 10-12)
**Goal:** Expand plugin library

**Deliverables:**
1. **New Plugins**
   - YouTube plugin (channel subscriptions, live streams, VODs)
   - BitTorrent plugin (magnet link discovery, seeding)
   - IPTV plugin (m3u playlist parsing, stream archiving)
   - HTTP plugin (progressive download, resumable transfers)

2. **Plugin SDK Enhancements**
   - WASM support (browser plugins)
   - Multi-language bindings (Python, Go, JavaScript)
   - Plugin marketplace (manifest, signatures, updates)

3. **Plugin Sandbox Hardening**
   - gVisor/Firecracker integration for strong isolation
   - Network filtering (domain whitelisting)
   - Signature verification

**Success Criteria:**
- 6+ production-ready plugins
- Plugin marketplace operational
- Third-party plugins installable
- Security audit passed

### Phase 5: Advanced Features (Months 13-15)
**Goal:** Production-hardening

**Deliverables:**
1. **Observability Stack**
   - Distributed tracing (OpenTelemetry)
   - Metrics aggregation (Prometheus)
   - Log aggregation (ELK stack)
   - Alerting (PagerDuty integration)

2. **Data Plane Optimization**
   - P2P file transfers (Bittorrent integration for large files)
   - Content-addressed storage (IPFS integration)
   - Distributed encoding (chunk-based transcoding)

3. **Incentivization Layer**
   - Proof-of-Work (PoW) for task completion
   - Token rewards for node operators
   - Reputation system (node reliability scoring)

**Success Criteria:**
- Full monitoring dashboard
- 99.9% uptime target
- 100+ node network operational
- Token distribution mechanism tested

---

## 6. Risk Analysis & Mitigation

### 6.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **CRDT divergence** | High | Medium | Regular snapshots, conflict resolution policies, testing under chaos |
| **Plugin isolation breach** | Critical | Low | Use gVisor/Firecracker, regular security audits, signed plugins only |
| **Scheduler bottleneck** | High | Medium | Sharded scheduling, hierarchical schedulers, fallback to local autonomy |
| **Network partitions** | High | High | CRDTs for offline-first, anti-entropy on reconnection, leader election |
| **Resource exhaustion** | Medium | High | Hard resource caps, admission control, overprovision monitoring |

### 6.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Node operator churn** | Medium | High | Graceful shutdown protocol, task redistribution, reputation system |
| **Plugin bugs causing cascading failures** | High | Medium | Circuit breakers, rate limits, per-plugin isolation, canary deployments |
| **Data corruption** | Critical | Low | Content-addressed storage, checksums, redundancy (erasure coding) |
| **Insufficient incentives** | High | Medium | Token rewards, reputation bonuses, leaderboard visibility |

### 6.3 Strategic Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Development velocity too slow** | Medium | Medium | Incremental migration, parallel plugin development, use existing libraries |
| **Complexity becomes unmanageable** | High | Medium | Modular design, clear interfaces, automated testing,documentation |
| **Competitor releases similar system** | Low | Low | Open-source community building, first-mover advantage, network effects |

---

## 7. Success Metrics

### 7.1 Technical Metrics
- **Uptime:** 99.9% target (8.76 hours downtime/year)
- **Task Success Rate:** 99.5% of tasks complete successfully
- **Resource Utilization:** 80% average across nodes (not under- or over-provisioned)
- **State Convergence:** < 30 seconds for CRDT sync after partition
- **Scheduling Latency:** < 5 seconds from task submission to assignment

### 7.2 Network Metrics
- **Node Count:** 100+ nodes in production network
- **Geographic Distribution:** Nodes in 20+ countries
- **Plugin Diversity:** 10+ plugin types in active use
- **Throughput:** 10 TB/day archived

### 7.3 Community Metrics
- **Plugin Contributors:** 50+ third-party plugins developed
- **Plugin Marketplace:** 100+ plugins available
- **Node Operators:** 200+ independent operators
- **Active Users:** 10,000+ end users

---

## 8. Conclusion

The proposed microkernel architecture with distributed services provides a robust foundation for a next-generation DePIN media archiver. By extracting a minimal, privileged core and delegating all media-specific logic to sandboxed plugins, we achieve:

1. **Extensibility:** New media sources plugins without core changes
2. **Decentralization:** True peer-to-peer operation with global coordination
3. **Resilience:** Graceful degradation under failure
4. **Observability:** Full visibility into distributed operations
5. **Resource Efficiency:** Fair allocation across heterogeneous hardware

The CRDT-based state layer enables offline-first operation with eventual consistency, critical for a distributed network where nodes may experience connectivity issues. The hybrid scheduling approach balances global optimization with local autonomy, preventing resource starvation while maintaining responsiveness.

The 15-month implementation roadmap provides a clear path from the current monolith to the vision architecture, with incremental deliverables that provide immediate value while building toward the long-term goal.

---

## Appendices

### Appendix A: Technology Stack Recommendations

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| **Core Language** | Rust | Performance, safety, async ecosystem |
| **Plugin SDK** | Rust + WASM support | Language flexibility, portability |
| **Networking** | libp2p | Mature P2P library, WebRTC support |
| **Consensus** | Raft (custom) | Simplicity, no external dependency |
| **State** | Automerge (CRDT library) | Battle-tested, multi-language support |
| **Scheduling** | Custom (Kubernetes-inspired) | Tailored to DePIN requirements |
| **Container Runtime** | Docker with gVisor | Balance of security and usability |
| **Observability** | OpenTelemetry | Industry standard, vendor-neutral |
| **Storage** | IPFS + Filecoin | Content-addressed, decentralized |

### Appendix B: Existing Code Migration Strategy

**Step 1: Interface Extraction**
- Define plugin interfaces (ArchiverPlugin trait)
- Create shim layer to call existing services

**Step 2: Service Porting**
- Port webrtc_recording_service.py to WebRTC Plugin (Rust)
- Port pumpfun_service.py to PumpFun Plugin (Rust)
- Port arkiv_sync.py to Arkiv Plugin (Rust)

**Step 3: Integration**
- Wire plugins into microkernel core
- Test against existing FastAPI frontend
- Gradual switchover (canary deployment)

**Step 4: Cleanup**
- Remove monolithic FastAPI app (or keep for legacy compatibility)
- Deprecate old API endpoints

### Appendix C: Glossary

| Term | Definition |
|------|------------|
| **CRDT** | Conflict-Free Replicated Data Type; data structure that can be replicated across nodes and converge to the same state without coordination |
| **DePIN** | Decentralized Physical Infrastructure Network; peer-to-peer network of physical infrastructure (nodes) |
| **Gossip Protocol** | Decentralized communication protocol where nodes periodically exchange state information with random peers |
| **Leader Election** | Distributed algorithm to elect a coordinator node for decision-making |
| **Microkernel** | Minimal operating system kernel that delegates most services to userspace processes |
| **Raft** | Consensus algorithm for distributed systems that ensures all nodes agree on state |
| **Sandbox** | Isolated execution environment that restricts resource access and prevents security breaches |
| **WASM** | WebAssembly; binary instruction format for stack-based virtual machines, enabling near-native performance in web browsers |
| **Work Stealing** | Load balancing technique where idle nodes claim tasks from overloaded nodes |

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | Principal Architect | Initial vision document |
