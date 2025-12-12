let counter = 0;

export function createLocalId(prefix: string): string {
  counter += 1;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_:-]/g, "_");
  return `${safePrefix}_${Date.now()}_${counter}`;
}

