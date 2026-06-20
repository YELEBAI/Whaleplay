import type { PrefixedKV } from "./namespaces";

export async function loadArray<T>(namespace: PrefixedKV, key: string): Promise<T[]> {
  const result = await namespace.getArray<T>(key);
  if (result.ok) return result.value;
  if (result.status === "corrupt") throw new Error(`Stored JSON array is corrupt: ${key}`);
  throw new Error(`Unable to read stored JSON array ${key}: ${result.error}`);
}

export async function readOptional(namespace: PrefixedKV, key: string): Promise<string | null> {
  const result = await namespace.get(key);
  if (result.status === "found") return result.value;
  if (result.status === "missing") return null;
  throw new Error(`Unable to read ${key}: ${result.reason}`);
}
