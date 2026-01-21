import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { spawn, exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { platform } from 'os';
import { registerRenderCrashLogger } from './utils/registerRenderCrashLogger';
import { uploadVideoToFilecoin } from './services/filecoinService';
import type { FilecoinConfig } from './types/filecoin';
import type { IpfsGatewayConfig } from './types/playback';
import { DEFAULT_IPFS_GATEWAY, normalizeGatewayBase } from './services/playbackResolver';
import { decryptTextWithLit, deserializeEncryptionMetadata } from './services/litService';
import type { LitEncryptionMetadata } from './services/litService';
import { getUploadWorker } from './services/uploadWorker';
import type { UploadWorkerConfig } from './types/plugin';

// Check if we're in development mode - only true if explicitly set or --dev flag
const isDev = process.argv.includes('--dev') || (process.env.NODE_ENV === 'development' && process.argv.includes('--serve'));

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

// ============================================================================
// PHASE 1: Centralized IPC Handler Management
// ============================================================================

// Registry to track all IPC handlers for proper cleanup
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

// ============================================================================
// PHASE 2: Memory Monitoring
// ============================================================================

let memoryCheckInterval: NodeJS.Timeout | null = null;

function startMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
  
  memoryCheckInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    
    console.log('📊 Main process memory:', {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    });

    // Warn if heap exceeds 200MB when idle
    if (memoryUsage.heapUsed > 200 * 1024 * 1024) {
      console.warn('⚠️ Main process memory high - heap exceeds 200MB');
      
      // Trigger manual GC in development if available
      if (!app.isPackaged && (global as NodeJS.Global & { gc?: () => void }).gc) {
        console.log('🗑️ Running manual GC...');
        (global as NodeJS.Global & { gc?: () => void }).gc!();
      }
    }
  }, 60000); // Every minute
  
  console.log('📊 Memory monitoring started (interval: 60s)');
}

function stopMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
    console.log('🛑 Memory monitoring stopped');
  }
}

// ============================================================================
// PHASE 4: Window Event Listener Tracking
// ============================================================================

// Track webContents event listeners for cleanup
interface TrackedListener {
  event: string;
  listener: (...args: unknown[]) => void;
}
let webContentsListeners: TrackedListener[] = [];

// ============================================================================
// Helper Functions
// ============================================================================

// Helper function to find Python executable and venv info, checking for virtual environment first
function findPythonExecutable(backendDir: string): { pythonPath: string; venvPath: string | null } {
  const isWindows = platform() === 'win32';
  const pythonName = isWindows ? 'python.exe' : 'python';
  
  // Check for venv in backend directory
  const venvPaths = [
    path.join(backendDir, 'venv'),
    path.join(backendDir, '.venv'),
  ];
  
  for (const venvPath of venvPaths) {
    if (fs.existsSync(venvPath)) {
      const pythonPath = isWindows
        ? path.join(venvPath, 'Scripts', pythonName)
        : path.join(venvPath, 'bin', pythonName);
      
      if (fs.existsSync(pythonPath)) {
        console.log(`✅ Found Python in virtual environment: ${pythonPath}`);
        return { pythonPath, venvPath };
      }
    }
  }
  
  // Fall back to system Python
  console.log(`⚠️ No virtual environment found, using system Python: ${pythonName}`);
  return { pythonPath: pythonName, venvPath: null };
}

// Helper function to activate venv environment variables
function activateVenvEnvironment(venvPath: string | null, _backendDir: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isWindows = platform() === 'win32';
  const env = { ...baseEnv };
  
  if (venvPath) {
    // Set VIRTUAL_ENV variable (like activate script does)
    env.VIRTUAL_ENV = venvPath;
    
    // Add venv's Scripts/bin to PATH (prepend so venv takes precedence)
    const venvBinPath = isWindows
      ? path.join(venvPath, 'Scripts')
      : path.join(venvPath, 'bin');
    
    const currentPath = env.PATH || env.Path || '';
    const pathSeparator = isWindows ? ';' : ':';
    env.PATH = `${venvBinPath}${pathSeparator}${currentPath}`;
    if (isWindows) {
      env.Path = env.PATH; // Windows uses both PATH and Path
    }
    
    console.log(`🔧 Activated virtual environment: ${venvPath}`);
    console.log(`   Added to PATH: ${venvBinPath}`);
  } else {
    console.log(`⚠️ No virtual environment to activate, using system Python`);
  }
  
  return env;
}

// Helper function to spawn backend process with proper Windows handling
function spawnBackendProcess(
  pythonExecutable: string,
  venvPath: string | null,
  backendDir: string,
  baseEnv: NodeJS.ProcessEnv
): ChildProcess {
  const isWindows = platform() === 'win32';
  const uvicornArgs = ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'];
  
  // Activate venv environment (sets PATH, VIRTUAL_ENV, etc.)
  const env = activateVenvEnvironment(venvPath, backendDir, baseEnv);
  
  console.log(`🐍 Starting backend with Python: ${pythonExecutable}`);
  console.log(`📁 Backend directory: ${backendDir}`);
  console.log(`💻 Platform: ${platform()}`);
  if (venvPath) {
    console.log(`🔧 Virtual environment: ${venvPath}`);
  }
  
  let childProcess: ChildProcess;
  
  if (isWindows) {
    const fullCommand = `start "HavenPlayerBackend" cmd /k ""${pythonExecutable}" ${uvicornArgs.join(' ')}"`;
    
    console.log(`📝 Windows command: ${fullCommand}`);
    console.log(`📁 Working directory: ${backendDir}`);
    
    const execProcess = exec(fullCommand, {
      cwd: backendDir,
      env,
      windowsHide: false,
    }, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        console.error(`❌ Failed to start backend process on Windows: ${error.message}`);
        console.error(`   stdout: ${stdout}`);
        console.error(`   stderr: ${stderr}`);
      }
    });
    
    childProcess = execProcess as ChildProcess;
  } else {
    console.log(`📝 Command: ${pythonExecutable} ${uvicornArgs.join(' ')}`);
    
    childProcess = spawn(pythonExecutable, uvicornArgs, {
      cwd: backendDir,
      env,
      stdio: 'inherit',
    });
    
    childProcess.on('error', (error: Error) => {
      console.error(`❌ Failed to start backend process: ${error.message}`);
      console.error(`   Python executable: ${pythonExecutable}`);
      console.error(`   Backend directory: ${backendDir}`);
      if (venvPath) {
        console.error(`   Virtual environment: ${venvPath}`);
      }
    });
  }
  
  return childProcess;
}

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

// Helper function to detect chain and token from RPC URL
function detectChainFromRpcUrl(rpcUrl: string): { chainName: string; tokenSymbol: string } {
  const rpcLower = rpcUrl.toLowerCase();
  
  if (rpcLower.includes('ethereum') || rpcLower.includes('mainnet') || rpcLower.includes('eth')) {
    if (rpcLower.includes('sepolia') || rpcLower.includes('goerli')) {
      return { chainName: 'Ethereum Testnet', tokenSymbol: 'ETH' };
    }
    return { chainName: 'Ethereum', tokenSymbol: 'ETH' };
  }
  
  if (rpcLower.includes('polygon') || rpcLower.includes('matic')) {
    if (rpcLower.includes('mumbai') || rpcLower.includes('testnet')) {
      return { chainName: 'Polygon Testnet', tokenSymbol: 'MATIC' };
    }
    return { chainName: 'Polygon', tokenSymbol: 'MATIC' };
  }
  
  if (rpcLower.includes('bsc') || rpcLower.includes('binance')) {
    if (rpcLower.includes('testnet')) {
      return { chainName: 'BSC Testnet', tokenSymbol: 'BNB' };
    }
    return { chainName: 'BSC', tokenSymbol: 'BNB' };
  }
  
  if (rpcLower.includes('avalanche') || rpcLower.includes('avax')) {
    if (rpcLower.includes('fuji') || rpcLower.includes('testnet')) {
      return { chainName: 'Avalanche Testnet', tokenSymbol: 'AVAX' };
    }
    return { chainName: 'Avalanche', tokenSymbol: 'AVAX' };
  }
  
  if (rpcLower.includes('arbitrum')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('testnet')) {
      return { chainName: 'Arbitrum Testnet', tokenSymbol: 'ETH' };
    }
    return { chainName: 'Arbitrum', tokenSymbol: 'ETH' };
  }
  
  if (rpcLower.includes('optimism') || rpcLower.includes('optimistic')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('testnet')) {
      return { chainName: 'Optimism Testnet', tokenSymbol: 'ETH' };
    }
    return { chainName: 'Optimism', tokenSymbol: 'ETH' };
  }
  
  if (rpcLower.includes('base')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('sepolia') || rpcLower.includes('testnet')) {
      return { chainName: 'Base Testnet', tokenSymbol: 'ETH' };
    }
    return { chainName: 'Base', tokenSymbol: 'ETH' };
  }
  
  if (rpcLower.includes('filecoin') || rpcLower.includes('fil')) {
    if (rpcLower.includes('calibration') || rpcLower.includes('testnet')) {
      return { chainName: 'Filecoin Calibration', tokenSymbol: 'tFIL' };
    }
    return { chainName: 'Filecoin', tokenSymbol: 'FIL' };
  }
  
  if (rpcLower.includes('localhost') || rpcLower.includes('127.0.0.1')) {
    return { chainName: 'Local Network', tokenSymbol: 'ETH' };
  }
  
  return { chainName: 'EVM Chain', tokenSymbol: 'gas tokens' };
}

async function loadDecryptedFilecoinConfig(): Promise<{ privateKey: string; rpcUrl?: string; dataSetId?: number; encryptionEnabled?: boolean } | null> {
  const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
  if (!fs.existsSync(configPath)) return null;
  const fileBuffer = fs.readFileSync(configPath);
  const data = fileBuffer.toString('utf-8');
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
    encryptionEnabled: config.encryptionEnabled ?? false,
  };
}

function getIpfsGatewayConfigPath(): string {
  return path.join(app.getPath('userData'), 'ipfs-gateway-config.json');
}

function readIpfsGatewayConfig(): IpfsGatewayConfig {
  const configPath = getIpfsGatewayConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const fileBuffer = fs.readFileSync(configPath);
      const fileContent = fileBuffer.toString('utf-8');
      const parsed = JSON.parse(fileContent);
      const baseUrl = normalizeGatewayBase(parsed.baseUrl || DEFAULT_IPFS_GATEWAY);
      return { baseUrl };
    }
  } catch (error) {
    console.error('Failed to read IPFS gateway config:', error);
  }

  return { baseUrl: DEFAULT_IPFS_GATEWAY };
}

function writeIpfsGatewayConfig(config: IpfsGatewayConfig): IpfsGatewayConfig {
  const configPath = getIpfsGatewayConfigPath();
  const sanitizedBase = normalizeGatewayBase(config.baseUrl || DEFAULT_IPFS_GATEWAY);
  const payload: IpfsGatewayConfig = { baseUrl: sanitizedBase };

  try {
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save IPFS gateway config:', error);
    throw new Error('Unable to persist IPFS gateway configuration');
  }

  return payload;
}

// ============================================================================
// Named IPC Handler Functions
// ============================================================================

async function handleSelectVideo(): Promise<string | null> {
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
}

async function handleAddMagnetUrl(_event: Electron.IpcMainInvokeEvent, magnetUrl: string): Promise<unknown> {
  try {
    const infohashMatch = magnetUrl.match(/urn:btih:([a-zA-Z0-9]{40})/);
    if (!infohashMatch) {
      throw new Error('Invalid magnet URL');
    }
    const infohash = infohashMatch[1];

    const body = {
      plugin_name: 'BitTorrentPlugin',
      operation: 'archive',
      params: {
        source: {
          source_id: infohash,
          media_type: 'bittorrent',
          uri: magnetUrl,
          metadata: {},
        },
      },
    };

    const response = await fetch('http://localhost:8000/api/plugins/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to start torrent download');
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to handle magnet URL:', error);
    throw error;
  }
}

async function handleReadVideoFile(_event: Electron.IpcMainInvokeEvent, filePath: string): Promise<{
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
}> {
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
}

async function handleGetFilecoinConfig(): Promise<{ privateKey: string; rpcUrl?: string; dataSetId?: number; encryptionEnabled?: boolean } | null> {
  try {
    const configPath = path.join(app.getPath('userData'), 'filecoin-config.json');
    if (fs.existsSync(configPath)) {
      const fileBuffer = fs.readFileSync(configPath);
      const data = fileBuffer.toString('utf-8');
      const config = JSON.parse(data);
      
      if (!config.encryptedPrivateKey || !safeStorage.isEncryptionAvailable()) {
        return null;
      }

      try {
        const encryptedBuffer = Buffer.from(config.encryptedPrivateKey, 'base64');
        const privateKey = safeStorage.decryptString(encryptedBuffer);
        const loadedConfig = {
          privateKey,
          rpcUrl: config.rpcUrl,
          dataSetId: config.dataSetId,
          encryptionEnabled: config.encryptionEnabled ?? false,
        };
        console.log(`[FilecoinConfig] Loaded config from ${configPath} - encryptionEnabled: ${loadedConfig.encryptionEnabled}`);
        return loadedConfig;
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
}

async function handleUploadToFilecoin(
  _event: Electron.IpcMainInvokeEvent,
  args: { videoPath: string; config: FilecoinConfig }
): Promise<unknown> {
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

async function handleSaveFilecoinConfig(
  _event: Electron.IpcMainInvokeEvent,
  config: { privateKey: string; rpcUrl?: string; dataSetId?: number; encryptionEnabled?: boolean }
): Promise<{ success: boolean }> {
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
    
    const encryptionEnabled = config.encryptionEnabled === true;
    
    const dataToSave = {
      encryptedPrivateKey,
      rpcUrl: config.rpcUrl,
      dataSetId: config.dataSetId,
      encryptionEnabled,
    };
    
    console.log(`[FilecoinConfig] Saving config - encryptionEnabled: ${encryptionEnabled}`);
    
    fs.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    console.log(`[FilecoinConfig] ✅ Config saved to ${configPath}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to save Filecoin config:', error);
    throw new Error(`Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleGetArkivConfig(): Promise<{
  rpcUrl: string;
  enabled: boolean;
  syncEnabled: boolean;
  expirationWeeks: number;
}> {
  try {
    const configPath = path.join(app.getPath('userData'), 'arkiv-config.json');
    let syncEnabled = false;
    let rpcUrl = 'https://mendoza.hoodi.arkiv.network/rpc';
    let expirationWeeks = 4;
    
    if (fs.existsSync(configPath)) {
      const fileBuffer = fs.readFileSync(configPath);
      const data = fileBuffer.toString('utf-8');
      const config = JSON.parse(data);
      rpcUrl = config.rpcUrl || rpcUrl;
      syncEnabled = config.syncEnabled ?? false;
      expirationWeeks = config.expirationWeeks ?? 4;
    }
    
    const filecoinConfig = await loadDecryptedFilecoinConfig();
    const enabled = !!filecoinConfig?.privateKey;
    
    return { rpcUrl, enabled, syncEnabled, expirationWeeks };
  } catch (error) {
    console.error('Failed to load Arkiv config:', error);
    return {
      rpcUrl: 'https://mendoza.hoodi.arkiv.network/rpc',
      enabled: false,
      syncEnabled: false,
      expirationWeeks: 4,
    };
  }
}

async function handleSaveArkivConfig(
  _event: Electron.IpcMainInvokeEvent,
  config: { rpcUrl?: string; syncEnabled?: boolean; expirationWeeks?: number }
): Promise<{ success: boolean }> {
  try {
    const configPath = path.join(app.getPath('userData'), 'arkiv-config.json');
    
    const dataToSave = {
      rpcUrl: config.rpcUrl || 'https://mendoza.hoodi.arkiv.network/rpc',
      syncEnabled: config.syncEnabled ?? false,
      expirationWeeks: config.expirationWeeks ?? 4,
    };
    
    fs.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save Arkiv config:', error);
    throw new Error(`Failed to save Arkiv config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleValidateEvmConfig(
  _event: Electron.IpcMainInvokeEvent,
  { rpcUrl }: { rpcUrl?: string }
): Promise<{
  wallet_address: string;
  chain_name: string;
  native_token_symbol: string;
  rpc_url: string;
}> {
  try {
    const config = await loadDecryptedFilecoinConfig();
    if (!config?.privateKey) {
      throw new Error('Private key not configured. Please configure Filecoin settings first.');
    }
    
    let normalizedKey = config.privateKey.trim();
    if (!normalizedKey.startsWith('0x')) {
      normalizedKey = `0x${normalizedKey}`;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(normalizedKey);
    const walletAddress = wallet.address;
    
    const finalRpcUrl = rpcUrl || config.rpcUrl || 'https://mendoza.hoodi.arkiv.network/rpc';
    const { chainName, tokenSymbol } = detectChainFromRpcUrl(finalRpcUrl);
    
    return {
      wallet_address: walletAddress,
      chain_name: chainName,
      native_token_symbol: tokenSymbol,
      rpc_url: finalRpcUrl,
    };
  } catch (error) {
    console.error('Failed to validate EVM config:', error);
    throw new Error(`Failed to validate EVM config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleCheckEvmBalance(
  _event: Electron.IpcMainInvokeEvent,
  { rpcUrl }: { rpcUrl?: string }
): Promise<{
  wallet_address: string;
  chain_name: string;
  native_token_symbol: string;
  balance_wei: string;
  balance_ether: number;
  has_sufficient_balance: boolean;
  rpc_url: string;
}> {
  try {
    const config = await loadDecryptedFilecoinConfig();
    if (!config?.privateKey) {
      throw new Error('Private key not configured. Please configure Filecoin settings first.');
    }
    
    let normalizedKey = config.privateKey.trim();
    if (!normalizedKey.startsWith('0x')) {
      normalizedKey = `0x${normalizedKey}`;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(normalizedKey);
    const walletAddress = wallet.address;
    
    let finalRpcUrl = rpcUrl || config.rpcUrl || 'https://mendoza.hoodi.arkiv.network/rpc';
    if (finalRpcUrl.startsWith('wss://')) {
      finalRpcUrl = finalRpcUrl.replace('wss://', 'https://');
    } else if (finalRpcUrl.startsWith('ws://')) {
      finalRpcUrl = finalRpcUrl.replace('ws://', 'http://');
    }
    
    const { chainName, tokenSymbol } = detectChainFromRpcUrl(finalRpcUrl);
    
    const provider = new ethers.JsonRpcProvider(finalRpcUrl);
    const balanceWei = await provider.getBalance(walletAddress);
    const balanceEther = parseFloat(ethers.formatEther(balanceWei));
    const hasSufficientBalance = balanceWei > 0n;
    
    return {
      wallet_address: walletAddress,
      chain_name: chainName,
      native_token_symbol: tokenSymbol,
      balance_wei: balanceWei.toString(),
      balance_ether: balanceEther,
      has_sufficient_balance: hasSufficientBalance,
      rpc_url: finalRpcUrl,
    };
  } catch (error) {
    console.error('Failed to check EVM balance:', error);
    throw new Error(`Failed to check wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleStartBackend(): Promise<{ pid: number | undefined; message: string }> {
  if (backendProcess && !backendProcess.killed) {
    return { pid: backendProcess.pid, message: 'Backend already running' };
  }

  const cfg = await loadDecryptedFilecoinConfig();
  if (!cfg || !cfg.privateKey) {
    throw new Error('Filecoin config with private key is not available. Please configure Filecoin settings first.');
  }

  let arkivRpcUrl = 'https://mendoza.hoodi.arkiv.network/rpc';
  let arkivSyncEnabled = false;
  let arkivExpirationWeeks = 4;
  try {
    const arkivConfigPath = path.join(app.getPath('userData'), 'arkiv-config.json');
    if (fs.existsSync(arkivConfigPath)) {
      const fileBuffer = fs.readFileSync(arkivConfigPath);
      const data = fileBuffer.toString('utf-8');
      const arkivConfig = JSON.parse(data);
      if (arkivConfig.rpcUrl) {
        arkivRpcUrl = arkivConfig.rpcUrl;
      }
      arkivSyncEnabled = arkivConfig.syncEnabled ?? false;
      arkivExpirationWeeks = arkivConfig.expirationWeeks ?? 4;
    }
  } catch (err) {
    console.error('Failed to load Arkiv config for backend:', err);
  }

  const backendDir = path.join(app.getAppPath(), '..', 'backend');
  const env = {
    ...process.env,
    FILECOIN_PRIVATE_KEY: cfg.privateKey,
    FILECOIN_RPC_URL: cfg.rpcUrl || 'http://127.0.0.1:8545',
    ARKIV_RPC_URL: arkivRpcUrl,
    ARKIV_SYNC_ENABLED: arkivSyncEnabled ? 'true' : 'false',
    ARKIV_EXPIRATION_WEEKS: arkivExpirationWeeks.toString(),
    RING_DTLS_STRATEGY: 'no_patch',
    RING_EXTENDED_CIPHERS: '1',
    RING_RSA_CERT: '1',
    RING_DTLS_DEBUG: '1',
  };

  const { pythonPath, venvPath } = findPythonExecutable(backendDir);
  backendProcess = spawnBackendProcess(pythonPath, venvPath, backendDir, env);

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });

  // Start upload worker after backend is ready
  try {
    const uploadWorker = getUploadWorker();
    await uploadWorker.start({ enabled: true, pollInterval: 15000 });
    console.log('✅ Upload worker started automatically with backend');
  } catch (error) {
    console.error('Failed to start upload worker automatically:', error);
  }

  return { pid: backendProcess.pid, message: 'Backend started' };
}

async function handleStopBackend(): Promise<{ success: boolean; message: string }> {
  if (!backendProcess || backendProcess.killed) {
    return { success: true, message: 'Backend not running' };
  }

  return new Promise((resolve) => {
    backendProcess!.on('exit', () => {
      backendProcess = null;
      resolve({ success: true, message: 'Backend stopped' });
    });

    backendProcess!.kill('SIGTERM');

    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
        backendProcess = null;
        resolve({ success: true, message: 'Backend force stopped' });
      }
    }, 5000);
  });
}

async function handleRestartBackend(): Promise<{ pid: number | undefined; message: string }> {
  if (backendProcess && !backendProcess.killed) {
    await new Promise<void>((resolve) => {
      backendProcess!.on('exit', () => {
        backendProcess = null;
        resolve();
      });
      backendProcess!.kill('SIGTERM');
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL');
          backendProcess = null;
        }
        resolve();
      }, 3000);
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const cfg = await loadDecryptedFilecoinConfig();
  if (!cfg || !cfg.privateKey) {
    throw new Error('Filecoin config with private key is not available. Please configure Filecoin settings first.');
  }

  let arkivRpcUrl = 'https://mendoza.hoodi.arkiv.network/rpc';
  let arkivSyncEnabled = false;
  let arkivExpirationWeeks = 4;
  try {
    const arkivConfigPath = path.join(app.getPath('userData'), 'arkiv-config.json');
    if (fs.existsSync(arkivConfigPath)) {
      const fileBuffer = fs.readFileSync(arkivConfigPath);
      const data = fileBuffer.toString('utf-8');
      const arkivConfig = JSON.parse(data);
      if (arkivConfig.rpcUrl) {
        arkivRpcUrl = arkivConfig.rpcUrl;
      }
      arkivSyncEnabled = arkivConfig.syncEnabled ?? false;
      arkivExpirationWeeks = arkivConfig.expirationWeeks ?? 4;
    }
  } catch (err) {
    console.error('Failed to load Arkiv config for backend restart:', err);
  }

  const backendDir = path.join(app.getAppPath(), '..', 'backend');
  const env = {
    ...process.env,
    FILECOIN_PRIVATE_KEY: cfg.privateKey,
    FILECOIN_RPC_URL: cfg.rpcUrl || 'http://127.0.0.1:8545',
    ARKIV_RPC_URL: arkivRpcUrl,
    ARKIV_SYNC_ENABLED: arkivSyncEnabled ? 'true' : 'false',
    ARKIV_EXPIRATION_WEEKS: arkivExpirationWeeks.toString(),
    RING_DTLS_STRATEGY: 'no_patch',
    RING_EXTENDED_CIPHERS: '1',
    RING_RSA_CERT: '1',
    RING_DTLS_DEBUG: '1',
  };

  const { pythonPath, venvPath } = findPythonExecutable(backendDir);
  backendProcess = spawnBackendProcess(pythonPath, venvPath, backendDir, env);

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });

  return { pid: backendProcess.pid, message: 'Backend restarted with new configuration' };
}

async function handlePlaybackFileExists(_event: Electron.IpcMainInvokeEvent, filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function handlePlaybackGetGatewayConfig(): IpfsGatewayConfig {
  return readIpfsGatewayConfig();
}

function handlePlaybackSetGatewayConfig(_event: Electron.IpcMainInvokeEvent, config: IpfsGatewayConfig): IpfsGatewayConfig {
  return writeIpfsGatewayConfig(config);
}

async function handleDecryptTextWithLit(
  _event: Electron.IpcMainInvokeEvent,
  { ciphertext, metadataJson }: { ciphertext: string; metadataJson: string }
): Promise<string> {
  try {
    const config = await loadDecryptedFilecoinConfig();
    if (!config?.privateKey) {
      throw new Error('Private key not configured. Please configure Filecoin settings first.');
    }
    
    const metadata: LitEncryptionMetadata = deserializeEncryptionMetadata(metadataJson);
    const decryptedText = await decryptTextWithLit(ciphertext, metadata, config.privateKey);
    return decryptedText;
  } catch (error) {
    console.error('Failed to decrypt text with Lit:', error);
    throw new Error(`Failed to decrypt text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleUploadWorkerStart(
  _event: Electron.IpcMainInvokeEvent,
  config?: Partial<UploadWorkerConfig>
): Promise<{
  success: boolean;
  isRunning: boolean;
  config: UploadWorkerConfig;
  filecoinConfigured: boolean;
  message: string;
}> {
  try {
    const worker = getUploadWorker();
    const filecoinConfig = await loadDecryptedFilecoinConfig();
    const isConfigured = !!filecoinConfig?.privateKey;

    const effectiveConfig: Partial<UploadWorkerConfig> = config || {};
    if (isConfigured && effectiveConfig.enabled === undefined) {
      effectiveConfig.enabled = true;
    }

    await worker.start(effectiveConfig);

    return {
      success: true,
      isRunning: true,
      config: worker.getConfig(),
      filecoinConfigured: isConfigured,
      message: isConfigured
        ? 'Upload worker started with auto-upload enabled'
        : 'Upload worker started (disabled - Filecoin not configured)',
    };
  } catch (error) {
    console.error('Failed to start upload worker:', error);
    throw new Error(`Failed to start upload worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleUploadWorkerStop(): Promise<{
  success: boolean;
  isRunning: boolean;
  message: string;
}> {
  try {
    const worker = getUploadWorker();
    worker.stop();

    return {
      success: true,
      isRunning: false,
      message: 'Upload worker stopped',
    };
  } catch (error) {
    console.error('Failed to stop upload worker:', error);
    throw new Error(`Failed to stop upload worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleUploadWorkerGetStatus(): Promise<{
  isRunning: boolean;
  config: UploadWorkerConfig;
}> {
  try {
    const worker = getUploadWorker();

    return {
      isRunning: worker.isWorkerRunning(),
      config: worker.getConfig(),
    };
  } catch (error) {
    console.error('Failed to get upload worker status:', error);
    throw new Error(`Failed to get upload worker status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleUploadWorkerUpdateConfig(
  _event: Electron.IpcMainInvokeEvent,
  newConfig: Partial<UploadWorkerConfig>
): Promise<{
  success: boolean;
  config: UploadWorkerConfig;
  message: string;
}> {
  try {
    const worker = getUploadWorker();

    if (!worker.isWorkerRunning()) {
      throw new Error('Cannot update config: upload worker is not running');
    }

    worker.updateConfig(newConfig);

    return {
      success: true,
      config: worker.getConfig(),
      message: 'Upload worker config updated',
    };
  } catch (error) {
    console.error('Failed to update upload worker config:', error);
    throw new Error(`Failed to update upload worker config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function handleGetMemoryStats(): Promise<NodeJS.MemoryUsage> {
  return process.memoryUsage();
}

// ============================================================================
// PHASE 1: IPC Handler Registration & Cleanup
// ============================================================================

function registerIPCHandlers(): void {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    'select-video': handleSelectVideo,
    'add-magnet-url': handleAddMagnetUrl,
    'read-video-file': handleReadVideoFile,
    'get-filecoin-config': handleGetFilecoinConfig,
    'upload-to-filecoin': handleUploadToFilecoin,
    'save-filecoin-config': handleSaveFilecoinConfig,
    'get-arkiv-config': handleGetArkivConfig,
    'save-arkiv-config': handleSaveArkivConfig,
    'validate-evm-config': handleValidateEvmConfig,
    'check-evm-balance': handleCheckEvmBalance,
    'start-backend': handleStartBackend,
    'stop-backend': handleStopBackend,
    'restart-backend': handleRestartBackend,
    'playback:file-exists': handlePlaybackFileExists,
    'playback:get-gateway-config': handlePlaybackGetGatewayConfig,
    'playback:set-gateway-config': handlePlaybackSetGatewayConfig,
    'decrypt-text-with-lit': handleDecryptTextWithLit,
    'upload-worker:start': handleUploadWorkerStart,
    'upload-worker:stop': handleUploadWorkerStop,
    'upload-worker:get-status': handleUploadWorkerGetStatus,
    'upload-worker:update-config': handleUploadWorkerUpdateConfig,
    'get-memory-stats': handleGetMemoryStats,
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
    ipcHandlers.set(channel, handler as (...args: unknown[]) => unknown);
  }
  
  console.log(`✅ Registered ${ipcHandlers.size} IPC handlers`);
}

function cleanupIPCHandlers(): void {
  for (const channel of ipcHandlers.keys()) {
    try {
      ipcMain.removeHandler(channel);
    } catch (error) {
      console.warn(`Failed to remove handler for ${channel}:`, error);
    }
  }
  console.log(`🧹 Cleaned up ${ipcHandlers.size} IPC handlers`);
  ipcHandlers.clear();
}

// ============================================================================
// Window Creation with Tracked Event Listeners
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  registerRenderCrashLogger(mainWindow.webContents);

  const indexPath = path.join(__dirname, 'index.html');
  
  if (isDev) {
    console.log('Loading from development server: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Loading from local file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
  
  // Track the before-input-event listener for cleanup
  const devToolsListener = (event: Electron.Event, input: Electron.Input) => {
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    }
  };
  
  mainWindow.webContents.on('before-input-event', devToolsListener);
  webContentsListeners.push({ 
    event: 'before-input-event', 
    listener: devToolsListener as unknown as (...args: unknown[]) => void 
  });

  mainWindow.on('closed', () => {
    // Clean up tracked webContents listeners
    webContentsListeners = [];
    mainWindow = null;
  });
}

// ============================================================================
// Backend Auto-Start
// ============================================================================

async function tryStartBackend(): Promise<void> {
  try {
    const cfg = await loadDecryptedFilecoinConfig();
    if (!cfg || !cfg.privateKey) {
      console.log('📋 Backend not auto-started: Filecoin config not yet configured.');
      return;
    }

    let arkivRpcUrl = 'https://mendoza.hoodi.arkiv.network/rpc';
    let arkivSyncEnabled = false;
    let arkivExpirationWeeks = 4;
    try {
      const arkivConfigPath = path.join(app.getPath('userData'), 'arkiv-config.json');
      if (fs.existsSync(arkivConfigPath)) {
        const fileBuffer = fs.readFileSync(arkivConfigPath);
        const data = fileBuffer.toString('utf-8');
        const arkivConfig = JSON.parse(data);
        if (arkivConfig.rpcUrl) {
          arkivRpcUrl = arkivConfig.rpcUrl;
        }
        arkivSyncEnabled = arkivConfig.syncEnabled ?? false;
        arkivExpirationWeeks = arkivConfig.expirationWeeks ?? 4;
      }
    } catch (err) {
      console.error('Failed to load Arkiv config for auto-start:', err);
    }

    const backendDir = path.join(app.getAppPath(), '..', 'backend');
    const env = {
      ...process.env,
      FILECOIN_PRIVATE_KEY: cfg.privateKey,
      FILECOIN_RPC_URL: cfg.rpcUrl || 'http://127.0.0.1:8545',
      ARKIV_RPC_URL: arkivRpcUrl,
      ARKIV_SYNC_ENABLED: arkivSyncEnabled ? 'true' : 'false',
      ARKIV_EXPIRATION_WEEKS: arkivExpirationWeeks.toString(),
      RING_DTLS_STRATEGY: 'no_patch',
      RING_EXTENDED_CIPHERS: '1',
      RING_RSA_CERT: '1',
      RING_DTLS_DEBUG: '1',
      RING_DTLS_FIX: '1',
    };

    console.log('🚀 Auto-starting backend with configured environment variables...');
    const { pythonPath, venvPath } = findPythonExecutable(backendDir);
    backendProcess = spawnBackendProcess(pythonPath, venvPath, backendDir, env);

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
    });

    console.log(`✅ Backend auto-started with PID: ${backendProcess.pid}`);
  } catch (err) {
    console.error('Failed to auto-start backend:', err);
  }
}

// ============================================================================
// PHASE 3: Application Lifecycle Events
// ============================================================================

app.whenReady().then(async () => {
  registerIPCHandlers();
  startMemoryMonitoring();
  createWindow();
  await tryStartBackend();
});

app.on('window-all-closed', () => {
  // Clean up IPC handlers when all windows close
  cleanupIPCHandlers();
  
  // Stop memory monitoring
  stopMemoryMonitoring();
  
  // Stop upload worker
  try {
    const worker = getUploadWorker();
    if (worker.isWorkerRunning()) {
      worker.stop();
      console.log('🛑 Upload worker stopped on window close');
    }
  } catch (error) {
    console.warn('Failed to stop upload worker:', error);
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    // Re-register handlers if they were cleaned up
    if (ipcHandlers.size === 0) {
      registerIPCHandlers();
      startMemoryMonitoring();
    }
    createWindow();
  }
});

app.on('will-quit', () => {
  // Final cleanup
  stopMemoryMonitoring();
  cleanupIPCHandlers();
  
  // Stop backend process
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    console.log('🛑 Backend process killed on quit');
  }
  
  // Stop upload worker
  try {
    const worker = getUploadWorker();
    if (worker.isWorkerRunning()) {
      worker.stop();
    }
  } catch {
    // Ignore errors during quit
  }
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
