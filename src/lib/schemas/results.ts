import { z } from "zod";
import { FactResultSchema } from "./fact.js";
import { FallacySchema } from "./fallacy.js";
import { EvalScoreSchema } from "./evaluator.js";

const PipelineSchema = z.enum(["fast", "standard", "deep"]);

const VibeUsedSchema = z.object({
  site_id: z.string(),
  display_name: z.string(),
});

export const ShieldResultSchema = z.object({
  request_id: z.string().min(1),
  pipeline: PipelineSchema,
  vibe_used: VibeUsedSchema,
  claim_excerpt: z.string().max(200),
  fact: FactResultSchema,
  fallacies: z.array(FallacySchema),
  vibe_adjusted_summary: z.string().min(1),
  generated_at: z.string().datetime(),
});

export const SwordResultSchema = z.object({
  request_id: z.string().min(1),
  pipeline: PipelineSchema,
  vibe_used: VibeUsedSchema,
  score: EvalScoreSchema,
  generated_at: z.string().datetime(),
});

export type Pipeline = z.infer<typeof PipelineSchema>;
export type ShieldResult = z.infer<typeof ShieldResultSchema>;
export type SwordResult = z.infer<typeof SwordResultSchema>;
