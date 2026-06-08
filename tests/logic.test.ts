import { describe, it, expect } from "vitest";
import { MockLlm, emitToolCall } from "@/lib/llm/mock.js";
import { detectFallacies } from "@/agents/logic.js";
import { fixtureVibe } from "./_fixtures.js";

describe("logic agent", () => {
  const text = "너는 멍청해서 이 주장은 틀렸다. 진짜 문제는 사실 다른 거지.";

  it("returns fallacies and filters hallucinated spans", async () => {
    const llm = new MockLlm();
    llm.enqueue(() =>
      emitToolCall("emit_result", {
        fallacies: [
          {
            type: "ad_hominem",
            span: "너는 멍청해서",
            explanation: "사람을 공격함",
            counter_punch: "공격 말고 근거를 가져오시죠",
          },
          {
            type: "red_herring",
            span: "이 부분은 입력에 없음", // should be filtered
            explanation: "주제 일탈",
            counter_punch: "원래 주장으로 돌아오시죠",
          },
        ],
      }),
    );

    const out = await detectFallacies({ llm }, { text, vibe: fixtureVibe });
    expect(out.length).toBe(1);
    expect(out[0]?.type).toBe("ad_hominem");
  });

  it("returns empty array when no fallacies", async () => {
    const llm = new MockLlm();
    llm.enqueue(() => emitToolCall("emit_result", { fallacies: [] }));
    const out = await detectFallacies({ llm }, { text: "팩트만 적어둔 문장." });
    expect(out).toEqual([]);
  });
});
