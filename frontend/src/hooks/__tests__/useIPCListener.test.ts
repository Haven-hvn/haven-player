import { renderHook, act } from '@testing-library/react-hooks';
import { useIPCListener, useIPCListenerOnce, getActiveListenerCount, getAllActiveListeners } from '../useIPCListener';

// Mock electron
const mockOn = jest.fn();
const mockRemoveListener = jest.fn();

jest.mock('electron', () => ({
  ipcRenderer: {
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}));

describe('useIPCListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should register listener on mount', () => {
      const handler = jest.fn();
      renderHook(() => useIPCListener('test-channel', handler));

      expect(mockOn).toHaveBeenCalledWith('test-channel', expect.any(Function));
      expect(mockOn).toHaveBeenCalledTimes(1);
    });

    it('should remove listener on unmount', () => {
      const handler = jest.fn();
      const { unmount } = renderHook(() => useIPCListener('test-channel', handler));

      unmount();

      expect(mockRemoveListener).toHaveBeenCalledWith('test-channel', expect.any(Function));
      expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    });

    it('should call handler when event is received', () => {
      const handler = jest.fn();
      renderHook(() => useIPCListener('test-channel', handler));

      // Get the wrapped handler that was passed to ipcRenderer.on
      const wrappedHandler = mockOn.mock.calls[0][1];
      const mockEvent = {} as Electron.IpcRendererEvent;
      const mockData = { foo: 'bar' };

      // Simulate event
      wrappedHandler(mockEvent, mockData);

      expect(handler).toHaveBeenCalledWith(mockEvent, mockData);
    });

    it('should not register listener when disabled', () => {
      const handler = jest.fn();
      renderHook(() => useIPCListener('test-channel', handler, [], { enabled: false }));

      expect(mockOn).not.toHaveBeenCalled();
    });

    it('should register listener when enabled changes from false to true', () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ enabled }) => useIPCListener('test-channel', handler, [], { enabled }),
        { initialProps: { enabled: false } }
      );

      expect(mockOn).not.toHaveBeenCalled();

      rerender({ enabled: true });

      expect(mockOn).toHaveBeenCalledWith('test-channel', expect.any(Function));
    });

    it('should remove listener when enabled changes from true to false', () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ enabled }) => useIPCListener('test-channel', handler, [], { enabled }),
        { initialProps: { enabled: true } }
      );

      expect(mockOn).toHaveBeenCalledTimes(1);

      rerender({ enabled: false });

      expect(mockRemoveListener).toHaveBeenCalledWith('test-channel', expect.any(Function));
    });

    it('should re-register listener when channel changes', () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ channel }) => useIPCListener(channel, handler),
        { initialProps: { channel: 'channel-1' } }
      );

      expect(mockOn).toHaveBeenCalledWith('channel-1', expect.any(Function));
      mockOn.mockClear();
      mockRemoveListener.mockClear();

      rerender({ channel: 'channel-2' });

      expect(mockRemoveListener).toHaveBeenCalledWith('channel-1', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('channel-2', expect.any(Function));
    });

    it('should use latest handler reference', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const { rerender } = renderHook(
        ({ handler }) => useIPCListener('test-channel', handler),
        { initialProps: { handler: handler1 } }
      );

      // Get the wrapped handler
      const wrappedHandler = mockOn.mock.calls[0][1];

      // Update handler
      rerender({ handler: handler2 });

      // Simulate event - should call handler2, not handler1
      const mockEvent = {} as Electron.IpcRendererEvent;
      wrappedHandler(mockEvent, { test: 'data' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(mockEvent, { test: 'data' });
    });
  });

  describe('re-registration on dependency changes', () => {
    it('should re-register when dependencies change', () => {
      const handler = jest.fn();
      const { rerender } = renderHook(
        ({ dep }) => useIPCListener('test-channel', handler, [dep]),
        { initialProps: { dep: 1 } }
      );

      expect(mockOn).toHaveBeenCalledTimes(1);
      mockOn.mockClear();
      mockRemoveListener.mockClear();

      rerender({ dep: 2 });

      expect(mockRemoveListener).toHaveBeenCalled();
      expect(mockOn).toHaveBeenCalled();
    });
  });
});

describe('useIPCListenerOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register listener on mount', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListenerOnce('test-channel', handler));

    expect(mockOn).toHaveBeenCalledWith('test-channel', expect.any(Function));
  });

  it('should remove listener after first event', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListenerOnce('test-channel', handler));

    const wrappedHandler = mockOn.mock.calls[0][1];
    const mockEvent = {} as Electron.IpcRendererEvent;

    // First event
    wrappedHandler(mockEvent, { count: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockRemoveListener).toHaveBeenCalledWith('test-channel', wrappedHandler);
  });

  it('should ignore subsequent events after first', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListenerOnce('test-channel', handler));

    const wrappedHandler = mockOn.mock.calls[0][1];
    const mockEvent = {} as Electron.IpcRendererEvent;

    // Multiple events
    wrappedHandler(mockEvent, { count: 1 });
    wrappedHandler(mockEvent, { count: 2 });
    wrappedHandler(mockEvent, { count: 3 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(mockEvent, { count: 1 });
  });

  it('should remove listener on unmount even if no event received', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useIPCListenerOnce('test-channel', handler));

    unmount();

    expect(mockRemoveListener).toHaveBeenCalledWith('test-channel', expect.any(Function));
  });

  it('should not register when disabled', () => {
    const handler = jest.fn();
    renderHook(() => useIPCListenerOnce('test-channel', handler, [], { enabled: false }));

    expect(mockOn).not.toHaveBeenCalled();
  });
});

describe('development mode utilities', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('getActiveListenerCount', () => {
    it('should return -1 in production mode with warning', () => {
      process.env.NODE_ENV = 'production';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const count = getActiveListenerCount('test-channel');

      expect(count).toBe(-1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'getActiveListenerCount is only available in development mode'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return 0 for non-existent channel in development mode', () => {
      process.env.NODE_ENV = 'development';

      const count = getActiveListenerCount('non-existent-channel');

      expect(count).toBe(0);
    });
  });

  describe('getAllActiveListeners', () => {
    it('should return empty map in production mode with warning', () => {
      process.env.NODE_ENV = 'production';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const listeners = getAllActiveListeners();

      expect(listeners.size).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'getAllActiveListeners is only available in development mode'
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
