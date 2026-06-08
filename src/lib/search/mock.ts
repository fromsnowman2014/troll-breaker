import type { Source } from "../schemas/fact.js";
import type { SearchClient } from "./types.js";

export class MockSearch implements SearchClient {
  readonly calls: { query: string; max: number }[] = [];

  constructor(private readonly canned: Source[] = []) {}

  async searchWeb(query: string, max = 5): Promise<Source[]> {
    this.calls.push({ query, max });
    return this.canned.slice(0, max);
  }
}
