import type { StorageDriver } from "./driver";
import { getSharedDriver } from "./runtime";

export interface StorageDiagnosticEntry {
  key: string;
  bytes: number;
}

export interface StorageDiagnostics {
  totalKeys: number;
  totalBytes: number;
  byScope: Record<string, { keys: number; bytes: number }>;
  largest: StorageDiagnosticEntry[];
}

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

/** Collect key/size metadata only. Stored values are never returned. */
export async function collectStorageDiagnostics(
  driver: StorageDriver = getSharedDriver(),
  largestLimit = 10,
): Promise<StorageDiagnostics> {
  const entries = await driver.entries("");
  const byScope: StorageDiagnostics["byScope"] = {};
  const sizes: StorageDiagnosticEntry[] = [];
  let totalBytes = 0;

  for (const [key, value] of Object.entries(entries)) {
    const bytes = byteLength(key) + byteLength(value);
    const scope = key.includes(":") ? key.slice(0, key.indexOf(":")) : "legacy";
    const summary = byScope[scope] ?? { keys: 0, bytes: 0 };
    summary.keys += 1;
    summary.bytes += bytes;
    byScope[scope] = summary;
    totalBytes += bytes;
    sizes.push({ key, bytes });
  }

  sizes.sort((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key));
  return {
    totalKeys: sizes.length,
    totalBytes,
    byScope,
    largest: sizes.slice(0, Math.max(0, largestLimit)),
  };
}
