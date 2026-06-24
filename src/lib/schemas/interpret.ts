import { z } from "zod";

export const GlossaryEntrySchema = z.object({
  original: z.string().min(1),
  normalized: z.string().min(1),
  note: z.string().optional(),
});

export const InterpretResultSchema = z.object({
  plain_text: z.string().min(1),
  glossary: z.array(GlossaryEntrySchema).default([]),
});

export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type InterpretResult = z.output<typeof InterpretResultSchema>;
