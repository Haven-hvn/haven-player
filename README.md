# Haven Player

A modern video analysis application with Electron + FastAPI architecture. Haven Player provides AI-powered video analysis with a sleek, dark-themed interface.

## 📸 Screenshots

> **Note**: Screenshots will be added here to showcase the application interface

### Main Application Interface

_Coming soon: Dark-themed video analysis dashboard with sidebar navigation_

### Video Analysis Progress

_Coming soon: Real-time progress visualization with timeline segments_

### Configuration Modal

_Coming soon: AI model configuration and settings interface_

## 🏗️ Architecture

Haven Player follows a modern microservices architecture with clear separation between frontend and backend:

### 🔧 Backend (FastAPI + SQLAlchemy)

- **📍 Location**: `backend/`
- **⚡ Core Technology**: FastAPI, SQLAlchemy, SQLite
- **🚀 Key Features**:
  - RESTful API with automatic OpenAPI documentation
  - Video metadata management and storage
  - AI analysis timestamps with confidence tracking
  - VLM (Vision Language Model) integration
  - Job queue management for batch processing
- **🗄️ Database**: SQLite with optimized schemas for videos, timestamps, and analysis jobs
- **🧪 Testing**: 100% test coverage with pytest and comprehensive integration tests

### 🖥️ Frontend (Electron + React)

- **📍 Location**: `frontend/`
- **⚡ Core Technology**: Electron, React 18, TypeScript, Material-UI v5
- **🎨 UI Features**:
  - Dark theme with custom Material-UI theming
  - Real-time video analysis visualization
  - Interactive progress tracking with timeline segments
  - Responsive grid and list layouts
  - Modal-based configuration management
- **🧪 Testing**: Jest + React Testing Library with component and integration tests

### 🔄 Communication Flow

```
Electron App ↔ React Frontend ↔ FastAPI Backend ↔ SQLite Database
                      ↕                    ↕
              Material-UI Components    VLM Services
```

## ✨ Key Features

### 🎯 AI-Powered Video Analysis

- **🤖 VLM Integration**: Advanced Vision Language Model processing for intelligent video analysis
- **📊 Dynamic Progress Tracking**: Real-time visualization of analysis progress with interactive timeline
- **🔄 Batch Processing**: "Analyze All" functionality for efficient bulk video processing
- **📈 Status Management**: Comprehensive status indicators (pending, analyzing, completed, error)
- **⏱️ Timestamp Precision**: Frame-accurate analysis with confidence scoring

### 🎨 Modern User Experience

- **🌙 Dark Theme Design**: Sleek #2a2a2a background with carefully crafted contrast ratios
- **🧭 Intuitive Navigation**: Clean sidebar with vertical icon layout for easy access
- **📱 Responsive Interface**: Adaptive layouts that work across different screen sizes
- **✨ Smooth Interactions**: Hover effects and transitions for enhanced user experience
- **⚡ Real-time Updates**: Live data synchronization across all interface components

### 📊 Advanced Data Management

- **🗃️ Smart Storage**: Efficient video metadata management with SQLite optimization
- **🔗 RESTful Architecture**: Clean API design following REST principles
- **📈 Confidence Tracking**: AI analysis results with detailed confidence metrics
- **🔄 Job Queue System**: Background processing with progress monitoring
- **💾 Persistent State**: Reliable data persistence across application sessions

### 🛠️ Developer-Friendly Features

- **📋 OpenAPI Documentation**: Auto-generated API docs at `/docs` endpoint
- **🧪 Comprehensive Testing**: 100% backend coverage with extensive frontend tests
- **📦 Type Safety**: Full TypeScript implementation with strict mode
- **🔧 Development Tools**: Hot reload, debugging, and development server setup

## 🚀 Quick Start

### 📋 Prerequisites

- **🐍 Python 3.12+** - Required for backend services
- **📦 Node.js 18+** - Required for frontend development and Electron
- **🔧 Git** - For version control and cloning the repository

### ⚡ Installation & Setup

#### 1️⃣ Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Start the development server
uvicorn app.main:app --reload
```

🌐 **Backend will be running at**: `http://localhost:8000`
📖 **API Documentation**: `http://localhost:8000/docs` (Auto-generated OpenAPI docs)

#### 2️⃣ Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Build the application
npm run build

# Start the Electron application
npm start
```

#### 3️⃣ Verification

- ✅ Backend API responds at `localhost:8000/api/videos/`
- ✅ Frontend launches with dark-themed interface
- ✅ Both services communicate successfully

### 🔄 Development Mode

For active development with hot reload:

```bash
# Terminal 1: Backend with auto-reload
cd backend && uvicorn app.main:app --reload

# Terminal 2: Frontend with hot reload
cd frontend && npm run dev
```

## 🔗 API Endpoints

### 📹 Video Management

- **`GET /api/videos/`** - Retrieve all videos with metadata and analysis status
- **`POST /api/videos/`** - Create a new video entry with validation
- **`DELETE /api/videos/{video_path}`** - Remove video and associated data
- **`PUT /api/videos/{video_path}/move-to-front`** - Reorder videos for priority processing

### ⏱️ Timestamp & Analysis

- **`POST /api/videos/{video_path}/timestamps/`** - Add AI analysis timestamps with confidence scores
- **`GET /api/videos/{video_path}/timestamps/`** - Retrieve video analysis timestamps
- **`GET /api/videos/{video_path}/analysis-status`** - Get current analysis progress

### ⚙️ Configuration & Jobs

- **`GET /api/config/vlm`** - Retrieve VLM configuration settings
- **`POST /api/config/vlm`** - Update VLM model parameters
- **`GET /api/jobs/`** - Monitor analysis job queue
- **`POST /api/jobs/batch-analyze`** - Start batch analysis for multiple videos

### 📖 Documentation

- **`GET /docs`** - Interactive OpenAPI documentation (Swagger UI)
- **`GET /redoc`** - Alternative API documentation (ReDoc)

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
