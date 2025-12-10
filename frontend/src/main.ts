import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { registerRenderCrashLogger } from './utils/registerRenderCrashLogger';
import { uploadVideoToFilecoin } from './services/filecoinService';
import type { FilecoinConfig } from './types/filecoin';

// Check if we're in development mode - only true if explicitly set or --dev flag
const isDev = process.argv.includes('--dev') || (process.env.NODE_ENV === 'development' && process.argv.includes('--serve'));

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

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

  registerRenderCrashLogger(mainWindow.webContents);

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
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
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
      
      // Decrypt private key if available (never stored in plaintext)
      if (!config.encryptedPrivateKey || !safeStorage.isEncryptionAvailable()) {
        return null;
      }

      try {
        const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
        const privateKey = safeStorage.decryptString(encryptedBuffer);
        return {
          privateKey,
          rpcUrl: config.rpcUrl,
          dataSetId: config.dataSetId,
        };
      } catch (error) {
        console.error('Failed to decrypt private key:', error);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to load Filecoin config:', error);
    return null;
  }
});

ipcMain.handle(
  'upload-to-filecoin',
  async (
    _event,
    args: {
      videoPath: string;
      config: FilecoinConfig;
    }
  ) => {
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    const { videoPath, config } = args;

    const fileStats = fs.statSync(videoPath);
    if (!fileStats.isFile()) {
      throw new Error(`Path is not a file: ${videoPath}`);
    }

    const fileBuffer = fs.readFileSync(videoPath);
    const fileName = path.basename(videoPath);
    const mimeType = getMimeType(videoPath);

    // Convert Buffer to Uint8Array before wrapping in Blob/File to satisfy TS/DOM typings.
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    const result = await uploadVideoToFilecoin({
      file,
      config,
      filePath: videoPath,
      onProgress: (progress) => {
        mainWindow?.webContents.send('filecoin-upload-progress', {
          videoPath,
          progress,
        });
      },
    });

    return result;
  }
);

ipcMain.handle('save-filecoin-config', async (_event, config: { privateKey: string; rpcUrl?: string; dataSetId?: number }) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
    
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system; cannot save private key.');
    }

    let encryptedPrivateKey: string | undefined;
    try {
      const encrypted = safeStorage.encryptString(config.privateKey);
      encryptedPrivateKey = encrypted.toString('base64');
    } catch (error) {
      console.error('Failed to encrypt private key:', error);
      throw new Error('Failed to encrypt private key');
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

async function loadDecryptedFilecoinConfig(): Promise<{ privateKey: string; rpcUrl?: string; dataSetId?: number } | null> {
  const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
  if (!fs.existsSync(configPath)) return null;
  const data = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(data);

  if (!config.encryptedPrivateKey) {
    return null;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available; cannot decrypt private key.');
  }

  const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
  const privateKey = safeStorage.decryptString(encryptedBuffer);
  return {
    privateKey,
    rpcUrl: config.rpcUrl,
    dataSetId: config.dataSetId,
  };
}

ipcMain.handle('start-backend', async () => {
  if (backendProcess && !backendProcess.killed) {
    return { pid: backendProcess.pid, message: 'Backend already running' };
  }

  const cfg = await loadDecryptedFilecoinConfig();
  if (!cfg || !cfg.privateKey) {
    throw new Error('Filecoin config with private key is not available. Please configure Filecoin settings first.');
  }

  const backendDir = path.join(app.getAppPath(), '..', 'backend');
  const env = {
    ...process.env,
    FILECOIN_PRIVATE_KEY: cfg.privateKey,
    FILECOIN_RPC_URL: cfg.rpcUrl || 'http://127.0.0.1:8545',
  };

  backendProcess = spawn(
    'python',
    ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'],
    {
      cwd: backendDir,
      env,
      stdio: 'inherit',
    }
  );

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });

  return { pid: backendProcess.pid, message: 'Backend started' };
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});