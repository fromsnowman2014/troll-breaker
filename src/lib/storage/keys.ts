export const StorageKeys = {
  vibe: (siteId: string) => `vibe:${siteId}` as const,
  vibeOverride: (siteId: string) => `vibe:overrides:${siteId}` as const,
  factMemo: (hash: string) => `fact_memo:${hash}` as const,
} as const;

export const TTL = {
  vibeStructured: 7 * 24 * 60 * 60 * 1000,
  factMemo: 24 * 60 * 60 * 1000,
} as const;
