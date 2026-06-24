import { describe, it, expect } from "vitest";
import { TheGridLlm } from "@/lib/llm/thegrid.js";
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

const PROXY = "https://example.test/api/chat";

describe("TheGridLlm", () => {
  it("posts OpenAI-shaped body with system message prepended and maps content text", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    const fetchImpl = makeFetch(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: "안녕" },
            finish_reason: "stop",
          },
        ],
      });
    });

    const llm = new TheGridLlm({ proxyUrl: PROXY, fetchImpl });
    const res = await llm.chat({
      system: "be brief",
      messages: [{ role: "user", content: "say hi" }],
    });

    expect(capturedUrl).toBe(PROXY);
    expect(capturedBody.messages[0]).toEqual({ role: "system", content: "be brief" });
    expect(capturedBody.messages[1]).toEqual({ role: "user", content: "say hi" });
    expect(capturedBody.model).toBe("text-prime");
    expect(res.text).toBe("안녕");
    expect(res.tool_calls).toEqual([]);
    expect(res.stop_reason).toBe("end_turn");
  });

  it("maps tool_choice + tools to OpenAI function shape and parses tool_calls response", async () => {
    let captured: any;
    const fetchImpl = makeFetch(async (_url, init) => {
      captured = JSON.parse(init.body as string);
      return jsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "emit_result", arguments: '{"foo":1}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    });

    const llm = new TheGridLlm({ proxyUrl: PROXY, fetchImpl });
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

    expect(captured.tools[0].type).toBe("function");
    expect(captured.tools[0].function.name).toBe("emit_result");
    expect(captured.tool_choice).toEqual({ type: "function", function: { name: "emit_result" } });
    expect(res.tool_calls.length).toBe(1);
    expect(res.tool_calls[0]?.name).toBe("emit_result");
    expect(res.tool_calls[0]?.input).toEqual({ foo: 1 });
    expect(res.stop_reason).toBe("tool_use");
  });

  it("synthesizes a tool call when forced tool was not honored but content is JSON", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({
        choices: [
          {
            message: { role: "assistant", content: '{"foo":42}' },
            finish_reason: "stop",
          },
        ],
      }),
    );

    const llm = new TheGridLlm({ proxyUrl: PROXY, fetchImpl });
    const res = await llm.chat({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      tools: [{ name: "emit_result", description: "d", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "emit_result" },
    });

    expect(res.tool_calls.length).toBe(1);
    expect(res.tool_calls[0]?.name).toBe("emit_result");
    expect(res.tool_calls[0]?.input).toEqual({ foo: 42 });
  });

  it("wraps non-2xx as llm_unreachable AppError", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response("server fail", { status: 500 }),
    );
    const llm = new TheGridLlm({ proxyUrl: PROXY, fetchImpl });
    await expect(
      llm.chat({ system: "s", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("wraps network failure as llm_unreachable AppError", async () => {
    const fetchImpl = makeFetch(async () => {
      throw new Error("network down");
    });
    const llm = new TheGridLlm({ proxyUrl: PROXY, fetchImpl });
    await expect(
      llm.chat({ system: "s", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ code: "llm_unreachable" });
  });
});
