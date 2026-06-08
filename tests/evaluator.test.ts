import { describe, it, expect } from "vitest";
import { MockLlm, emitToolCall } from "@/lib/llm/mock.js";
import { scoreAndCritique } from "@/agents/evaluator.js";
import { fixtureVibe } from "./_fixtures.js";

describe("evaluator agent", () => {
  it("returns 4-axis scores and filters hallucinated spans", async () => {
    const draft = "이 주장은 통계 없이 감정만 있다. 마지막 한 방도 없음.";
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        axes: {
          cynicism: { value: 5, rationale: "건조함 부족" },
          fact: { value: 2, rationale: "통계 없음" },
          punchline: { value: 3, rationale: "약함" },
          vibe: { value: 6, rationale: "준수" },
        },
        line_critique: [
          { span: "감정만 있다", note: "데이터 한 줄 추가" },
          { span: "원문에 없는 부분", note: "ignored" },
        ],
        final_post: "팩트는 이거임. 그래서 결론.",
        needs_verification: [],
      }),
    );

    const out = await scoreAndCritique(
      { llm },
      { draft, vibe: fixtureVibe },
    );
    expect(out.axes.fact.value).toBe(2);
    expect(out.line_critique.length).toBe(1);
    expect(out.line_critique[0]?.span).toBe("감정만 있다");
  });
});
