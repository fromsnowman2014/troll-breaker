import { VibeProfileSchema, type VibeProfile } from "../schemas/vibe.js";

/**
 * Detect a still-skeletal seed — bundled file that owner has not yet curated.
 * Per USER_ACTION_ITEMS.md §2, owner replaces every __TODO__ marker with real content.
 * UI / smoke runner should surface this so we don't ship empty corpora silently.
 */
export function isSkeleton(profile: VibeProfile): boolean {
  const fingerprint = JSON.stringify(profile);
  return fingerprint.includes("__TODO__");
}

/** A function that returns the raw JSON for a site_id (env-specific — fs in node, fetch in extension). */
export type RawSeedLoader = (siteId: string) => Promise<unknown | undefined>;

/**
 * Wrap a raw loader with schema validation. Returns undefined if no seed for the site,
 * throws if a seed exists but is malformed.
 */
export function makeSeedLoader(raw: RawSeedLoader): (siteId: string) => Promise<VibeProfile | undefined> {
  return async (siteId: string) => {
    const data = await raw(siteId);
    if (data === undefined) return undefined;
    const parsed = VibeProfileSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        `bundled seed for ${siteId} failed schema: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  };
}

export { nodeFsRawLoader } from "./node.js";
