import { describe, it, expect } from "vitest";
import { MockLlm, emitToolCall } from "@/lib/llm/mock.js";
import { MockSearch } from "@/lib/search/mock.js";
import { InMemoryKv } from "@/lib/storage/memory.js";
import {
  pickPipeline,
  runRefine,
  runShield,
  runSword,
} from "@/background/orchestrator.js";
import { StorageKeys } from "@/lib/storage/keys.js";
import { fixtureVibe, fixtureSources } from "./_fixtures.js";

function baseDeps(llm: MockLlm) {
  const storage = new InMemoryKv();
  return {
    llm,
    search: new MockSearch(fixtureSources),
    storage,
  };
}

async function seedVibe(deps: { storage: InMemoryKv }) {
  await deps.storage.set(StorageKeys.vibe("example.com"), fixtureVibe);
}

describe("pickPipeline", () => {
  it("returns fast for short text", () => {
    expect(pickPipeline("짧은 문장")).toBe("fast");
  });
  it("returns standard for long text", () => {
    expect(pickPipeline("a".repeat(600))).toBe("standard");
  });
});

describe("runShield", () => {
  it("fast pipeline skips logic and runs fact + rewrite", async () => {
    const llm = new MockLlm();
    // Fact emit (parallel with interpret)
    llm.enqueue((req) => {
      const isInterpret = req.system.includes("커뮤니티 언어 전문가");
      if (isInterpret) {
        return emitToolCall("emit_result", { plain_text: "해석된 글", glossary: [] });
      }
      return emitToolCall("emit_result", {
        claim: "주장 X",
        verdict: "partial",
        summary: "일부 사실",
        sources: [fixtureSources[0]],
        confidence: 0.6,
      });
    });
    llm.enqueue((req) => {
      const isInterpret = req.system.includes("커뮤니티 언어 전문가");
      if (isInterpret) {
        return emitToolCall("emit_result", { plain_text: "해석된 글", glossary: [] });
      }
      return emitToolCall("emit_result", {
        claim: "주장 X",
        verdict: "partial",
        summary: "일부 사실",
        sources: [fixtureSources[0]],
        confidence: 0.6,
      });
    });
    // Rewrite chat (plain text)
    llm.enqueueText("팩트는 이거임 ㅇㅇ");

    const deps = baseDeps(llm);
    await seedVibe(deps);

    const result = await runShield(deps, {
      request_id: "r1",
      selected_text: "주장 X",
      page_url: "https://example.com/post/1",
    });

    expect(result.pipeline).toBe("fast");
    expect(result.fact.verdict).toBe("partial");
    expect(result.fallacies).toEqual([]);
    expect(result.vibe_adjusted_summary).toBe("팩트는 이거임 ㅇㅇ");
    expect(result.vibe_used.site_id).toBe("example.com");
  });

  it("standard pipeline runs fact + logic + rewrite", async () => {
    const longClaim = "주장 X. " + "긴 본문 ".repeat(200);
    const llm = new MockLlm();
    // fact, logic, interpret run in parallel — accept any order
    const shieldResponder = (req: Parameters<typeof emitToolCall>[1] extends infer _U ? any : never) => {
      const toolName = req.tools?.[0]?.name ?? "emit_result";
      if (req.system.includes("커뮤니티 언어 전문가")) {
        return emitToolCall(toolName, { plain_text: "표준어로 해석", glossary: [] });
      }
      if (req.system.includes("fact-check")) {
        return emitToolCall(toolName, {
          claim: longClaim,
          verdict: "true",
          summary: "ok",
          sources: [fixtureSources[0]],
          confidence: 0.8,
        });
      }
      return emitToolCall(toolName, { fallacies: [] });
    };
    llm.enqueue(shieldResponder);
    llm.enqueue(shieldResponder);
    llm.enqueue(shieldResponder);
    llm.enqueueText("리라이트 결과");

    const deps = baseDeps(llm);
    await seedVibe(deps);

    const result = await runShield(deps, {
      request_id: "r2",
      selected_text: longClaim,
      page_url: "https://example.com",
    });

    expect(result.pipeline).toBe("standard");
    expect(result.fact.verdict).toBe("true");
    expect(result.vibe_adjusted_summary).toBe("리라이트 결과");
  });

  it("degrades to unverified when fact call throws", async () => {
    const llm = new MockLlm();
    // fact throws, interpret succeeds (parallel — either can run first)
    llm.enqueue((req: any) => {
      if (req.system.includes("커뮤니티 언어 전문가")) {
        return emitToolCall("emit_result", { plain_text: "해석", glossary: [] });
      }
      throw new Error("fact path down");
    });
    // Second parallel slot (interpret or fact retry)
    llm.enqueue((req: any) => {
      if (req.system.includes("커뮤니티 언어 전문가")) {
        return emitToolCall("emit_result", { plain_text: "해석", glossary: [] });
      }
      throw new Error("fact path down");
    });
    // structuredChat retries once on parse fail, but here we throw synchronously
    // — only one call is made before the error bubbles up. The orchestrator catches.
    // Then rewrite runs:
    llm.enqueueText("리라이트 결과 (unverified)");

    const deps = baseDeps(llm);
    await seedVibe(deps);

    const result = await runShield(deps, {
      request_id: "r3",
      selected_text: "주장",
      page_url: "https://example.com",
    });

    expect(result.fact.verdict).toBe("unverified");
    expect(result.fact.sources).toEqual([]);
    expect(result.vibe_adjusted_summary).toContain("unverified");
  });
});

describe("runSword", () => {
  it("fast pipeline uses evaluator's final_post as-is", async () => {
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        axes: {
          cynicism: { value: 7, rationale: "ok" },
          fact: { value: 6, rationale: "ok" },
          punchline: { value: 8, rationale: "ok" },
          vibe: { value: 7, rationale: "ok" },
        },
        line_critique: [],
        final_post: "평가자 최종글",
        needs_verification: [],
      }),
    );

    const deps = baseDeps(llm);
    await seedVibe(deps);

    const result = await runSword(deps, {
      request_id: "s1",
      draft: "초안",
      page_url: "https://example.com",
    });

    expect(result.score.final_post).toBe("평가자 최종글");
    expect(result.pipeline).toBe("fast");
  });

  it("standard pipeline runs evaluator then finalize", async () => {
    const draft = "초안 " + "긴 ".repeat(300);
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        axes: {
          cynicism: { value: 4, rationale: "ok" },
          fact: { value: 3, rationale: "ok" },
          punchline: { value: 4, rationale: "ok" },
          vibe: { value: 5, rationale: "ok" },
        },
        line_critique: [{ span: "초안", note: "후킹 약함" }],
        final_post: "평가자 1차 글",
        needs_verification: [],
      }),
    );
    llm.enqueueText("최종 마감 글");

    const deps = baseDeps(llm);
    await seedVibe(deps);

    const result = await runSword(deps, {
      request_id: "s2",
      draft,
      page_url: "https://example.com",
    });

    expect(result.pipeline).toBe("standard");
    expect(result.score.final_post).toBe("최종 마감 글");
  });
});

describe("runRefine", () => {
  it("re-runs rewrite with the user instruction", async () => {
    const llm = new MockLlm();
    llm.enqueueText("더 짧게 다듬은 글");

    const deps = baseDeps(llm);
    const out = await runRefine(deps, {
      mode: "shield",
      prior_text: "원본 결과",
      vibe: fixtureVibe,
      user_instruction: "더 짧게",
    });

    expect(out).toBe("더 짧게 다듬은 글");
    expect(llm.calls.length).toBe(1);
    expect(llm.calls[0]?.messages.at(-1)?.content).toContain("더 짧게");
  });
});
