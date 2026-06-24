import type { RawSeedLoader } from "./index.js";

export function extensionRawLoader(): RawSeedLoader {
  return async (siteId: string) => {
    const url = chrome.runtime.getURL(`seeds/${siteId}.json`);
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return res.json();
  };
}
