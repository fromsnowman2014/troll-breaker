import type { KvStore, StoredEntry } from "./types.js";

export class InMemoryKv implements KvStore {
  private readonly map = new Map<string, StoredEntry<unknown>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.map.get(key) as StoredEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expires_at !== undefined && entry.expires_at <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, opts?: { ttlMs?: number }): Promise<void> {
    const entry: StoredEntry<T> = { value };
    if (opts?.ttlMs !== undefined) {
      entry.expires_at = this.now() + opts.ttlMs;
    }
    this.map.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
