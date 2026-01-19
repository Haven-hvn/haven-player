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
  Grid,
} from "@mui/material";
import {
  Save as SaveIcon,
  Close as CloseIcon,
  SmartToy as AIIcon,
  SmartDisplay as PlaybackIcon,
  WorkspacePremium as BatchIcon,
  CloudUpload as CloudUploadIcon,
  Lock as LockIcon,
  AccountTree as ArkivIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  Add as AddIcon,
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

// Explicitly define JSX.IntrinsicElements for missing types
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "webview": React.DetailedHTMLProps<React.WebViewHTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>;
    }
  }
}

interface AppConfig {
  id: number;
  analysis_tags: string;
  // VLM Processing Configuration
  vlm_frame_interval: number;
  vlm_threshold: number;
  vlm_return_timestamps: boolean;
  vlm_return_confidence: boolean;
  vlm_multiplexer_enabled: boolean;
  vlm_multiplexer_endpoints: MultiplexerEndpoint[] | null;
  vlm_max_concurrent_requests: number;
  // LLM Configuration
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
  download_directory: string; /* Added global download directory */
  updated_at: string;
}

type EditableAppConfig = Omit<AppConfig, "id" | "updated_at">;

interface MultiplexerEndpoint {
  base_url: string;
  api_key: string;
  name: string;
  weight: number;
  max_concurrent: number;
}

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
  expirationWeeks: 4, // Default: 4 weeks
};

const defaultFilecoinConfig: FilecoinConfig = {
  privateKey: "",
  rpcUrl: "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
  dataSetId: undefined,
  encryptionEnabled: false,
};

const defaultAppConfig: EditableAppConfig = {
  analysis_tags: "",
  vlm_frame_interval: 2.0,
  vlm_threshold: 0.5,
  vlm_return_timestamps: true,
  vlm_return_confidence: true,
  vlm_multiplexer_enabled: false,
  vlm_multiplexer_endpoints: null,
  vlm_max_concurrent_requests: 15,
  llm_base_url: "http://localhost:1234/v1",
  llm_model: "zai-org/glm-4.6v-flash",
  max_batch_size: 1,
  download_directory: "downloads", /* Added default download directory */
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
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);
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
  const [showMultiplexer, setShowMultiplexer] = useState(false);
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
      
      // Parse multiplexer endpoints from JSON response
      let multiplexerEndpoints = null;
      if (data.vlm_multiplexer_endpoints) {
        if (Array.isArray(data.vlm_multiplexer_endpoints)) {
          // Direct array (new format)
          multiplexerEndpoints = data.vlm_multiplexer_endpoints;
        } else if (typeof data.vlm_multiplexer_endpoints === 'string') {
          try {
            // Parse JSON string (legacy format)
            const parsed = JSON.parse(data.vlm_multiplexer_endpoints);
            if (Array.isArray(parsed)) {
              multiplexerEndpoints = parsed;
            }
          } catch (e) {
            console.warn('Failed to parse multiplexer endpoints JSON:', e);
          }
        }
      }
      
      setConfig({
        analysis_tags: data.analysis_tags,
        vlm_frame_interval: data.vlm_frame_interval ?? 2.0,
        vlm_threshold: data.vlm_threshold ?? 0.5,
        vlm_return_timestamps: data.vlm_return_timestamps ?? true,
        vlm_return_confidence: data.vlm_return_confidence ?? true,
        vlm_multiplexer_enabled: data.vlm_multiplexer_enabled ?? false,
        vlm_multiplexer_endpoints: multiplexerEndpoints,
        vlm_max_concurrent_requests: data.vlm_max_concurrent_requests ?? 15,
        llm_base_url: data.llm_base_url,
        llm_model: data.llm_model,
        max_batch_size: data.max_batch_size,
        download_directory: data.download_directory, /* Added global download directory */
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
        const loadedConfig = {
          privateKey: savedConfig.privateKey || "",
          rpcUrl:
            savedConfig.rpcUrl ||
            "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
          dataSetId: savedConfig.dataSetId,
          encryptionEnabled: savedConfig.encryptionEnabled ?? false,
        };
        console.log(`[ConfigurationModal] Loaded Filecoin config from JSON - encryptionEnabled: ${loadedConfig.encryptionEnabled} (from savedConfig: ${savedConfig.encryptionEnabled})`);
        setFilecoinConfig(loadedConfig);
      } else {
        console.log(`[ConfigurationModal] No saved config found, using defaults - encryptionEnabled: ${defaultFilecoinConfig.encryptionEnabled}`);
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
          expirationWeeks: savedConfig.expirationWeeks ?? 4,
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
      setAvailableModels(["zai-org/glm-4.6v-flash"]);
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

  const addEndpoint = () => {
    const newEndpoint: MultiplexerEndpoint = {
      base_url: "http://localhost:1234/v1",
      api_key: "",
      name: `endpoint-${(config.vlm_multiplexer_endpoints?.length || 0) + 1}`,
      weight: 1,
      max_concurrent: 5,
    };
    setConfig((prev) => ({
      ...prev,
      vlm_multiplexer_endpoints: [...(prev.vlm_multiplexer_endpoints || []), newEndpoint],
    }));
  };

  const removeEndpoint = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      vlm_multiplexer_endpoints: prev.vlm_multiplexer_endpoints?.filter((_, i) => i !== index) || null,
    }));
  };

  const updateEndpoint = (index: number, field: keyof MultiplexerEndpoint, value: string | number) => {
    setConfig((prev) => {
      const endpoints = prev.vlm_multiplexer_endpoints ? [...prev.vlm_multiplexer_endpoints] : [];
      if (endpoints[index]) {
        (endpoints[index] as any)[field] = value;
      }
      return { ...prev, vlm_multiplexer_endpoints: endpoints };
    });
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

        // Log what we're about to save
        console.log(`[ConfigurationModal] Saving Filecoin config - encryptionEnabled: ${filecoinConfig.encryptionEnabled} (type: ${typeof filecoinConfig.encryptionEnabled})`);
        
        await ipcRenderer.invoke("save-filecoin-config", {
          privateKey: filecoinConfig.privateKey,
          rpcUrl: filecoinConfig.rpcUrl,
          dataSetId: filecoinConfig.dataSetId,
          encryptionEnabled: filecoinConfig.encryptionEnabled ?? false, // Explicitly ensure boolean
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
          expirationWeeks: arkivConfig.expirationWeeks,
        });
        // Reload to get updated enabled status
        await loadArkivConfig();
      } else {
        await onSave(config);
      }

      // Only close if no critical errors (warnings are OK) and no glitter endpoint error
      if (!filecoinError && !arkivError && !error) {
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
      setRestoreProgress("Fetching entities from Arkiv...");
      
      // Step 1: Restore from Arkiv
      setRestoreProgress("Restoring catalog from Arkiv...");
      const result = await restoreService.restoreFromArkiv();
      
      // Step 2: Decrypt encrypted CIDs for videos that need it
      try {
        setRestoreProgress("Checking for encrypted CIDs to decrypt...");
        const videosNeedingDecryption = await restoreService.getVideosNeedingDecryption();
        if (videosNeedingDecryption.length > 0) {
          const config: FilecoinConfig | null = await ipcRenderer.invoke('get-filecoin-config');
          
          if (config?.privateKey) {
            let decryptedCount = 0;
            const total = videosNeedingDecryption.length;
            
            for (let i = 0; i < videosNeedingDecryption.length; i++) {
              const video = videosNeedingDecryption[i];
              try {
                setRestoreProgress(`Decrypting CID ${i + 1} of ${total}...`);
                // Decrypt the CID using Lit Protocol
                const decryptedCid = await ipcRenderer.invoke('decrypt-text-with-lit', {
                  ciphertext: video.encrypted_filecoin_cid,
                  metadataJson: video.cid_encryption_metadata,
                });
                
                // Update the database with decrypted CID
                await restoreService.decryptVideoCid(video.path, decryptedCid);
                decryptedCount++;
              } catch (err) {
                console.error(`Failed to decrypt CID for ${video.path}:`, err);
              }
            }
            
            setRestoreProgress(null);
            if (decryptedCount > 0) {
              setRestoreSummary(
                `Restored ${result.restored}, skipped ${result.skipped}. Decrypted ${decryptedCount} CID(s).`
              );
            } else {
      setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}.`);
            }
          } else {
            setRestoreProgress(null);
            setRestoreSummary(
              `Restored ${result.restored}, skipped ${result.skipped}. ${videosNeedingDecryption.length} CID(s) need decryption (private key required).`
            );
          }
        } else {
          setRestoreProgress(null);
          setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}.`);
        }
      } catch (decryptErr) {
        console.error('Failed to decrypt CIDs:', decryptErr);
        setRestoreProgress(null);
        setRestoreSummary(
          `Restored ${result.restored}, skipped ${result.skipped}. Warning: CID decryption failed.`
        );
      }
    } catch (err) {
      setRestoreProgress(null);
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

      <Divider sx={{ backgroundColor: "#F0F0F0", my: 2 }} />

      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        VLM Processing Parameters
      </Typography>

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <TextField
          sx={{ flex: 1, minWidth: 200 }}
          label="Frame Interval (seconds)"
          type="number"
          value={config.vlm_frame_interval}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConfig((prev: EditableAppConfig) => ({
              ...prev,
              vlm_frame_interval: parseFloat(e.target.value) || 2.0,
            }))
          }
          inputProps={{ step: 0.1, min: 0.1, max: 60.0 }}
          helperText="Seconds between frame samples"
        />

        <TextField
          sx={{ flex: 1, minWidth: 200 }}
          label="Confidence Threshold"
          type="number"
          value={config.vlm_threshold}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConfig((prev: EditableAppConfig) => ({
              ...prev,
              vlm_threshold: parseFloat(e.target.value) || 0.5,
            }))
          }
          inputProps={{ step: 0.01, min: 0.0, max: 1.0 }}
          helperText="Min confidence for tag detection"
        />

        <FormControl sx={{ flex: 1, minWidth: 150 }}>
          <InputLabel style={{ backgroundColor: "#2A2A2A", padding: "0 4px" }}>
            VLM Settings
          </InputLabel>
          <Select
            multiple
            value={[
              ...[config.vlm_return_timestamps ? "Timestamps" : ""],
              ...[config.vlm_return_confidence ? "Confidence" : ""],
            ].filter(Boolean)}
            label="VLM Settings"
            onChange={(e: SelectChangeEvent<string[]>) => {
              const values = e.target.value;
              setConfig((prev: EditableAppConfig) => ({
                ...prev,
                vlm_return_timestamps: values.includes("Timestamps"),
                vlm_return_confidence: values.includes("Confidence"),
              }));
            }}
            renderValue={(selected: string[]) => selected.join(", ")}
          >
            <MenuItem value={"Timestamps"}>Include Timestamps</MenuItem>
            <MenuItem value={"Confidence"}>Include Confidence</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ backgroundColor: "#F0F0F0", my: 2 }} />

      {/* Multiplexer UI Section */}
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ width: 24, height: 24, backgroundColor: "#9C27B0", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BatchIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
            </Box>
            <Typography variant="h6" sx={{ color: "#000000", fontWeight: 500, fontSize: "16px" }}>
              LLM Multiplexer
            </Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={config.vlm_multiplexer_enabled} onChange={(e) => setConfig((prev) => ({ ...prev, vlm_multiplexer_enabled: e.target.checked }))} />}
            label="Enable multiplexer"
          />
        </Box>

        {config.vlm_multiplexer_enabled && (
          <>
            <Alert severity="info" sx={{ mb: 3 }}>
              Multiplexer distributes requests across multiple LLM endpoints for load balancing and fault tolerance.
              When enabled, single endpoint settings are ignored.
            </Alert>
            
            {/* Add/Edit endpoints UI */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {config.vlm_multiplexer_endpoints?.map((endpoint, index) => (
                <Box key={index} sx={{ p: 2, border: "1px solid #E0E0E0", borderRadius: "8px" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Endpoint {index + 1}: {endpoint.name}
                    </Typography>
                    <IconButton size="small" onClick={() => removeEndpoint(index)} sx={{ color: "#FF5252" }} color="error">
                      <CancelIcon />
                    </IconButton>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Name" value={endpoint.name} onChange={(e) => updateEndpoint(index, "name", e.target.value)} size="small" required />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Base URL" value={endpoint.base_url} onChange={(e) => updateEndpoint(index, "base_url", e.target.value)} size="small" required placeholder="http://localhost:1234/v1" />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth label="API Key" value={endpoint.api_key} onChange={(e) => updateEndpoint(index, "api_key", e.target.value)} size="small" required />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth type="number" label="Weight" value={endpoint.weight} onChange={(e) => updateEndpoint(index, "weight", parseFloat(e.target.value))} inputProps={{ min: 1 }} size="small" required helperText="Higher = more traffic" />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth type="number" label="Max Concurrent" value={endpoint.max_concurrent} onChange={(e) => updateEndpoint(index, "max_concurrent", parseInt(e.target.value, 10))} inputProps={{ min: 1 }} size="small" required helperText="Concurrent requests" />
                    </Grid>
                  </Grid>
                </Box>
              ))}
              
              <Button startIcon={<AddIcon />} onClick={addEndpoint} variant="outlined" sx={{ alignSelf: "flex-start" }}>
                Add Endpoint
              </Button>
            </Box>
            
            <Divider sx={{ backgroundColor: "#F0F0F0", my: 2 }} />
            
            <TextField fullWidth type="number" label="Global Max Concurrent Requests" value={config.vlm_max_concurrent_requests} onChange={(e) => setConfig((prev) => ({ ...prev, vlm_max_concurrent_requests: parseInt(e.target.value, 10) }))} inputProps={{ min: 1 }} helperText="Total concurrent requests across all endpoints" />
          </>
        )}
      </Box>

      <Divider sx={{ backgroundColor: "#F0F0F0" }} style={{ margin: '16px 0' }} />

      {/* Single endpoint configuration - disabled when multiplexer is enabled */}
      <Box sx={{ opacity: config.vlm_multiplexer_enabled ? 0.5 : 1, pointerEvents: config.vlm_multiplexer_enabled ? "none" : "auto" }}>
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
            <PlaybackIcon sx={{ color: "#FFFFFF", fontSize: 14 }} />
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
          <Typography variant="body2" color="text.secondary">
            {config.vlm_multiplexer_enabled ? "Single endpoint settings are ignored when multiplexer is enabled" : "Configure a single LLM endpoint"}
          </Typography>
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
            placeholder="http://localhost:1234/v1"
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

      <Divider sx={{ backgroundColor: "#F0F0F0", my: 2 }} />

      <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "16px" }}>
        Download Directory
      </Typography>
      <TextField
        fullWidth
        label="Global Download Directory"
        value={config.download_directory}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setConfig((prev: EditableAppConfig) => ({
            ...prev,
            download_directory: e.target.value,
          }))
        }
        placeholder="downloads"
        helperText="The default directory for all plugin downloads"
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

      <TextField
        fullWidth
        label="Video Expiration (weeks)"
        type="number"
        value={arkivConfig.expirationWeeks ?? 4}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const weeks = parseInt(e.target.value, 10);
          setArkivConfig((prev: ArkivConfig) => ({
            ...prev,
            expirationWeeks: isNaN(weeks) || weeks < 1 ? 1 : weeks,
          }));
        }}
        inputProps={{ min: 1, max: 520 }} // 1 week to 10 years (520 weeks)
        helperText="How long (in weeks) videos will be able to be restored from Arkiv. After expiration, data is automatically pruned from the blockchain. Default: 4 weeks"
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
          {restoring ? (restoreProgress || "Restoring...") : "Restore Catalog from Arkiv"}
        </Button>
        {restoreProgress && restoring && (
          <Typography variant="body2" sx={{ mt: 1, color: "text.secondary", fontStyle: "italic" }}>
            {restoreProgress}
          </Typography>
        )}
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
