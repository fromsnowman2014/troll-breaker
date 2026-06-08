import { describe, it, expect } from "vitest";
import { MockLlm } from "@/lib/llm/mock.js";
import { InMemoryKv } from "@/lib/storage/memory.js";
import { getSiteVibe, rewriteInVibe, urlToSiteId } from "@/agents/vibe.js";
import { StorageKeys } from "@/lib/storage/keys.js";
import { fixtureVibe } from "./_fixtures.js";

describe("vibe agent", () => {
  it("normalizes url to site_id", () => {
    expect(urlToSiteId("https://www.example.com/foo/bar")).toBe("example.com");
    expect(urlToSiteId("https://example.com")).toBe("example.com");
    expect(urlToSiteId("not a url")).toBe("generic");
  });

  it("returns cached profile on hit", async () => {
    const storage = new InMemoryKv();
    await storage.set(StorageKeys.vibe("example.com"), fixtureVibe);
    const out = await getSiteVibe(
      { llm: new MockLlm(), storage },
      "https://example.com",
    );
    expect(out.site_id).toBe("example.com");
  });

  it("falls back to seed loader when cache miss", async () => {
    const storage = new InMemoryKv();
    const loadSeed = async (id: string) =>
      id === "example.com" ? fixtureVibe : undefined;
    const out = await getSiteVibe(
      { llm: new MockLlm(), storage, loadSeed },
      "https://example.com",
    );
    expect(out.display_name).toBe("Example Community");
    // and writes to cache
    expect(await storage.get(StorageKeys.vibe("example.com"))).toBeDefined();
  });

  it("falls back to generic when no seed", async () => {
    const out = await getSiteVibe(
      { llm: new MockLlm(), storage: new InMemoryKv() },
      "https://unknown-site.test",
    );
    expect(out.site_id).toBe("generic");
  });

  it("rewriteInVibe sends a single chat and returns trimmed text", async () => {
    const llm = new MockLlm();
    llm.enqueueText("  팩트는 이거임. 그저 웃지요.  ");
    const out = await rewriteInVibe(
      { llm, storage: new InMemoryKv() },
      "X is true.",
      fixtureVibe,
    );
    expect(out).toBe("팩트는 이거임. 그저 웃지요.");
    expect(llm.calls.length).toBe(1);
  });
});
