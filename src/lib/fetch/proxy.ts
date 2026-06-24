export interface FetchResult {
  title: string | null;
  snippet: string | null;
  reason?: string;
}

export interface UrlFetcher {
  fetchPage(url: string): Promise<FetchResult>;
}

export class ProxyFetcher implements UrlFetcher {
  constructor(private readonly proxyUrl: string) {}

  async fetchPage(url: string): Promise<FetchResult> {
    try {
      const res = await fetch(this.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return { title: null, snippet: null, reason: `proxy_${res.status}` };
      return (await res.json()) as FetchResult;
    } catch {
      return { title: null, snippet: null, reason: "proxy_unreachable" };
    }
  }
}
