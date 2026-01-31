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
  Breadcrumbs,
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
  CloudSync as UploadWorkerIcon,
  NavigateNext as NavigateNextIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import type { FilecoinConfig, ArkivConfig } from "@/types/filecoin";
import { restoreService, evmService } from "@/services/api";
import type { SettingsTab } from "@/context/SettingsNavigationContext";
import type { IpfsGatewayConfig } from "@/types/playback";
import { DEFAULT_IPFS_GATEWAY, normalizeGatewayBase } from "@/services/playbackResolver";
import { gatewayService } from "@/services/api";
import { ipcRenderer } from "electron";
import { liquidGlassTokens, glowEffects } from "@/styles/liquidGlassTheme";

interface AppConfig {
  id: number;
  analysis_tags: string;
  vlm_frame_interval: number;
  vlm_threshold: number;
  vlm_return_timestamps: boolean;
  vlm_return_confidence: boolean;
  vlm_multiplexer_enabled: boolean;
  vlm_multiplexer_endpoints: MultiplexerEndpoint[] | null;
  vlm_max_concurrent_requests: number;
  llm_base_url: string;
  llm_model: string;
  max_batch_size: number;
  download_directory: string;
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
  expirationWeeks: 4,
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
  download_directory: "downloads",
};

const defaultUploadWorkerConfig = {
  enabled: false,
  pollInterval: 15000,  // milliseconds
  maxConcurrentUploads: 1,
  retryAttempts: 3,
  gatewaySelection: 'auto',  // 'auto' or 'custom'
  customGatewayUrl: '',
};

// Glass panel styles for Liquid Glass design
const glassPanelStyles = {
  background: liquidGlassTokens.glass.fill,
  backdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  WebkitBackdropFilter: `blur(${liquidGlassTokens.glass.blur}) saturate(180%)`,
  border: `1px solid ${liquidGlassTokens.glass.border}`,
  borderRadius: liquidGlassTokens.radius.lg,
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.5), 0 8px 32px rgba(0, 0, 0, 0.4)`,
};

// Glass input field styles
const glassInputStyles = {
  '& .MuiOutlinedInput-root': {
    borderRadius: liquidGlassTokens.radius.sm,
    background: 'rgba(255, 255, 255, 0.03)',
    transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
    '& fieldset': {
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    '&.Mui-focused': {
      background: `${liquidGlassTokens.neon.cyan}08`,
      '& fieldset': {
        borderColor: liquidGlassTokens.neon.cyan,
        borderWidth: 1,
        boxShadow: glowEffects.cyan(0.15),
      },
    },
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(255, 255, 255, 0.5)',
    '&.Mui-focused': {
      color: liquidGlassTokens.neon.cyan,
    },
  },
  '& .MuiInputBase-input': {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  '& .MuiFormHelperText-root': {
    color: 'rgba(255, 255, 255, 0.4)',
  },
};

// Glass button styles
const glassButtonStyles = {
  primary: {
    background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}25 0%, ${liquidGlassTokens.neon.cyan}15 100%)`,
    border: `1px solid ${liquidGlassTokens.neon.cyan}50`,
    color: liquidGlassTokens.neon.cyan,
    borderRadius: liquidGlassTokens.radius.sm,
    transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
    '&:hover': {
      background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}35 0%, ${liquidGlassTokens.neon.cyan}20 100%)`,
      boxShadow: glowEffects.cyan(0.25),
    },
    '&:disabled': {
      background: 'rgba(255, 255, 255, 0.05)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      color: 'rgba(255, 255, 255, 0.3)',
    },
  },
  secondary: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${liquidGlassTokens.glass.border}`,
    color: 'rgba(255, 255, 255, 0.7)',
    borderRadius: liquidGlassTokens.radius.sm,
    transition: `all ${liquidGlassTokens.motion.durationFast} ease`,
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
    },
  },
};

// Section header component
const SectionHeader = ({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, pt: 1 }}>
    <Box sx={{ width: 28, height: 28, backgroundColor: color, borderRadius: liquidGlassTokens.radius.sm, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${color}40` }}>
      {icon}
    </Box>
    <Typography variant="h6" sx={{ color: "#fff", fontWeight: 500, fontSize: "16px" }}>{title}</Typography>
  </Box>
);

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({
  open, activeTab, onTabChange, onClose, onSave, onSaveFilecoin, initialFilecoinConfig,
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
  const [filecoinConfig, setFilecoinConfig] = useState<FilecoinConfig>(initialFilecoinConfig ?? defaultFilecoinConfig);
  const [arkivConfig, setArkivConfig] = useState<ArkivConfig>(defaultArkivConfig);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<IpfsGatewayConfig>({ baseUrl: DEFAULT_IPFS_GATEWAY });
  const [gatewayStatus, setGatewayStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [gatewayStatusMessage, setGatewayStatusMessage] = useState<string | null>(null);
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{ wallet_address: string; chain_name: string; native_token_symbol: string; balance_ether: number; has_sufficient_balance: boolean; } | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [uploadWorkerConfig, setUploadWorkerConfig] = useState(defaultUploadWorkerConfig);
  const [loadingUploadWorker, setLoadingUploadWorker] = useState(false);

  const isFilecoinTab = activeTab === "filecoin" || activeTab === "encryption";
  const isArkivTab = activeTab === "arkiv";
  const isPlaybackTab = activeTab === "playback";
  const isUploadWorkerTab = activeTab === "upload-worker";
  const loading = loadingAi || loadingFilecoin || loadingArkiv || loadingGateway || loadingUploadWorker;

  useEffect(() => { if (open) { setError(null); setFilecoinError(null); setArkivError(null); setBalanceInfo(null); setBalanceError(null); loadConfig(); loadAvailableModels(); loadFilecoinConfig(); loadArkivConfig(); loadGatewayConfig(); } }, [open]);

  // Clear balance info when switching tabs to prevent showing wrong chain's balance
  useEffect(() => {
    setBalanceInfo(null);
    setBalanceError(null);
  }, [activeTab]);

  const loadConfig = async () => {
    try {
      setLoadingAi(true); setError(null);
      const response = await fetch("http://localhost:8000/api/config/");
      if (!response.ok) throw new Error("Failed to load configuration");
      const data = await response.json();
      let multiplexerEndpoints = null;
      if (data.vlm_multiplexer_endpoints) {
        if (Array.isArray(data.vlm_multiplexer_endpoints)) multiplexerEndpoints = data.vlm_multiplexer_endpoints;
        else if (typeof data.vlm_multiplexer_endpoints === 'string') {
          try { const parsed = JSON.parse(data.vlm_multiplexer_endpoints); if (Array.isArray(parsed)) multiplexerEndpoints = parsed; } catch {}
        }
      }
      setConfig({ analysis_tags: data.analysis_tags, vlm_frame_interval: data.vlm_frame_interval ?? 2.0, vlm_threshold: data.vlm_threshold ?? 0.5, vlm_return_timestamps: data.vlm_return_timestamps ?? true, vlm_return_confidence: data.vlm_return_confidence ?? true, vlm_multiplexer_enabled: data.vlm_multiplexer_enabled ?? false, vlm_multiplexer_endpoints: multiplexerEndpoints, vlm_max_concurrent_requests: data.vlm_max_concurrent_requests ?? 15, llm_base_url: data.llm_base_url, llm_model: data.llm_model, max_batch_size: data.max_batch_size, download_directory: data.download_directory });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load configuration"); setConfig(defaultAppConfig); } finally { setLoadingAi(false); }
  };

  const loadFilecoinConfig = async () => {
    try {
      setLoadingFilecoin(true);
      const savedConfig = await ipcRenderer.invoke("get-filecoin-config");
      if (savedConfig) {
        setFilecoinConfig({
          privateKey: savedConfig.privateKey || "",
          rpcUrl: savedConfig.rpcUrl || "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1",
          dataSetId: savedConfig.dataSetId,
          encryptionEnabled: savedConfig.encryptionEnabled ?? false,
        });
      } else {
        setFilecoinConfig(defaultFilecoinConfig);
      }
    } catch {
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
    } catch {
      setArkivConfig(defaultArkivConfig);
    } finally {
      setLoadingArkiv(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/config/available-models/");
      if (!response.ok) throw new Error("Failed to load available models");
      const data = await response.json();
      setAvailableModels(data.models);
    } catch { setAvailableModels(["zai-org/glm-4.6v-flash"]); }
  };

  const loadGatewayConfig = async () => {
    try {
      setLoadingGateway(true); setGatewayStatus("idle"); setGatewayStatusMessage(null);
      const savedGateway: IpfsGatewayConfig | null = await ipcRenderer.invoke("playback:get-gateway-config");
      let resolvedBase = savedGateway?.baseUrl ?? DEFAULT_IPFS_GATEWAY;
      try { const backendGateway = await gatewayService.get(); if (backendGateway?.baseUrl) resolvedBase = backendGateway.baseUrl; } catch {}
      setGatewayConfig({ baseUrl: normalizeGatewayBase(resolvedBase) });
    } catch { setGatewayConfig({ baseUrl: DEFAULT_IPFS_GATEWAY }); setGatewayStatus("error"); setGatewayStatusMessage("Failed to load gateway settings"); } finally { setLoadingGateway(false); }
  };

  const handleGatewayChange = (value: string) => { setGatewayConfig({ baseUrl: value }); setGatewayStatus("idle"); setGatewayStatusMessage(null); };
  const handleGatewayReset = () => { setGatewayConfig({ baseUrl: DEFAULT_IPFS_GATEWAY }); setGatewayStatus("idle"); setGatewayStatusMessage(null); };

  const checkGatewayConnectivity = async () => {
    const normalizedBase = normalizeGatewayBase(gatewayConfig.baseUrl);
    setGatewayConfig({ baseUrl: normalizedBase }); setGatewayStatus("checking"); setGatewayStatusMessage(null);
    try {
      const response = await fetch(normalizedBase, { method: "HEAD" });
      const isReachable = response.ok || response.status < 500;
      setGatewayStatus(isReachable ? "ok" : "error");
      setGatewayStatusMessage(isReachable ? "Gateway reachable" : `Gateway responded with status ${response.status}`);
    } catch { setGatewayStatus("error"); setGatewayStatusMessage("Gateway unreachable"); }
  };

  const addEndpoint = () => {
    const newEndpoint: MultiplexerEndpoint = { base_url: "http://localhost:1234/v1", api_key: "", name: `endpoint-${(config.vlm_multiplexer_endpoints?.length || 0) + 1}`, weight: 1, max_concurrent: 5 };
    setConfig((prev) => ({ ...prev, vlm_multiplexer_endpoints: [...(prev.vlm_multiplexer_endpoints || []), newEndpoint] }));
  };

  const removeEndpoint = (index: number) => setConfig((prev) => ({ ...prev, vlm_multiplexer_endpoints: prev.vlm_multiplexer_endpoints?.filter((_, i) => i !== index) || null }));

  const updateEndpoint = (index: number, field: keyof MultiplexerEndpoint, value: string | number) => {
    setConfig((prev) => {
      const endpoints = prev.vlm_multiplexer_endpoints ? [...prev.vlm_multiplexer_endpoints] : [];
      if (endpoints[index]) endpoints[index][field] = value as never;
      return { ...prev, vlm_multiplexer_endpoints: endpoints as MultiplexerEndpoint[] };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true); setError(null); setFilecoinError(null); setArkivError(null); setRestoreSummary(null);
      if (isPlaybackTab) {
        const normalizedBase = normalizeGatewayBase(gatewayConfig.baseUrl);
        const savedGateway: IpfsGatewayConfig = await ipcRenderer.invoke("playback:set-gateway-config", { baseUrl: normalizedBase });
        setGatewayConfig({ baseUrl: normalizeGatewayBase(savedGateway.baseUrl) });
        try { await gatewayService.update({ baseUrl: normalizedBase }); } catch { setGatewayStatus("error"); setGatewayStatusMessage("Saved locally but backend sync failed"); return; }
        setGatewayStatus("ok"); setGatewayStatusMessage("Gateway saved");
      } else if (isFilecoinTab) {
        if (!filecoinConfig.privateKey.trim()) { setFilecoinError("Private key is required"); return; }
        setCheckingBalance(true); setBalanceError(null); setBalanceInfo(null);
        try {
          let rpcUrl = filecoinConfig.rpcUrl || "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1";
          if (rpcUrl.startsWith("wss://")) rpcUrl = rpcUrl.replace("wss://", "https://");
          else if (rpcUrl.startsWith("ws://")) rpcUrl = rpcUrl.replace("ws://", "http://");
          const balance = await evmService.checkBalance(rpcUrl);
          setBalanceInfo(balance);
          if (!balance.has_sufficient_balance) setFilecoinError(`⚠️ Low gas balance: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}. Send ${balance.native_token_symbol} to ${balance.wallet_address} for gas fees.`);
        } catch (err) { setBalanceError(err instanceof Error ? err.message : "Failed to check balance"); } finally { setCheckingBalance(false); }
        await ipcRenderer.invoke("save-filecoin-config", { privateKey: filecoinConfig.privateKey, rpcUrl: filecoinConfig.rpcUrl, dataSetId: filecoinConfig.dataSetId, encryptionEnabled: filecoinConfig.encryptionEnabled ?? false });
        await onSaveFilecoin(filecoinConfig);
      } else if (isArkivTab) {
        if (arkivConfig.syncEnabled) {
          setCheckingBalance(true); setBalanceError(null); setBalanceInfo(null);
          try {
            const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc";
            const balance = await evmService.checkBalance(rpcUrl);
            setBalanceInfo(balance);
            if (!balance.has_sufficient_balance) setArkivError(`⚠️ Low gas balance: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}. Send ${balance.native_token_symbol} to ${balance.wallet_address} for gas fees.`);
          } catch (err) { setBalanceError(err instanceof Error ? err.message : "Failed to check balance"); } finally { setCheckingBalance(false); }
        }
        await ipcRenderer.invoke("save-arkiv-config", { rpcUrl: arkivConfig.rpcUrl, syncEnabled: arkivConfig.syncEnabled, expirationWeeks: arkivConfig.expirationWeeks });
        await loadArkivConfig();
      } else { await onSave(config); }
      if (!filecoinError && !arkivError && !error) onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      if (isFilecoinTab) setFilecoinError(message);
      else if (isArkivTab) setArkivError(message);
      else setError(message);
    } finally { setSaving(false); }
  };

  const handleRestoreFromArkiv = async () => {
    try {
      setRestoring(true); setArkivError(null); setRestoreSummary(null); setRestoreProgress("Fetching entities from Arkiv...");
      setRestoreProgress("Restoring catalog from Arkiv...");
      const result = await restoreService.restoreFromArkiv();
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
                const decryptedCid = await ipcRenderer.invoke('decrypt-text-with-lit', { ciphertext: video.encrypted_filecoin_cid, metadataJson: video.cid_encryption_metadata });
                await restoreService.decryptVideoCid(video.path, decryptedCid);
                decryptedCount++;
              } catch {}
            }
            setRestoreProgress(null);
            setRestoreSummary(decryptedCount > 0 ? `Restored ${result.restored}, skipped ${result.skipped}. Decrypted ${decryptedCount} CID(s).` : `Restored ${result.restored}, skipped ${result.skipped}.`);
          } else {
            setRestoreProgress(null);
            setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}. ${videosNeedingDecryption.length} CID(s) need decryption (private key required).`);
          }
        } else { setRestoreProgress(null); setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}.`); }
      } catch { setRestoreProgress(null); setRestoreSummary(`Restored ${result.restored}, skipped ${result.skipped}. Warning: CID decryption failed.`); }
    } catch (err) { setRestoreProgress(null); setArkivError(err instanceof Error ? err.message : "Failed to restore from Arkiv"); } finally { setRestoring(false); }
  };

  const handleRestartBackend = async () => {
    try {
      setRestartingBackend(true); setArkivError(null); setBackendRestartMessage(null);
      const result = await ipcRenderer.invoke("restart-backend");
      setBackendRestartMessage(result.message || "Backend restarted successfully");
      await loadArkivConfig();
    } catch (err) { setArkivError(err instanceof Error ? err.message : "Failed to restart backend"); } finally { setRestartingBackend(false); }
  };

  const handleCheckBalance = async () => {
    try {
      setCheckingBalance(true); setBalanceError(null); setBalanceInfo(null);
      let rpcUrl = filecoinConfig.rpcUrl || "wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1";
      if (rpcUrl.startsWith("wss://")) rpcUrl = rpcUrl.replace("wss://", "https://");
      else if (rpcUrl.startsWith("ws://")) rpcUrl = rpcUrl.replace("ws://", "http://");
      const balance = await evmService.checkBalance(rpcUrl);
      setBalanceInfo(balance);
    } catch (err) { setBalanceError(err instanceof Error ? err.message : "Failed to check balance"); } finally { setCheckingBalance(false); }
  };

  const tagList = useMemo(() => config.analysis_tags.split(",").map((tag: string) => tag.trim()).filter((tag: string) => tag), [config.analysis_tags]);

  const renderAiContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Box sx={{ mt: 2 }}>
        <SectionHeader icon={<AIIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Analysis Tags" color={liquidGlassTokens.neon.amber} />
        <TextField fullWidth label="Analysis Tags (comma-separated)" value={config.analysis_tags} onChange={(e) => setConfig((prev) => ({ ...prev, analysis_tags: e.target.value }))} placeholder="person,car,bicycle,walking,running..." multiline rows={3} sx={glassInputStyles} />
        {tagList.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 2, fontSize: "12px", fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags Preview ({tagList.length} tags)</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, maxHeight: 120, overflow: "auto", p: 2, ...glassPanelStyles }}>
              {tagList.map((tag: string) => <Chip key={tag} label={tag} size="small" sx={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#fff', border: `1px solid ${liquidGlassTokens.glass.border}`, borderRadius: '16px', fontSize: '12px', fontWeight: 500 }} />)}
            </Box>
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      <Box>
        <SectionHeader icon={<BatchIcon sx={{ color: "#fff", fontSize: 16 }} />} title="VLM Processing Parameters" color={liquidGlassTokens.neon.magenta} />
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <TextField sx={{ flex: 1, minWidth: 200, ...glassInputStyles }} label="Frame Interval (seconds)" type="number" value={config.vlm_frame_interval} onChange={(e) => setConfig((prev) => ({ ...prev, vlm_frame_interval: parseFloat(e.target.value) || 2.0 }))} inputProps={{ step: 0.1, min: 0.1, max: 60.0 }} helperText="Seconds between frame samples" />
          <TextField sx={{ flex: 1, minWidth: 200, ...glassInputStyles }} label="Confidence Threshold" type="number" value={config.vlm_threshold} onChange={(e) => setConfig((prev) => ({ ...prev, vlm_threshold: parseFloat(e.target.value) || 0.5 }))} inputProps={{ step: 0.01, min: 0.0, max: 1.0 }} helperText="Min confidence for tag detection" />
          <FormControl sx={{ flex: 1, minWidth: 150, ...glassInputStyles }}>
            <InputLabel sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>VLM Settings</InputLabel>
            <Select multiple value={[...[config.vlm_return_timestamps ? "Timestamps" : ""], ...[config.vlm_return_confidence ? "Confidence" : ""]].filter(Boolean)} label="VLM Settings" onChange={(e: SelectChangeEvent<string[]>) => { const values = e.target.value; setConfig((prev: EditableAppConfig) => ({ ...prev, vlm_return_timestamps: values.includes("Timestamps"), vlm_return_confidence: values.includes("Confidence") })); }} renderValue={(selected: string[]) => selected.join(", ")} sx={{ '& .MuiSelect-select': { color: 'rgba(255, 255, 255, 0.9)' } }}>
              <MenuItem value="Timestamps">Include Timestamps</MenuItem>
              <MenuItem value="Confidence">Include Confidence</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <SectionHeader icon={<BatchIcon sx={{ color: "#fff", fontSize: 16 }} />} title="LLM Multiplexer" color={liquidGlassTokens.neon.cyan} />
          <FormControlLabel control={<Switch checked={config.vlm_multiplexer_enabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EditableAppConfig) => ({ ...prev, vlm_multiplexer_enabled: e.target.checked }))} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: liquidGlassTokens.neon.cyan }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: `${liquidGlassTokens.neon.cyan}60` } }} />} label={<Typography sx={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>Enable multiplexer</Typography>} />
        </Box>
        {config.vlm_multiplexer_enabled && (
          <>
            <Alert severity="info" sx={{ mb: 3, backgroundColor: `${liquidGlassTokens.neon.cyan}10`, border: `1px solid ${liquidGlassTokens.neon.cyan}30`, color: liquidGlassTokens.neon.cyan, '& .MuiAlert-icon': { color: liquidGlassTokens.neon.cyan } }}>Multiplexer distributes requests across multiple LLM endpoints for load balancing and fault tolerance.</Alert>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {config.vlm_multiplexer_endpoints?.map((endpoint, index) => (
                <Box key={index} sx={{ p: 2, ...glassPanelStyles }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#fff' }}>Endpoint {index + 1}: {endpoint.name}</Typography>
                    <IconButton size="small" onClick={() => removeEndpoint(index)} sx={{ color: liquidGlassTokens.neon.error }}><CancelIcon /></IconButton>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Name" value={endpoint.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEndpoint(index, "name", e.target.value)} size="small" sx={glassInputStyles} /></Grid>
                    <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Base URL" value={endpoint.base_url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEndpoint(index, "base_url", e.target.value)} size="small" sx={glassInputStyles} /></Grid>
                    <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="API Key" value={endpoint.api_key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEndpoint(index, "api_key", e.target.value)} size="small" sx={glassInputStyles} /></Grid>
                    <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="number" label="Weight" value={endpoint.weight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEndpoint(index, "weight", parseFloat(e.target.value))} inputProps={{ min: 1 }} size="small" helperText="Higher = more traffic" sx={glassInputStyles} /></Grid>
                    <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth type="number" label="Max Concurrent" value={endpoint.max_concurrent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEndpoint(index, "max_concurrent", parseInt(e.target.value, 10))} inputProps={{ min: 1 }} size="small" sx={glassInputStyles} /></Grid>
                  </Grid>
                </Box>
              ))}
              <Button startIcon={<AddIcon />} onClick={addEndpoint} variant="outlined" sx={{ alignSelf: "flex-start", ...glassButtonStyles.secondary }}>Add Endpoint</Button>
            </Box>
            <Divider sx={{ borderColor: liquidGlassTokens.glass.border, my: 2 }} />
            <TextField fullWidth type="number" label="Global Max Concurrent Requests" value={config.vlm_max_concurrent_requests} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EditableAppConfig) => ({ ...prev, vlm_max_concurrent_requests: parseInt(e.target.value, 10) }))} inputProps={{ min: 1 }} helperText="Total concurrent requests across all endpoints" sx={glassInputStyles} />
          </>
        )}
      </Box>

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      <Box sx={{ opacity: config.vlm_multiplexer_enabled ? 0.5 : 1, pointerEvents: config.vlm_multiplexer_enabled ? "none" : "auto" }}>
        <SectionHeader icon={<PlaybackIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Language Model Configuration" color={liquidGlassTokens.neon.success} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>{config.vlm_multiplexer_enabled ? "Single endpoint settings are ignored when multiplexer is enabled" : "Configure a single LLM endpoint"}</Typography>
          <TextField fullWidth label="LLM Base URL" value={config.llm_base_url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EditableAppConfig) => ({ ...prev, llm_base_url: e.target.value }))} placeholder="http://localhost:1234/v1" sx={glassInputStyles} />
          <FormControl fullWidth sx={glassInputStyles}>
            <InputLabel sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Visual Language Model</InputLabel>
            <Select value={config.llm_model} label="Visual Language Model" onChange={(e: SelectChangeEvent<string>) => setConfig((prev: EditableAppConfig) => ({ ...prev, llm_model: e.target.value }))} sx={{ '& .MuiSelect-select': { color: 'rgba(255, 255, 255, 0.9)' } }}>
              {availableModels.map((model: string) => <MenuItem key={model} value={model}>{model}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Box>
    </Box>
  );

  const renderPlaybackContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<PlaybackIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Playback Preferences" color={liquidGlassTokens.neon.cyan} />
      <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>Haven Player prefers your local file when it exists. If it is missing, playback streams from the configured IPFS gateway.</Typography>
      <TextField fullWidth label="IPFS Gateway URL" value={gatewayConfig.baseUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleGatewayChange(e.target.value)} placeholder={DEFAULT_IPFS_GATEWAY} helperText="Used for remote playback. /ipfs/ is added automatically." sx={glassInputStyles} />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={checkGatewayConnectivity} disabled={gatewayStatus === "checking"} sx={glassButtonStyles.primary}>{gatewayStatus === "checking" ? "Checking..." : "Check gateway"}</Button>
        <Button variant="text" onClick={handleGatewayReset} sx={glassButtonStyles.secondary}>Reset to default</Button>
      </Box>
      {gatewayStatusMessage && <Alert severity={gatewayStatus === "ok" ? "success" : gatewayStatus === "error" ? "error" : "info"} sx={{ backgroundColor: gatewayStatus === "ok" ? `${liquidGlassTokens.neon.success}10` : gatewayStatus === "error" ? `${liquidGlassTokens.neon.error}10` : `${liquidGlassTokens.neon.cyan}10`, border: `1px solid ${gatewayStatus === "ok" ? liquidGlassTokens.neon.success : gatewayStatus === "error" ? liquidGlassTokens.neon.error : liquidGlassTokens.neon.cyan}30`, color: gatewayStatus === "ok" ? liquidGlassTokens.neon.success : gatewayStatus === "error" ? liquidGlassTokens.neon.error : liquidGlassTokens.neon.cyan }}>{gatewayStatusMessage}</Alert>}
    </Box>
  );

  const renderProcessingContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<BatchIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Processing Configuration" color={liquidGlassTokens.neon.magenta} />
      <TextField fullWidth label="Max Batch Size" type="number" value={config.max_batch_size} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EditableAppConfig) => ({ ...prev, max_batch_size: parseInt(e.target.value, 10) || 1 }))} inputProps={{ min: 1, max: 10 }} helperText="Number of videos to process simultaneously (1-10)" sx={glassInputStyles} />
      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />
      <SectionHeader icon={<CloudUploadIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Download Directory" color={liquidGlassTokens.neon.cyan} />
      <TextField fullWidth label="Global Download Directory" value={config.download_directory} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev: EditableAppConfig) => ({ ...prev, download_directory: e.target.value }))} placeholder="downloads" helperText="The default directory for all plugin downloads" sx={glassInputStyles} />
    </Box>
  );

  const renderFilecoinContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<CloudUploadIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Filecoin Configuration" color={liquidGlassTokens.neon.cyan} />
      <TextField fullWidth label="Private Key" value={filecoinConfig.privateKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setFilecoinConfig((prev: FilecoinConfig) => ({ ...prev, privateKey: e.target.value })); setBalanceInfo(null); setBalanceError(null); }} placeholder="Enter your private key from MetaMask" type="password" required helperText="Your Ethereum private key (0x prefix will be added automatically if missing)" sx={glassInputStyles} />
      <TextField fullWidth label="RPC URL (optional)" value={filecoinConfig.rpcUrl ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setFilecoinConfig((prev: FilecoinConfig) => ({ ...prev, rpcUrl: e.target.value })); setBalanceInfo(null); setBalanceError(null); }} placeholder="wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1" helperText="Filecoin RPC endpoint. Default: Calibration testnet WebSocket" sx={glassInputStyles} />
      <TextField fullWidth label="Data Set ID (optional)" type="number" value={filecoinConfig.dataSetId ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilecoinConfig((prev: FilecoinConfig) => ({ ...prev, dataSetId: e.target.value ? parseInt(e.target.value, 10) : undefined }))} placeholder="Leave empty to create new" helperText="Use existing data set ID or leave empty to create a new one" sx={glassInputStyles} />
      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>Gas Balance Check</Typography>
        <Button variant="outlined" onClick={handleCheckBalance} disabled={checkingBalance} startIcon={checkingBalance ? <CircularProgress size={16} /> : <RefreshIcon />} sx={{ alignSelf: "flex-start", ...glassButtonStyles.primary }}>{checkingBalance ? "Checking..." : "Check Gas Balance"}</Button>
        {balanceInfo && (
          <Alert severity={balanceInfo.has_sufficient_balance ? "success" : "warning"} sx={{ backgroundColor: balanceInfo.has_sufficient_balance ? `${liquidGlassTokens.neon.success}10` : `${liquidGlassTokens.neon.amber}10`, border: `1px solid ${balanceInfo.has_sufficient_balance ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.amber}30`, color: balanceInfo.has_sufficient_balance ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.amber }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}><Typography variant="body2" sx={{ fontWeight: 500 }}>Wallet: {balanceInfo.wallet_address}</Typography><IconButton size="small" onClick={() => navigator.clipboard.writeText(balanceInfo.wallet_address)} sx={{ padding: 0.5, color: 'inherit' }}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton></Box>
            <Typography variant="body2">Chain: {balanceInfo.chain_name}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>Balance: {balanceInfo.balance_ether.toFixed(6)} {balanceInfo.native_token_symbol}</Typography>
            {!balanceInfo.has_sufficient_balance && <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>⚠️ Low balance! Please send {balanceInfo.native_token_symbol} to this address for gas fees.</Typography>}
          </Alert>
        )}
        {balanceError && <Alert severity="error" sx={{ backgroundColor: `${liquidGlassTokens.neon.error}10`, border: `1px solid ${liquidGlassTokens.neon.error}30`, color: liquidGlassTokens.neon.error }}>{balanceError}</Alert>}
      </Box>
      <Alert severity="info" sx={{ backgroundColor: `${liquidGlassTokens.neon.cyan}10`, border: `1px solid ${liquidGlassTokens.neon.cyan}30`, color: liquidGlassTokens.neon.cyan }}><Typography sx={{ fontSize: "12px" }}><strong>Note:</strong> This uses Filecoin Calibration testnet. Private keys are encrypted and stored securely on your device.</Typography></Alert>
      {filecoinError && <Alert severity="error" sx={{ backgroundColor: `${liquidGlassTokens.neon.error}10`, border: `1px solid ${liquidGlassTokens.neon.error}30`, color: liquidGlassTokens.neon.error }}>{filecoinError}</Alert>}
    </Box>
  );

  const renderEncryptionContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<LockIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Encryption" color={liquidGlassTokens.neon.magenta} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, backgroundColor: filecoinConfig.encryptionEnabled ? `${liquidGlassTokens.neon.success}10` : 'rgba(255, 255, 255, 0.03)', borderRadius: liquidGlassTokens.radius.md, border: `1px solid ${filecoinConfig.encryptionEnabled ? liquidGlassTokens.neon.success : liquidGlassTokens.glass.border}`, transition: "all 0.2s ease-in-out" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <LockIcon sx={{ color: filecoinConfig.encryptionEnabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)', fontSize: 20 }} />
          <FormControlLabel control={<Switch checked={filecoinConfig.encryptionEnabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilecoinConfig((prev: FilecoinConfig) => ({ ...prev, encryptionEnabled: e.target.checked }))} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: liquidGlassTokens.neon.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: `${liquidGlassTokens.neon.success}60` } }} />} label={<Typography sx={{ fontWeight: 500, fontSize: "14px", color: "#fff" }}>Encrypt videos before upload</Typography>} sx={{ margin: 0 }} />
        </Box>
        <Typography sx={{ fontSize: "12px", color: 'rgba(255, 255, 255, 0.5)', ml: 4.5 }}>{filecoinConfig.encryptionEnabled ? "Videos will be encrypted with Lit Protocol before uploading. Only your wallet can decrypt them." : "Videos will be uploaded without encryption."}</Typography>
        <FormHelperText sx={{ ml: 4.5, mt: 1, color: 'rgba(255, 255, 255, 0.4)' }}>Encryption preferences are stored locally in the Filecoin settings.</FormHelperText>
      </Box>
    </Box>
  );

  const renderArkivContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<ArkivIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Arkiv Configuration" color={liquidGlassTokens.neon.magenta} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, borderRadius: liquidGlassTokens.radius.md, backgroundColor: arkivConfig.syncEnabled ? `${liquidGlassTokens.neon.success}10` : 'rgba(255, 255, 255, 0.03)', border: `1px solid ${arkivConfig.syncEnabled ? liquidGlassTokens.neon.success : liquidGlassTokens.glass.border}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {arkivConfig.syncEnabled ? <CheckCircleIcon sx={{ color: liquidGlassTokens.neon.success, fontSize: 24 }} /> : <CancelIcon sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 24 }} />}
          <Box>
            <Typography sx={{ fontWeight: 500, fontSize: "14px", color: "#fff", mb: 0.5 }}>Sync videos to Arkiv blockchain</Typography>
            <Typography sx={{ fontSize: "12px", color: 'rgba(255, 255, 255, 0.5)' }}>{arkivConfig.syncEnabled ? "Videos with sharing enabled will be synced to Arkiv" : "Arkiv sync is disabled"}</Typography>
          </Box>
        </Box>
        <FormControlLabel control={<Switch checked={arkivConfig.syncEnabled} onChange={async (e: React.ChangeEvent<HTMLInputElement>) => { const newSyncEnabled = e.target.checked; setArkivConfig((prev: ArkivConfig) => ({ ...prev, syncEnabled: newSyncEnabled })); if (newSyncEnabled) { setCheckingBalance(true); setBalanceError(null); setBalanceInfo(null); try { const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc"; const balance = await evmService.checkBalance(rpcUrl); setBalanceInfo(balance); if (!balance.has_sufficient_balance) setArkivError(`⚠️ Low gas balance: ${balance.balance_ether.toFixed(6)} ${balance.native_token_symbol}.`); else setArkivError(null); } catch (err) { setBalanceError(err instanceof Error ? err.message : "Failed to check balance"); } finally { setCheckingBalance(false); } } else { setBalanceInfo(null); setBalanceError(null); setArkivError(null); } }} disabled={!arkivConfig.enabled} color="success" />} label="" />
      </Box>
      {!arkivConfig.enabled && <Alert severity="warning" sx={{ backgroundColor: `${liquidGlassTokens.neon.amber}10`, border: `1px solid ${liquidGlassTokens.neon.amber}30`, color: liquidGlassTokens.neon.amber }}><Typography sx={{ fontSize: "12px" }}><strong>Private key required:</strong> Configure a private key in the Filecoin settings tab to enable Arkiv sync.</Typography></Alert>}
      <TextField fullWidth label="Arkiv RPC URL" value={arkivConfig.rpcUrl ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setArkivConfig((prev: ArkivConfig) => ({ ...prev, rpcUrl: e.target.value })); setBalanceInfo(null); setBalanceError(null); }} placeholder="https://mendoza.hoodi.arkiv.network/rpc" helperText="Ethereum RPC endpoint for Arkiv blockchain" disabled={!arkivConfig.syncEnabled} sx={glassInputStyles} />
      <TextField fullWidth label="Video Expiration (weeks)" type="number" value={arkivConfig.expirationWeeks ?? 4} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const weeks = parseInt(e.target.value, 10); setArkivConfig((prev: ArkivConfig) => ({ ...prev, expirationWeeks: isNaN(weeks) || weeks < 1 ? 1 : weeks })); }} inputProps={{ min: 1, max: 520 }} helperText="How long videos can be restored from Arkiv. Default: 4 weeks" disabled={!arkivConfig.syncEnabled} sx={glassInputStyles} />
      {arkivConfig.enabled && (
        <>
          <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>Gas Balance Check</Typography>
            <Button variant="outlined" onClick={async () => { try { setCheckingBalance(true); setBalanceError(null); setBalanceInfo(null); const rpcUrl = arkivConfig.rpcUrl || "https://mendoza.hoodi.arkiv.network/rpc"; const balance = await evmService.checkBalance(rpcUrl); setBalanceInfo(balance); } catch (err) { setBalanceError(err instanceof Error ? err.message : "Failed to check balance"); } finally { setCheckingBalance(false); } }} disabled={checkingBalance || !arkivConfig.enabled} startIcon={checkingBalance ? <CircularProgress size={16} /> : <RefreshIcon />} sx={{ alignSelf: "flex-start", ...glassButtonStyles.primary }}>{checkingBalance ? "Checking..." : "Check Gas Balance"}</Button>
            {balanceInfo && <Alert severity={balanceInfo.has_sufficient_balance ? "success" : "warning"} sx={{ backgroundColor: balanceInfo.has_sufficient_balance ? `${liquidGlassTokens.neon.success}10` : `${liquidGlassTokens.neon.amber}10`, border: `1px solid ${balanceInfo.has_sufficient_balance ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.amber}30`, color: balanceInfo.has_sufficient_balance ? liquidGlassTokens.neon.success : liquidGlassTokens.neon.amber }}><Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}><Typography variant="body2" sx={{ fontWeight: 500 }}>Wallet: {balanceInfo.wallet_address}</Typography><IconButton size="small" onClick={() => navigator.clipboard.writeText(balanceInfo.wallet_address)} sx={{ padding: 0.5, color: 'inherit' }}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton></Box><Typography variant="body2">Chain: {balanceInfo.chain_name}</Typography><Typography variant="body2" sx={{ fontWeight: 500, mt: 0.5 }}>Balance: {balanceInfo.balance_ether.toFixed(6)} {balanceInfo.native_token_symbol}</Typography>{!balanceInfo.has_sufficient_balance && <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>⚠️ Low balance! Please send {balanceInfo.native_token_symbol} to this address for gas fees.</Typography>}</Alert>}
            {balanceError && <Alert severity="error" sx={{ backgroundColor: `${liquidGlassTokens.neon.error}10`, border: `1px solid ${liquidGlassTokens.neon.error}30`, color: liquidGlassTokens.neon.error }}>{balanceError}</Alert>}
          </Box>
        </>
      )}
      <Alert severity="info" sx={{ backgroundColor: `${liquidGlassTokens.neon.cyan}10`, border: `1px solid ${liquidGlassTokens.neon.cyan}30`, color: liquidGlassTokens.neon.cyan }}><Typography sx={{ fontSize: "12px" }}><strong>Note:</strong> Arkiv uses the same private key as Filecoin. Enable sharing for individual videos via the context menu.</Typography></Alert>
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 2, mt: 2 }}>
        <Button variant="outlined" disabled={restoring || !arkivConfig.enabled} onClick={handleRestoreFromArkiv} startIcon={restoring ? <CircularProgress size={16} /> : undefined} sx={{ ...glassButtonStyles.primary, borderColor: arkivConfig.enabled ? liquidGlassTokens.neon.success : liquidGlassTokens.glass.border, color: arkivConfig.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)' }}>{restoring ? (restoreProgress || "Restoring...") : "Restore Catalog from Arkiv"}</Button>
        {restoreSummary && <Typography variant="body2" sx={{ color: liquidGlassTokens.neon.success }}>{restoreSummary}</Typography>}
      </Box>
      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)' }}>Backend Configuration</Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: "12px" }}>After changing settings, restart the backend for changes to take effect.</Typography>
        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Button variant="contained" disabled={restartingBackend} onClick={handleRestartBackend} startIcon={restartingBackend ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />} sx={{ background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.magenta}30 100%)`, border: `1px solid ${liquidGlassTokens.neon.cyan}50`, color: '#fff', '&:hover': { background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}40 0%, ${liquidGlassTokens.neon.magenta}40 100%)`, boxShadow: glowEffects.cyan(0.3) } }}>{restartingBackend ? "Restarting..." : "Restart Backend"}</Button>
          {backendRestartMessage && <Typography variant="body2" sx={{ color: liquidGlassTokens.neon.success }}>{backendRestartMessage}</Typography>}
        </Box>
      </Box>
      {arkivError && <Alert severity="error" sx={{ mt: 2, backgroundColor: `${liquidGlassTokens.neon.error}10`, border: `1px solid ${liquidGlassTokens.neon.error}30`, color: liquidGlassTokens.neon.error }}>{arkivError}</Alert>}
    </Box>
  );

  const renderUploadWorkerContent = (): JSX.Element => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
      <SectionHeader icon={<UploadWorkerIcon sx={{ color: "#fff", fontSize: 16 }} />} title="Upload Worker Configuration" color={liquidGlassTokens.neon.cyan} />
      
      {/* Enable/Disable Upload Worker */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: liquidGlassTokens.radius.md, backgroundColor: uploadWorkerConfig.enabled ? `${liquidGlassTokens.neon.success}10` : 'rgba(255, 255, 255, 0.03)', border: `1px solid ${uploadWorkerConfig.enabled ? liquidGlassTokens.neon.success : liquidGlassTokens.glass.border}` }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <UploadWorkerIcon sx={{ color: uploadWorkerConfig.enabled ? liquidGlassTokens.neon.success : 'rgba(255, 255, 255, 0.4)', fontSize: 20 }} />
          <FormControlLabel control={<Switch checked={uploadWorkerConfig.enabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadWorkerConfig((prev) => ({ ...prev, enabled: e.target.checked }))} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: liquidGlassTokens.neon.success }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: `${liquidGlassTokens.neon.success}60` } }} />} label={<Typography sx={{ fontWeight: 500, fontSize: "14px", color: "#fff" }}>Enable Upload Worker</Typography>} sx={{ margin: 0 }} />
        </Box>
        <Typography sx={{ fontSize: "12px", color: 'rgba(255, 255, 255, 0.5)', ml: 4.5 }}>{uploadWorkerConfig.enabled ? "Upload worker will automatically process pending uploads" : "Upload worker is disabled"}</Typography>
      </Box>

      <Divider sx={{ borderColor: liquidGlassTokens.glass.border }} />

      {/* Poll Interval */}
      <TextField fullWidth label="Poll Interval (seconds)" type="number" value={uploadWorkerConfig.pollInterval / 1000} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const seconds = parseInt(e.target.value, 10); setUploadWorkerConfig((prev) => ({ ...prev, pollInterval: isNaN(seconds) || seconds < 5 ? 5000 : seconds * 1000 })); }} inputProps={{ min: 5, max: 300 }} helperText="How often to check for new uploads (5-300 seconds)" disabled={!uploadWorkerConfig.enabled} sx={glassInputStyles} />

      {/* Max Concurrent Uploads */}
      <TextField fullWidth label="Max Concurrent Uploads" type="number" value={uploadWorkerConfig.maxConcurrentUploads} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const count = parseInt(e.target.value, 10); setUploadWorkerConfig((prev) => ({ ...prev, maxConcurrentUploads: isNaN(count) || count < 1 ? 1 : count > 5 ? 5 : count })); }} inputProps={{ min: 1, max: 5 }} helperText="Maximum number of simultaneous uploads (1-5)" disabled={!uploadWorkerConfig.enabled} sx={glassInputStyles} />

      {/* Retry Attempts */}
      <TextField fullWidth label="Retry Attempts" type="number" value={uploadWorkerConfig.retryAttempts} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const attempts = parseInt(e.target.value, 10); setUploadWorkerConfig((prev) => ({ ...prev, retryAttempts: isNaN(attempts) || attempts < 0 ? 0 : attempts > 10 ? 10 : attempts })); }} inputProps={{ min: 0, max: 10 }} helperText="Number of retry attempts for failed uploads (0-10)" disabled={!uploadWorkerConfig.enabled} sx={glassInputStyles} />

      <Alert severity="info" sx={{ backgroundColor: `${liquidGlassTokens.neon.cyan}10`, border: `1px solid ${liquidGlassTokens.neon.cyan}30`, color: liquidGlassTokens.neon.cyan }}><Typography sx={{ fontSize: "12px" }}><strong>Note:</strong> Upload worker requires Filecoin configuration. Configure your private key in the Filecoin tab.</Typography></Alert>
    </Box>
  );

  const renderContent = (): JSX.Element | null => {
    switch (activeTab) {
      case "ai": return renderAiContent();
      case "playback": return renderPlaybackContent();
      case "processing": return renderProcessingContent();
      case "filecoin": return renderFilecoinContent();
      case "encryption": return renderEncryptionContent();
      case "arkiv": return renderArkivContent();
      case "upload-worker": return renderUploadWorkerContent();
      default: return null;
    }
  };

  const saveLabel = isPlaybackTab ? "Save Playback Settings" : isFilecoinTab ? "Save Filecoin Settings" : isArkivTab ? "Save Arkiv Settings" : isUploadWorkerTab ? "Save Upload Worker Settings" : "Save Configuration";

  // Get current tab label for breadcrumb
  const getCurrentTabLabel = (): string => {
    switch (activeTab) {
      case "ai": return "AI / LLM";
      case "playback": return "Playback";
      case "processing": return "Processing";
      case "filecoin": return "Filecoin";
      case "encryption": return "Encryption";
      case "arkiv": return "Arkiv";
      case "upload-worker": return "Upload Worker";
      default: return "Settings";
    }
  };

  return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { backgroundColor: liquidGlassTokens.canvas.base, color: "#fff", overflow: "hidden", border: glassPanelStyles.border, borderRadius: glassPanelStyles.borderRadius, boxShadow: glassPanelStyles.boxShadow } }} BackdropProps={{ sx: { backgroundColor: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(12px)" } }}>
      <DialogTitle sx={{ display: "flex", flexDirection: "column", gap: 1.5, pb: 2, px: 3, pt: 2.5, backgroundColor: liquidGlassTokens.canvas.elevated, borderBottom: `1px solid ${liquidGlassTokens.glass.border}` }}>
        {/* Breadcrumb Navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Breadcrumbs
            separator={<NavigateNextIcon sx={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.3)' }} />}
            sx={{
              '& .MuiBreadcrumbs-ol': {
                alignItems: 'center',
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.8rem',
              }}
            >
              <SettingsIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ color: 'inherit' }}>
                Settings
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: liquidGlassTokens.neon.cyan,
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              {getCurrentTabLabel()}
            </Typography>
          </Breadcrumbs>
          <IconButton onClick={onClose} sx={{ color: 'rgba(255, 255, 255, 0.6)', '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.08)' } }}><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 3, backgroundColor: liquidGlassTokens.canvas.base }}>
        {(error || filecoinError || arkivError) && <Alert severity="error" sx={{ backgroundColor: `${liquidGlassTokens.neon.error}10`, color: liquidGlassTokens.neon.error, border: `1px solid ${liquidGlassTokens.neon.error}30`, borderRadius: liquidGlassTokens.radius.md, mb: 2 }}>{error || filecoinError || arkivError}</Alert>}

        <Tabs value={activeTab} onChange={(_e: SyntheticEvent, value: SettingsTab) => onTabChange(value)} variant="scrollable" scrollButtons="auto" sx={{ '& .MuiTab-root': { color: 'rgba(255, 255, 255, 0.5)', textTransform: 'none', minHeight: 48, '&.Mui-selected': { color: liquidGlassTokens.neon.cyan } }, '& .MuiTabs-indicator': { backgroundColor: liquidGlassTokens.neon.cyan, height: 2, boxShadow: `0 0 8px ${liquidGlassTokens.neon.cyan}60` } }}>
          <Tab label="AI / LLM" value="ai" icon={<AIIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Processing" value="processing" icon={<BatchIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Playback" value="playback" icon={<PlaybackIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Filecoin" value="filecoin" icon={<CloudUploadIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Encryption" value="encryption" icon={<LockIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Arkiv" value="arkiv" icon={<ArkivIcon fontSize="small" />} iconPosition="start" />
          <Tab label="Upload Worker" value="upload-worker" icon={<UploadWorkerIcon fontSize="small" />} iconPosition="start" />
        </Tabs>

        {loading ? <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress sx={{ color: liquidGlassTokens.neon.cyan }} /></Box> : <Box sx={{ mt: 3 }}>{renderContent()}</Box>}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 2, backgroundColor: liquidGlassTokens.canvas.elevated, borderTop: `1px solid ${liquidGlassTokens.glass.border}`, gap: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={glassButtonStyles.secondary}>Cancel</Button>
        <Button onClick={handleSave} disabled={loading || saving || (isFilecoinTab && !filecoinConfig.privateKey.trim())} variant="contained" startIcon={saving ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <SaveIcon />} sx={{ background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}30 0%, ${liquidGlassTokens.neon.magenta}30 100%)`, border: `1px solid ${liquidGlassTokens.neon.cyan}50`, color: '#fff', px: 4, '&:hover': { background: `linear-gradient(135deg, ${liquidGlassTokens.neon.cyan}40 0%, ${liquidGlassTokens.neon.magenta}40 100%)`, boxShadow: glowEffects.cyan(0.3) }, '&:disabled': { background: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.3)' } }}>{saving ? "Saving..." : saveLabel}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationModal;
