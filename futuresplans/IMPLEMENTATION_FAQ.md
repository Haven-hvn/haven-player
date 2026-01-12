# Implementation FAQ
## Haven Player DePIN Architecture

This document addresses common questions about implementing the next-generation DePIN media archiver architecture.

---

## Table of Contents
1. [Architecture Decisions](#architecture-decisions)
2. [Plugin Development](#plugin-development)
3. [State Management](#state-management)
4. [Scheduling & Resources](#scheduling--resources)
5. [Security](#security)
6. [Performance](#performance)
7. [Migration](#migration)
8. [Operations](#operations)

---

## Architecture Decisions

### Q1: Why a microkernel instead of just modular microservices?

**A:** Microkernel provides several advantages unique to DePIN scenarios:

| Aspect | Microkernel | Microservices |
|--------|-------------|---------------|
| **Plugin Safety** | Sandboxed by default | Requires manual isolation |
| **Consensus Overhead** | Single leader for all critical decisions | Multiple consensus groups needed |
| **Node Identity** | Clear distinction (core vs. plugins) | All peers equal |
| **Evolution** | Core stays small; plugins grow unbounded | All services can inflate |
| **Boot Time** | One process to start | N processes to coordinate |

**Key Insight:** In a DePIN, nodes join/leave frequently. A microkernel with a single Core process reduces coordination overhead during node churn.

### Q2: Why CRDTs instead of a distributed database (etcd, Consul)?

**A:** CRDTs are better for this specific use case:

**etcd/Consul Pros:**
- Strong consistency (linearizable)
- Mature tooling
- Watch API for notifications

**etcd/Consul Cons:**
- Single cluster = single point of failure
- Network partitions = unavailability (CAP theorem)
- Horizontal scaling requires complex sharding
- Requires运维运维 (heavy operations)

**CRDT Pros:**
- Offline-first: nodes continue during partitions
- No single point of failure: any node can serve reads
- Simple scaling: just add more nodes
- Convergent: state automatically reconciles

**CRDT Cons:**
- Eventual consistency only (may see stale data)
- Requires careful conflict resolution design
- Larger memory footprint (full state on each node)

**Decision:** For a DePIN where nodes have intermittent connectivity and must operate autonomously, CRDTs are the right choice. Strong consistency is less important than availability.

### Q3: Why Rust for the core instead of Go or Node.js?

**A:** Rust offers the best balance:

| Criterion | Rust | Go | Node.js |
|----------|------|----|----------| 
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Memory Safety** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Async Ecosystem** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Binary Size** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Development Velocity** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**Key Decision Factors:**
1. **Memory Safety:** The microkernel runs with elevated privileges. Memory leaks or buffer overflows can compromise the entire node. Rust's ownership model prevents these at compile time.
2. **Performance:** The Core handles gossip, CRDT merging, and scheduling for potentially thousands of nodes. Rust's zero-cost abstractions and async/await are ideal.
3. **Binary Distribution:** Single static binary = easy node deployment (no runtime dependencies).
4. **WASM Support:** Rust has best-in-class WASM toolchain, enabling future browser-based plugins.

**What if our team doesn't know Rust?**
- Start with Go for MVP (faster development)
- Rewrite critical path in Rust later (performance-sensitive components)
- Provide multi-language plugin SDKs (Rust, Go, Python, JavaScript)

---

## Plugin Development

### Q4: How do I create a new plugin?

**A:** Four-step process:

**Step 1: Define Plugin Manifest**
```json
{
  "name": "my-archiver",
  "version": "1.0.0",
  "description": "Archives media from my custom source",
  "author": "Your Name <email@example.com>",
  "capabilities": [
    "network:http",
    "network:https",
    "storage:write"
  ],
  "resources": {
    "cpu_min": 1,
    "memory_min_mb": 512,
    "bandwidth_min_mbps": 10
  },
  "signature": "ed25519:base64-encoded-signature"
}
```

**Step 2: Implement ArchiverPlugin Trait**
```rust
use haven_plugin_sdk::prelude::*;

pub struct MyArchiver {
    config: PluginConfig,
    client: reqwest::Client,
}

#[derive(Debug)]
pub enum MyError {
    NetworkError(reqwest::Error),
    ParseError,
    // ...
}

impl ArchiverPlugin for MyArchiver {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            name: "my-archiver".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            description: "Archives media from my custom source".to_string(),
        }
    }
    
    async fn discover_sources(&mut self) -> Result<Vec<MediaSource>, PluginError> {
        // YOUR DISCOVERY LOGIC HERE
        let source = MediaSource {
            source_id: "example-123".to_string(),
            source_type: SourceType::Http {
                url: "https://example.com/video.mp4".to_string(),
                headers: Default::default(),
            },
            priority: Priority::Normal,
            estimated_size: Some(100_000_000), // 100 MB
            estimated_duration: Some(Duration::from_secs(600)), // 10 min
        };
        Ok(vec![source])
    }
    
    async fn archive(&mut self, source: MediaSource) -> ArchiveResult {
        // YOUR ARCHIVE LOGIC HERE
        // 1. Download media
        // 2. Process (transcode, thumbnail, phash)
        // 3. Store to Filecoin/IPFS
        // 4. Index in Arkiv
        
        ArchiveResult {
            success: true,
            output_path: Some("/data/video.mp4".to_string()),
            file_size_bytes: Some(100_000_000),
            duration_seconds: Some(600),
            metrics: ArchiveMetrics::default(),
        }
    }
    
    // Implement other methods...
}
```

**Step 3: Build Plugin**
```bash
cargo build --release
```

**Step 4: Register Plugin**
```bash
haven-plugin install my-archiver/target/release/my-archiver
haven-plugin start my-archiver
```

### Q5: Can I write plugins in Python/JavaScript instead of Rust?

**A:** Yes! Multi-language support is planned:

**Phase 1 (MVP):** Rust-only plugins
**Phase 2:** Python plugins via gRPC
**Phase 3:** JavaScript/TypeScript plugins via gRPC
**Phase 4:** WASM plugins (language-agnostic)

**Example: Python Plugin (Future)**
```python
from haven_plugin_sdk import ArchiverPlugin, MediaSource, SourceType

class MyPythonArchiver(ArchiverPlugin):
    async def discover_sources(self):
        source = MediaSource(
            source_id="example-123",
            source_type=SourceType.HTTP(
                url="https://example.com/video.mp4"
            ),
            priority=Priority.NORMAL
        )
        return [source]
    
    async def archive(self, source: MediaSource):
        # Archive logic...
        pass
```

### Q6: How do plugins access Filecoin/IPFS?

**A:** Through the Plugin SDK:

```rust
use haven_plugin_sdk::storage;

async fn archive(&mut self, source: MediaSource) -> ArchiveResult {
    // Download to local filesystem
    let local_path = self.download(source).await?;
    
    // Upload to IPFS
    let ipfs_client = storage::IpfsClient::new();
    let cid = ipfs_client.upload(&local_path).await?;
    
    // Upload to Filecoin
    let filecoin_client = storage::FilecoinClient::new();
    let deal_id = filecoin_client.make_deal(
        cid,
        100_000_000, // 100 MB
        Duration::from_days(365), // 1 year
    ).await?;
    
    // Store metadata in Arkiv
    let arkiv_client = storage::ArkivClient::new();
    let entity_key = arkiv_client.create_entity(
        &local_path,
        &cid,
        &deal_id,
    ).await?;
    
    ArchiveResult {
        success: true,
        output_path: Some(local_path),
        filecoin_cid: Some(cid),
        arkiv_entity_key: Some(entity_key),
        ..Default::default()
    }
}
```

The SDK handles all the heavy lifting (authentication, retries, deal negotiation).

---

## State Management

### Q7: How does a YouTube plugin persist channel subscriptions across node restarts?

**A:** Use the StateManager SDK:

```rust
struct YouTubePlugin {
    subscriptions: GMap<ChannelId, SubscriptionState>,
}

async fn start(&mut self) -> Result<(), PluginError> {
    // Load state from CRDT store
    let state_snap = self.state_manager.load().await?;
    let saved_subs: GMap<ChannelId, SubscriptionState> = state_snap.get("subscriptions")?;
    self.subscriptions = saved_subs;
    
    // Resume monitoring
    for (channel_id, sub_state) in self.subscriptions.iter() {
        self.monitor_channel(channel_id, sub_state).await?;
    }
    
    Ok(())
}

async fn subscribe(&mut self, channel_id: ChannelId) -> Result<(), PluginError> {
    // Add to local GMap
    self.subscriptions.insert(channel_id, SubscriptionState {
        subscribed_at: now(),
        auto_archive: true,
        quality: "1080p".to_string(),
        last_check: now(),
    });
    
    // Persist to CRDT (replicates to other nodes)
    let snapshot = StateSnapshot::new()
        .with("subscriptions", &self.subscriptions);
    self.state_manager.save(snapshot).await?;
    
    Ok(())
}
```

**Key Points:**
1. Plugin state is stored in a GMap (Grow-Only Map) - a CRDT type
2. State automatically replicates to other nodes via gossip
3. Node restart: Load from CRDT snapshot
4. Multi-node: If both nodes subscribe to same channel, CRDT merge deduplicates

### Q8: What happens if two nodes update the same subscription simultaneously?

**A:** CRDT merge semantics handle this:

**Scenario:**
- Node A updates subscription quality to "1080p"
- Node B updates subscription quality to "720p"
- Both updates happen simultaneously (before gossip sync)

**Result:**
- CRDT uses Last-Write-Wins (LWW) register for subscription state
- Writes are timestamped with logical clock (node ID + counter)
- After gossip sync, the write with higher timestamp wins

```rust
// Node A writes (timestamp: node_alpha:100)
subscriptions.insert("channel-xyz", State { quality: "1080p", timestamp: 100 });

// Node B writes (timestamp: node_beta:101)
subscriptions.insert("channel-xyz", State { quality: "720p", timestamp: 101 });

// After gossip merge:
// Result: quality = "720p" (Node B's write wins - higher timestamp)
```

### Q9: What if network partitions?

**A:** CRDTs are partition-tolerant:

**Scenario:**
- Network partitions into {Alpha, Beta} and {Gamma}
- Both sides continue operating
- Alpha subscribes to channel-1
- Gamma subscribes to channel-2
- Network heals (reconnects)

**Result:**
- Both sides have valid state during partition
- After reconnection, CRDT merge reconciles differences
- Final state includes both channel-1 and channel-2 subscriptions
- No data loss, no manual intervention needed

---

## Scheduling & Resources

### Q10: How does the scheduler prevent resource starvation?

**A:** Multi-layer approach:

**Layer 1: Admission Control (Scheduler)**
```rust
fn assign_task(task: &Task, node: &Node) -> bool {
    // Check if node has capacity
    if node.current_load >= node.capacity * 0.9 {
        return false; // 90% full - reject new tasks
    }
    
    // Check if node is already running high priority tasks
    if node.high_priority_count > 0 && task.priority == Priority::Low {
        return false; // Don't block critical tasks
    }
    
    true
}
```

**Layer 2: Weighted Fair Queuing (WFQ)**
```rust
// Each priority class gets guaranteed CPU share
const PRIORITY_WEIGHTS: [u32; 4] = [4, 2, 1, 1]; // CRITICAL, HIGH, NORMAL, LOW

fn calculate_shares(node: &Node) -> Vec<ResourceShare> {
    let total_slots = node.cpu_cores;
    let critical_slots = (total_slots * PRIORITY_WEIGHTS[0]) / 8;
    let high_slots = (total_slots * PRIORITY_WEIGHTS[1]) / 8;
    // etc.
    
    vec![critical_slots, high_slots, normal_slots, low_slots]
}
```

**Layer 3: Age-Based Boost**
```rust
fn boost_old_tasks(queue: &mut TaskQueue) {
    let now = now();
    for task in queue.iter_mut() {
        let age = now - task.submitted_at;
        if age > Duration::from_secs(300) && task.priority == Priority::Low {
            // Boost to NORMAL priority if waiting > 5 minutes
            task.priority = Priority::Normal;
        }
    }
}
```

**Layer 4: Preemption**
```rust
async fn preempt_if_needed(node: &mut Node) {
    if node.high_priority_pending > 0 && node.low_priority_count > 0 {
        // Stop lowest priority task
        let task_to_stop = node.tasks.iter().min_by_key(|t| t.priority);
        if let Some(task) = task_to_stop {
            task.stop().await?;
            node.low_priority_count -= 1;
        }
    }
}
```

### Q11: How does work stealing avoid "thundering herd"?

**A:** Exponential backoff with jitter:

```rust
async fn work_stealer_loop(node: &Node) {
    loop {
        let overloaded_nodes = find_overloaded_nodes().await;
        
        for victim in overloaded_nodes {
            // Random delay to avoid thundering herd
            let delay_ms = rng.gen_range(0..1000);
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            
            // Check if victim still overloaded
            if !victim.is_overloaded() {
                continue; // Already claimed by another node
            }
            
            // Attempt to steal task
            if let Some(task) = victim.steal_task().await {
                task.assign_to(node).await?;
            }
        }
        
        // Exponential backoff before next sweep
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
```

### Q12: What if a node goes offline while running a task?

**A:** Timeout-based reassignment:

```rust
// Scheduler monitors task heartbeat
async fn monitor_tasks() {
    loop {
        for task in active_tasks.iter() {
            let last_heartbeat = task.last_heartbeat.unwrap();
            let elapsed = now() - last_heartbeat;
            
            if elapsed > Duration::from_secs(30) {
                // Task unresponsive for 30 seconds
                logger::warn!("Task {} heartbeat timeout, reassigning", task.id);
                
                // Mark as failed
                task.status = TaskStatus::Failed;
                task.failure_reason = "Heartbeat timeout".to_string();
                
                // Increment failure count
                task.failure_count += 1;
                
                if task.failure_count < MAX_RETRIES {
                    // Reassign to new node
                    scheduler.assign_task(task, pick_new_node()).await?;
                } else {
                    // Max retries exceeded - give up
                    task.status = TaskStatus::Abandoned;
                }
            }
        }
        
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
```

---

## Security

### Q13: How do we prevent malicious plugins from stealing keys or data?

**A:** Defense in depth:

**Layer 1: Signature Verification**
```rust
// Only allow plugins signed by trusted keys
const TRUSTED_KEYS: &[ed25519::PublicKey] = &[
    // Haven Official Keys
    load_key("haven-official-1.pub"),
    load_key("haven-official-2.pub"),
];

fn verify_plugin(manifest: &PluginManifest) -> Result<(), SecurityError> {
    let signature = ed25519::Signature::from_base64(&manifest.signature)?;
    let key = manifest.public_key.unwrap();
    
    // Check if signer is trusted
    if !TRUSTED_KEYS.contains(&key) {
        return Err(SecurityError::UntrustedSigner);
    }
    
    // Verify signature
    key.verify(
        manifest.manifest_hash(),
        &signature,
    )?;
    
    Ok(())
}
```

**Layer 2: Container Isolation**
```yaml
# docker-compose.yml for plugin
version: "3.8"
services:
  youtube-archiver:
    image: haven/youtube-archiver:1.0.0
    hostname: youtube-archiver
    network_mode: bridge
    cap_drop: [ALL]  # Drop all Linux capabilities
    cap_add: [NET_BIND_SERVICE]  # Only allow binding ports
    read_only: true  # Read-only filesystem except /data
    tmpfs:
      - /tmp:rw  # Only /data is writable
    devices: []  # No device access
    security_opt:
      - no-new-privileges:true  # Prevent privilege escalation
```

**Layer 3: Network Filtering**
```go
// iptables rules for plugin
iptables -A OUTPUT -d api.youtube.com -j ACCEPT
iptables -A OUTPUT -d *.googlevideo.com -j ACCEPT
iptables -A OUTPUT -j DROP  # Block all other destinations
```

**Layer 4: Sandbox (gVisor/Firecracker)**
```bash
# Run plugin in gVisor runtime
docker run --runtime=runsc youtube-archiver:1.0.0
```

### Q14: How do we prevent DDoS from malicious plugin scanning?

**A:** Rate limiting and quotas:

**Per-Plugin Rate Limits:**
```rust
struct PluginQuota {
    max_requests_per_minute: u32,
    max_concurrent_connections: u32,
    max_bandwidth_mbps: u32,
}

impl PluginRuntime {
    async fn enforce_quota(plugin: &Plugin, request: &HttpRequest) -> Result<(), QuotaError> {
        let quota = self.get_quota(plugin)?;
        
        // Check request rate
        let count = self.request_counter.increment(plugin.id)?;
        if count > quota.max_requests_per_minute {
            return Err(QuotaError::RateLimitExceeded);
        }
        
        // Check bandwidth
        let bandwidth = self.bandwidth_monitor.get_current(plugin.id)?;
        if bandwidth > quota.max_bandwidth_mbps {
            return Err(QuotaError::BandwidthExceeded);
        }
        
        Ok(())
    }
}
```

**Global Network-Wide Rate Limits (Coordination):**
```rust
// CRDT tracks global request counts
struct GlobalRateLimits {
    youtube_api_requests_per_hour: PNCounter,
}

impl Scheduler {
    async fn check_global_rate_limit(source: &MediaSource) -> Result<(), RateLimitError> {
        if source.is_youtube() {
            let count = global_state.youtube_api_requests_per_hour.value();
            if count > YOUTUBE_API_QUOTA_HOURLY {
                return Err(RateLimitError::QuotaExceeded);
            }
        }
        Ok(())
    }
}
```

### Q15: What about zero-day vulnerabilities in plugins?

**A:** Sandboxing + auto-recovery:

**Strategy:**
1. **Sandbox:** Even if plugin is compromised, it can't escape container
2. **Health Monitoring:** Core monitors plugin health (CPU, memory, process status)
3. **Auto-Restart:** If plugin crashes or hangs, Core automatically restarts it
4. **Kill Switch:** If plugin misbehaves repeatedly, Core disables it

```rust
async fn health_check_loop() {
    loop {
        for plugin in active_plugins.iter() {
            let status = plugin.health_check().await;
            
            match status {
                HealthStatus::Healthy => {/* do nothing */},
                HealthStatus::Degraded => {
                    logger::warn!("Plugin {} degraded, restarting", plugin.id);
                    plugin.restart().await?;
                },
                HealthStatus::Failed | HealthStatus::Unresponsive => {
                    logger::error!("Plugin {} failed, disabling", plugin.id);
                    self.disable_plugin(plugin.id).await?;
                    self.alert_operator(plugin.id).await?;
                },
            }
        }
        
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}
```

---

## Performance

### Q16: How much overhead does CRDT replication add?

**A:** Depends on update frequency:

| Metric | Low Update Rate | Medium Update Rate | High Update Rate |
|--------|-----------------|-------------------|------------------|
| **CPU** | < 1% | 1-5% | 5-10% |
| **Memory** | ~50 MB per node | ~100 MB per node | ~200 MB per node |
| **Network** | ~1 KB/s | ~10 KB/s | ~100 KB/s |
| **Latency** | < 10ms | 10-100ms | 100-500ms |

**Optimization Strategies:**
1. **Differential Updates:** Only send changed keys
2. **Batching:** Accumulate updates before gossip (5 second window)
3. **Compression:** Compress large payloads (zstd)
4. **Selective Replication:** Only replicate relevant CRDTs to plugins

```rust
struct GossipConfig {
    interval: Duration,
    batch_window: Duration,     // Accumulate updates for N seconds
    compression: bool,
    max_message_size: usize,
}
```

### Q17: Can we scale to 10,000+ nodes?

**A:** Yes, with optimizations:

**Bottlenecks:**
1. **Gossip Fanout:** O(N) messages per gossip round
2. **CRDT Merge:** O(M) where M = number of changed keys
3. **Leader Election:** Raft requires O(N) communication

**Solutions:**

**Gossip Optimization (Sharding):**
```rust
// Instead of gossiping to all nodes, gossip to random subset
const GOSSIP_FANOUT: usize = 10;  // Only gossip to 10 random peers

async fn gossip_round(node: &Node, state: &CRDTState) {
    let peers = node.get_random_peers(GOSSIP_FANOUT);
    for peer in peers {
        peer.send(state.clone()).await?;
    }
}
```

**CRDT Optimization (Lazy Replication):**
```rust
// Only replicate "hot" CRDTs immediately
// Defer "cold" CRDTs to periodic full sync
struct CRDTReplicationPolicy {
    hot_keys: HashSet<CRDTKey>,  // Updated frequently
    cold_keys: HashSet<CRDTKey>, // Updated rarely
}

async fn replicate_changes(state: &CRDTState) {
    for (key, value) in state.iter() {
        if policy.is_hot(key) {
            // Immediate replication
            gossip.broadcast(key, value).await?;
        } else {
            // Defer to periodic sync
            deferred_sync.add(key, value);
        }
    }
}
```

**Raft Optimization (Hierarchical Raft):**
```
┌─────────────────────────────────────────────────────────────┐
│                     GLOBAL LEADER                           │
│                   (Raft cluster of 10)                       │
└─────────────────────────────────────────────────────────────┘
         │
         │ Manages 1000 sub-clusters
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  REGIONAL LEADERS                           │
│                   (10 regions x 100 leaders)                 │
└─────────────────────────────────────────────────────────────┘
         │
         │ Each manages 10-100 nodes
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEAF NODES                              │
│                   (10,000 total)                            │
└─────────────────────────────────────────────────────────────┘
```

### Q18: What about single-threaded performance in Rust core?

**A:** Rust async is multi-threaded:

**Misconception:** "Rust is single-threaded like Node.js"  
**Reality:** Rust's `tokio` runtime uses multi-threaded scheduler by default

```rust
// Tokio runtime spawns N threads (default = num_cpus)
#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() {
    // This spawns 8 worker threads
    // Async tasks run in parallel across all threads
}
```

**Key Differences:**
- Node.js: Single event loop + worker threads for CPU-bound work
- Rust: Multi-threaded async runtime by default

**Performance Comparison:**

| Task | Node.js | Rust (multi-threaded) | Python (asyncio) |
|------|---------|------------------------|------------------|
| **HTTP Server** | 10k RPS | 50k RPS | 5k RPS |
| **JSON Parsing** | 100k ops/s | 1M ops/s | 20k ops/s |

**Bottom Line:** Rust can handle 10,000+ gossip connections concurrently without blocking.

---

## Migration

### Q19: How do we migrate existing Python services to plugins?

**A:** Incremental migration strategy:

**Phase 1: Adapter Layer (Week 1-2)**
```python
# Legacy adapter - wraps existing Python service in gRPC server
from haven_adapter import ArchiverPluginAdapter

class WebRTCAdapter(ArchiverPluginAdapter):
    def __init__(self):
        # Load existing service
        from app.services.webrtc_recording_service import WebRTCRecordingService
        self.service = WebRTCRecordingService()
    
    async def archive(self, source):
        # Call existing service
        result = await self.service.start_recording(
            mint_id=source.mint_id,
            output_format="webm",
        )
        return result
```

**Phase 2: Extract Plugin Logic (Week 3-4)**
```rust
// Port core logic to Rust
pub struct PumpFunPlugin {
    livekit_client: LiveKitClient,
    recorder: ParticipantRecorder,
}

impl ArchiverPlugin for PumpFunPlugin {
    async fn archive(&mut self, source: MediaSource) -> ArchiveResult {
        // Rust implementation (no Python dependency)
        self.recorder.start(&source).await?;
    }
}
```

**Phase 3: Deprecate Python (Week 5-6)**
- Switch to Rust plugin in production
- Keep Python adapter as fallback for 1 month
- Remove Python code after validation period

### Q20: What about the FastAPI frontend?

**A:** Keep it as a compatibility layer:

```
Legacy FastAPI  Microkernel Core
        │                      │
        │   HTTP/gRPC          │
        ├─────────────────────►│
        │                      │
        │   Legacy API          │
        │◄─────────────────────│
```

**Design:**
- FastAPI app runs alongside microkernel core
- FastAPI delegates to plugins via gRPC
- Gradually migrate endpoints to new microkernel API
- Deprecate FastAPI after all clients updated

```python
# FastAPI compatibility layer
from haven_grpc_client import MicrokernelClient

client = MicrokernelClient("localhost:50051")

@app.post("/api/recording/start")
async def start_recording(mint_id: str):
    # Delegate to microkernel
    result = client.start_archiving(
        plugin_name="webrtc-archiver",
        source=MediaSource(
            source_type=SourceType.WebRTC(mint_id=mint_id),
        ),
    )
    return result
```

---

## Operations

### Q21: How do we deploy updates to the network?

**A:** Rolling updates with canary deployments:

**Strategy:**
1. **Canary:** Deploy to 5% of nodes
2. **Monitor:** Watch for errors, performance degradation
3. **Rolling:** If canary succeeds, deploy to 100%
4. **Auto-Rollback:** If errors spike, auto-revert to previous version

```rust
impl NetworkDeployer {
    async fn deploy_update(&self, new_version: &Version) -> Result<(), DeployError> {
        // Phase 1: Canary (5%)
        let canary_nodes = self.select_canary_nodes(0.05);
        for node in canary_nodes {
            node.update(new_version.clone()).await?;
        }
        
        // Monitor for 10 minutes
        tokio::time::sleep(Duration::from_mins(10)).await;
        
        if self.check_health(&canary_nodes)? < 0.95 {
            // Canary failed - rollback
            logger::error!("Canary failed, rolling back");
            for node in canary_nodes {
                node.rollback().await?;
            }
            return Err(DeployError::CanaryFailed);
        }
        
        // Phase 2: Rolling update (100%)
        let all_nodes = self.get_all_nodes();
        let batch_size = 10;  // Update 10 nodes at a time
        
        for batch in all_nodes.chunks(batch_size) {
            for node in batch {
                node.update(new_version.clone()).await?;
            }
            
            // Wait between batches
            tokio::time::sleep(Duration::from_mins(1)).await;
        }
        
        Ok(())
    }
}
```

### Q22: How do we debug distributed issues?

**A:** Distributed tracing + centralized logging:

**Tracing Flow:**
```
User Request → API Gateway → Scheduler → Node → Plugin → YouTube API
     ↓           ↓            ↓          ↓        ↓           ↓
  Span A      Span B       Span C     Span D   Span E     Span F
```

**Jaeger Trace ID:** Pass trace ID through entire call chain for correlation.

```rust
#[tracing::instrument(skip_all)]
async fn archive_media(source: MediaSource) -> ArchiveResult {
    // Span: archive_media (parent)
    let span = tracing::span!(tracing::Level::INFO, "archive_media");
    
    // Child span: schedule_task
    let task_id = scheduler.assign(source).await?;
    
    // Child span: execute_task
    let result = node.execute(task_id, trace_id=span.id()).await?;
    
    result
}
```

**Centralized Logging (ELK):**
```json
{
  "timestamp": "2026-01-05T03:00:00Z",
  "level": "ERROR",
  "node_id": "node-alpha",
  "plugin": "youtube-archiver",
  "trace_id": "abc123",
  "message": "Failed to download video",
  "error": {
    "type": "NetworkError",
    "code": 503,
    "url": "https://youtube.com/watch?v=..."
  }
}
```

**Debugging Workflow:**
1. User reports issue (provide trace ID)
2. Search ELK for trace ID → see full call chain
3. Identify failing node/plugin
4. Check Grafana dashboards for that node
5. SSH into node for deeper inspection

### Q23: How do we handle node operator churn?

**A:** Incentivization + reputation system:

**Incentives:**
- Token rewards for completed tasks
- Reputation bonus for high-uptime nodes
- Priority processing for trusted operators

```rust
struct NodeReputation {
    tasks_completed: u64,
    uptime_seconds: u64,
    errors_count: u64,
    // Calculated metric
    score: f64,
}

impl NodeReputation {
    fn calculate_score(&self) -> f64 {
        let success_rate = 1.0 - (self.errors_count as f64 / self.tasks_completed as f64);
        let uptime_score = self.uptime_seconds as f64 / (7 * 24 * 3600) as f64; // Weekly uptime
        
        success_rate * 0.7 + uptime_score * 0.3
    }
}
```

**Benefits of High Reputation:**
- Priority task assignment
- Higher token rewards
- Early access to new features

**Penalties for Low Reputation:**
- Lower priority tasks
- Fewer task assignments
- Potential blacklisting

---

## Glossary

| Term | Definition |
|------|------------|
| **CRDT** | Conflict-Free Replicated Data Type; data structure that converges without coordination |
| **Gossip Protocol** | Decentralized communication where nodes exchange state with random peers |
| **gRPC** | Remote Procedure Call framework using Protocol Buffers |
| **Raft** | Consensus algorithm for distributed systems |
| **WASI** | WebAssembly System Interface; OS abstraction for WASM |
| **DePIN** | Decentralized Physical Infrastructure Network |
| **LWW-Register** | Last-Write-Wins Register; CRDT type that keeps latest value |
| **PN-Counter** | Positive-Negative Counter; CRDT type supporting increments/decrements |
| **Work Stealing** | Load balancing where idle nodes take tasks from overloaded nodes |

---

## Further Reading

- **CRDTs:** [A comprehensive study of CRDTs](https://hal.inria.fr/inria-00555588v1)
- **Raft:** [In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf)
- libp2p documentation: https://docs.libp2p.io/
- Rust async/await: https://rust-lang.github.io/async-book/
- gVisor: https://gvisor.dev/

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | Principal Architect | Initial FAQ |
