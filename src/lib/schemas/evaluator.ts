import { z } from "zod";

const AxisScoreSchema = z.object({
  value: z.number().int().min(0).max(10),
  rationale: z.string().max(150),
});

const LineNoteSchema = z.object({
  span: z.string().min(1),
  note: z.string().max(200),
});

export const EvalScoreSchema = z.object({
  axes: z.object({
    cynicism: AxisScoreSchema,
    fact: AxisScoreSchema,
    punchline: AxisScoreSchema,
    vibe: AxisScoreSchema,
  }),
  line_critique: z.array(LineNoteSchema),
  final_post: z.string().min(1),
  needs_verification: z.array(z.string()).default([]),
});

export type AxisScore = z.infer<typeof AxisScoreSchema>;
export type LineNote = z.infer<typeof LineNoteSchema>;
export type EvalScore = z.output<typeof EvalScoreSchema>;
