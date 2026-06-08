import { describe, it, expect } from "vitest";
import { FactResultSchema } from "@/lib/schemas/fact.js";
import { VibeProfileSchema } from "@/lib/schemas/vibe.js";
import { fixtureVibe } from "./_fixtures.js";

describe("FactResultSchema invariants", () => {
  it("accepts unverified with empty sources", () => {
    const r = FactResultSchema.safeParse({
      claim: "c",
      verdict: "unverified",
      summary: "no sources",
      sources: [],
      confidence: 0,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-unverified verdict with empty sources", () => {
    const r = FactResultSchema.safeParse({
      claim: "c",
      verdict: "true",
      summary: "ok",
      sources: [],
      confidence: 0.9,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-HTTPS source URL", () => {
    const r = FactResultSchema.safeParse({
      claim: "c",
      verdict: "true",
      summary: "ok",
      sources: [
        { title: "t", url: "http://example.com", snippet: "s" },
      ],
      confidence: 0.9,
    });
    expect(r.success).toBe(false);
  });
});

describe("VibeProfileSchema invariants", () => {
  it("accepts a valid fixture", () => {
    expect(VibeProfileSchema.safeParse(fixtureVibe).success).toBe(true);
  });

  it("rejects fewer than 2 few_shot_posts", () => {
    const bad = { ...fixtureVibe, few_shot_posts: [fixtureVibe.few_shot_posts[0]] };
    expect(VibeProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad site_id", () => {
    const bad = { ...fixtureVibe, site_id: "Bad Site ID!" };
    expect(VibeProfileSchema.safeParse(bad).success).toBe(false);
  });
});
