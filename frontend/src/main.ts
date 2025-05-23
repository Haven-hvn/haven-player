import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';

// Check if we're in development mode - only true if explicitly set or --dev flag
const isDev = process.argv.includes('--dev') || (process.env.NODE_ENV === 'development' && process.argv.includes('--serve'));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // TODO: Improve security later with preload script
    },
  });

  // Always load from local files unless explicitly in dev mode with --dev flag
  const indexPath = path.join(__dirname, 'index.html');
  
  if (isDev) {
    console.log('Loading from development server: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Loading from local file:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle file selection
ipcMain.handle('select-video', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'mkv'] }
    ]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
}); 