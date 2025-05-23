# Haven Player Frontend

This is the frontend application for Haven Player, built with Electron, React, TypeScript, and Material-UI.

## Features

- **Dark Theme Interface** (#2a2a2a background)
- **Sidebar Navigation** with vertical icons
- **Header with Video Counter** and add/analyze buttons
- **Dynamic Video Analysis List** with timeline visualization
- **Real-time Analysis Progress** indicators
- **Video Player** with playback controls

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

## GUI Specifications

The application follows a specific design with:

### Layout
- **Sidebar**: 60px wide, dark background (#2a2a2a), vertical icons
- **Header**: 60px high, video counter, add button (+), analyze all button
- **Main Area**: Dynamic video list with analysis visualization

### Video Analysis Interface
Each video shows:
- **Thumbnail**: 160x90px extracted from video
- **Metadata**: Index number, filename, duration
- **Analysis Bar**: Timeline with blue segments for analyzed portions
- **Status Indicator**: Pending, analyzing, completed, or error states
- **Action Button**: Play, analyze, or retry based on status

### Dynamic Behaviors
- Video counter updates automatically
- Analysis bars show real-time progress
- Status indicators change during processing
- Timeline segments reflect AI detection results

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