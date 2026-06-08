export interface KvStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface StoredEntry<T> {
  value: T;
  expires_at?: number;
}
