import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import ConfigurationModal from "../ConfigurationModal";
import type { FilecoinConfig } from "@/types/filecoin";

jest.mock(
  "electron",
  () => ({
    ipcRenderer: {
      invoke: jest.fn(),
    },
  }),
  { virtual: true }
);

const { ipcRenderer: mockIpcRenderer } = require("electron");
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const theme = createTheme({ palette: { mode: "light" } });

const mockConfigResponse = {
  id: 1,
  analysis_tags: "person,car,bicycle,motorcycle",
  llm_base_url: "http://localhost:1234",
  llm_model: "HuggingFaceTB/SmolVLM-Instruct",
  max_batch_size: 2,
  livekit_url: "wss://example.livekit",
  updated_at: "2024-01-15T10:30:00Z",
};

const mockModelsResponse = {
  models: ["HuggingFaceTB/SmolVLM-Instruct", "another-model"],
};

const mockFilecoinConfig: FilecoinConfig = {
  privateKey:
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  rpcUrl: "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
  dataSetId: 123,
  encryptionEnabled: true,
};

const ThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

const renderModal = (
  props?: Partial<React.ComponentProps<typeof ConfigurationModal>>
) =>
  render(
    <ThemeWrapper>
      <ConfigurationModal
        open
        activeTab={props?.activeTab ?? "ai"}
        onTabChange={props?.onTabChange ?? jest.fn()}
        onClose={props?.onClose ?? jest.fn()}
        onSave={props?.onSave ?? jest.fn()}
        onSaveFilecoin={props?.onSaveFilecoin ?? jest.fn()}
        initialFilecoinConfig={props?.initialFilecoinConfig}
      />
    </ThemeWrapper>
  );

describe("ConfigurationModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("Tabs and loading", () => {
    it("renders settings tabs and loads config/model lists", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse),
        } as Response);

      renderModal();

      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /AI \/ LLM/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Filecoin/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:8000/api/config/"
        );
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:8000/api/config/available-models/"
        );
      });
    });

    it("shows a loader while fetching", () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      renderModal();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
  });

  describe("AI save flow", () => {
    it("saves AI tab data via onSave", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse),
        } as Response);

      const onSave = jest.fn().mockResolvedValue(undefined);

      renderModal({ onSave });

      await waitFor(() => {
        expect(
          screen.getByDisplayValue(mockConfigResponse.analysis_tags)
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Save Configuration/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          analysis_tags: mockConfigResponse.analysis_tags,
          llm_base_url: mockConfigResponse.llm_base_url,
          llm_model: mockConfigResponse.llm_model,
          max_batch_size: mockConfigResponse.max_batch_size,
          livekit_url: mockConfigResponse.livekit_url,
        });
      });
    });
  });

  describe("Filecoin tab", () => {
    it("fires onTabChange when switching tabs", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse),
        } as Response);

      const onTabChange = jest.fn();
      renderModal({ onTabChange });

      fireEvent.click(screen.getByRole("tab", { name: /Filecoin/i }));

      expect(onTabChange).toHaveBeenCalledWith("filecoin");
    });

    it("saves Filecoin settings via onSaveFilecoin", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse),
        } as Response);

      const onSaveFilecoin = jest.fn().mockResolvedValue(undefined);

      renderModal({
        onSaveFilecoin,
        activeTab: "filecoin",
        initialFilecoinConfig: mockFilecoinConfig,
      });

      await waitFor(() => {
        expect(
          screen.getByDisplayValue(mockFilecoinConfig.rpcUrl ?? "")
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: /Save Filecoin Settings/i })
      );

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
          "save-filecoin-config",
          expect.objectContaining({
            privateKey: mockFilecoinConfig.privateKey,
            rpcUrl: mockFilecoinConfig.rpcUrl,
          })
        );
        expect(onSaveFilecoin).toHaveBeenCalledWith(
          expect.objectContaining({ privateKey: mockFilecoinConfig.privateKey })
        );
      });
    });

    it("shows validation message when private key is missing", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockConfigResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockModelsResponse),
        } as Response);

      renderModal({
        activeTab: "filecoin",
        initialFilecoinConfig: { ...mockFilecoinConfig, privateKey: "" },
      });

      const saveButton = screen.getByRole("button", {
        name: /Save Filecoin Settings/i,
      });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Private key is required/)).toBeInTheDocument();
      });
    });
  });
});

