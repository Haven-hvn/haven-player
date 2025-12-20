import React, { useState, useEffect, useMemo, SyntheticEvent } from "react";
import type { JSX } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Typography,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  FormHelperText,
  SelectChangeEvent,
} from "@mui/material";
import {
  Save as SaveIcon,
  Close as CloseIcon,
  SmartToy as AIIcon,
  SmartDisplay as PlaybackIcon,
  Storage as ServerIcon,
  WorkspacePremium as BatchIcon,
  CloudUpload as CloudUploadIcon,
  Lock as LockIcon,
  AccountTree as ArkivIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import type { FilecoinConfig, ArkivConfig } from "@/types/filecoin";
import { restoreService, evmService } from "@/services/api";
import type { SettingsTab } from "@/context/SettingsNavigationContext";
import type { IpfsGatewayConfig } from "@/types/playback";
import {
  DEFAULT_IPFS_GATEWAY,
  normalizeGatewayBase,
} from "@/services/playbackResolver";
import { gatewayService } from "@/services/api";
import { ipcRenderer } from "electron";

interface AppConfig {
  id: number;
  analysis_tags: string;
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
  livekit_url: string;
  updated_at: string;
}

type EditableAppConfig = Omit<AppConfig, "id" | "updated_at">;

interface ConfigurationModalProps {
  open: boolean;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  onSave: (config: EditableAppConfig) => Promise<void>;
  onSaveFilecoin: (config: FilecoinConfig) => Promise<void>;
  initialFilecoinConfig?: FilecoinConfig | null;
}

const defaultArkivConfig: ArkivConfig = {
  rpcUrl: "https://mendoza.hoodi.arkiv.network/rpc",
  enabled: false,
  syncEnabled: false,
};

const defaultFilecoinConfig: FilecoinConfig = {
  privateKey: "",
  rpcUrl: "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
  dataSetId: undefined,
  encryptionEnabled: false,
};

const defaultAppConfig: EditableAppConfig = {
  analysis_tags: "",
  llm_base_url: "http://localhost:1234",
  llm_model: "HuggingFaceTB/SmolVLM-Instruct",
  max_batch_size: 1,
  livekit_url: "wss://pump-prod-tg2x8veh.livekit.cloud",
};

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({
  open,
  activeTab,
  onTabChange,
  onClose,
  onSave,
  onSaveFilecoin,
  initialFilecoinConfig,
}: ConfigurationModalProps): JSX.Element => {
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingFilecoin, setLoadingFilecoin] = useState(false);
  const [loadingArkiv, setLoadingArkiv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filecoinError, setFilecoinError] = useState<string | null>(null);
  const [arkivError, setArkivError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null);
  const [restartingBackend, setRestartingBackend] = useState(false);
  const [backendRestartMessage, setBackendRestartMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<EditableAppConfig>(defaultAppConfig);
  const [filecoinConfig, setFilecoinConfig] =
    useState<FilecoinConfig>(initialFilecoinConfig ?? defaultFilecoinConfig);
  const [arkivConfig, setArkivConfig] = useState<ArkivConfig>(defaultArkivConfig);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<IpfsGatewayConfig>({
    baseUrl: DEFAULT_IPFS_GATEWAY,
  });
  const [gatewayStatus, setGatewayStatus] = useState<
    "idle" | "checking" | "ok" | "error"
  >("idle");
  const [gatewayStatusMessage, setGatewayStatusMessage] = useState<string | null>(null);
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    wallet_address: string;
    chain_name: string;
    native_token_symbol: string;
    balance_ether: number;
    has_sufficient_balance: boolean;
  } | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const isFilecoinTab =
    activeTab === "filecoin" || activeTab === "encryption";
  const isArkivTab = activeTab === "arkiv";
  const isPlaybackTab = activeTab === "playback";
  const loading = loadingAi || loadingFilecoin || loadingArkiv || loadingGateway;

  useEffect(() => {
    if (open) {
      setError(null);
      setFilecoinError(null);
      setArkivError(null);
      loadConfig();
      loadAvailableModels();
      loadFilecoinConfig();
      loadArkivConfig();
      loadGatewayConfig();
    }
  }, [open]);

  useEffect(() => {
    if (initialFilecoinConfig) {
      setFilecoinConfig(initialFilecoinConfig);
    }
  }, [initialFilecoinConfig]);

  const loadConfig = async () => {
    try {
      setLoadingAi(true);
      setError(null);
      const response = await fetch("http://localhost:8000/api/config/");
      if (!response.ok) throw new Error("Failed to load configuration");

      const data = await response.json();
      setConfig({
        analysis_tags: data.analysis_tags,
        llm_base_url: data.llm_base_url,
        llm_model: data.llm_model,
        max_batch_size: data.max_batch_size,
        livekit_url: data.livekit_url,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load configuration"
      );
      setConfig(defaultAppConfig);
    } finally {
      setLoadingAi(false);
    }
  };

  const loadFilecoinConfig = async () => {
    if (initialFilecoinConfig) return;
    try {
      setLoadingFilecoin(true);
      const savedConfig = await ipcRenderer.invoke("get-filecoin-config");
      if (savedConfig) {
        setFilecoinConfig({
          privateKey: savedConfig.privateKey || "",
          rpcUrl:
            savedConfig.rpcUrl ||
            "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
          dataSetId: savedConfig.dataSetId,
          encryptionEnabled: savedConfig.encryptionEnabled ?? false,
        });
      } else {
        setFilecoinConfig(defaultFilecoinConfig);
      }
    } catch (err) {
      console.error("Failed to load Filecoin config:", err);
      setFilecoinConfig(defaultFilecoinConfig);
    } finally {
      setLoadingFilecoin(false);
    }
  };

  const loadArkivConfig = async () => {
    try {
      setLoadingArkiv(true);
      setArkivError(null);
      const savedConfig = await ipcRenderer.invoke("get-arkiv-config");
      if (savedConfig) {
        setArkivConfig({
          rpcUrl: savedConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc",
          enabled: savedConfig.enabled ?? false,
          syncEnabled: savedConfig.syncEnabled ?? false,
        });
      } else {
        setArkivConfig(defaultArkivConfig);
      }
    } catch (err) {
      console.error("Failed to load Arkiv config:", err);
      setArkivConfig(defaultArkivConfig);
    } finally {
      setLoadingArkiv(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/api/config/available-models/"
      );
      if (!response.ok) throw new Error("Failed to load available models");

      const data = await response.json();
      setAvailableModels(data.models);
    } catch (err) {
      console.error("Failed to load available models:", err);
      setAvailableModels(["HuggingFaceTB/SmolVLM-Instruct"]);
    }
  };

  const loadGatewayConfig = async () => {
    try {
      setLoadingGateway(true);
      setGatewayStatus("idle");
      setGatewayStatusMessage(null);
      const savedGateway: IpfsGatewayConfig | null =
        await ipcRenderer.invoke("playback:get-gateway-config");

      let resolvedBase = savedGateway?.baseUrl ?? DEFAULT_IPFS_GATEWAY;

      try {
        const backendGateway = await gatewayService.get();
        if (backendGateway?.baseUrl) {
          resolvedBase = backendGateway.baseUrl;
        }
      } catch (backendError) {
        console.error("Failed to load backend gateway config:", backendError);
      }

      setGatewayConfig({ baseUrl: normalizeGatewayBase(resolvedBase) });
    } catch (err) {
      console.error("Failed to load IPFS gateway config:", err);
      setGatewayConfig({ baseUrl: DEFAULT_IPFS_GATEWAY });
      setGatewayStatus("error");
      setGatewayStatusMessage("Failed to load gateway settings");
    } finally {
      setLoadingGateway(false);
    }
  };

  const handleGatewayChange = (value: string) => {
    setGatewayConfig({ baseUrl: value });
    setGatewayStatus("idle");
    setGatewayStatusMessage(null);
  };

  const handleGatewayReset = () => {
    setGatewayConfig({ baseUrl: DEFAULT_IPFS_GATEWAY });
    setGatewayStatus("idle");
    setGatewayStatusMessage(null);
  };

  const checkGatewayConnectivity = async () => {
    const normalizedBase = normalizeGatewayBase(gatewayConfig.baseUrl);
    setGatewayConfig({ baseUrl: normalizedBase });
    setGatewayStatus("checking");
    setGatewayStatusMessage(null);

    try {
      const response = await fetch(normalizedBase, { method: "HEAD" });
      const isReachable = response.ok || response.status < 500;
      setGatewayStatus(isReachable ? "ok" : "error");
      setGatewayStatusMessage(
        isReachable
          ? "Gateway reachable"
          : `Gateway responded with status ${response.status}`
      );
    } catch (err) {
      console.error("Gateway connectivity check failed:", err);
      setGatewayStatus("error");
      setGatewayStatusMessage("Gateway unreachable");
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setFilecoinError(null);
      setArkivError(null);
      setRestoreSummary(null);

      if (isPlaybackTab) {
        const normalizedBase = normalizeGatewayBase(gatewayConfig.baseUrl);
        const savedGateway: IpfsGatewayConfig = await ipcRenderer.invoke(
          "playback:set-gateway-config",
          { baseUrl: normalizedBase }
        );
        setGatewayConfig({
          baseUrl: normalizeGatewayBase(savedGateway.baseUrl),
        });
        try {
          await gatewayService.update({ baseUrl: normalizedBase });
        } catch (syncError) {
          console.error("Failed to sync gateway config to backend:", syncError);
          setGatewayStatus("error");
          setGatewayStatusMessage("Saved locally but backend sync failed");
          return;
        }
        setGatewayStatus("ok");
        setGatewayStatusMessage("Gateway saved");
      } else if (isFilecoinTab) {
        if (!filecoinConfig.privateKey.trim()) {
          setFilecoinError("Private key is required");
          return;
        }

        // Automatically check gas balance when enabling Filecoin
        setCheckingBalance(true);
        setBalanceError(null);
        setBalanceInfo(null);
        
        try {
          // Use HTTP RPC URL for balance checking (convert wss:// to https:// if needed)
          let rpcUrl = filecoinConfig.rpcUrl || "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1";
          if (rpcUrl.startsWith("wss://")) {
            rpcUrl = rpcUrl.replace("wss://", "https://");
          } else if (rpcUrl.startsWith("ws://")) {
            rpcUrl = rpcUrl.replace("ws://", "http://");
          }

          const balance = await evmService.checkBalance(rpcUrl);
          setBalanceInfo(balance);
          
          // Warn if balance is insufficient but don't block save
          if (!balance.has_sufficient_balance) {
            setFilecoinError(
              `⚠️ Low gas balance detected: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}. ` +
              `Please send ${balance.native_token_symbol} to ${balance.wallet_address} for gas fees. ` +
              `Configuration saved, but you may encounter errors when uploading.`
            );
          }
        } catch (balanceErr) {
          // Log but don't block save - balance check is informational
          console.warn("Failed to check gas balance:", balanceErr);
          setBalanceError(
            balanceErr instanceof Error ? balanceErr.message : "Failed to check gas balance"
          );
        } finally {
          setCheckingBalance(false);
        }

        await ipcRenderer.invoke("save-filecoin-config", {
          privateKey: filecoinConfig.privateKey,
          rpcUrl: filecoinConfig.rpcUrl,
          dataSetId: filecoinConfig.dataSetId,
          encryptionEnabled: filecoinConfig.encryptionEnabled,
        });

        await onSaveFilecoin(filecoinConfig);
      } else if (isArkivTab) {
        // Automatically check gas balance when enabling Arkiv sync
        if (arkivConfig.syncEnabled) {
          setCheckingBalance(true);
          setBalanceError(null);
          setBalanceInfo(null);
          
          try {
            const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc";
            const balance = await evmService.checkBalance(rpcUrl);
            setBalanceInfo(balance);
            
            // Warn if balance is insufficient but don't block save
            if (!balance.has_sufficient_balance) {
              setArkivError(
                `⚠️ Low gas balance detected: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}. ` +
                `Please send ${balance.native_token_symbol} to ${balance.wallet_address} for gas fees. ` +
                `Configuration saved, but Arkiv sync may fail.`
              );
            }
          } catch (balanceErr) {
            // Log but don't block save - balance check is informational
            console.warn("Failed to check gas balance:", balanceErr);
            setBalanceError(
              balanceErr instanceof Error ? balanceErr.message : "Failed to check gas balance"
            );
          } finally {
            setCheckingBalance(false);
          }
        }

        await ipcRenderer.invoke("save-arkiv-config", {
          rpcUrl: arkivConfig.rpcUrl,
          syncEnabled: arkivConfig.syncEnabled,
        });
        // Reload to get updated enabled status
        await loadArkivConfig();
      } else {
        await onSave(config);
      }

      // Only close if no critical errors (warnings are OK)
      if (!filecoinError && !arkivError) {
        onClose();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save configuration";
      if (isFilecoinTab) {
        setFilecoinError(message);
      } else if (isArkivTab) {
        setArkivError(message);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreFromArkiv = async () => {
    try {
      setRestoring(true);
      setArkivError(null);
      setRestoreSummary(null);
      const result = await restoreService.restoreFromArkiv();
      setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restore from Arkiv";
      setArkivError(message);
    } finally {
      setRestoring(false);
    }
  };

  const handleRestartBackend = async () => {
    try {
      setRestartingBackend(true);
      setArkivError(null);
      setBackendRestartMessage(null);
      const result = await ipcRenderer.invoke("restart-backend");
      setBackendRestartMessage(result.message || "Backend restarted successfully");
      // Reload Arkiv config to update the enabled status
      await loadArkivConfig();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restart backend";
      setArkivError(message);
    } finally {
      setRestartingBackend(false);
    }
  };

  const handleTagsChange = (value: string) => {
    setConfig((prev: EditableAppConfig) => ({ ...prev, analysis_tags: value }));
  };

  const tagList = useMemo(
    () =>
      config.analysis_tags
        .split(",")
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag),
    [config.analysis_tags]
  );

  const renderAiContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Box sx={{ mt: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 3,
            pt: 1,
          }}
        >
          <Box
            sx={{
              width: 24,
              height: 24,
              backgroundColor: "#F9A825",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AIIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: "#000000",
              fontWeight: 500,
              fontSize: "16px",
            }}
          >
            Analysis Tags
          </Typography>
        </Box>

        <TextField
          fullWidth
          label="Analysis Tags (comma-separated)"
          value={config.analysis_tags}
          onChange={(
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
          ) => handleTagsChange(e.target.value)}
          placeholder="person,car,bicycle,walking,running..."
          multiline
          rows={3}
        />

        {tagList.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography
              variant="body2"
              sx={{
                color: "#6B6B6B",
                mb: 2,
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              TAGS PREVIEW ({tagList.length} tags)
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                maxHeight: 120,
                overflow: "auto",
                p: 2,
                backgroundColor: "#F7F7F7",
                borderRadius: "8px",
                border: "1px solid #F0F0F0",
              }}
            >
              {tagList.map((tag: string) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    backgroundColor: "#FFFFFF",
                    color: "#000000",
                    border: "1px solid #E0E0E0",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: 500,
                    "&:hover": {
                      backgroundColor: "#F5F5F5",
                      borderColor: "#BDBDBD",
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Divider sx={{ backgroundColor: "#F0F0F0" }} />

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              backgroundColor: "#4CAF50",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ServerIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: "#000000",
              fontWeight: 500,
              fontSize: "16px",
            }}
          >
            Language Model Configuration
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <TextField
            fullWidth
            label="LLM Base URL"
            value={config.llm_base_url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setConfig((prev: EditableAppConfig) => ({
                ...prev,
                llm_base_url: e.target.value,
              }))
            }
            placeholder="http://localhost:1234"
          />

          <FormControl fullWidth>
            <InputLabel>Visual Language Model</InputLabel>
            <Select
              value={config.llm_model}
              label="Visual Language Model"
              onChange={(e: SelectChangeEvent<string>) =>
                setConfig((prev: EditableAppConfig) => ({
                  ...prev,
                  llm_model: e.target.value as string,
                }))
              }
            >
              {availableModels.map((model: string) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>
    </Box>
  );

  const renderLivekitContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        LiveKit Configuration
      </Typography>
      <TextField
        fullWidth
        label="LiveKit URL"
        value={config.livekit_url}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setConfig((prev: EditableAppConfig) => ({
            ...prev,
            livekit_url: e.target.value,
          }))
        }
        placeholder="wss://pump-prod-tg2x8veh.livekit.cloud"
        helperText="WebSocket URL for LiveKit server connection"
      />
    </Box>
  );

  const renderPlaybackContent = (): JSX.Element => {
    const statusSeverity =
      gatewayStatus === "ok"
        ? "success"
        : gatewayStatus === "error"
        ? "error"
        : "info";

    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
          Playback Preferences
        </Typography>
        <Typography variant="body2" sx={{ color: "#6B6B6B" }}>
          Haven Player prefers your local file when it exists. If it is missing,
          playback streams from the configured IPFS gateway.
        </Typography>
        <TextField
          fullWidth
          label="IPFS Gateway URL"
          value={gatewayConfig.baseUrl}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            handleGatewayChange(e.target.value)
          }
          placeholder={DEFAULT_IPFS_GATEWAY}
          helperText="Used for remote playback. /ipfs/ is added automatically."
        />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            onClick={checkGatewayConnectivity}
            disabled={gatewayStatus === "checking"}
          >
            {gatewayStatus === "checking" ? "Checking..." : "Check gateway"}
          </Button>
          <Button variant="text" onClick={handleGatewayReset}>
            Reset to default
          </Button>
        </Box>
        {gatewayStatusMessage && (
          <Alert severity={statusSeverity}>{gatewayStatusMessage}</Alert>
        )}
      </Box>
    );
  };

  const renderProcessingContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        Processing Configuration
      </Typography>
      <TextField
        fullWidth
        label="Max Batch Size"
        type="number"
        value={config.max_batch_size}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setConfig((prev: EditableAppConfig) => ({
            ...prev,
            max_batch_size: parseInt(e.target.value, 10) || 1,
          }))
        }
        inputProps={{ min: 1, max: 10 }}
        helperText="Number of videos to process simultaneously (1-10)"
      />
    </Box>
  );

  const handleCheckBalance = async () => {
    try {
      setCheckingBalance(true);
      setBalanceError(null);
      setBalanceInfo(null);

      // Use HTTP RPC URL for balance checking (convert wss:// to https:// if needed)
      let rpcUrl = filecoinConfig.rpcUrl || "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1";
      // Convert WebSocket URL to HTTP for balance checking
      if (rpcUrl.startsWith("wss://")) {
        rpcUrl = rpcUrl.replace("wss://", "https://");
      } else if (rpcUrl.startsWith("ws://")) {
        rpcUrl = rpcUrl.replace("ws://", "http://");
      }

      const balance = await evmService.checkBalance(rpcUrl);
      setBalanceInfo(balance);
    } catch (err) {
      setBalanceError(
        err instanceof Error ? err.message : "Failed to check balance"
      );
    } finally {
      setCheckingBalance(false);
    }
  };

  const renderFilecoinContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        Filecoin Configuration
      </Typography>
      <TextField
        fullWidth
        label="Private Key"
        value={filecoinConfig.privateKey}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setFilecoinConfig((prev: FilecoinConfig) => ({
            ...prev,
            privateKey: e.target.value,
          }));
          // Clear balance info when private key changes
          setBalanceInfo(null);
          setBalanceError(null);
        }}
        placeholder="Enter your private key from MetaMask"
        type="password"
        required
        helperText="Your Ethereum private key (0x prefix will be added automatically if missing)"
      />

      <TextField
        fullWidth
        label="RPC URL (optional)"
        value={filecoinConfig.rpcUrl ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setFilecoinConfig((prev: FilecoinConfig) => ({
            ...prev,
            rpcUrl: e.target.value,
          }));
          // Clear balance info when RPC URL changes
          setBalanceInfo(null);
          setBalanceError(null);
        }}
        placeholder="wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1"
        helperText="Filecoin RPC endpoint (WebSocket wss:// or HTTP https://). Default: Calibration testnet WebSocket"
      />

      <TextField
        fullWidth
        label="Data Set ID (optional)"
        type="number"
        value={filecoinConfig.dataSetId ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setFilecoinConfig((prev: FilecoinConfig) => ({
            ...prev,
            dataSetId: e.target.value ? parseInt(e.target.value, 10) : undefined,
          }))
        }
        placeholder="Leave empty to create new"
        helperText="Use existing data set ID or leave empty to create a new one"
      />

      <Divider sx={{ my: 1 }} />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500, color: "#424242" }}>
          Gas Balance Check
        </Typography>
        <Button
          variant="outlined"
          onClick={handleCheckBalance}
              disabled={checkingBalance}
          startIcon={checkingBalance ? <CircularProgress size={16} /> : <RefreshIcon />}
          sx={{
            alignSelf: "flex-start",
            textTransform: "none",
          }}
        >
          {checkingBalance ? "Checking..." : "Check Gas Balance"}
        </Button>

        {balanceInfo && (
          <Alert
            severity={balanceInfo.has_sufficient_balance ? "success" : "warning"}
            sx={{
              "& .MuiAlert-icon": {
                color: balanceInfo.has_sufficient_balance ? "#4CAF50" : "#FF9800",
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Wallet: {balanceInfo.wallet_address}
              </Typography>
              <IconButton
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(balanceInfo.wallet_address);
                }}
                sx={{
                  padding: 0.5,
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
                title="Copy wallet address"
              >
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Typography variant="body2">
              Chain: {balanceInfo.chain_name}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
              Balance: {balanceInfo.balance_ether.toFixed(6)} {balanceInfo.native_token_symbol}
            </Typography>
            {!balanceInfo.has_sufficient_balance && (
              <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
                ⚠️ Low balance! Please send {balanceInfo.native_token_symbol} to this address for gas fees.
              </Typography>
            )}
          </Alert>
        )}

        {balanceError && (
          <Alert severity="error">
            {balanceError}
          </Alert>
        )}
      </Box>

      <Alert
        severity="info"
        sx={{
          backgroundColor: "#E3F2FD",
          color: "#1976D2",
          border: "1px solid #BBDEFB",
          borderRadius: "8px",
          "& .MuiAlert-icon": {
            color: "#1976D2",
          },
        }}
      >
        <Typography
          sx={{
            fontSize: "12px",
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          }}
        >
          <strong>Note:</strong> This uses Filecoin Calibration testnet. You'll
          need test FIL for gas and test USDFC for storage payments. Private keys
          are encrypted and stored securely on your device.
        </Typography>
      </Alert>

      {filecoinError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {filecoinError}
        </Alert>
      )}
    </Box>
  );

  const renderEncryptionContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        Encryption
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          p: 2,
          backgroundColor: filecoinConfig.encryptionEnabled ? "#E8F5E9" : "#FAFAFA",
          borderRadius: "8px",
          border: filecoinConfig.encryptionEnabled
            ? "1px solid #4CAF50"
            : "1px solid #E0E0E0",
          transition: "all 0.2s ease-in-out",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <LockIcon
            sx={{
              color: filecoinConfig.encryptionEnabled ? "#4CAF50" : "#9E9E9E",
              fontSize: 20,
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={filecoinConfig.encryptionEnabled}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFilecoinConfig((prev: FilecoinConfig) => ({
                    ...prev,
                    encryptionEnabled: e.target.checked,
                  }))
                }
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: "#4CAF50",
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    backgroundColor: "#4CAF50",
                  },
                }}
              />
            }
            label={
              <Typography
                sx={{
                  fontWeight: 500,
                  fontSize: "14px",
                  color: "#000000",
                }}
              >
                Encrypt videos before upload
              </Typography>
            }
            sx={{ margin: 0 }}
          />
        </Box>
        <Typography
          sx={{
            fontSize: "12px",
            color: "#6B6B6B",
            ml: 4.5,
          }}
        >
          {filecoinConfig.encryptionEnabled
            ? "Videos will be encrypted with Lit Protocol before uploading to Filecoin. Only your wallet can decrypt them."
            : "Videos will be uploaded to Filecoin without encryption."}
        </Typography>
        <FormHelperText sx={{ ml: 4.5, mt: 1 }}>
          Encryption preferences are stored locally in the Filecoin settings.
        </FormHelperText>
      </Box>
    </Box>
  );

  const saveLabel = isPlaybackTab
    ? "Save Playback Settings"
    : isFilecoinTab
    ? "Save Filecoin Settings"
    : isArkivTab
    ? "Save Arkiv Settings"
    : "Save Configuration";

  const renderArkivContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        Arkiv Configuration
      </Typography>

      {/* Enable/Disable Toggle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
          borderRadius: "8px",
          backgroundColor: arkivConfig.syncEnabled ? "#E8F5E9" : "#F5F5F5",
          border: `1px solid ${arkivConfig.syncEnabled ? "#4CAF50" : "#E0E0E0"}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {arkivConfig.syncEnabled ? (
            <CheckCircleIcon sx={{ color: "#4CAF50", fontSize: 24 }} />
          ) : (
            <CancelIcon sx={{ color: "#9E9E9E", fontSize: 24 }} />
          )}
          <Box>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: "14px",
                color: "#000000",
                mb: 0.5,
              }}
            >
              Sync videos to Arkiv blockchain
            </Typography>
            <Typography
              sx={{
                fontSize: "12px",
                color: "#6B6B6B",
              }}
            >
              {arkivConfig.syncEnabled
                ? "Videos with sharing enabled will be synced to Arkiv"
                : "Arkiv sync is disabled"}
            </Typography>
          </Box>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={arkivConfig.syncEnabled}
              onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                const newSyncEnabled = e.target.checked;
                setArkivConfig((prev: ArkivConfig) => ({
                  ...prev,
                  syncEnabled: newSyncEnabled,
                }));
                
                // Automatically check balance when enabling Arkiv sync
                if (newSyncEnabled) {
                  setCheckingBalance(true);
                  setBalanceError(null);
                  setBalanceInfo(null);
                  
                  try {
                    const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc";
                    const balance = await evmService.checkBalance(rpcUrl);
                    setBalanceInfo(balance);
                    
                    // Warn if balance is insufficient
                    if (!balance.has_sufficient_balance) {
                      setArkivError(
                        `⚠️ Low gas balance: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}. ` +
                        `Send ${balance.native_token_symbol} to ${balance.wallet_address} for gas fees.`
                      );
                    } else {
                      setArkivError(null);
                    }
                  } catch (balanceErr) {
                    console.warn("Failed to check gas balance:", balanceErr);
                    setBalanceError(
                      balanceErr instanceof Error ? balanceErr.message : "Failed to check gas balance"
                    );
                  } finally {
                    setCheckingBalance(false);
                  }
                } else if (!newSyncEnabled) {
                  // Clear balance info when disabling
                  setBalanceInfo(null);
                  setBalanceError(null);
                  setArkivError(null);
                }
              }}
              disabled={!arkivConfig.enabled}
              color="success"
            />
          }
          label=""
        />
      </Box>

      {/* Private Key Status */}
      {!arkivConfig.enabled && (
        <Alert
          severity="warning"
          sx={{
            backgroundColor: "#FFF3E0",
            color: "#E65100",
            border: "1px solid #FFCC80",
            borderRadius: "8px",
            "& .MuiAlert-icon": {
              color: "#E65100",
            },
          }}
        >
          <Typography sx={{ fontSize: "12px" }}>
            <strong>Private key required:</strong> Configure a private key in the Filecoin settings tab to enable Arkiv sync.
          </Typography>
        </Alert>
      )}

      <TextField
        fullWidth
        label="Arkiv RPC URL"
        value={arkivConfig.rpcUrl ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setArkivConfig((prev: ArkivConfig) => ({
            ...prev,
            rpcUrl: e.target.value,
          }));
          // Clear balance info when RPC URL changes
          setBalanceInfo(null);
          setBalanceError(null);
        }}
        placeholder="https://mendoza.hoodi.arkiv.network/rpc"
        helperText="Ethereum RPC endpoint for Arkiv blockchain. Default: https://mendoza.hoodi.arkiv.network/rpc"
        disabled={!arkivConfig.syncEnabled}
      />

      {arkivConfig.enabled && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500, color: "#424242" }}>
              Gas Balance Check
            </Typography>
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  setCheckingBalance(true);
                  setBalanceError(null);
                  setBalanceInfo(null);

                  const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc";
                  const balance = await evmService.checkBalance(rpcUrl);
                  setBalanceInfo(balance);
                } catch (err) {
                  setBalanceError(
                    err instanceof Error ? err.message : "Failed to check balance"
                  );
                } finally {
                  setCheckingBalance(false);
                }
              }}
              disabled={checkingBalance || !arkivConfig.enabled}
              startIcon={checkingBalance ? <CircularProgress size={16} /> : <RefreshIcon />}
              sx={{
                alignSelf: "flex-start",
                textTransform: "none",
              }}
            >
              {checkingBalance ? "Checking..." : "Check Gas Balance"}
            </Button>

            {balanceInfo && (
              <Alert
                severity={balanceInfo.has_sufficient_balance ? "success" : "warning"}
                sx={{
                  "& .MuiAlert-icon": {
                    color: balanceInfo.has_sufficient_balance ? "#4CAF50" : "#FF9800",
                  },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Wallet: {balanceInfo.wallet_address}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(balanceInfo.wallet_address);
                    }}
                    sx={{
                      padding: 0.5,
                      "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.04)",
                      },
                    }}
                    title="Copy wallet address"
                  >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
                <Typography variant="body2">
                  Chain: {balanceInfo.chain_name}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>
                  Balance: {balanceInfo.balance_ether.toFixed(6)} {balanceInfo.native_token_symbol}
                </Typography>
                {!balanceInfo.has_sufficient_balance && (
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
                    ⚠️ Low balance! Please send {balanceInfo.native_token_symbol} to this address for gas fees.
                  </Typography>
                )}
              </Alert>
            )}

            {balanceError && (
              <Alert severity="error">
                {balanceError}
              </Alert>
            )}
          </Box>
        </>
      )}

      <Alert
        severity="info"
        sx={{
          backgroundColor: "#E3F2FD",
          color: "#1976D2",
          border: "1px solid #BBDEFB",
          borderRadius: "8px",
          "& .MuiAlert-icon": {
            color: "#1976D2",
          },
        }}
      >
        <Typography
          sx={{
            fontSize: "12px",
            fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
          }}
        >
          <strong>Note:</strong> Arkiv uses the same private key as Filecoin
          (configured in Filecoin settings). The RPC URL is for the Ethereum
          network where Arkiv entities are stored. Enable sharing for individual
          videos via the context menu to sync them to Arkiv.
        </Typography>
      </Alert>

      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 2, mt: 2 }}>
        <Button
          variant="outlined"
          disabled={restoring || !arkivConfig.enabled}
          onClick={handleRestoreFromArkiv}
          startIcon={restoring ? <CircularProgress size={16} /> : undefined}
          sx={{
            borderColor: arkivConfig.enabled ? "#4CAF50" : "#E0E0E0",
            color: arkivConfig.enabled ? "#4CAF50" : "#9E9E9E",
            "&:hover": {
              borderColor: arkivConfig.enabled ? "#45A049" : "#E0E0E0",
              backgroundColor: arkivConfig.enabled ? "#F1F8F4" : "#FAFAFA",
            },
          }}
        >
          {restoring ? "Restoring..." : "Restore Catalog from Arkiv"}
        </Button>
        {restoreSummary && (
          <Typography variant="body2" sx={{ color: "#4CAF50" }}>
            {restoreSummary}
          </Typography>
        )}
      </Box>
      {!arkivConfig.enabled && (
        <Typography variant="body2" sx={{ color: "#9E9E9E", fontSize: "12px", mt: -1 }}>
          Configure a private key in Filecoin settings to enable restore functionality.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500, color: "#424242" }}>
          Backend Configuration
        </Typography>
        <Typography variant="body2" sx={{ color: "#6B6B6B", fontSize: "12px" }}>
          After changing Arkiv settings (sync toggle, RPC URL) or Filecoin private key, you must restart the backend for changes to take effect.
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            disabled={restartingBackend}
            onClick={handleRestartBackend}
            startIcon={restartingBackend ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            sx={{
              backgroundColor: "#1976D2",
              color: "#FFFFFF",
              "&:hover": {
                backgroundColor: "#1565C0",
              },
              "&:disabled": {
                backgroundColor: "#BDBDBD",
              },
            }}
          >
            {restartingBackend ? "Restarting..." : "Restart Backend"}
          </Button>
          {backendRestartMessage && (
            <Typography variant="body2" sx={{ color: "#4CAF50" }}>
              {backendRestartMessage}
            </Typography>
          )}
        </Box>
      </Box>

      {arkivError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {arkivError}
        </Alert>
      )}
    </Box>
  );

  const renderContent = (): JSX.Element | null => {
    switch (activeTab) {
      case "ai":
        return renderAiContent();
      case "livekit":
        return renderLivekitContent();
      case "playback":
        return renderPlaybackContent();
      case "processing":
        return renderProcessingContent();
      case "filecoin":
        return renderFilecoinContent();
      case "encryption":
        return renderEncryptionContent();
      case "arkiv":
        return renderArkivContent();
      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: "#FFFFFF",
          color: "#000000",
          border: "1px solid #F0F0F0",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
        },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          px: 3,
          pt: 3,
          backgroundColor: "#FAFAFA",
          borderBottom: "1px solid #F0F0F0",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            variant="h6"
            sx={{
              fontFamily: '"Inter", "Segoe UI", "Arial", sans-serif',
              fontWeight: 600,
              fontSize: "18px",
              color: "#000000",
              letterSpacing: "-0.01em",
            }}
          >
            Settings
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: "#6B6B6B",
            "&:hover": {
              backgroundColor: "#F5F5F5",
            },
          }}
          aria-label="Close settings"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3 }}>
        {(error || filecoinError || arkivError) && (
          <Alert
            severity="error"
            sx={{
              backgroundColor: "#FFF5F5",
              color: "#FF4D4D",
              border: "1px solid #FFE0E0",
              borderRadius: "8px",
              mb: 2,
              "& .MuiAlert-icon": {
                color: "#FF4D4D",
              },
            }}
          >
            {error || filecoinError || arkivError}
          </Alert>
        )}

        <Tabs
          value={activeTab}
          onChange={(event: SyntheticEvent, value: SettingsTab) => {
            event.preventDefault();
            onTabChange(value);
          }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="AI / LLM" value="ai" icon={<AIIcon fontSize="small" />} iconPosition="start" />
          <Tab label="LiveKit" value="livekit" icon={<ServerIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Processing" value="processing" icon={<BatchIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Playback" value="playback" icon={<PlaybackIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Filecoin" value="filecoin" icon={<CloudUploadIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Encryption" value="encryption" icon={<LockIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Arkiv" value="arkiv" icon={<ArkivIcon fontSize="small" />} iconPosition="start" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress sx={{ color: "#000000" }} />
          </Box>
        ) : (
          <Box sx={{ mt: 3 }}>{renderContent()}</Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          pt: 2,
          backgroundColor: "#FAFAFA",
          borderTop: "1px solid #F0F0F0",
          gap: 2,
        }}
      >
        <Button
          onClick={onClose}
          disabled={saving}
          sx={{
            color: "#6B6B6B",
            fontSize: "14px",
            fontWeight: 500,
            px: 3,
            py: 1,
            borderRadius: "8px",
            "&:hover": {
              backgroundColor: "#F5F5F5",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading || saving || (isFilecoinTab && !filecoinConfig.privateKey.trim())}
          variant="contained"
          sx={{
            background: "linear-gradient(135deg, #000000 0%, #424242 100%)",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 500,
            px: 4,
            py: 1,
            borderRadius: "8px",
            boxShadow: "none",
            "&:hover": {
              background: "linear-gradient(135deg, #424242 0%, #000000 100%)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            },
            "&:disabled": {
              backgroundColor: "#E0E0E0",
              color: "#9E9E9E",
            },
          }}
          startIcon={
            saving ? (
              <CircularProgress size={16} sx={{ color: "#FFFFFF" }} />
            ) : (
              <SaveIcon />
            )
          }
        >
          {saving ? "Saving..." : saveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationModal;
