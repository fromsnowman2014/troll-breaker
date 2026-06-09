import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSkeleton, makeSeedLoader, nodeFsRawLoader } from "@/lib/seeds/index.js";
import { fixtureVibe } from "./_fixtures.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SEEDS_DIR = resolve(REPO_ROOT, "extension/seeds");

describe("seed loader", () => {
  it("returns undefined for unknown site", async () => {
    const load = makeSeedLoader(nodeFsRawLoader(SEEDS_DIR));
    expect(await load("does-not-exist.test")).toBeUndefined();
  });

  it("loads and validates bundled site seeds (currently skeleton)", async () => {
    const load = makeSeedLoader(nodeFsRawLoader(SEEDS_DIR));
    for (const site of [
      "fmkorea.com",
      "dcinside.com",
      "theqoo.net",
      "ruliweb.com",
      "ilbe.com",
    ]) {
      const profile = await load(site);
      expect(profile, `seed ${site} should load`).toBeDefined();
      expect(profile!.site_id).toBe(site);
      // Skeletons should be flagged so UI/CI can warn.
      expect(isSkeleton(profile!)).toBe(true);
    }
  });

  it("isSkeleton returns false for a real profile", () => {
    expect(isSkeleton(fixtureVibe)).toBe(false);
  });

  it("throws on malformed JSON via injected raw loader", async () => {
    const load = makeSeedLoader(async () => ({ site_id: "bad" }));
    await expect(load("bad")).rejects.toThrow();
  });
});
