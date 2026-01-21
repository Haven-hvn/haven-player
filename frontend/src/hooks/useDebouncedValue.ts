import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value, only updating after the specified delay.
 * Useful for search inputs and other user input that triggers expensive operations.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before the value updates
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearch = useDebouncedValue(searchQuery, 300);
 * 
 * // Use debouncedSearch for filtering, not searchQuery
 * const filteredItems = useMemo(() => {
 *   return items.filter(item => 
 *     item.name.toLowerCase().includes(debouncedSearch.toLowerCase())
 *   );
 * }, [items, debouncedSearch]);
 * ```
 */
export const useDebouncedValue = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook that provides a debounced callback function.
 * The callback will only be executed after the specified delay since the last call.
 * 
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds
 * @returns A debounced version of the callback
 * 
 * @example
 * ```tsx
 * const debouncedSearch = useDebouncedCallback(
 *   (query: string) => {
 *     fetchSearchResults(query);
 *   },
 *   300
 * );
 * 
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 * ```
 */
export const useDebouncedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const newTimeoutId = setTimeout(() => {
      callback(...args);
    }, delay);

    setTimeoutId(newTimeoutId);
  };
};

export default useDebouncedValue;
