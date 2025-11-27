# Haven Player Frontend

This is the frontend application for Haven Player, built with Electron, React, TypeScript, and Material-UI.

## Features

- **Modern Light Theme Interface** with clean, minimal design
- **Sidebar Navigation** with vertical icons
- **Header with Video Counter** and add/analyze buttons
- **Dynamic Video Analysis List** with timeline visualization
- **Real-time Analysis Progress** indicators
- **Video Player** with playback controls
- **Filecoin Integration** for decentralized video storage
- **Lit Protocol Encryption** for optional end-to-end video encryption

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

## Development

For development with hot reloading:
```bash
npm run dev
```

## Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Watch mode for tests:
```bash
npm run test:watch
```

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
