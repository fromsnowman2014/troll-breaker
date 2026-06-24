import type { KvStore, StoredEntry } from "./types.js";

export class ChromeKvStore implements KvStore {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    const entry = result[key] as StoredEntry<T> | undefined;
    if (entry === undefined) return undefined;
    if (entry.expires_at !== undefined && entry.expires_at < Date.now()) {
      await chrome.storage.local.remove(key);
      return undefined;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, opts?: { ttlMs?: number }): Promise<void> {
    const entry: StoredEntry<T> = {
      value,
      ...(opts?.ttlMs !== undefined && { expires_at: Date.now() + opts.ttlMs }),
    };
    await chrome.storage.local.set({ [key]: entry });
  }

  async delete(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  }
}
