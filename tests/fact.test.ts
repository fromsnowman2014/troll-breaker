import { describe, it, expect } from "vitest";
import { MockLlm, emitToolCall } from "@/lib/llm/mock.js";
import { MockSearch } from "@/lib/search/mock.js";
import { InMemoryKv } from "@/lib/storage/memory.js";
import { verifyFactWithLinks } from "@/agents/fact.js";
import { fixtureSources } from "./_fixtures.js";

describe("fact agent", () => {
  it("returns a verdict grounded in candidate sources", async () => {
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        claim: "Example is widely used.",
        verdict: "true",
        summary: "Confirmed.",
        sources: [fixtureSources[0]],
        confidence: 0.9,
        needs_followup: [],
      }),
    );

    const search = new MockSearch(fixtureSources);
    const storage = new InMemoryKv();

    const out = await verifyFactWithLinks(
      { llm, search, storage },
      { claim: "Example is widely used." },
    );

    expect(out.verdict).toBe("true");
    expect(out.sources.length).toBeGreaterThanOrEqual(1);
    expect(out.sources[0]?.url.startsWith("https://")).toBe(true);
    expect(search.calls.length).toBe(1);
  });

  it("downgrades to unverified when LLM emits no sources", async () => {
    const llm = new MockLlm();
    // Both the initial call and the retry need responders.
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        claim: "x",
        verdict: "true",
        summary: "s",
        sources: [],
        confidence: 0.8,
      }),
    );
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        claim: "x",
        verdict: "unverified",
        summary: "s",
        sources: [],
        confidence: 0.2,
      }),
    );

    const out = await verifyFactWithLinks(
      { llm, search: new MockSearch([]), storage: new InMemoryKv() },
      { claim: "x" },
    );
    expect(out.verdict).toBe("unverified");
    expect(out.sources).toEqual([]);
  });

  it("uses memo cache on second call with same claim", async () => {
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        claim: "y",
        verdict: "unverified",
        summary: "s",
        sources: [],
        confidence: 0,
      }),
    );

    const deps = { llm, search: new MockSearch([]), storage: new InMemoryKv() };
    await verifyFactWithLinks(deps, { claim: "y" });
    await verifyFactWithLinks(deps, { claim: "y" });

    expect(llm.calls.length).toBe(1);
  });
});
