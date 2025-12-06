import type { WebContents } from 'electron';

export interface RenderProcessGoneDetails {
  reason: string;
  exitCode: number;
}

export function registerRenderCrashLogger(webContents: WebContents): void {
  webContents.on('render-process-gone', (_event, details: RenderProcessGoneDetails) => {
    // eslint-disable-next-line no-console
    console.error('[Renderer] process gone', {
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  });
}

