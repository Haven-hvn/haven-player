import { useState, useEffect, useCallback, useRef } from "react";

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export interface UseSearchOptions {
  debounceMs?: number;
  maxHistoryItems?: number;
  storageKey?: string;
  onSearch?: (query: string) => void;
}

export interface UseSearchReturn {
  query: string;
  debouncedQuery: string;
  history: SearchHistoryItem[];
  isSearchActive: boolean;
  setQuery: (query: string) => void;
  clearSearch: () => void;
  addToHistory: (query: string) => void;
  clearHistory: () => void;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MAX_HISTORY_ITEMS = 10;
const DEFAULT_STORAGE_KEY = "haven-player-search-history";

/**
 * Custom hook for managing search functionality with debouncing and history
 * @param options - Configuration options for the search hook
 * @returns Search state and control functions
 */
export const useSearch = (options: UseSearchOptions = {}): UseSearchReturn => {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxHistoryItems = DEFAULT_MAX_HISTORY_ITEMS,
    storageKey = DEFAULT_STORAGE_KEY,
    onSearch,
  } = options;

  const [query, setQueryState] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load search history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedHistory = JSON.parse(stored) as SearchHistoryItem[];
        if (Array.isArray(parsedHistory)) {
          setHistory(parsedHistory);
        }
      }
    } catch (error) {
      console.error("Failed to load search history from localStorage:", error);
    }
  }, [storageKey]);

  // Save search history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history));
    } catch (error) {
      console.error("Failed to save search history to localStorage:", error);
    }
  }, [history, storageKey]);

  // Debounce the search query
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      if (onSearch) {
        onSearch(query);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceMs, onSearch]);

  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
  }, []);

  const clearSearch = useCallback(() => {
    setQueryState("");
    setDebouncedQuery("");
    if (onSearch) {
      onSearch("");
    }
  }, [onSearch]);

  const addToHistory = useCallback(
    (newQuery: string) => {
      if (!newQuery.trim()) {
        return;
      }

      setHistory((prevHistory) => {
        // Remove duplicate entries
        const filtered = prevHistory.filter(
          (item) => item.query.toLowerCase() !== newQuery.toLowerCase()
        );

        // Add new query at the beginning
        const updated = [
          { query: newQuery, timestamp: Date.now() },
          ...filtered,
        ];

        // Limit to maxHistoryItems
        return updated.slice(0, maxHistoryItems);
      });
    },
    [maxHistoryItems]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error("Failed to clear search history from localStorage:", error);
    }
  }, [storageKey]);

  const isSearchActive = query.trim().length > 0;

  return {
    query,
    debouncedQuery,
    history,
    isSearchActive,
    setQuery,
    clearSearch,
    addToHistory,
    clearHistory,
  };
};

