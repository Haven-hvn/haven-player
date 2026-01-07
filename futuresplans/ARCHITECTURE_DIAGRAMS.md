# Architecture Diagrams
## Visual Reference for Haven Player DePIN Architecture

This document provides detailed visual diagrams expanding on the architecture described in the main Vision Document.

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEPIN NETWORK                                         │
│                        (Global Coordination Layer)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
        ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
        │   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
        │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
        │  │Microkernel│  │  │  │Microkernel│  │  │  │Microkernel│  │
        │  │   Core    │  │  │  │   Core    │  │  │  │   Core    │  │
        │  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │
        │        │        │  │        │        │  │        │        │
        │        ▼        │  │        ▼        │  │        ▼        │
        │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
        │  │  Plugin   │  │  │  │  Plugin   │  │  │  │  Plugin   │  │
        │  │  Runtime  │  │  │  │  Runtime  │  │  │  │  Runtime  │  │
        │  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │
        │        │        │  │        │        │  │        │        │
        │  ┌─────┴─────┐  │  │  ┌─────┴─────┐  │  │  ┌─────┴─────┐  │
        │  │  Plugins  │  │  │  │  Plugins  │  │  │  │  Plugins  │  │
        │  │ ┌───────┐│  │  │  │ ┌───────┐│  │  │  │ ┌───────┐│  │
        │  │ │WebRTC ││  │  │  │ │YouTube││  │  │  │ │BitTor.││  │
        │  │ └───────┘│  │  │  │ └───────┘│  │  │  │ └───────┘│  │
        │  │ ┌───────┐│  │  │  │ ┌───────┐│  │  │  │ ┌───────┐│  │
        │  │ │IPTV   ││  │  │  │ │HTTP   ││  │  │  │ │Custom ││  │
        │  │ └───────┘│  │  │  │ └───────┘│  │  │  │ └───────┘│  │
        │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │
        └─────────────────┘  └─────────────────┘  └─────────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   ▼
                    ┌────────────────────────┐
                    │   PEER-TO-PEER NETWORK │
                    │   (libp2p / Gossip)    │
                    └────────────────────────┘
```

---

## 2. Microkernel Core Internal Architecture

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MICROKERNEL CORE                                 │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ Node Discovery  │  │   Gossip        │  │  Health Monitor  │     │
│  │   Manager       │  │   Protocol      │  │  & Heartbeats    │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
┌───────────┼─────────────────────┼─────────────────────┼─────────────┐
│           ▼                     ▼                     ▼             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ Leader Election │  │ Distributed    │  │ Resource        │     │
│  │   (Raft)        │  │ State (CRDT)   │  │ Accounting      │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                     │                     │             │
│  ┌────────┴─────────────────────┴─────────────────────┴────────┐    │
│  │                  GLOBAL STATE LAYER                        │    │
│  │  • Node Registry (CRDT)                                   │    │
│  │  • Task Queue (CRDT)                                      │    │
│  │  • Plugin Catalog (CRDT)                                  │    │
│  │  • Media Index (CRDT)                                     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  TASK ORCHESTRATOR                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │ Scheduler    │  │ Priority     │  │ Anti-        │    │  │
│  │  │ (Resource-   │  │ Manager      │  │ Starvation   │    │  │
│  │  │  Aware)      │  │              │  │ Monitor      │    │  │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘    │  │
│  │         │                                                    │  │
│  │         ▼                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │ Task         │  │ Work         │  │ Failure       │    │  │
│  │  │ Allocator    │  │ Stealer      │  │ Handler      │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              PLUGIN LIFECYCLE MANAGER                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ Install   │  │ Start    │  │ Health   │  │ Update/  │  │  │
│  │  │ Manager   │  │ Manager  │  │ Check    │  │ Uninstall│  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    IPC BRIDGE (gRPC)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow: Plugin Discovery and Resource Registration

```
NODE STARTUP SEQUENCE:
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│  NEW NODE   │           │ EXISTING    │           │  LEADER     │
│             │           │ PEER NODE   │           │   NODE      │
└──────┬──────┘           └──────┬──────┘           └──────┬──────┘
       │                         │                         │
       │ 1. Boot microkernel     │                         │
       │                         │                         │
       ▼                         │                         │
       │ 2. Discover peers (mDNS/DHT)                       │
       │─────────────────────────►│                         │
       │                         │                         │
       │                         │  3. Forward to leader   │
       │                         ├─────────────────────────►│
       │                         │                         │
       │  4. Join request        │  5. Join response       │
       │◄─────────────────────────┼─────────────────────────►│
       │                         │                         │
       │  (Node ID, capabilities)│  (Assign node ID)        │
       │                         │                         │
       ▼                         │                         │
       │ 6. Advertise resources                           │
       ├─────────────────────────────────────────────────►│
       │                         │                         │
       │  (CPU, memory, bandwidth, plugins)              │
       │                         │                         │
       │  7. Initial state sync  │  8. Broadcast to all   │
       │◄─────────────────────────├─────────────────────────►│
       │                         │                         │
       │  (CRDT snapshots)       │                         │
       │                         │                         │
       ▼                         ▼                         ▼
    READY                     UPDATED                   UPDATED
```

---

## 3. Plugin Architecture

### 3.1 Plugin Runtime Isolation

```
HOST OS
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              DOCKER ENGINE / CONTAINER RUNTIME                   │ │
│  │                                                                │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│ │
│  │  │  CONTAINER A    │  │  CONTAINER B    │  │  CONTAINER C    ││ │
│  │  │  (WebRTC Plugin)│  │  (YouTube Plugin)│  │(BitTorrent Plugin)││ │
│  │  │                 │  │                 │  │                 ││ │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐ ││ │
│  │  │  │ Plugin    │  │  │  │ Plugin    │  │  │  │ Plugin    │ ││ │
│  │  │  │ Binary    │  │  │  │ Binary    │  │  │  │ Binary    │ ││ │
│  │  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘ ││ │
│  │  │                 │  │                 │  │                 ││ │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐ ││ │
│  │  │  │ Plugin    │  │  │  │ Plugin    │  │  │  │ Plugin    │ ││ │
│  │  │  │ SDK (Rust)│  │  │  │ SDK (Rust)│  │  │  │ SDK (Rust)│ ││ │
│  │  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘ ││ │
│  │  │                 │  │                 │  │                 ││ │
│  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐ ││ │
│  │  │  │ gRPC      │  │  │  │ gRPC      │  │  │  │ gRPC      │ ││ │
│  │  │  │ Server    │  │  │  │ Server    │  │  │  │ Server    │ ││ │
│  │  │  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └─────┬─────┘ ││ │
│  │  └────────┼────────┘  └────────┼────────┘  └────────┼────────┘│ │
│  └───────────┼─────────────────────┼─────────────────────┼─────────┘ │
│              │                     │                     │           │
│              ▼                     ▼                     ▼           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  NETWORK BRIDGE (DOCKER)                        │ │
│  │  • Resource limits (CPU, memory, network)                      │
│  │  • Network filtering (whitelisted domains)                     │
│  │  • Filesystem isolation (sandboxed filesystems)                │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MICROKERNEL CORE (gRPC CLIENT)                         │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                  PLUGIN MANAGER                                ││
│  │  • Lifecycle management                                         ││
│  │  • Health monitoring                                            ││
│  │  • Resource enforcement                                         ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Plugin Communication Flow (gRPC)

```
┌──────────────────┐                    gRPC                      ┌──────────────────┐
│  MICROKERNEL     │ ◄──────────────────────────────────────────► │  PLUGIN RUNTIME  │
│      CORE        │                                               │  (Container)     │
└──────────────────┘                                               └──────────────────┘
         │                                                                │
         │                                                                │
         ▼                                                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          gRPC SERVICES                                 │
│                                                                         │
│  PluginLifecycle::Initialize(config) → Result                          │
│  PluginLifecycle::Start() → Result                                     │
│  PluginLifecycle::Stop() → Result                                      │
│  PluginLifecycle::HealthCheck() → HealthStatus                         │
│                                                                         │
│  ArchiverPlugin::DiscoverSources() → Vec<MediaSource>                  │
│  ArchiverPlugin::Archive(source) → ArchiveResult                       │
│                                                                         │
│  StateManager::SaveState(snapshot) → Result                            │
│  StateManager::LoadState() → StateSnapshot                              │
│                                                                         │
│  Observable::GetMetrics() → Metrics                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management (CRDT Architecture)

### 4.1 CRDT Replication Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                   DISTRIBUTED STATE LAYER (CRDT)                      │
└─────────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   NODE ALPHA    │ │   NODE BETA     │ │   NODE GAMMA    │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │   CRDT      │ │ │ │   CRDT      │ │ │ │   CRDT      │ │
│ │  REPLICA    │ │ │ │  REPLICA    │ │ │ │  REPLICA    │ │
│ │ (Local)     │ │ │ │ (Local)     │ │ │ │ (Local)     │ │
│ └──────┬──────┘ │ │ └──────┬──────┘ │ │ └──────┬──────┘ │
└────────┼─────────┘ └────────┼─────────┘ └────────┼─────────┘
         │                     │                     │
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ • G-Counters    │ │ • G-Counters    │ │ • G-Counters    │
│   (Tasks        │ │   (Tasks        │ │   (Tasks        │
│    completed)   │ │    completed)   │ │    completed)   │
│                 │ │                 │ │                 │
│ • G-Maps        │ │ • G-Maps        │ │ • G-Maps        │
│   (YouTube      │ │   (YouTube      │ │   (YouTube      │
│    subs)        │ │    subs)        │ │    subs)        │
│                 │ │                 │ │                 │
│ • LWW-Registers │ │ • LWW-Registers │ │ • LWW-Registers │
│   (Plugin       │ │   (Plugin       │ │   (Plugin       │
│    state)       │ │    state)       │ │    state)       │
│                 │ │                 │ │                 │
│ • OR-Maps       │ │ • OR-Maps       │ │ • OR-Maps       │
│   (Media        │ │   (Media        │ │   (Media        │
│    catalog)     │ │    catalog)     │ │    catalog)     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         │                                            │
         ▼                                            ▼
┌────────────────────────┐                ┌────────────────────────┐
│  GOSSIP PROTOCOL       │                │  ANTI-ENTROPY SYNC     │
│  • Periodic exchange    │                │  • Full state sync     │
│  • Differential updates │                │  • Conflict resolution  │
│  • Random peer sampling │                │  • Merge-based         │
└────────────────────────┘                └────────────────────────┘
```

### 4.2 CRDT Data Structures

```
CRDT TYPE HIERARCHY:

┌─────────────────────────────────────────────────────────────────────┐
│                          CRDT TYPES                                 │
└─────────────────────────────────────────────────────────────────────┘
        │
        ├──► COUNTERS (Numeric values)
        │      │
        │      ├──► G-Counter (Grow-Only Counter)
        │      │       • Tasks completed
        │      │       • Bytes downloaded
        │      │       • Uptime duration
        │      │
        │      └──► PN-Counter (Positive-Negative Counter)
        │              • Active connections (increment/decrement)
        │              • Pending tasks (add/remove)
        │
        ├──► REGISTERS (Single value, overwrites)
        │      │
        │      └──► LWW-Register (Last-Write-Wins)
        │              • Plugin state snapshots
        │              • Node health status
        │              • Last heartbeat timestamp
        │
        ├──► SETS (Collections of unique items)
        │      │
        │      ├──► G-Set (Grow-Only Set)
        │      │       • Discovered magnet links
        │      │       • Completed task IDs
        │      │
        │      └──► OR-Set (Observed-Remove Set)
        │              • Media catalog (supports deletions)
        │              • Plugin manifests (supports updates)
        │
        └──► MAPS (Key-value collections)
               │
               ├──► G-Map (Grow-Only Map)
               │       • YouTube subscriptions (ChannelID → State)
               │       • BitTorrent queue (TorrentID → Progress)
               │       • Plugin configurations
               │
               └──► OR-Map (Observed-Remove Map)
                       • Node registry (NodeID → NodeInfo)
                       • Task queue (TaskID → TaskState)
                       • Plugin catalog (PluginID → PluginInfo)
```

---

## 5. Task Scheduling Architecture

### 5.1 Global Task Queue

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GLOBAL TASK QUEUE (CRDT)                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  CRITICAL     │     │  HIGH         │     │  NORMAL       │
│  PRIORITY     │     │  PRIORITY     │     │  PRIORITY     │
│  QUEUE        │     │  QUEUE        │     │  QUEUE        │
│               │     │               │     │               │
│ ┌───────────┐ │     │ ┌───────────┐ │     │ ┌───────────┐ │
│ │Task 1     │ │     │ │Task 10    │ │     │ │Task 30    │ │
│ │Recording  │ │     │ │YouTube    │ │     │ │BitTorrent │ │
│ │ (expire:  │ │     │ │Stream     │ │     │ │Scan       │ │
│ │  5 min)   │ │     │ │ (expire:  │ │     │ │           │ │
│ └───────────┘ │     │ │  30 min)  │ │     │ └───────────┘ │
│ ┌───────────┐ │     │ └───────────┘ │     │ ┌───────────┐ │
│ │Task 2     │ │     │ ┌───────────┐ │     │ │Task 31    │ │
│ │Archive    │ │     │ │Task 11    │ │     │ │HTTP       │ │
│ │ (expire:  │ │     │ │BitTorrent │ │     │ │Download   │ │
│ │  10 min)  │ │     │ │Download   │ │     │ │           │ │
│ └───────────┘ │     │ └───────────┘ │     │ └───────────┘ │
│ ┌───────────┐ │     │ ┌───────────┐ │     │ ┌───────────┐ │
│ │Task 3     │ │     │ │Task 12    │ │     │ │Task 32    │ │
│ │...        │ │     │ │...        │ │     │ │...        │ │
│ └───────────┘ │     │ └───────────┘ │     │ └───────────┘ │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     TASK SCHEDULER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Resource     │  │ Priority     │  │ Assignment   │             │
│  │ Matcher      │  │ Enforcer    │  │ Engine       │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    Match nodes       Enforce         Pick best node
    with slots        critical        for task
                      tasks
```

### 5.2 Work Stealing Load Balancing

```
SCENARIO: Node B is overloaded, Node A has capacity

┌─────────────────┐                    ┌─────────────────┐
│   NODE ALPHA    │                    │   NODE BETA     │
│   (Underloaded) │                    │   (Overloaded)  │
│                 │                    │                 │
│ • Capacity: 8   │                    │ • Capacity: 4   │
│ • Load: 2/8     │                    │ • Load: 6/4     │
│               ┌─┼────────────────────►│◄─┐               │
│               │ │                    │ │                 │
│               │ │ WORK STEALING     │ │                 │
│               │ │ REQUEST           │ │                 │
│               │ │                   │ │                 │
│               │◄┼────────────────────┼─┤                 │
│               │ │  TASK SHAPE:      │ │                 │
│               │ │  - TaskID: 12345  │ │                 │
│               │ │  - Type: YouTube  │ │                 │
│               │ │  - CPU: 2 cores   │ │                 │
│               │ │  - Priority: LOW  │ │                 │
│               │ └────────────────────┼─┘                 │
│               │                      │                     │
│ ▼             │                      │                     ▼
│ NODE ALPHA    │                      │ NODE BETA           │
│ CLAIMS TASK   │                      │ RELEASES TASK       │
│ 12345         │                      │ 12345               │
│               │                      │                     │
│ • Load: 3/8   │                      │ • Load: 5/4       │
│ (Still OK)    │                      │ (Still overloaded) │
▔───────────────┘                      ▔─────────────────────┘
```

### 5.3 Task Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ PENDING  │───►│ ASSIGNED │───►│ RUNNING  │───►│COMPLETED │
│          │    │          │    │          │    │          │
│ • In     │    │ • NodeID  │    │ • Started│    │ • Result  │
│   queue  │    │ • Timeout │    │ • Progress│    │ • Metrics │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                   │
                   │ Failure
                   ▼
              ┌──────────┐
              │ FAILED   │
              │          │
              │ • Error  │
              │ • Retry  │
              │   count │
              └──────────┘
                   │
                   │ Retryable
                   ▼
              ┌──────────┐
              │ RETRYING │
              │          │
              │ • Backoff │
              │ • New     │
              │   node?   │
              └──────────┘
```

---

## 6. Data Plane Architecture

### 6.1 Media Archiving Pipeline

```
SOURCE DISCOVERY → DOWNLOAD → PROCESSING → STORAGE → INDEXING

┌─────────────────────────────────────────────────────────────────────┐
│                         SOURCE DISCOVERY                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ WebRTC   │  │ YouTube  │  │ BitTor.  │  │ IPTV     │          │
│  │ Streams  │  │ API      │  │ Crawlers │  │ Scan     │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
└───────┼─────────────┼─────────────┼─────────────┼─────────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MEDIA SOURCES                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Task Queue: [Source:youtube.com/video/xyz, Priority:HIGH]   │   │
│  │ Task Queue: [Source:magnet:?xt=..., Priority:NORMAL]         │   │
│  │ Task Queue: [Source:webrtc://room/abc/participant/123, ...] │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DOWNLOAD PHASE                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ • Progressive download (resumable)                            │   │
│  │ • Rate limiting (enforced by core)                            │   │
│  │ • Progress reporting (to CRDT)                               │   │
│  │ • Error handling (retry with exponential backoff)             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PROCESSING PHASE                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Transcode│  │Thumbnail │  │ Metadata │  │ Phash    │          │
│  │ (FFmpeg) │  │  Gen.    │  │ Extraction│  │ Calc.    │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
└───────┼─────────────┼─────────────┼─────────────┼─────────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          STORAGE PHASE                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │   │
│  │ │ Local   │  │  IPFS   │  │ Filecoin│  │  Arkiv  │          │   │
│  │ │ Storage │  │ (DHT)   │  │ (L2)    │  │ (Index) │          │   │
│  │ └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │   │
│  │      │            │            │            │                │   │
│  │      └────────────┴────────────┴────────────┘                │   │
│  │                    │                                       │   │
│  └────────────────────┼───────────────────────────────────────┘   │
│                       ▼                                             │
│                 Content-Addressed                                   │
│                 (CID-based deduplication)                          │
└─────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         INDEXING PHASE                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ • Extract metadata (title, duration, codec, etc.)            │   │
│  │ • Compute perceptual hash (phash for deduplication)          │   │
│  │ • Generate thumbnails (multiple resolutions)                 │   │
│  │ • Index in Arkiv (metadata + timestamps)                     │   │
│  │ • Update CRDT media index                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Distributed File Transfer (P2P)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTED FILE TRANSFER                         │
│                   (BitTorrent Integration)                          │
└─────────────────────────────────────────────────────────────────────┘

SINGLE NODE DOWNLOAD:
┌─────────────────┐
│   NODE ALPHA    │
│                 │
│  Source Server  │
│  ┌───────────┐  │
│  │ File A    │◄─┼──── 100 Mbps (bottleneck)
│  │ (1 GB)    │  │
│  └───────────┘  │
│                 │
│  Time: 80 sec   │
└─────────────────┘

DISTRIBUTED PEER-TO-PEER DOWNLOAD:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
│                 │  │                 │  │                 │
│  Source Server  │  │  Peer: Alpha    │  │  Peer: Alpha    │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │ File A    │◄─┼──┼──│ Chunk 1-4 │◄─┼──┼──│ Chunk 5-8 │◄─┼──
│  │ (1 GB)    │  │  │  └───────────┘  │  │  └───────────┘  │
│  └───────────┘  │  │                 │  │                 │
│                 │  │  Time: 20 sec   │  │  Time: 20 sec   │
│  Time: 20 sec   │  │  (25% of file)  │  │  (25% of file)  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
       │                    │                    │
       └────────────────────┴────────────────────┘
                     │
                     ▼
              ASSEMBLE FILE
           (Chunk 1 → 8 from all peers)

RESULT: 4x faster (80 sec → 20 sec)
        Reduced server load
        Better bandwidth utilization
```

---

## 7. Network Topology and Communication

### 7.1 Gossip Protocol Message Flow

```
┌─────────────────┐                    ┌─────────────────┐
│   NODE ALPHA    │                    │   NODE BETA     │
│                 │                    │                 │
│  CRDT Replica   │                    │  CRDT Replica   │
│  State: V1      │                    │  State: V1      │
└────────┬────────┘                    └────────┬────────┘
         │                                     │
         │ GOSSIP TICKLE (every 5 seconds)    │
         ├────────────────────────────────────►│
         │                                     │
         │ Message:                           │
         │ {                                  │
         │   type: "GOSSIP",                 │
         │   version: 12345,                 │
         │   deltas: [                       │
         │     {op: "ADD", key: "task:123", value: {...}},
         │     {op: "REMOVE", key: "node:456"}                     │
         │   ]                             │                   │
         │ }                               │                   
         │                                 │                   
         │                                 │                   
         │                                 │                   
│ MERGE          │                    │ MERGE          │
│ UPDATE: V1→V2   │                    │ UPDATE: V1→V2   │
│ State: V2       │                    │ State: V2       │
└─────────────────┘                    └─────────────────┘
```

### 7.2 Leader Election (Raft)

```
ELECTION PHASE:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
│                 │  │                 │  │                 │
│ FOLLOWER        │  │ FOLLOWER        │  │ FOLLOWER        │
│                 │  │                 │  │                 │
│ Election timer  │  │ Election timer  │  │ Election timer  │
│ expires →       │  │ expires →       │  │ expires →       │
│                 │  │                 │  │                 │
│ CANDIDATE       │                    │                  
│ ┌───────────┐  │  │                  │                  
│ │ Vote for  │  │  │                  │                  
│ │ Alpha     │─┼─►│                  │                  
│ │ (Term 1)  │  │  │                  │                  
│ └───────────┘  │  │                  │                  
│                 │  │                  │                  
│ GRANTED (1/3)  │                    │                  
│                 │                    │                  
│ Request        │                    │                  
│ Votes from     │                    │                  
│ Beta & Gamma   │                    │                  
└───────┬─────────┘                    │                  
        │                             │                  
        ├─────────────────────────────►│                  
        │ Request Votes                                    │
        │ from Gamma                                      │
        │                                                     │
        ▼                                                     │
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
│                 │  │                 │  │                 │
│ LEADER          │  │ FOLLOWER        │  │ FOLLOWER        │
│                 │  │                 │  │                 │
│ Send heartbeats │◄─┼─◄─Heartbeats───┼─◄┼──Heartbeats─────┤
│ to all          │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 8. Security Architecture

### 8.1 Plugin Security Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                                  │
└─────────────────────────────────────────────────────────────────────┘

LAYER 1: SIGNATURE VERIFICATION
┌─────────────────────────────────────────────────────────────────────┐
│  Plugin Manifest (plugin.json)                                     │
│  {                                                                  │
│    "name": "youtube-archiver",                                     │
│    "version": "1.0.0",                                              │
│    "signature": "ed25519:ABC123...",                               │
│    "capabilities": [                                               │
│      "network:http",                                                │
│      "storage:write",                                               │
│      "cpu:2"                                                       │
│    ]                                                               │
│  }                                                                  │
│                                                                    │
│  Verification Process:                                             │
│  1. Load plugin manifest                                            │
│  2. Verify signature against trusted public keys                  │
│  3. Check manifest schema validation                               │
│  4. Enforce capability-based security                              │
└─────────────────────────────────────────────────────────────────────┘

LAYER 2: CONTAINER ISOLATION
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Container Restrictions                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ • CPU quota: 2 cores maximum                                  │  │
│  │ • Memory limit: 2GB maximum                                   │  │
│  │ • Network: Whitelisted domains only                            │  │
│  │   - API.youtube.com (allow)                                   │  │
│  │   - *.googlevideo.com (allow)                                 │  │
│  │   - * (deny)                                                  │  │
│  │ • Filesystem: Read-only except /data (write)                  │  │
│  │ • No privileged mode                                           │  │
│  │ • No host networking                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

LAYER 3: RUNTIME SANDBOX (optional, higher security)
┌─────────────────────────────────────────────────────────────────────┐
│  gVisor / Firecracker                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ • User-space kernel sandbox                                    │  │
│  │ • Syscall filtering (seccomp)                                 │  │
│  │ • Filesystem virtualization                                   │  │
│  │ • Network stack isolation                                      │  │
│  │ • No access to host processes or sockets                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Monitoring and Observability

### 9.1 Observability Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                  OBSERVABILITY ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NODE ALPHA    │  │   NODE BETA     │  │   NODE GAMMA    │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │ OpenTelemetry│ │  │ OpenTelemetry│ │  │ OpenTelemetry│ │
│ │   SDK        │ │  │   SDK        │ │  │   SDK        │ │
│ └──────┬──────┘ │  │ └──────┬──────┘ │  │ └──────┬──────┘ │
└────────┼─────────┘  └────────┼─────────┘  └────────┼─────────┘
         │                      │                      │
         │ OTLP (gRPC)          │ OTLP (gRPC)          │ OTLP (gRPC)
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  TELEMETRY PUBLISHER (OTLP)                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   PROMETHEUS    │   │     ELK        │   │   JAEGER/      │
│   (Metrics)     │   │   (Logs)       │   │   TEMPO        │
│                 │   │                 │   │ (Traces)       │
│ ┌─────────────┐ │   │ ┌─────────────┐ │   │ ┌─────────────┐ │
│ │ Time-Series │ │   │ │ Log Storage │ │   │ │ Span Storage│ │
│ │   DB        │ │   │ │   + Index   │ │   │ │   + Index   │ │
│ └──────┬──────┘ │   │ └──────┬──────┘ │   │ └──────┬──────┘ │
└────────┼─────────┘   └────────┼─────────┘   └────────┼─────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GRAFANA (Dashboard)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Node Health  │  │ Task Metrics │  │ Plugin Perf. │              │
│  │   Heatmap    │  │   (Success   │  │   (Tasks/sec)│              │
│  │              │  │    Rate,     │  │              │              │
│  └──────────────┘  │    Latency)  │  │ └──────────────┘              │
│                   └──────────────┘                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Network      │  │ Resource     │  │ Alert Console│              │
│  │   Topology   │  │ Utilization │  │              │              │
│  │   (Map)      │  │   (CPU, Mem) │  │ └──────────────┘              │
│  └──────────────┘  └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Migration Path

### 10.1 Phase 1: Microkernel Extraction

```
BEFORE (Monolithic FASTAPI):
┌─────────────────────────────────────────────────────────────────────┐
│                    haven-player/backend                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  FastAPI Application                                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │   │
│  │  │Recording │  │PumpFun   │  │Arkiv     │                   │   │
│  │  │Service   │  │Service   │  │Service   │                   │   │
│  │  └──────────┘  └──────────┘  └──────────┘                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │   │
│  │  │Stream    │  │Live      │  │Database  │                   │   │
│  │  │Manager   │  │Session   │  │  (SQL)   │                   │   │
│  │  └──────────┘  └──────────┘  └──────────┘                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ∙ Tightly coupled                                                 │
│  ∙ Single process                                                  │
│  ∙ No plugin system                                                │
└─────────────────────────────────────────────────────────────────────┘

PHASE 1: Plugin Extraction:
┌─────────────────────────────────────────────────────────────────────┐
│                       haven-player/backend                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Microkernel Core (Rust) + Legacy Bridge                        │   │
│  │  ┌──────────┐                                                  │   │
│  │  │Plugin    │                                                  │   │
│  │  │Runtime   │                                                  │   │
│  │  │Manager   │                                                  │   │
│  │  └────┬─────┘                                                  │   │
│  │       │                                                        │   │
│  │  ┌────┴─────┐  ┌──────────┐  ┌──────────┐                   │   │
│  │  │Recording │  │PumpFun   │  │Arkiv     │                   │   │
│  │  │Plugin    │  │Plugin    │  │Plugin    │                   │   │
│  │  │(Python)  │  │(Python)  │  │(Python)  │                   │   │
│  │  └──────────┘  └──────────┘  └──────────┘                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  FastAPI (Legacy API Compatibility Layer)                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │   │
│  │  │ /record  │ │ /streams │ │ /upload  │                     │   │
│  │  └──────────┘ └──────────┘ └──────────┘                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ∙ Core in Rust, initial plugins in Python (for speed)            │
│  ∙ Legacy API preserved for frontend compatibility                │
└─────────────────────────────────────────────────────────────────────┘
```

**Note:** All diagrams use ASCII art for portability. For production documentation, consider using tools like Mermaid.js or draw.io for interactive, clickable diagrams.
