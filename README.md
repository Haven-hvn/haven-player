# Haven Player

> **Encrypted. Local. Yours forever.**

A video management application that puts you in control. Store your videos locally, encrypt them for privacy, and access them from anywhere—without giving up ownership of your data.

![screenshot](https://github.com/user-attachments/assets/c4e6d7a9-3317-4374-a816-c5f505e8a1b)

## Why Haven Player?

**Your videos, your rules.**

Most video platforms make you choose between convenience and control. Either you host everything yourself (high maintenance) or you upload to a service that controls access to your data (loss of privacy). Haven Player offers a third path:

- **Local-first**: Your videos live on your machine. Fast access, no bandwidth costs.
- **Encrypted**: Your private videos stay private. Only you (or people you authorize) can view them.
- **Portable**: Take your entire library with you. Restore it anywhere. Your catalog syncs across devices.
- **Share without hosting**: Grant access to specific people without running a public server.

## Features

### 🔒 Client-Side Encryption
Encrypt videos before they leave your machine. Only holders of the encryption key can decrypt and view the content. Even if the encrypted files are publicly accessible, they remain unreadable without authorization.

Access controls let you define who can decrypt your content:
- Only you (default)
- Specific accounts you designate
- Members of a group you define
- Holders of specific credentials

### 📥 Plugin-Based Media Ingestion
Archive videos from multiple sources through a unified interface:

| Plugin | Source Type | Use Case |
|--------|-------------|----------|
| **YouTube** | Video platforms | Archive channels, tutorials, livestreams |
| **BitTorrent** | P2P networks | Download and archive distributed content |
| **WebRTC/Live** | Real-time streams | Record live sessions, webinars, broadcasts |
| **OpenRing** | Ring streams | Archive video doorbell footage |

### 🤖 Automatic Recording Agent
Set rules for what to record and when. The agent monitors sources continuously and archives content matching your criteria—automatically, in the background.

### 🧠 AI Video Analysis
Built-in visual language model (VLM) processing analyzes your videos:
- Automatic content tagging
- Timeline visualization of analyzed segments
- Searchable metadata

### 🔄 Catalog Restore & Sync
Your video catalog (metadata, analysis, access controls) can be synchronized across devices. Lose your machine? Restore your entire library catalog from backup. The encrypted video files can be retrieved separately using their content identifiers.

### 📊 Spatial Operations Dashboard
Visual interface showing:
- Active recording operations
- Plugin health and status
- Storage utilization
- Processing queue

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ELECTRON FRONTEND                        │
│  • Dark-themed UI (Material-UI)                             │
│  • Video player with timeline visualization                 │
│  • Plugin configuration panels                              │
│  • Operations dashboard                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND                           │
│  • RESTful API for video/metadata management                │
│  • Plugin system (YouTube, BitTorrent, WebRTC, etc.)        │
│  • AI analysis pipeline                                     │
│  • Upload coordination                                      │
│  • SQLite database (local)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- FFmpeg (optional, for better video quality)
- Deno or Node.js runtime (for YouTube downloads)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API available at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run build
npm start
```

### YouTube Plugin Setup

For full YouTube functionality, install a JavaScript runtime:

```bash
# macOS
brew install deno

# Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows
# Download from https://deno.land/install
```

For age-restricted content, configure authentication cookies via the plugin settings.

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Source     │────▶│   Local      │────▶│  Encrypted   │
│  (Plugin)    │     │   Storage    │     │   Backup     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                    │
                            ▼                    ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   AI         │     │   Access     │
                     │   Analysis   │     │   Controls   │
                     └──────────────┘     └──────────────┘
```

1. **Ingest**: Plugins download or record from various sources
2. **Store**: Videos saved to local SQLite + filesystem
3. **Analyze**: Optional AI processing extracts metadata
4. **Encrypt** (optional): Files encrypted with access controls
5. **Backup** (optional): Encrypted copies stored with retrieval credentials
6. **Restore**: Catalog metadata syncs; encrypted files retrieved on demand

## Encryption & Access Control

Haven Player uses threshold encryption for access control:

- **Encryption**: Files are encrypted locally before any network operation
- **Access Policies**: You define who can decrypt using account lists, group membership, or credential ownership
- **Decryption**: Only authorized parties can reconstruct the encryption key

No centralized server ever holds the decryption key. If you lose your key, the encrypted data cannot be recovered—just as it should be for true data ownership.

## Project Structure

```
haven-player/
├── backend/              # FastAPI server
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── models/       # Database models
│   │   ├── plugins/      # Built-in plugins (YouTube, BitTorrent, etc.)
│   │   └── services/     # Business logic
│   └── tests/
├── frontend/             # Electron + React app
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API services, encryption
│   │   └── main.ts       # Electron main process
│   └── tests/
└── docs/                 # Architecture documentation
```

## Testing

Backend:
```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

Frontend:
```bash
cd frontend
npm test
```

## Development

### Backend Development
```bash
cd backend
uvicorn app.main:app --reload
```

### Frontend Development
```bash
cd frontend
npm run dev
```

## Security Notes

- **Private keys**: Never commit credentials to version control
- **Cookies**: Authentication cookies contain sensitive data—store securely
- **Encryption**: Encrypted files without the key are unrecoverable. Back up your keys.

## License

MIT License
