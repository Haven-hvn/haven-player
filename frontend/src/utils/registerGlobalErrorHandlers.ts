/**
 * Registers global error/rejection handlers in the renderer to surface crashes
 * instead of silently killing the process.
 */
export function registerGlobalErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalError] Unhandled error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalError] Unhandled rejection', {
        reason: event.reason,
      });
    });
  }

  if (typeof process !== 'undefined' && process.on) {
    process.on('uncaughtException', (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalError] Uncaught exception', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    });

    process.on('unhandledRejection', (reason: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalError] Unhandled rejection (process)', { reason });
    });
  }
}

