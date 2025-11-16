import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
    // DevTools not opened by default - use Cmd+Shift+I / Ctrl+Shift+I to toggle
    // Or use the bug icon in the UI to view console logs via LogViewer
  }
  
  // Add keyboard shortcut to toggle DevTools (Cmd+Option+I or Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    }
  });

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
      { name: 'Videos', extensions: ['ts', 'mp4', 'webm', 'mkv'] }
    ]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Handle reading video file as File object data
ipcMain.handle('read-video-file', async (_event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(filePath);

    return {
      name: fileName,
      size: stats.size,
      type: mimeType,
      data: buffer.buffer,
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.ts': 'video/mp2t',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Handle Filecoin configuration storage
ipcMain.handle('get-filecoin-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      
      // Decrypt private key if available
      if (config.encryptedPrivateKey && safeStorage.isEncryptionAvailable()) {
        try {
          const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
          config.privateKey = safeStorage.decryptString(encryptedBuffer);
        } catch (error) {
          console.error('Failed to decrypt private key:', error);
          return null;
        }
      }
      
      return {
        privateKey: config.privateKey,
        rpcUrl: config.rpcUrl,
        dataSetId: config.dataSetId,
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to load Filecoin config:', error);
    return null;
  }
});

ipcMain.handle('save-filecoin-config', async (_event, config: { privateKey: string; rpcUrl?: string; dataSetId?: number }) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
    
    // Encrypt private key if encryption is available
    let encryptedPrivateKey: string | undefined;
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(config.privateKey);
        encryptedPrivateKey = encrypted.toString('base64');
      } catch (error) {
        console.error('Failed to encrypt private key:', error);
        throw new Error('Failed to encrypt private key');
      }
    }
    
    const dataToSave = {
      encryptedPrivateKey,
      rpcUrl: config.rpcUrl,
      dataSetId: config.dataSetId,
    };
    
    fs.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save Filecoin config:', error);
    throw new Error(`Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}); 