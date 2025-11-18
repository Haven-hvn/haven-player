import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SortMenu from "../SortMenu";
import { SortOption, DEFAULT_SORT } from "@/utils/sortUtils";

const theme = createTheme({});

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe("SortMenu", () => {
  const mockAnchorEl = document.createElement("button");
  const mockOnClose = jest.fn();
  const mockOnSortChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders when open", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    expect(screen.getByText("Sort By")).toBeInTheDocument();
    expect(screen.getByText("Name (A-Z)")).toBeInTheDocument();
    expect(screen.getByText("Name (Z-A)")).toBeInTheDocument();
    expect(screen.getByText("Date (Newest First)")).toBeInTheDocument();
    expect(screen.getByText("Date (Oldest First)")).toBeInTheDocument();
    expect(screen.getByText("Mint ID (A-Z)")).toBeInTheDocument();
    expect(screen.getByText("Mint ID (Z-A)")).toBeInTheDocument();
    expect(screen.getByText("Popularity (Most Popular)")).toBeInTheDocument();
    expect(screen.getByText("Popularity (Least Popular)")).toBeInTheDocument();
    expect(screen.getByText("Status (Active First)")).toBeInTheDocument();
    expect(screen.getByText("Status (Inactive First)")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={false}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    expect(screen.queryByText("Sort By")).not.toBeInTheDocument();
  });

  it("calls onSortChange and onClose when a sort option is selected", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const nameAscOption = screen.getByText("Name (A-Z)");
    fireEvent.click(nameAscOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "name",
      direction: "asc",
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows checkmark for selected sort option", () => {
    const currentSort: SortOption = { field: "name", direction: "asc" };
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={currentSort}
        onSortChange={mockOnSortChange}
      />
    );

    const nameAscOption = screen.getByText("Name (A-Z)").closest("li");
    expect(nameAscOption).toHaveClass("Mui-selected");
  });

  it("handles name sort descending", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const nameDescOption = screen.getByText("Name (Z-A)");
    fireEvent.click(nameDescOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "name",
      direction: "desc",
    });
  });

  it("handles date sort newest first", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const dateDescOption = screen.getByText("Date (Newest First)");
    fireEvent.click(dateDescOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "date",
      direction: "desc",
    });
  });

  it("handles date sort oldest first", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const dateAscOption = screen.getByText("Date (Oldest First)");
    fireEvent.click(dateAscOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "date",
      direction: "asc",
    });
  });

  it("handles mint_id sort ascending", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const mintIdAscOption = screen.getByText("Mint ID (A-Z)");
    fireEvent.click(mintIdAscOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "mint_id",
      direction: "asc",
    });
  });

  it("handles mint_id sort descending", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const mintIdDescOption = screen.getByText("Mint ID (Z-A)");
    fireEvent.click(mintIdDescOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "mint_id",
      direction: "desc",
    });
  });

  it("handles popularity sort most popular", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const popularityDescOption = screen.getByText("Popularity (Most Popular)");
    fireEvent.click(popularityDescOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "popularity",
      direction: "desc",
    });
  });

  it("handles popularity sort least popular", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const popularityAscOption = screen.getByText("Popularity (Least Popular)");
    fireEvent.click(popularityAscOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "popularity",
      direction: "asc",
    });
  });

  it("handles status sort active first", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const statusDescOption = screen.getByText("Status (Active First)");
    fireEvent.click(statusDescOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "status",
      direction: "desc",
    });
  });

  it("handles status sort inactive first", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    const statusAscOption = screen.getByText("Status (Inactive First)");
    fireEvent.click(statusAscOption);

    expect(mockOnSortChange).toHaveBeenCalledWith({
      field: "status",
      direction: "asc",
    });
  });

  it("calls onClose when menu is closed", () => {
    renderWithTheme(
      <SortMenu
        anchorEl={mockAnchorEl}
        open={true}
        onClose={mockOnClose}
        currentSort={DEFAULT_SORT}
        onSortChange={mockOnSortChange}
      />
    );

    // Simulate closing the menu (e.g., clicking outside)
    // Material-UI Menu component handles this internally
    // We test that onClose is called when an option is selected
    const nameAscOption = screen.getByText("Name (A-Z)");
    fireEvent.click(nameAscOption);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("displays correct selected state for different sort options", () => {
    const testCases: Array<{ sort: SortOption; expectedText: string }> = [
      { sort: { field: "name", direction: "asc" }, expectedText: "Name (A-Z)" },
      { sort: { field: "name", direction: "desc" }, expectedText: "Name (Z-A)" },
      { sort: { field: "date", direction: "desc" }, expectedText: "Date (Newest First)" },
      { sort: { field: "date", direction: "asc" }, expectedText: "Date (Oldest First)" },
      { sort: { field: "mint_id", direction: "asc" }, expectedText: "Mint ID (A-Z)" },
      { sort: { field: "mint_id", direction: "desc" }, expectedText: "Mint ID (Z-A)" },
      { sort: { field: "popularity", direction: "desc" }, expectedText: "Popularity (Most Popular)" },
      { sort: { field: "popularity", direction: "asc" }, expectedText: "Popularity (Least Popular)" },
      { sort: { field: "status", direction: "desc" }, expectedText: "Status (Active First)" },
      { sort: { field: "status", direction: "asc" }, expectedText: "Status (Inactive First)" },
    ];

    testCases.forEach(({ sort, expectedText }) => {
      const { unmount } = renderWithTheme(
        <SortMenu
          anchorEl={mockAnchorEl}
          open={true}
          onClose={mockOnClose}
          currentSort={sort}
          onSortChange={mockOnSortChange}
        />
      );

      const selectedOption = screen.getByText(expectedText).closest("li");
      expect(selectedOption).toHaveClass("Mui-selected");
      unmount();
    });
  });
});

