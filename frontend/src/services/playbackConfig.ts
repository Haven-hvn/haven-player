import { ipcRenderer } from "electron";
import type { IpfsGatewayConfig } from "@/types/playback";
import {
  DEFAULT_IPFS_GATEWAY,
  normalizeGatewayBase,
} from "@/services/playbackResolver";
import { gatewayService } from "@/services/api";

export const loadGatewayConfig = async (): Promise<IpfsGatewayConfig> => {
  let baseUrl: string = DEFAULT_IPFS_GATEWAY;

  try {
    const savedGateway: IpfsGatewayConfig | null = await ipcRenderer.invoke(
      "playback:get-gateway-config"
    );
    if (savedGateway?.baseUrl) {
      baseUrl = savedGateway.baseUrl;
    }
  } catch (error) {
    console.error("Failed to load gateway config from IPC:", error);
  }

  try {
    const backendGateway = await gatewayService.get();
    if (backendGateway?.baseUrl) {
      baseUrl = backendGateway.baseUrl;
    }
  } catch (error) {
    console.error("Failed to load gateway config from backend:", error);
  }

  return { baseUrl: normalizeGatewayBase(baseUrl) };
};

export const saveGatewayConfig = async (
  config: IpfsGatewayConfig
): Promise<IpfsGatewayConfig> => {
  const normalizedBase = normalizeGatewayBase(config.baseUrl || DEFAULT_IPFS_GATEWAY);
  const ipcSaved: IpfsGatewayConfig = await ipcRenderer.invoke(
    "playback:set-gateway-config",
    { baseUrl: normalizedBase }
  );
  const baseUrl = normalizeGatewayBase(ipcSaved?.baseUrl || normalizedBase);

  await gatewayService.update({ baseUrl });
  return { baseUrl };
};

export const fileExistsViaIpc = async (filePath: string): Promise<boolean> => {
  try {
    return await ipcRenderer.invoke("playback:file-exists", filePath);
  } catch (error) {
    console.error("Failed to check file existence via IPC:", error);
    return false;
  }
};

