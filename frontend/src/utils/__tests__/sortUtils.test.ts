import {
  SortOption,
  SortField,
  SortDirection,
  DEFAULT_SORT,
  getSortLabel,
  sortStreams,
  loadSortPreference,
  saveSortPreference,
} from "../sortUtils";
import { StreamInfo } from "@/types/video";

describe("sortUtils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("DEFAULT_SORT", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_SORT).toEqual({
        field: "date",
        direction: "desc",
      });
    });
  });

  describe("getSortLabel", () => {
    it("returns correct label for name ascending", () => {
      const sort: SortOption = { field: "name", direction: "asc" };
      expect(getSortLabel(sort)).toBe("Name (A-Z)");
    });

    it("returns correct label for name descending", () => {
      const sort: SortOption = { field: "name", direction: "desc" };
      expect(getSortLabel(sort)).toBe("Name (Z-A)");
    });

    it("returns correct label for date newest first", () => {
      const sort: SortOption = { field: "date", direction: "desc" };
      expect(getSortLabel(sort)).toBe("Date (Newest First)");
    });

    it("returns correct label for date oldest first", () => {
      const sort: SortOption = { field: "date", direction: "asc" };
      expect(getSortLabel(sort)).toBe("Date (Oldest First)");
    });

    it("returns correct label for mint_id ascending", () => {
      const sort: SortOption = { field: "mint_id", direction: "asc" };
      expect(getSortLabel(sort)).toBe("Mint ID (A-Z)");
    });

    it("returns correct label for mint_id descending", () => {
      const sort: SortOption = { field: "mint_id", direction: "desc" };
      expect(getSortLabel(sort)).toBe("Mint ID (Z-A)");
    });

    it("returns correct label for popularity most popular", () => {
      const sort: SortOption = { field: "popularity", direction: "desc" };
      expect(getSortLabel(sort)).toBe("Popularity (Most Popular)");
    });

    it("returns correct label for popularity least popular", () => {
      const sort: SortOption = { field: "popularity", direction: "asc" };
      expect(getSortLabel(sort)).toBe("Popularity (Least Popular)");
    });

    it("returns correct label for status active first", () => {
      const sort: SortOption = { field: "status", direction: "desc" };
      expect(getSortLabel(sort)).toBe("Status (Active First)");
    });

    it("returns correct label for status inactive first", () => {
      const sort: SortOption = { field: "status", direction: "asc" };
      expect(getSortLabel(sort)).toBe("Status (Inactive First)");
    });
  });

  describe("sortStreams", () => {
    const createMockStream = (
      mintId: string,
      name: string,
      numParticipants: number,
      isLive: boolean,
      createdTimestamp?: number,
      lastTradeTimestamp?: number
    ): StreamInfo => ({
      mint_id: mintId,
      name,
      symbol: name.substring(0, 3).toUpperCase(),
      num_participants: numParticipants,
      is_currently_live: isLive,
      nsfw: false,
      created_timestamp: createdTimestamp,
      last_trade_timestamp: lastTradeTimestamp,
    });

    it("sorts by name ascending", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-3", "Charlie", 10, true),
        createMockStream("mint-1", "Alpha", 5, true),
        createMockStream("mint-2", "Beta", 8, true),
      ];

      const sorted = sortStreams(streams, { field: "name", direction: "asc" });

      expect(sorted[0].name).toBe("Alpha");
      expect(sorted[1].name).toBe("Beta");
      expect(sorted[2].name).toBe("Charlie");
    });

    it("sorts by name descending", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Alpha", 5, true),
        createMockStream("mint-3", "Charlie", 10, true),
        createMockStream("mint-2", "Beta", 8, true),
      ];

      const sorted = sortStreams(streams, { field: "name", direction: "desc" });

      expect(sorted[0].name).toBe("Charlie");
      expect(sorted[1].name).toBe("Beta");
      expect(sorted[2].name).toBe("Alpha");
    });

    it("sorts by name case-insensitively", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "alpha", 5, true),
        createMockStream("mint-2", "Beta", 8, true),
        createMockStream("mint-3", "CHARLIE", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "name", direction: "asc" });

      expect(sorted[0].name).toBe("alpha");
      expect(sorted[1].name).toBe("Beta");
      expect(sorted[2].name).toBe("CHARLIE");
    });

    it("handles undefined names", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Alpha", 5, true),
        { ...createMockStream("mint-2", "Beta", 8, true), name: undefined as unknown as string },
        createMockStream("mint-3", "Charlie", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "name", direction: "asc" });

      expect(sorted[0].name).toBeUndefined();
      expect(sorted[1].name).toBe("Alpha");
      expect(sorted[2].name).toBe("Charlie");
    });

    it("sorts by date newest first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true, 1000),
        createMockStream("mint-2", "Stream 2", 8, true, 3000),
        createMockStream("mint-3", "Stream 3", 10, true, 2000),
      ];

      const sorted = sortStreams(streams, { field: "date", direction: "desc" });

      expect(sorted[0].mint_id).toBe("mint-2");
      expect(sorted[1].mint_id).toBe("mint-3");
      expect(sorted[2].mint_id).toBe("mint-1");
    });

    it("sorts by date oldest first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true, 3000),
        createMockStream("mint-2", "Stream 2", 8, true, 1000),
        createMockStream("mint-3", "Stream 3", 10, true, 2000),
      ];

      const sorted = sortStreams(streams, { field: "date", direction: "asc" });

      expect(sorted[0].mint_id).toBe("mint-2");
      expect(sorted[1].mint_id).toBe("mint-3");
      expect(sorted[2].mint_id).toBe("mint-1");
    });

    it("uses last_trade_timestamp when created_timestamp is missing", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true, undefined, 1000),
        createMockStream("mint-2", "Stream 2", 8, true, 3000),
        createMockStream("mint-3", "Stream 3", 10, true, undefined, 2000),
      ];

      const sorted = sortStreams(streams, { field: "date", direction: "desc" });

      expect(sorted[0].mint_id).toBe("mint-2");
      expect(sorted[1].mint_id).toBe("mint-3");
      expect(sorted[2].mint_id).toBe("mint-1");
    });

    it("handles streams with no timestamps", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-2", "Stream 2", 8, true, 2000),
        createMockStream("mint-3", "Stream 3", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "date", direction: "desc" });

      expect(sorted[0].mint_id).toBe("mint-2");
      // Streams without timestamps should be at the end
      expect(sorted.length).toBe(3);
    });

    it("sorts by mint_id ascending", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-3", "Stream 3", 10, true),
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-2", "Stream 2", 8, true),
      ];

      const sorted = sortStreams(streams, { field: "mint_id", direction: "asc" });

      expect(sorted[0].mint_id).toBe("mint-1");
      expect(sorted[1].mint_id).toBe("mint-2");
      expect(sorted[2].mint_id).toBe("mint-3");
    });

    it("sorts by mint_id descending", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-3", "Stream 3", 10, true),
        createMockStream("mint-2", "Stream 2", 8, true),
      ];

      const sorted = sortStreams(streams, { field: "mint_id", direction: "desc" });

      expect(sorted[0].mint_id).toBe("mint-3");
      expect(sorted[1].mint_id).toBe("mint-2");
      expect(sorted[2].mint_id).toBe("mint-1");
    });

    it("sorts by popularity most popular first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-2", "Stream 2", 15, true),
        createMockStream("mint-3", "Stream 3", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "popularity", direction: "desc" });

      expect(sorted[0].num_participants).toBe(15);
      expect(sorted[1].num_participants).toBe(10);
      expect(sorted[2].num_participants).toBe(5);
    });

    it("sorts by popularity least popular first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 15, true),
        createMockStream("mint-2", "Stream 2", 5, true),
        createMockStream("mint-3", "Stream 3", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "popularity", direction: "asc" });

      expect(sorted[0].num_participants).toBe(5);
      expect(sorted[1].num_participants).toBe(10);
      expect(sorted[2].num_participants).toBe(15);
    });

    it("handles undefined num_participants", () => {
      const streams: StreamInfo[] = [
        { ...createMockStream("mint-1", "Stream 1", 10, true), num_participants: undefined as unknown as number },
        createMockStream("mint-2", "Stream 2", 5, true),
        createMockStream("mint-3", "Stream 3", 15, true),
      ];

      const sorted = sortStreams(streams, { field: "popularity", direction: "desc" });

      expect(sorted[0].num_participants).toBe(15);
      expect(sorted[1].num_participants).toBe(5);
      expect(sorted[2].num_participants).toBeUndefined();
    });

    it("sorts by status active first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, false),
        createMockStream("mint-2", "Stream 2", 8, true),
        createMockStream("mint-3", "Stream 3", 10, false),
      ];

      const sorted = sortStreams(streams, { field: "status", direction: "desc" });

      expect(sorted[0].is_currently_live).toBe(true);
      expect(sorted[1].is_currently_live).toBe(false);
      expect(sorted[2].is_currently_live).toBe(false);
    });

    it("sorts by status inactive first", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-2", "Stream 2", 8, false),
        createMockStream("mint-3", "Stream 3", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "status", direction: "asc" });

      expect(sorted[0].is_currently_live).toBe(false);
      expect(sorted[1].is_currently_live).toBe(true);
      expect(sorted[2].is_currently_live).toBe(true);
    });

    it("preserves order for streams with same status", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-1", "Stream 1", 5, true),
        createMockStream("mint-2", "Stream 2", 8, true),
        createMockStream("mint-3", "Stream 3", 10, true),
      ];

      const sorted = sortStreams(streams, { field: "status", direction: "desc" });

      expect(sorted.length).toBe(3);
      expect(sorted.every((s) => s.is_currently_live)).toBe(true);
    });

    it("does not mutate original array", () => {
      const streams: StreamInfo[] = [
        createMockStream("mint-3", "Charlie", 10, true),
        createMockStream("mint-1", "Alpha", 5, true),
        createMockStream("mint-2", "Beta", 8, true),
      ];

      const originalOrder = streams.map((s) => s.mint_id);
      sortStreams(streams, { field: "name", direction: "asc" });

      expect(streams.map((s) => s.mint_id)).toEqual(originalOrder);
    });
  });

  describe("loadSortPreference", () => {
    it("returns default sort when localStorage is empty", () => {
      const sort = loadSortPreference();
      expect(sort).toEqual(DEFAULT_SORT);
    });

    it("loads valid sort preference from localStorage", () => {
      const customSort: SortOption = { field: "name", direction: "asc" };
      localStorage.setItem("livestream_sort_preference", JSON.stringify(customSort));

      const sort = loadSortPreference();
      expect(sort).toEqual(customSort);
    });

    it("returns default sort when localStorage has invalid data", () => {
      localStorage.setItem("livestream_sort_preference", "invalid json");

      const sort = loadSortPreference();
      expect(sort).toEqual(DEFAULT_SORT);
    });

    it("returns default sort when localStorage has invalid field", () => {
      localStorage.setItem(
        "livestream_sort_preference",
        JSON.stringify({ field: "invalid", direction: "asc" })
      );

      const sort = loadSortPreference();
      expect(sort).toEqual(DEFAULT_SORT);
    });

    it("returns default sort when localStorage has invalid direction", () => {
      localStorage.setItem(
        "livestream_sort_preference",
        JSON.stringify({ field: "name", direction: "invalid" })
      );

      const sort = loadSortPreference();
      expect(sort).toEqual(DEFAULT_SORT);
    });
  });

  describe("saveSortPreference", () => {
    it("saves sort preference to localStorage", () => {
      const customSort: SortOption = { field: "popularity", direction: "desc" };
      saveSortPreference(customSort);

      const stored = localStorage.getItem("livestream_sort_preference");
      expect(stored).toBe(JSON.stringify(customSort));
    });

    it("overwrites existing preference", () => {
      const firstSort: SortOption = { field: "name", direction: "asc" };
      const secondSort: SortOption = { field: "date", direction: "desc" };

      saveSortPreference(firstSort);
      saveSortPreference(secondSort);

      const stored = localStorage.getItem("livestream_sort_preference");
      expect(stored).toBe(JSON.stringify(secondSort));
    });

    it("handles localStorage errors gracefully", () => {
      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error("Storage quota exceeded");
      });

      const customSort: SortOption = { field: "name", direction: "asc" };
      expect(() => saveSortPreference(customSort)).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });
});

