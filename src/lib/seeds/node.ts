import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RawSeedLoader } from "./index.js";

/**
 * Node-side raw loader. Reads JSON from `<seedsDir>/<site_id>.json`.
 * Returns undefined if the file doesn't exist (so getSiteVibe falls through to generic).
 *
 * For the browser extension, write a fetch-based loader against chrome.runtime.getURL.
 */
export function nodeFsRawLoader(seedsDir: string): RawSeedLoader {
  return async (siteId: string) => {
    const path = resolve(seedsDir, `${siteId}.json`);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return undefined;
      throw e;
    }
  };
}
