# Spatial Architecture Plan: Haven Archival Interface

# Liquid Glass Neon-Tech Reimagination

---
Vision Statement

Haven Player transforms into a __digital preservation cockpit__—an environment where archivists navigate the infinite through crystalline portals. The interface feels like peering into a data vault suspended in deep space: translucent glass surfaces hover at varying depths, each containing its own universe of information. Beneath these surfaces, neon circuit pathways pulse with the heartbeat of the decentralized network—data flowing, archives forming, rewards accruing. This is not a dashboard. It is a control room for digital permanence, where every interaction feels like commanding light itself.

## Post-Filesystem Spatial Flow Discovery

---

## 1) Intent Analysis

### What Users Are Actually Here To Do

Users of Haven are not here to "manage files" or "organize folders." They are here to:

**Observe & Verify:**
- Is my archival system healthy? Are recordings happening?
- Has my content reached permanent storage (Filecoin)?
- Is my data encrypted and protected?
- Did the blockchain sync complete?
- Is the VLM analysis generating useful metadata?

**Understand State & Transformation:**
- What stage is each piece of content in?
- What's actively recording right now?
- What's queued for upload?
- What failed and needs attention?

**Discover & Subscribe:**
- What live streams are available to archive?
- Which sources should I watch/subscribe to?
- What plugins are active and discovering content?

### Observation vs. Operation Balance

This is **primarily an observation interface** with **occasional operation triggers**.

| Observation (80%) | Operation (20%) |
|-------------------|-----------------|
| View transformation pipeline status | Start/stop recording |
| Monitor upload queue health | Configure plugins |
| Verify encryption status | Subscribe to sources |
| Check Arkiv sync state | Trigger manual upload |
| Watch recording progress | Adjust settings |

**Key Insight:** Users don't need action stations. They need **truth surfaces**—places where the current state of their archival system is immediately visible and understandable without demanding action.

### What Replaces "Finding Files"

In the old paradigm, users asked: "Where is my video stored?"

In Haven, users ask:
- "What transformation stage is my content in?"
- "Is this recording being preserved permanently?"
- "Can I trust that my data is encrypted and synced?"

The core task is **verification of transformation**, not **location of storage**.

---

## 2) Organizing Dimension

### If Not Location, Then What?

After analyzing the codebase, the natural organizing dimension is:

### **Workflow Stage × Source Identity**

Content in Haven flows through a **transformation pipeline**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSFORMATION PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   DISCOVERY        CAPTURE         PRESERVATION       VERIFICATION          │
│   ──────────       ─────────       ────────────       ────────────          │
│   │ Sources │  →   │ Recording │ → │ Upload to   │ → │ Arkiv Sync │        │
│   │ Streams │      │ Download  │   │ Filecoin    │   │ VLM Analysis│        │
│   │ Plugins │      │ Encrypt   │   │ CID Create  │   │ Blockchain │        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Source Identity** provides the secondary axis:
- TokenGroup (mint_id) for PumpFun streams
- Channel for YouTube content
- InfoHash for BitTorrent
- Device for OpenRing
- "Ungrouped" for manual imports

### Why This Works

1. **Workflow as Territory:** Users mentally model their content by "what's happening to it" rather than "where it lives." A video being uploaded is different from a video that's been verified—even if they're the "same file."

2. **Identity Over Location:** Content is known by its CID (content identifier), its mint_id, its encryption status—never by its file path. The path is infrastructure; the identity is meaning.

3. **Time as Progress:** Timestamps become meaningful as markers of transformation progress (recording_started_at, uploaded_at, synced_at) rather than file modification times.

---

## 3) Spatial Thesis

### The Fundamental Layout Philosophy

Haven's interface should embody the principle:

> **"The transformation pipeline IS the navigation. Content flows left-to-right through stages of preservation, and the user's eye follows the same path."**

### Core Layout: **Flow Canvas with Status Gravity**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  HEADER: Identity & Health Pulse                                              │
│  [Wallet Status] [Backend Status] [Points/Streak] [Settings]                 │
├──────────┬───────────────────────────────────────────────────────────────────┤
│          │                                                                    │
│  SOURCES │                    PRIMARY CANVAS                                  │
│          │                                                                    │
│  Plugins │   ┌─────────────────────────────────────────────────────────┐    │
│  Streams │   │                                                          │    │
│  Devices │   │              CONTENT IN TRANSFORMATION                   │    │
│          │   │                                                          │    │
│  ──────  │   │   Grouped by Source Identity                            │    │
│          │   │   Sorted by Transformation State                         │    │
│  FILTERS │   │                                                          │    │
│          │   │   [Active Recordings] → [Uploading] → [Preserved]       │    │
│  By State│   │                                                          │    │
│  By Type │   │                                                          │    │
│  By Time │   └─────────────────────────────────────────────────────────┘    │
│          │                                                                    │
│          ├───────────────────────────────────────────────────────────────────┤
│          │  QUEUE TRAY: Active Operations (expandable)                       │
│          │  [Upload Queue] [Recording Sessions] [Sync Status]                │
└──────────┴───────────────────────────────────────────────────────────────────┘
```

### Why This Layout

1. **Sources on Left:** Consistent with reading direction. Sources are the "input" to the transformation pipeline. This is where content enters.

2. **Content Canvas Center:** The largest area shows content IN transformation. Not "stored files" but "things becoming permanent."

3. **Queue Tray Bottom:** Active operations deserve persistent visibility but shouldn't dominate. They're "infrastructure"—important to verify, not to stare at.

4. **Header Health Pulse:** The system's overall health (wallet funded? backend running? encryption working?) should be glanceable without investigation.

---

## 4) Information Hierarchy

### What Must Be Glanceable (Peripheral Vision)

- **System Health:** Backend connected? Wallet funded? Encryption enabled?
- **Active Recording Count:** How many streams being captured right now?
- **Upload Queue Size:** How many items waiting for Filecoin?
- **Error Count:** Anything demanding attention?

### What Can Be Summoned (One Click)

- **Content Details:** CID, encryption metadata, timestamps
- **Upload Progress:** Detailed stage information
- **Plugin Configuration:** Settings for each source type
- **Recording Controls:** Start/stop/pause

### What Should Be Buried (Settings/Config)

- **Private Key Management:** Essential but rare
- **RPC URLs:** Infrastructure configuration
- **Gateway Settings:** IPFS gateway preferences
- **VLM Model Configuration:** Analysis settings

### The Attention Funnel

```
GLANCEABLE (always visible)
├── System health indicators
├── Active operation counts
└── Error badges

SUMMONED (one interaction)
├── Content transformation details
├── Upload queue entries
├── Recording session info
└── Plugin source lists

BURIED (intentional navigation)
├── Wallet configuration
├── Encryption settings
├── Plugin schemas
└── Advanced preferences
```

---

## 5) Zone Discovery

### Zone 1: **Source Navigator** (Left Sidebar)

**What it answers:**
- "What plugins are active?"
- "What sources am I monitoring?"
- "Which devices/channels/streams exist?"

**Why it lives here:**
Left-edge position establishes it as the "input" side of the flow. Sources are where content enters the system. Persistent visibility ensures users always know their capture scope.

**Contents:**
- Plugin list with health indicators
- Source counts per plugin
- Quick filters by source type
- Subscription status badges

### Zone 2: **Transformation Canvas** (Center Primary)

**What it answers:**
- "What content do I have?"
- "What state is each piece in?"
- "What needs my attention?"

**Why it lives here:**
Center dominance reflects its primary importance. This is what users actually came to see. Content grouped by source identity, sorted by transformation urgency.

**Contents:**
- TokenGroup cards (collapsed by default, expandable)
- Video cards showing transformation state
- State badges (Recording → Pending → Uploading → Preserved → Synced)
- Encryption indicators
- Error highlights

### Zone 3: **Health Pulse Bar** (Top Header)

**What it answers:**
- "Is the system working?"
- "Am I earning points?"
- "Is my wallet connected?"

**Why it lives here:**
Top position = system-level truth. This isn't about specific content; it's about the platform's readiness to transform content.

**Contents:**
- Backend connection status
- Wallet address (truncated) with balance hint
- DePIN points/streak
- Settings access

### Zone 4: **Operation Queue Tray** (Bottom Dock)

**What it answers:**
- "What's actively happening right now?"
- "How many uploads are in progress?"
- "What's next in the queue?"

**Why it lives here:**
Bottom position = infrastructure monitoring. Important enough to persist, not important enough to dominate. Expandable for details, collapsible for focus.

**Contents:**
- Upload queue stats (pending/processing/completed/failed)
- Arkiv sync status counts
- VLM analysis progress
- Active recording indicators

### Zone 5: **Detail Panel** (Right Slide-Out, On-Demand)

**What it answers:**
- "What are the specifics of this content?"
- "What's the CID? Transaction hash? Encryption metadata?"

**Why it lives here:**
Right-edge emergence for detail deep-dives. Doesn't exist until summoned. Respects the primary flow by not competing for space.

**Contents:**
- Full metadata display
- Explorer links (IPFS, Filecoin, Arkiv)
- Encryption details
- VLM analysis results
- Playback controls

---

## 6) Navigation Paradigm

### How Users Move Without Folder Trees

**The Folder Tree is Dead. Long Live the State Filter.**

Navigation in Haven is not hierarchical traversal but **state refinement**:

```
ALL CONTENT
  ├── Filter: By Transformation State
  │     ├── Recording Now
  │     ├── Pending Upload
  │     ├── Uploading
  │     ├── Preserved (on Filecoin)
  │     ├── Synced (to Arkiv)
  │     └── Failed/Needs Attention
  │
  ├── Filter: By Source Type
  │     ├── PumpFun Streams
  │     ├── YouTube Channels
  │     ├── BitTorrent Downloads
  │     ├── OpenRing Devices
  │     └── Manual Imports
  │
  └── Filter: By Time
        ├── Today
        ├── This Week
        ├── This Month
        └── Older
```

### Navigation Interactions

1. **Source Selection:** Click plugin/source in sidebar → Canvas shows only that source's content
2. **State Filtering:** Click state badge in header → Canvas filters to that state
3. **Search:** Text search across titles, CIDs, mint_ids → Results replace canvas content
4. **Group Expansion:** Click TokenGroup → Expands to show individual videos

### What Replaces Breadcrumbs

Traditional breadcrumbs show path: `Home > Folder > Subfolder > File`

Haven shows **context**: `PumpFun > Token XYZ > 3 recordings > 2 preserved`

This context string tells users:
- Where the content came from (Source)
- What identity it belongs to (Token)
- How many pieces exist (Count)
- What state they're in (Transformation)

---

## 7) State Expression

### How Different States Manifest Spatially

#### Healthy System State

```
┌─────────────────────────────────────────────────┐
│ ● Backend Connected  ● Wallet Funded  ● 142 pts │  ← Green dots, calm
├─────────────────────────────────────────────────┤
│                                                  │
│  Token Groups appear with subtle glow            │
│  Upload queue shows "0 pending" in muted text    │
│  No error badges visible                         │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### Active Recording State

```
┌─────────────────────────────────────────────────┐
│ ◉ 3 Recording  ● Backend  ● Wallet  ● 142 pts  │  ← Pulsing indicator
├─────────────────────────────────────────────────┤
│                                                  │
│  Recording cards have animated border pulse      │
│  Duration counter visible and incrementing       │
│  "Recording" badge in magenta (#FF00E5)         │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### Upload In Progress State

```
┌─────────────────────────────────────────────────┐
│ ● Backend  ● Wallet  ● 142 pts                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Video card shows progress bar                   │
│  "Uploading 47%" with cyan glow                 │
│  Queue tray expanded, showing stage detail      │
│                                                  │
├─────────────────────────────────────────────────┤
│ ▲ Queue: 1 uploading | 4 pending | 23 complete │  ← Tray prominent
└─────────────────────────────────────────────────┘
```

#### Error/Attention Needed State

```
┌─────────────────────────────────────────────────┐
│ ● Backend  ⚠ Wallet Low  ● 142 pts             │  ← Warning indicator
├─────────────────────────────────────────────────┤
│                                                  │
│  Failed items rise to top of canvas             │
│  Error badge in red (#FF3366) with count        │
│  Affected cards have red border                 │
│                                                  │
├─────────────────────────────────────────────────┤
│ ▲ Queue: 0 uploading | 2 failed | 23 complete  │  ← "failed" highlighted
└─────────────────────────────────────────────────┘
```

#### Empty/Nothing Happening State

```
┌─────────────────────────────────────────────────┐
│ ● Backend  ● Wallet  ○ 0 pts                   │  ← Dim/inactive feel
├─────────────────────────────────────────────────┤
│                                                  │
│     ┌──────────────────────────────────────┐    │
│     │                                      │    │
│     │    No content yet.                   │    │
│     │                                      │    │
│     │    Start by enabling a plugin        │    │
│     │    or subscribing to a stream.       │    │
│     │                                      │    │
│     │    [Browse Live Streams]             │    │
│     │                                      │    │
│     └──────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### State Color System

| State | Color | Meaning |
|-------|-------|---------|
| Recording | Magenta (#FF00E5) | Active capture, attention |
| Pending | Muted white (0.4 opacity) | Waiting, not urgent |
| Uploading | Cyan (#00F5FF) | Transformation in progress |
| Preserved | Success green (#00FF88) | Safely on Filecoin |
| Synced | Amber (#FFB800) | Blockchain verified |
| Encrypted | Cyan border glow | Protected content |
| Failed | Error red (#FF3366) | Needs intervention |

---

## 8) Anti-Patterns

### Conventions Explicitly Rejected

#### ❌ File Browser Layout
**Rejected because:** Haven content doesn't "live" in folders. Showing a tree structure implies a location hierarchy that doesn't exist. Content is organized by transformation state and source identity, not by path.

#### ❌ Central Media Player as Workspace
**Rejected because:** This is not a media consumption app. It's an archival verification system. The player is an inspection tool, not the primary interface. It belongs in a detail panel, not center stage.

#### ❌ Action-Heavy Toolbar
**Rejected because:** Most user time is spent observing, not acting. A prominent toolbar implies frequent operations. Instead, actions should emerge contextually when relevant.

#### ❌ Tab-Based Content Organization
**Rejected because:** Tabs imply discrete, unrelated sections. Haven's content exists on a transformation continuum. Filtering by state is more appropriate than switching "tabs."

#### ❌ Modal-Heavy Configuration
**Rejected because:** Settings shouldn't interrupt the observation flow. Configuration should slide in/out or exist in dedicated settings pages, not block the primary canvas.

#### ❌ Notification Center
**Rejected because:** Discrete notifications imply events that need immediate response. Haven should show system state continuously, not alarm users with popups. State is visible; events are integrated.

#### ❌ File Path Display
**Rejected because:** Users should never see `/Users/name/recordings/video.mp4`. They should see `PumpFun > Token XYZ > Recording 3`. The path is infrastructure; the identity is meaning.

---

## 9) Spatial Signature

### The 3 Defining Layout Choices

#### 1. **Transformation-First Content Grouping**

Content cards show transformation state BEFORE metadata. The first thing you see is "Uploading" or "Preserved," not the video title. This reinforces that Haven is about transformation verification, not content browsing.

```
┌────────────────────────────────┐
│ ◉ UPLOADING 47%               │  ← State dominates
│ ─────────────────────────────  │
│ Stream: Token ABC              │
│ Duration: 4:32                 │
│ Encrypted: Yes                 │
└────────────────────────────────┘
```

#### 2. **Source-to-Sink Flow Direction**

The interface flows left-to-right, matching the transformation pipeline:
- **Left:** Sources (input, discovery, subscription)
- **Center:** Content in transformation
- **Right:** Details (output, verification, exploration)

This spatial flow mirrors the mental model of content moving through preservation stages.

#### 3. **Persistent Operation Visibility Without Dominance**

The queue tray remains visible but doesn't demand attention. It's infrastructure—important to verify, not to watch. Users glance down to confirm operations are happening, then return focus to the content canvas.

This creates a **NASA Mission Control** pattern: critical metrics visible peripherally, primary focus on the mission (content).

---

## Implementation Notes

### Component Mapping to Zones

| Zone | Existing Components | Needed Changes |
|------|--------------------| ---------------|
| Source Navigator | `Sidebar.tsx` | Refactor to show plugins/sources, not page navigation |
| Transformation Canvas | `VideoGrid.tsx`, `TokenGroup.tsx` | Add state badges, transformation-first layout |
| Health Pulse Bar | `Header.tsx` | Add backend/wallet/points status |
| Operation Queue Tray | `UploadWorkerConfig.tsx` (partial) | Create dedicated queue status tray |
| Detail Panel | `VideoPlayer.tsx`, `ConfigurationModal.tsx` | Convert to slide-out panel pattern |

### State Management Needs

- Global state for transformation pipeline visibility
- Real-time updates from backend for queue status
- WebSocket or polling for recording progress
- Centralized error state surfacing

### Design System Alignment

The existing `liquidGlassTheme.ts` provides the foundation:
- Use neon colors for state indicators (cyan for progress, magenta for active, amber for verified)
- Glass surfaces for cards and panels
- Glow effects for active/attention states
- Dark canvas background for contrast

---

## Summary

Haven's spatial architecture should embody the post-filesystem paradigm by:

1. **Eliminating location-based thinking** entirely—no paths, no folders, no "where is it"
2. **Centering transformation state** as the primary organizing principle
3. **Making verification effortless** through persistent health indicators
4. **Allowing observation without demanding action** through careful UI density
5. **Following the transformation flow** spatially from source (left) to preservation (right)

The user who opens Haven should immediately understand:
- What's being recorded
- What's being preserved
- What needs attention
- Whether the system is healthy

Without ever asking "where is my file."
