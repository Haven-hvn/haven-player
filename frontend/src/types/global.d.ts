/// <reference types="webpack/module" />

declare global {
  interface NodeModule {
    hot?: {
      accept(path: string, callback: () => void): void;
      accept(callback: () => void): void;
      dispose(callback: () => void): void;
    };
  }
}

export {};
