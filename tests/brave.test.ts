import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BraveSearch } from "@/lib/search/brave.js";
import { AppError } from "@/lib/schemas/errors.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOk(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function mockFetchStatus(status: number) {
  return vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

describe("BraveSearch", () => {
  beforeEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("maps Brave web results to Source[] and sends the API key header", async () => {
    const fetchMock = mockFetchOk({
      web: {
        results: [
          {
            title: "Result A",
            url: "https://example.com/a",
            description: "snippet a",
            meta_url: { hostname: "example.com" },
          },
          {
            title: "Result B",
            url: "https://example.org/b",
            description: "snippet b",
          },
        ],
      },
    });
    globalThis.fetch = fetchMock;

    const brave = new BraveSearch({ apiKey: "test-key" });
    const out = await brave.searchWeb("hello world", 5);

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      title: "Result A",
      url: "https://example.com/a",
      snippet: "snippet a",
      publisher: "example.com",
    });
    expect(out[1]?.publisher).toBeUndefined();

    const call = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(call?.[0]).toContain("q=hello%20world");
    expect(call?.[0]).toContain("count=5");
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers["X-Subscription-Token"]).toBe("test-key");
  });

  it("drops non-HTTPS results", async () => {
    globalThis.fetch = mockFetchOk({
      web: {
        results: [
          { title: "Secure", url: "https://ok.example/x", description: "s" },
          { title: "Insecure", url: "http://bad.example/y", description: "s" },
        ],
      },
    });
    const out = await new BraveSearch({ apiKey: "k" }).searchWeb("q");
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe("https://ok.example/x");
  });

  it("truncates snippet to 280 chars", async () => {
    const long = "x".repeat(500);
    globalThis.fetch = mockFetchOk({
      web: { results: [{ title: "T", url: "https://e.example/p", description: long }] },
    });
    const out = await new BraveSearch({ apiKey: "k" }).searchWeb("q");
    expect(out[0]?.snippet.length).toBe(280);
  });

  it("throws no_api_key when apiKey is empty", async () => {
    const brave = new BraveSearch({ apiKey: "" });
    await expect(brave.searchWeb("q")).rejects.toMatchObject({
      name: "AppError",
      code: "no_api_key",
    });
  });

  it("throws search_unreachable on HTTP 429", async () => {
    globalThis.fetch = mockFetchStatus(429);
    const brave = new BraveSearch({ apiKey: "k" });
    await expect(brave.searchWeb("q")).rejects.toBeInstanceOf(AppError);
    await expect(brave.searchWeb("q")).rejects.toMatchObject({ code: "search_unreachable" });
  });

  it("throws search_unreachable when fetch rejects", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const brave = new BraveSearch({ apiKey: "k" });
    await expect(brave.searchWeb("q")).rejects.toMatchObject({ code: "search_unreachable" });
  });
});
