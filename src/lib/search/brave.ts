import { AppError } from "../schemas/errors.js";
import type { Source } from "../schemas/fact.js";
import type { SearchClient } from "./types.js";

export interface BraveConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Brave Search adapter — wire-format stub.
 *
 * Real implementation must:
 *   - GET {baseUrl}/res/v1/web/search?q={query} with X-Subscription-Token.
 *   - Map results to Source[]; drop non-HTTPS URLs (schema rejects them).
 *   - Surface 429 / 5xx as `AppError("search_unreachable", ...)`.
 */
export class BraveSearch implements SearchClient {
  constructor(private readonly cfg: BraveConfig) {}

  async searchWeb(_query: string, _max?: number): Promise<Source[]> {
    if (!this.cfg.apiKey) {
      throw new AppError("no_api_key", "Brave Search API key is not configured");
    }
    throw new AppError(
      "search_unreachable",
      "BraveSearch.searchWeb is not implemented; wire the real Brave API call here",
    );
  }
}
