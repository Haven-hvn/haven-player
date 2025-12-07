declare module 'filecoin-pin/core';
declare module 'filecoin-pin/core/synapse';
declare module 'filecoin-pin/core/upload';
declare module 'filecoin-pin/core/unixfs' {
  export interface Logger {
    level?: string;
    info(msg: unknown, ...args: unknown[]): void;
    warn(msg: unknown, ...args: unknown[]): void;
    error(msg: unknown, ...args: unknown[]): void;
    debug(msg: unknown, ...args: unknown[]): void;
    fatal(msg: unknown, ...args: unknown[]): void;
    trace(msg: unknown, ...args: unknown[]): void;
    silent(msg: unknown, ...args: unknown[]): void;
    [key: string]: unknown;
  }

  export type Spinner = {
    start(msg: string): void;
    stop(msg: string): void;
    message(msg: string): void;
  };

  export interface CreateCarOptions {
    logger?: Logger;
    bare?: boolean;
    spinner?: Spinner;
    isDirectory?: boolean;
  }

  export interface CarBuildResult {
    carPath: string;
    rootCid: string;
    size?: number;
  }

  export interface FileBuilder {
    buildCar(sourcePath: string, options?: CreateCarOptions): Promise<CarBuildResult>;
    cleanup(carPath: string, logger?: Logger): Promise<void>;
  }

  export function createUnixfsCarBuilder(): FileBuilder;
}
declare module 'multiformats/cid';

declare module '@web3-storage/piece' {
  export interface PieceResult {
    pieceCid: { toString(): string };
    rootCid?: unknown;
    pieceSize?: number;
    payloadSize?: number;
  }

  export function pieceFromCAR(car: Blob | Uint8Array | AsyncIterable<Uint8Array>): Promise<PieceResult>;
}

declare module 'buffer' {
  export class Buffer extends Uint8Array {
    static from(data: ArrayBuffer | ArrayBufferView | string, encoding?: string): Buffer;
  }
}

declare module 'fs' {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  }

  export function statSync(path: string): Stats;
  export function readFileSync(path: string): Buffer;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function existsSync(path: string): boolean;
}

declare module 'fs/promises' {
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string | URL | Buffer): Promise<Uint8Array>;
  export function writeFile(
    path: string | URL | Buffer,
    data: string | ArrayBuffer | ArrayBufferView
  ): Promise<void>;
  export function rm(path: string | URL | Buffer, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}

declare module 'os' {
  export function tmpdir(): string;
}

declare module 'path' {
  export function join(...paths: string[]): string;
}

