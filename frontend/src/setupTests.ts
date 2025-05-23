import '@testing-library/jest-dom';

// Define the mock IPC renderer type
interface MockIpcRenderer {
  invoke: jest.Mock;
  on: jest.Mock;
  removeAllListeners: jest.Mock;
  send: jest.Mock;
}

// Mock Electron APIs
const mockIpcRenderer: MockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  send: jest.fn(),
};

// Mock the electron module
jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}));

// Extend global types
declare global {
  var mockIpcRenderer: MockIpcRenderer;
}

// Mock console methods to avoid noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  mockIpcRenderer.invoke.mockClear();
  mockIpcRenderer.on.mockClear();
  mockIpcRenderer.removeAllListeners.mockClear();
  mockIpcRenderer.send.mockClear();
});

// Suppress expected console errors in tests
console.error = (...args: any[]) => {
  // Only suppress specific expected errors
  const message = args[0]?.toString() || '';
  if (
    message.includes('Warning: ReactDOM.render is deprecated') ||
    message.includes('Warning: componentWillReceiveProps') ||
    message.includes('Warning: componentWillMount')
  ) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  // Only suppress specific expected warnings
  const message = args[0]?.toString() || '';
  if (
    message.includes('Warning: ReactDOM.render is deprecated') ||
    message.includes('Warning: componentWillReceiveProps')
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

// Global test utilities
global.mockIpcRenderer = mockIpcRenderer; 