import { describe, it, expect } from "vitest";
import { GeminiLlm } from "@/lib/llm/gemini.js";
import { AppError } from "@/lib/schemas/errors.js";

function makeFetch(impl: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    impl(input.toString(), init ?? {})) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GeminiLlm", () => {
  it("throws no_api_key when key is missing", async () => {
    const llm = new GeminiLlm({ apiKey: "" });
    await expect(
      llm.chat({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ code: "no_api_key" });
  });

  it("posts contents + systemInstruction and maps text response", async () => {
    let capturedBody: any = undefined;
    const fetchImpl = makeFetch(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse({
        candidates: [
          {
            content: { role: "model", parts: [{ text: "안녕" }] },
            finishReason: "STOP",
          },
        ],
      });
    });

    const llm = new GeminiLlm({ apiKey: "k", fetchImpl });
    const res = await llm.chat({
      system: "be brief",
      messages: [{ role: "user", content: "say hi" }],
    });

    expect(res.text).toBe("안녕");
    expect(res.tool_calls).toEqual([]);
    expect(res.stop_reason).toBe("end_turn");
    expect(capturedBody.systemInstruction.parts[0].text).toBe("be brief");
    expect(capturedBody.contents[0].role).toBe("user");
  });

  it("maps tool_choice to functionCallingConfig and parses functionCall response", async () => {
    let captured: any = undefined;
    const fetchImpl = makeFetch(async (_url, init) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "emit_result",
                    args: { foo: 1 },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      });
    });

    const llm = new GeminiLlm({ apiKey: "k", fetchImpl });
    const res = await llm.chat({
      system: "s",
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          name: "emit_result",
          description: "emit",
          input_schema: { type: "object", properties: { foo: { type: "integer" } } },
        },
      ],
      tool_choice: { type: "tool", name: "emit_result" },
    });

    expect(res.tool_calls.length).toBe(1);
    expect(res.tool_calls[0]?.name).toBe("emit_result");
    expect(res.tool_calls[0]?.input).toEqual({ foo: 1 });
    expect(res.stop_reason).toBe("tool_use");
    expect(captured.toolConfig.functionCallingConfig.mode).toBe("ANY");
    expect(captured.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["emit_result"]);
    expect(captured.tools[0].functionDeclarations[0].name).toBe("emit_result");
  });

  it("wraps non-2xx as llm_unreachable AppError", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response("server fail", { status: 500 }),
    );
    const llm = new GeminiLlm({ apiKey: "k", fetchImpl });
    await expect(
      llm.chat({ system: "s", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
