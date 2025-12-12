# Haven Player Frontend

This is the frontend application for Haven Player, built with Electron, React, TypeScript, and Material-UI.

## Features

This frontend now includes a **Haven “Loom” workspace** (Navigator / Canvas / Marginalia) that is **fully interactive using typed sample data** (no backend required for UI testing).

Key UI surfaces:

- **Artifacts**: rich objects with metadata, provenance, integrity indicators, access policy + “encrypt before upload” (UI-only), discussion, and curator notes
- **Pipeline**: capture → analyze → archive → replay (simulated jobs, progress, outputs)
- **Hubs**: collections, members/roles (UI-gated), governance proposals/voting (simulated), moderation queue/actions (simulated)
- **Operators / DePIN**: operator marketplace, operator dashboard, rewards/settlement ledger (simulated)
- **Threads overlay**: Loom “threads” via `three` + `@react-three/fiber` (interactive when the Marginalia “Threads” tab is active)

## Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Build the application:
```bash
npm run build
```

4. Start the Electron application:
```bash
npm start
```

### Backend note (for Loom UI testing)
- The Loom workspace is designed to be **testable without a backend** (it uses sample data and local persistence).
- Some older “video-app” features referenced in this README may not apply to the Loom workspace.

## Development

For development with hot reloading:
```bash
npm run dev
```

## Testing

### Run unit tests
Run the test suite:
```bash
npm test
```

### Run tests with coverage
Run tests with coverage:
```bash
npm run test:coverage
```

Watch mode for tests:
```bash
npm run test:watch
```

## Manual UI test checklist (Loom workspace)

### Library / Artifacts
- Select an artifact in **Library** → ensure the **Artifact detail** opens
- Edit **title**, **access policy**, toggle **Encrypt before upload (UI-only)**
- Add a **timestamp tag** and a **summary segment**
- Add a **discussion comment** and verify it appears in Marginalia → Discussion
- Edit **Curator notes** in the artifact view and in Marginalia → Curator notes (both should persist)

### Reciprocity prompts
- In the artifact view, use **Reciprocity prompts**:\n+  - “Verify provenance” should add a verification indicator and append a provenance step\n+  - “Add curator notes” should prefill notes when empty\n+  - “Tag a key moment” should prefill the timestamp/tag inputs

### Pipeline (simulated)
- Navigate to Pipeline → **Capture**:\n+  - “Ingest as new artifact + queue capture” should create an artifact and a capture job\n+- Create a job in any stage and click **Advance +10%** until completion\n+  - Analyze completion should append simulated tags/summaries\n+  - Archive completion should assign a simulated CID\n+- Archive → “Share to Arkiv” → Publish (simulated)\n+- Replay → change playback source and toggle provenance overlay (UI-only)

### Hubs / social / governance / moderation
- Open a Hub → Collections:\n+  - Create a collection\n+  - Add artifacts to the collection\n+  - Reorder items using Up/Down buttons\n+  - Remove an item from a collection\n+- Hub → Members & Roles:\n+  - Change a member role (Moderator/Archivist gating)\n+  - Add/remove a member (gated)\n+- Hub → Governance:\n+  - Create a proposal and vote Yes/No/Abstain\n+- Hub → Moderation:\n+  - Resolve a case with an action (gated)

### Operators / DePIN
- Operators → Marketplace:\n+  - Assign an operator to a queued/running capture/archive job\n+- Operators → Dashboard:\n+  - Verify assigned jobs appear\n+- Operators → Rewards & settlement:\n+  - Confirm rewards only accrue for completed jobs (“No Service, No Rewards”)

### Threads overlay
- Open Marginalia → **Threads** tab\n+- Use type filters (link/transclusion/discussion)\n+- Hover/click threads in the overlay to ensure selection syncs with the Marginalia Threads list

## Filecoin & Lit Protocol Integration

### Filecoin Storage
Videos can be uploaded to Filecoin for decentralized, permanent storage:
- Configure your Ethereum private key in the Filecoin Configuration modal
- Uses Filecoin Calibration testnet by default
- Supports custom RPC endpoints and data set IDs

### Lit Protocol Encryption (Optional)
Enable end-to-end encryption for your videos before uploading to Filecoin:
- **Toggle encryption** in the Filecoin Configuration modal
- **Owner-only access** - only your wallet can decrypt the videos
- **Uses Datil-dev network** - free development network, no payment required
- **Automatic decryption** - videos decrypt seamlessly during playback

#### How It Works
1. Enable "Encrypt videos before upload" in Filecoin settings
2. When uploading, videos are encrypted client-side using Lit Protocol
3. Encrypted videos are stored on Filecoin
4. When playing, videos are automatically decrypted using your wallet's private key
5. Encrypted videos show a lock icon during playback

## GUI Specifications

The application follows a specific design with:

### Layout
- **Sidebar**: 60px wide, light gradient background, vertical navigation icons
- **Header**: 60px high, video counter, add button (+), analyze all button
- **Main Area**: Dynamic video list with analysis visualization

### Video Analysis Interface
Each video shows:
- **Thumbnail**: 160x90px extracted from video
- **Metadata**: Index number, filename, duration
- **Analysis Bar**: Timeline with segments for analyzed portions
- **Status Indicator**: Pending, analyzing, completed, or error states
- **Action Button**: Play, analyze, or retry based on status
- **Upload Button**: Upload to Filecoin (with optional encryption)
- **Encryption Badge**: Lock icon for encrypted videos

### Dynamic Behaviors
- Video counter updates automatically
- Analysis bars show real-time progress
- Status indicators change during processing
- Timeline segments reflect AI detection results
- Encryption/decryption status shown during video operations

## Building for Production

To package the application:
```bash
npm run make
```

This will create distributables in the `out` folder.

## Architecture

- **Electron Main Process**: `src/main.ts`
- **React Components**: `src/components/`
- **Haven sample-data domain**: `src/haven/`
- **Custom Hooks**: `src/hooks/`
- **API Services**: `src/services/`
- **Type Definitions**: `src/types/`

### Key Services
- **`api.ts`** - Backend API communication
- **`filecoinService.ts`** - Filecoin upload with optional encryption
- **`litService.ts`** - Lit Protocol encryption/decryption

### Key Hooks
- **`useVideos.ts`** - Video management and state
- **`useFilecoinUpload.ts`** - Filecoin upload with progress tracking
- **`useLitDecryption.ts`** - Video decryption during playback

## Dependencies

### Core
- React 19 with TypeScript
- Electron 39
- Material-UI 7
- three + @react-three/fiber (threads overlay)

### Blockchain
- **ethers** - Ethereum wallet operations
- **filecoin-pin** - Filecoin storage integration
- **@lit-protocol/*** - Lit Protocol encryption SDK (v7)

## Troubleshooting

### Build Out of Memory
If you encounter heap memory errors during build:
```bash
# The build script already includes increased memory allocation
npm run build
```

### Lit Protocol Network Issues
- Ensure you have a valid Ethereum private key configured
- The Datil-dev network is free and doesn't require tokens
- Check console logs for connection status
