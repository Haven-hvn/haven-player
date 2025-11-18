import { StreamInfo } from "@/types/video";

export type SortField = "name" | "date" | "mint_id" | "popularity" | "status";
export type SortDirection = "asc" | "desc";

export interface SortOption {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortOption = {
  field: "date",
  direction: "desc",
};

/**
 * Get sort option label for display
 */
export function getSortLabel(sort: SortOption): string {
  const fieldLabels: Record<SortField, string> = {
    name: "Name",
    date: "Date",
    mint_id: "Mint ID",
    popularity: "Popularity",
    status: "Status",
  };

  const directionLabel = sort.direction === "asc" ? "A-Z" : "Z-A";
  if (sort.field === "name") {
    return `Name (${directionLabel})`;
  }
  if (sort.field === "date") {
    return `Date (${sort.direction === "desc" ? "Newest First" : "Oldest First"})`;
  }
  if (sort.field === "popularity") {
    return `Popularity (${sort.direction === "desc" ? "Most Popular" : "Least Popular"})`;
  }
  if (sort.field === "status") {
    return `Status (${sort.direction === "desc" ? "Active First" : "Inactive First"})`;
  }
  return `${fieldLabels[sort.field]} (${directionLabel})`;
}

/**
 * Compare two strings for sorting
 */
function compareStrings(a: string | undefined, b: string | undefined, direction: SortDirection): number {
  const aVal = (a ?? "").toLowerCase();
  const bVal = (b ?? "").toLowerCase();
  if (aVal < bVal) return direction === "asc" ? -1 : 1;
  if (aVal > bVal) return direction === "asc" ? 1 : -1;
  return 0;
}

/**
 * Compare two numbers for sorting
 */
function compareNumbers(a: number | undefined, b: number | undefined, direction: SortDirection): number {
  const aVal = a ?? 0;
  const bVal = b ?? 0;
  if (direction === "asc") {
    return aVal - bVal;
  }
  return bVal - aVal;
}

/**
 * Compare two timestamps for sorting
 */
function compareTimestamps(a: number | undefined, b: number | undefined, direction: SortDirection): number {
  const aVal = a ?? 0;
  const bVal = b ?? 0;
  if (direction === "asc") {
    return aVal - bVal;
  }
  return bVal - aVal;
}

/**
 * Sort streams based on the provided sort option
 */
export function sortStreams(streams: StreamInfo[], sort: SortOption): StreamInfo[] {
  const sorted = [...streams];

  sorted.sort((a, b) => {
    switch (sort.field) {
      case "name":
        return compareStrings(a.name, b.name, sort.direction);
      case "mint_id":
        return compareStrings(a.mint_id, b.mint_id, sort.direction);
      case "date":
        // Use created_timestamp if available, otherwise last_trade_timestamp, otherwise 0
        const aDate = a.created_timestamp ?? a.last_trade_timestamp ?? 0;
        const bDate = b.created_timestamp ?? b.last_trade_timestamp ?? 0;
        return compareTimestamps(aDate, bDate, sort.direction);
      case "popularity":
        // Use num_participants as popularity metric
        return compareNumbers(a.num_participants, b.num_participants, sort.direction);
      case "status":
        // Active streams first (is_currently_live: true)
        if (a.is_currently_live === b.is_currently_live) {
          return 0;
        }
        if (sort.direction === "desc") {
          return a.is_currently_live ? -1 : 1;
        }
        return a.is_currently_live ? 1 : -1;
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Load sort preference from localStorage
 */
export function loadSortPreference(): SortOption {
  try {
    const stored = localStorage.getItem("livestream_sort_preference");
    if (stored) {
      const parsed = JSON.parse(stored) as SortOption;
      // Validate the stored preference
      if (
        parsed &&
        typeof parsed === "object" &&
        ["name", "date", "mint_id", "popularity", "status"].includes(parsed.field) &&
        ["asc", "desc"].includes(parsed.direction)
      ) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Failed to load sort preference from localStorage:", error);
  }
  return DEFAULT_SORT;
}

/**
 * Save sort preference to localStorage
 */
export function saveSortPreference(sort: SortOption): void {
  try {
    localStorage.setItem("livestream_sort_preference", JSON.stringify(sort));
  } catch (error) {
    console.warn("Failed to save sort preference to localStorage:", error);
  }
}

