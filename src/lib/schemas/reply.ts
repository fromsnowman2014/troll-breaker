import { z } from "zod";

export const ReplyModeSchema = z.enum(["attack", "defend", "agree", "mock", "humor"]);

export const ReplyResultSchema = z.object({
  reply_mode: ReplyModeSchema,
  post: z.string().min(1),
  cited_urls: z.array(z.string()).default([]),
});

export type ReplyMode = z.infer<typeof ReplyModeSchema>;
export type ReplyResult = z.output<typeof ReplyResultSchema>;
