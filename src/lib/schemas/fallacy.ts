import { z } from "zod";

export const FallacyTypeSchema = z.enum([
  "ad_hominem",
  "red_herring",
  "strawman",
  "slippery_slope",
  "false_dilemma",
  "appeal_to_authority",
  "appeal_to_emotion",
  "tu_quoque",
  "moving_the_goalposts",
  "other",
]);

export const FallacySchema = z.object({
  type: FallacyTypeSchema,
  span: z.string().min(1),
  explanation: z.string().max(200),
  counter_punch: z.string().max(300),
});

export type FallacyType = z.infer<typeof FallacyTypeSchema>;
export type Fallacy = z.infer<typeof FallacySchema>;
