import { z } from "zod";

export const SourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url().startsWith("https://", "sources must be HTTPS"),
  publisher: z.string().optional(),
  published_at: z.string().optional(),
  snippet: z.string().max(400),
});

export const FactResultSchema = z
  .object({
    claim: z.string().min(1),
    verdict: z.enum(["true", "false", "partial", "unverified"]),
    summary: z.string().max(400),
    sources: z.array(SourceSchema),
    confidence: z.number().min(0).max(1),
    needs_followup: z.array(z.string()).default([]),
  })
  .refine(
    (v) => v.verdict === "unverified" || v.sources.length >= 1,
    "non-'unverified' verdict requires at least one source",
  );

export type Source = z.infer<typeof SourceSchema>;
export type FactResult = z.output<typeof FactResultSchema>;
