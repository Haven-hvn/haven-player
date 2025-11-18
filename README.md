# Haven Player

A modern video analysis application with Electron + FastAPI architecture. Haven Player provides AI-powered video analysis with a sleek, dark-themed interface.

## 📸 Screens

### Main Application Interface

Sleek Dark-themed video analysis dash

![Screenshot 2025-06-21 040505](https://github.com/user-attachments/assets/f3a1857a-affc-4331-a67f-5fb2600a402b)
board with sidebar navigation_

### Video Analysis Progress

Real-time progress visualization 

![Screenshot 2025-06-21 040642](https://github.com/user-attachments/assets/40c6eade-4392-4fd9-95f0-e9e27e475032)

### Configuration Modal

AI model configuration and settings interface

![Screenshot 2025-06-21 040603](https://github.com/user-attachments/assets/623791a0-95d8-4eba-b122-e29efb48dc0f)
![Screenshot 2025-06-21 040548](https://github.com/user-attachments/assets/ea0745f9-3738-4a7e-9c8a-786867a7cad2)


## Architecture

This application consists of two main components:

### Backend (FastAPI + SQLAlchemy)
- **Location**: `backend/`
- **Technology**: FastAPI, SQLAlchemy, SQLite
- **Features**: RESTful API, video metadata management, AI analysis timestamps
- **Database**: SQLite with videos and timestamps tables
- **Testing**: 100% test coverage with pytest

### Frontend (Electron + React)
- **Location**: `frontend/`
- **Technology**: Electron, React, TypeScript, Material-UI
- **Features**: Dark theme UI, video analysis visualization, real-time progress tracking
- **Testing**: Jest + React Testing Library

## Key Features

### 🎯 AI Video Analysis Interface
- **Dynamic video list** with real-time analysis progress
- **Timeline visualization** showing analyzed segments
- **Status indicators** (pending, analyzing, completed, error)
- **Batch processing** with "Analyze All" functionality

### 🎨 Modern UI Design
- **Dark theme** (#2a2a2a background)
- **Sidebar navigation** with vertical icons
- **Header with counters** and action buttons
- **Responsive layout** with hover effects

### 📊 Data Management
- **Video metadata** storage and retrieval
- **AI analysis timestamps** with confidence scores
- **RESTful API** for all operations
- **Real-time updates** across the interface

## Quick Start

### Prerequisites
- **Python 3.12+** for backend
- **Node.js 18+** for frontend
- **Git** for version control
- **MetaMask** browser extension (for Filecoin wallet setup)

### Filecoin Wallet Setup

Haven Player supports uploading videos to Filecoin using the Calibration testnet. To use this feature, you'll need to set up a wallet with testnet tokens.

#### 1. Install and Configure MetaMask

1. **Install MetaMask**:
   - Download and install MetaMask from [metamask.io](https://metamask.io/)
   - Create a new wallet or import an existing one
   - **Important**: Use a test wallet for development. Never use your main wallet with real funds.

2. **Add Filecoin Calibration Testnet to MetaMask**:
   - Open MetaMask and click the network dropdown (top of the extension)
   - Click "Add Network" or "Add a network manually"
   - Enter the following details:
     - **Network Name**: `Filecoin Calibration`
     - **New RPC URL**: `https://api.calibration.node.glif.io/rpc/v1`
     - **Chain ID**: `314159`
     - **Currency Symbol**: `tFIL`
     - **Block Explorer URL**: `https://calibration.filscan.io/`
   - Click "Save"

   Alternatively, you can use [chainid.network](https://chainid.network/) to add the network automatically.

#### 2. Get Testnet FIL (tFIL) Tokens

Testnet FIL is required to pay for transaction fees (gas) on the Calibration testnet.

1. **Get tFIL from the Faucet**:
   - Visit the [Filecoin Calibration Faucet](https://faucet.calibnet.chainsafe-fil.io/)
   - Enter your MetaMask wallet address (copy it from MetaMask)
   - Click "Send Funds" or "Request tFIL"
   - Wait a few minutes for the transaction to complete
   - Verify receipt by checking your MetaMask balance (should show tFIL)

   **Note**: You may need to request multiple times if you need more tokens. The faucet typically provides a small amount per request.

#### 3. Get Testnet USDFC Tokens

USDFC (USD Filecoin) tokens are required for storage payments when uploading videos to Filecoin.

1. **Mint Test USDFC**:
   - Visit the [USDFC Testnet Application](https://stg.usdfc.net)
   - Connect your MetaMask wallet (make sure you're on the Calibration testnet)
   - Navigate to the "Trove" or "Mint" section
   - Follow the instructions to mint test USDFC using your tFIL as collateral
   - You'll need some tFIL in your wallet to use as collateral

   **Alternative**: Some faucets may provide USDFC directly. Check the [Secured Finance documentation](https://docs.secured.finance/usdfc-stablecoin/getting-started/getting-test-usdfc-on-testnet) for the latest methods.

#### 4. Export Your Private Key

To use your wallet in Haven Player, you'll need to export your private key from MetaMask:

1. **Export Private Key from MetaMask**:
   - Open MetaMask extension
   - Click the three dots (menu) in the top right
   - Select "Account details"
   - Click "Export Private Key"
   - Enter your MetaMask password
   - **Copy the private key** (it will look like: `0x1234...` or just `1234...`)
   - **Important**: Keep this private key secure and never share it publicly

2. **Configure in Haven Player**:
   - Open Haven Player
   - Navigate to the Filecoin configuration (usually in settings or via a Filecoin upload button)
   - Paste your private key into the "Private Key" field
   - The application will automatically add the `0x` prefix if it's missing
   - The RPC URL should default to: `wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1`
   - Optionally, enter a Data Set ID if you want to use an existing dataset
   - Click "Save Configuration"

#### 5. Verify Your Setup

Before uploading videos, verify that:
- ✅ MetaMask is configured with the Calibration testnet
- ✅ Your wallet has tFIL tokens (for gas fees)
- ✅ Your wallet has USDFC tokens (for storage payments)
- ✅ Your private key is correctly configured in Haven Player
- ✅ The RPC URL is set correctly

#### Security Best Practices

- **Never share your private key**: Keep it secure and never commit it to version control
- **Use a test wallet**: Create a separate MetaMask wallet specifically for testing
- **Testnet tokens only**: Remember that testnet tokens (tFIL, test USDFC) have no real value
- **Backup your wallet**: Make sure you have your MetaMask seed phrase backed up securely

#### Troubleshooting

**Issue**: "Synapse SDK initialization timed out"
- **Solution**: Verify your RPC URL is correct: `wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1`

**Issue**: "Upload blocked: Payment setup incomplete"
- **Solution**: Ensure you have both tFIL (for gas) and USDFC (for storage payments) in your wallet

**Issue**: "Invalid private key format"
- **Solution**: The private key should be 66 characters with `0x` prefix, or 64 characters without. MetaMask exports without `0x`, but the app will add it automatically.

**Issue**: "Insufficient balance"
- **Solution**: Request more tFIL from the faucet or mint more USDFC using your tFIL collateral

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run build
npm start
```

## API Endpoints

- `GET /api/videos/` - Get all videos
- `POST /api/videos/` - Create a new video
- `POST /api/videos/{video_path}/timestamps/` - Add AI analysis timestamps
- `GET /api/videos/{video_path}/timestamps/` - Get video timestamps
- `DELETE /api/videos/{video_path}` - Delete a video
- `PUT /api/videos/{video_path}/move-to-front` - Reorder videos

## Testing

### Backend Tests
```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

### Frontend Tests
```bash
cd frontend
npm test
npm run test:coverage
```

## GUI Specifications

The interface follows a data-driven design:

### Layout Structure
```
┌─[Sidebar]─┬─[Header: Counter + Add + Analyze All]─┐
│           │                                      │
│ [Icons]   │ [Video 1: Thumbnail | Meta | ████▓▓ | Status | Action] │
│           │ [Video 2: Thumbnail | Meta | ██▓▓▓▓ | Status | Action] │
│           │ [Video 3: Thumbnail | Meta | ▓▓▓▓▓▓ | Status | Action] │
│           │                                      │
└───────────┴──────────────────────────────────────┘
```

### Video Analysis Visualization
- **Blue segments** (████): AI-analyzed portions
- **Gray segments** (▓▓▓▓): Unanalyzed or no-content areas
- **Progress bars**: Real-time analysis status
- **Dynamic counters**: Auto-updating video counts

## Development

### Backend Development
```bash
cd backend
pytest  # Run tests
uvicorn app.main:app --reload  # Development server
```

### Frontend Development
```bash
cd frontend
npm run dev  # Development with hot reload
npm test  # Run tests
```

## Migration Notes

This project represents a complete migration from the original PyQt desktop application to a modern web-based architecture:

### ✅ Migration Complete
- ✅ **Backend**: PyQt SQLite → FastAPI + SQLAlchemy
- ✅ **Frontend**: PyQt GUI → Electron + React + TypeScript
- ✅ **Database**: Direct access → RESTful API
- ✅ **UI**: Native widgets → Material-UI components
- ✅ **Testing**: Manual → 100% automated test coverage
- ✅ **Architecture**: Monolithic → Microservices-ready

### Key Improvements
- **Cross-platform**: Runs on Windows, macOS, Linux
- **Scalable**: API-first architecture
- **Modern**: React with TypeScript and Material-UI
- **Tested**: Complete unit and integration test coverage
- **Maintainable**: Clean separation of concerns

## Project Structure

```
haven-player/
├── backend/           # FastAPI server
│   ├── app/
│   │   ├── api/       # API endpoints
│   │   ├── models/    # Database models
│   │   └── main.py    # FastAPI app
│   ├── tests/         # Backend tests
│   └── requirements.txt
├── frontend/          # Electron + React app
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── services/    # API services
│   │   ├── types/       # TypeScript types
│   │   └── main.ts      # Electron main process
│   ├── tests/         # Frontend tests
│   └── package.json
└── README.md
```

## Contributing

1. Follow TypeScript strict mode guidelines
2. Maintain 100% test coverage
3. Use proper type definitions (no `any` types)
4. Follow the established GUI specifications
5. Write tests for all new features

## License

MIT License 
