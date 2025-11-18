import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import AddLivestreamModal, { AddLivestreamFormData } from "../AddLivestreamModal";

const theme = createTheme({ palette: { mode: "light" } });

// Wrapper component with theme provider
const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

describe("AddLivestreamModal", () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = (open: boolean = true, existingMintIds?: Set<string>) => {
    return render(
      <ThemeWrapper>
        <AddLivestreamModal
          open={open}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          existingMintIds={existingMintIds}
        />
      </ThemeWrapper>
    );
  };

  describe("Modal Visibility", () => {
    it("should not render when closed", () => {
      renderModal(false);
      expect(screen.queryByText("Add RTC Livestream")).not.toBeInTheDocument();
    });

    it("should render when open", () => {
      renderModal(true);
      expect(screen.getByText("Add RTC Livestream")).toBeInTheDocument();
    });
  });

  describe("Form Fields", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should display all form fields", () => {
      expect(screen.getByLabelText(/RTC URL or Connection String/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mint ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Stream Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Symbol/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    });

    it("should allow entering RTC URL", () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com/room" } });
      expect(rtcUrlInput).toHaveValue("wss://example.com/room");
    });

    it("should allow entering mint ID", () => {
      const mintIdInput = screen.getByLabelText(/Mint ID/i);
      fireEvent.change(mintIdInput, { target: { value: "test-mint-id" } });
      expect(mintIdInput).toHaveValue("test-mint-id");
    });

    it("should allow entering stream name", () => {
      const streamNameInput = screen.getByLabelText(/Stream Name/i);
      fireEvent.change(streamNameInput, { target: { value: "Test Stream" } });
      expect(streamNameInput).toHaveValue("Test Stream");
    });

    it("should allow entering symbol", () => {
      const symbolInput = screen.getByLabelText(/Symbol/i);
      fireEvent.change(symbolInput, { target: { value: "TEST" } });
      expect(symbolInput).toHaveValue("TEST");
    });

    it("should allow entering description", () => {
      const descriptionInput = screen.getByLabelText(/Description/i);
      fireEvent.change(descriptionInput, { target: { value: "Test description" } });
      expect(descriptionInput).toHaveValue("Test description");
    });
  });

  describe("Form Validation", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should show error when RTC URL is empty on submit", async () => {
      const mintIdInput = screen.getByLabelText(/Mint ID/i);
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/RTC URL or connection string is required/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should show error when mint ID is empty on submit", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Mint ID is required/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should show error when RTC URL format is invalid", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "invalid-url" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid RTC URL format. Use wss:\/\/, ws:\/\/, or a valid connection string/i)
        ).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should accept valid WebSocket URLs (wss://)", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com/room" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it("should accept valid WebSocket URLs (ws://)", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "ws://localhost:8080/room" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it("should accept connection strings with ://", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "room://room-name" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it("should show error when mint ID already exists", async () => {
      const existingMintIds = new Set(["existing-mint"]);
      const { rerender } = renderModal(true, existingMintIds);

      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "existing-mint" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/A livestream with this mint ID already exists/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should show error when stream name is too short", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);
      const streamNameInput = screen.getByLabelText(/Stream Name/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });
      fireEvent.change(streamNameInput, { target: { value: "A" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Stream name must be at least 2 characters/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should clear field error when user starts typing", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      // Trigger validation error
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });
      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/RTC URL or connection string is required/i)).toBeInTheDocument();
      });

      // Start typing in the field
      fireEvent.change(rtcUrlInput, { target: { value: "w" } });

      await waitFor(() => {
        expect(screen.queryByText(/RTC URL or connection string is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Submit Functionality", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should call onSubmit with form data when form is valid", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);
      const streamNameInput = screen.getByLabelText(/Stream Name/i);
      const symbolInput = screen.getByLabelText(/Symbol/i);
      const descriptionInput = screen.getByLabelText(/Description/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com/room" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint-id" } });
      fireEvent.change(streamNameInput, { target: { value: "Test Stream" } });
      fireEvent.change(symbolInput, { target: { value: "TEST" } });
      fireEvent.change(descriptionInput, { target: { value: "Test description" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          rtcUrl: "wss://example.com/room",
          streamName: "Test Stream",
          mintId: "test-mint-id",
          symbol: "TEST",
          description: "Test description",
        });
      });
    });

    it("should trim whitespace from form data", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);
      const streamNameInput = screen.getByLabelText(/Stream Name/i);

      fireEvent.change(rtcUrlInput, { target: { value: "  wss://example.com  " } });
      fireEvent.change(mintIdInput, { target: { value: "  test-mint  " } });
      fireEvent.change(streamNameInput, { target: { value: "  Test Stream  " } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          rtcUrl: "wss://example.com",
          streamName: "Test Stream",
          mintId: "test-mint",
          symbol: undefined,
          description: undefined,
        });
      });
    });

    it("should use mint ID as stream name if stream name is empty", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint-id" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            streamName: "test-mint-id",
            mintId: "test-mint-id",
          })
        );
      });
    });

    it("should close modal after successful submit", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it("should reset form after successful submit", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });

      // Reopen modal and check form is reset
      const { rerender } = render(
        <ThemeWrapper>
          <AddLivestreamModal
            open={true}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
          />
        </ThemeWrapper>
      );

      expect(screen.getByLabelText(/RTC URL or Connection String/i)).toHaveValue("");
      expect(screen.getByLabelText(/Mint ID/i)).toHaveValue("");
    });

    it("should show loading state during submit", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockImplementation(() => new Promise(() => {})); // Never resolves

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Adding...")).toBeInTheDocument();
      });

      expect(submitButton).toBeDisabled();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled();
    });

    it("should handle submit error", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      const errorMessage = "Failed to add livestream";
      mockOnSubmit.mockRejectedValue(new Error(errorMessage));

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Modal should stay open
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("should handle submit error with non-Error object", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockRejectedValue("String error");

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Failed to add livestream")).toBeInTheDocument();
      });
    });

    it("should clear submit error when user makes changes", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      const errorMessage = "Failed to add livestream";
      mockOnSubmit.mockRejectedValue(new Error(errorMessage));

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Make a change
      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com/updated" } });

      await waitFor(() => {
        expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
      });
    });
  });

  describe("Cancel Functionality", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should call onClose when cancel button clicked", () => {
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should call onClose when close icon clicked", () => {
      const closeButton = screen.getByRole("button", { name: "" }); // Close icon button
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should reset form when closing", () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Reopen modal and check form is reset
      const { rerender } = render(
        <ThemeWrapper>
          <AddLivestreamModal
            open={true}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
          />
        </ThemeWrapper>
      );

      expect(screen.getByLabelText(/RTC URL or Connection String/i)).toHaveValue("");
      expect(screen.getByLabelText(/Mint ID/i)).toHaveValue("");
    });

    it("should not close when cancel is clicked during submit", async () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockImplementation(() => new Promise(() => {})); // Never resolves

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Adding...")).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();
      fireEvent.click(cancelButton);

      // onClose should not be called because button is disabled
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should have proper dialog role", () => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have proper form labels", () => {
      expect(screen.getByLabelText(/RTC URL or Connection String/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mint ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Stream Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Symbol/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    });

    it("should have proper button labels", () => {
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add Livestream/i })).toBeInTheDocument();
    });

    it("should mark required fields", () => {
      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      expect(rtcUrlInput).toBeRequired();
      expect(mintIdInput).toBeRequired();
    });
  });

  describe("Helper Text", () => {
    beforeEach(() => {
      renderModal(true);
    });

    it("should show helper text for RTC URL field", () => {
      expect(
        screen.getByText(/WebSocket URL \(wss:\/\/ or ws:\/\/\) or LiveKit connection string/i)
      ).toBeInTheDocument();
    });

    it("should show helper text for mint ID field", () => {
      expect(screen.getByText(/Unique identifier \(e.g., pump.fun mint ID\)/i)).toBeInTheDocument();
    });

    it("should show optional label for stream name", () => {
      expect(screen.getByText(/Optional: Display name/i)).toBeInTheDocument();
    });
  });

  describe("Existing Mint IDs Validation", () => {
    it("should validate against existing mint IDs", async () => {
      const existingMintIds = new Set(["existing-1", "existing-2"]);
      renderModal(true, existingMintIds);

      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "existing-1" } });

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/A livestream with this mint ID already exists/i)).toBeInTheDocument();
      });
    });

    it("should allow new mint IDs not in existing set", async () => {
      const existingMintIds = new Set(["existing-1"]);
      renderModal(true, existingMintIds);

      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "new-mint-id" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    it("should work without existing mint IDs prop", async () => {
      renderModal(true, undefined);

      const rtcUrlInput = screen.getByLabelText(/RTC URL or Connection String/i);
      const mintIdInput = screen.getByLabelText(/Mint ID/i);

      fireEvent.change(rtcUrlInput, { target: { value: "wss://example.com" } });
      fireEvent.change(mintIdInput, { target: { value: "test-mint" } });

      mockOnSubmit.mockResolvedValue(undefined);

      const submitButton = screen.getByRole("button", { name: /Add Livestream/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });
  });
});

