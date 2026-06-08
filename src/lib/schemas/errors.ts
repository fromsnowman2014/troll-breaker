export type AppErrorCode =
  | "no_api_key"
  | "llm_unreachable"
  | "search_unreachable"
  | "schema_validation_failed"
  | "timeout"
  | "cancelled"
  | "unknown";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AgentTimeoutError extends AppError {
  constructor(agent: string, ms: number) {
    super("timeout", `${agent} timed out after ${ms}ms`);
    this.name = "AgentTimeoutError";
  }
}

export class SchemaValidationError extends AppError {
  constructor(agent: string, details: unknown) {
    super("schema_validation_failed", `${agent} output failed schema validation`, details);
    this.name = "SchemaValidationError";
  }
}
