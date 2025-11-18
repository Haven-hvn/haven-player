import { renderHook, act, waitFor } from "@testing-library/react";
import { useSearch } from "../useSearch";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => store[key] || null,
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("useSearch", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should initialize with empty query", () => {
    const { result } = renderHook(() => useSearch());

    expect(result.current.query).toBe("");
    expect(result.current.debouncedQuery).toBe("");
    expect(result.current.isSearchActive).toBe(false);
    expect(result.current.history).toEqual([]);
  });

  it("should update query immediately", () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery("test");
    });

    expect(result.current.query).toBe("test");
    expect(result.current.isSearchActive).toBe(true);
  });

  it("should debounce query updates", async () => {
    const { result } = renderHook(() =>
      useSearch({ debounceMs: 300 })
    );

    act(() => {
      result.current.setQuery("t");
    });

    expect(result.current.debouncedQuery).toBe("");

    act(() => {
      result.current.setQuery("te");
    });

    expect(result.current.debouncedQuery).toBe("");

    act(() => {
      result.current.setQuery("test");
    });

    expect(result.current.debouncedQuery).toBe("");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.debouncedQuery).toBe("test");
  });

  it("should call onSearch callback with debounced query", () => {
    const onSearch = jest.fn();
    const { result } = renderHook(() =>
      useSearch({ debounceMs: 300, onSearch })
    );

    act(() => {
      result.current.setQuery("test");
    });

    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledWith("test");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("should clear search", () => {
    const onSearch = jest.fn();
    const { result } = renderHook(() =>
      useSearch({ debounceMs: 300, onSearch })
    );

    act(() => {
      result.current.setQuery("test");
      jest.advanceTimersByTime(300);
    });

    expect(result.current.query).toBe("test");
    expect(result.current.isSearchActive).toBe(true);

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.query).toBe("");
    expect(result.current.debouncedQuery).toBe("");
    expect(result.current.isSearchActive).toBe(false);
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("should add query to history", () => {
    const { result } = renderHook(() =>
      useSearch({ maxHistoryItems: 10 })
    );

    act(() => {
      result.current.setQuery("test");
      jest.advanceTimersByTime(300);
      result.current.addToHistory("test");
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe("test");
    expect(result.current.history[0].timestamp).toBeGreaterThan(0);
  });

  it("should not add empty query to history", () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.addToHistory("");
    });

    expect(result.current.history).toHaveLength(0);
  });

  it("should limit history to maxHistoryItems", () => {
    const { result } = renderHook(() =>
      useSearch({ maxHistoryItems: 3 })
    );

    act(() => {
      result.current.addToHistory("query1");
      result.current.addToHistory("query2");
      result.current.addToHistory("query3");
      result.current.addToHistory("query4");
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].query).toBe("query4");
    expect(result.current.history[2].query).toBe("query2");
  });

  it("should remove duplicates from history", () => {
    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.addToHistory("test");
      result.current.addToHistory("test");
      result.current.addToHistory("TEST");
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe("TEST");
  });

  it("should clear history", () => {
    const { result } = renderHook(() =>
      useSearch({ storageKey: "test-key" })
    );

    act(() => {
      result.current.addToHistory("test1");
      result.current.addToHistory("test2");
    });

    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toHaveLength(0);
    expect(localStorageMock.getItem("test-key")).toBeNull();
  });

  it("should load history from localStorage on mount", () => {
    const history: Array<{ query: string; timestamp: number }> = [
      { query: "test1", timestamp: Date.now() },
      { query: "test2", timestamp: Date.now() },
    ];
    localStorageMock.setItem("test-key", JSON.stringify(history));

    const { result } = renderHook(() =>
      useSearch({ storageKey: "test-key" })
    );

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].query).toBe("test1");
    expect(result.current.history[1].query).toBe("test2");
  });

  it("should save history to localStorage when it changes", () => {
    const { result } = renderHook(() =>
      useSearch({ storageKey: "test-key" })
    );

    act(() => {
      result.current.addToHistory("test");
    });

    const stored = localStorageMock.getItem("test-key");
    expect(stored).not.toBeNull();
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].query).toBe("test");
    }
  });

  it("should handle localStorage errors gracefully", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Mock localStorage.getItem to throw an error
    const originalGetItem = localStorageMock.getItem;
    localStorageMock.getItem = jest.fn(() => {
      throw new Error("Storage error");
    });

    const { result } = renderHook(() => useSearch());

    expect(result.current.history).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    localStorageMock.getItem = originalGetItem;
    consoleErrorSpy.mockRestore();
  });

  it("should use custom storage key", () => {
    const { result } = renderHook(() =>
      useSearch({ storageKey: "custom-key" })
    );

    act(() => {
      result.current.addToHistory("test");
    });

    expect(localStorageMock.getItem("custom-key")).not.toBeNull();
    expect(localStorageMock.getItem("haven-player-search-history")).toBeNull();
  });

  it("should handle invalid localStorage data gracefully", () => {
    localStorageMock.setItem("test-key", "invalid json");

    const { result } = renderHook(() =>
      useSearch({ storageKey: "test-key" })
    );

    expect(result.current.history).toEqual([]);
  });

  it("should handle non-array localStorage data gracefully", () => {
    localStorageMock.setItem("test-key", JSON.stringify({ not: "an array" }));

    const { result } = renderHook(() =>
      useSearch({ storageKey: "test-key" })
    );

    expect(result.current.history).toEqual([]);
  });

  it("should cancel previous debounce timer when query changes quickly", () => {
    const onSearch = jest.fn();
    const { result } = renderHook(() =>
      useSearch({ debounceMs: 300, onSearch })
    );

    act(() => {
      result.current.setQuery("t");
      jest.advanceTimersByTime(100);
      result.current.setQuery("te");
      jest.advanceTimersByTime(100);
      result.current.setQuery("test");
      jest.advanceTimersByTime(300);
    });

    // Should only be called once with the final value
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("test");
  });

  it("should set isSearchActive correctly", () => {
    const { result } = renderHook(() => useSearch());

    expect(result.current.isSearchActive).toBe(false);

    act(() => {
      result.current.setQuery(" ");
    });

    expect(result.current.isSearchActive).toBe(false);

    act(() => {
      result.current.setQuery("test");
    });

    expect(result.current.isSearchActive).toBe(true);
  });
});

