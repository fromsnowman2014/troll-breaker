import type { Source } from "../schemas/fact.js";

export interface SearchClient {
  searchWeb(query: string, max?: number): Promise<Source[]>;
}
