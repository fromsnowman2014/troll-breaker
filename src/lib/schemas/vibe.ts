import { z } from "zod";

export const SiteIdSchema = z
  .string()
  .regex(/^[a-z0-9.-]+(:[a-z0-9_-]+)?$/, "site_id must match host or host:board");

export const VibePostSchema = z.object({
  title: z.string().min(1),
  body: z.string().max(1500),
  top_comments: z.array(z.string().max(300)).max(3),
  collected_at: z.string().datetime(),
});

export const VibeProfileSchema = z.object({
  site_id: SiteIdSchema,
  display_name: z.string().min(1),
  source: z.enum(["bundled-seed", "scraped", "user-curated"]),
  last_refreshed: z.string().datetime(),

  lexicon: z.object({
    high_signal_words: z.array(z.string()).max(30),
    forbidden_words: z.array(z.string()).max(15),
    emoji_or_emoticons: z.array(z.string()).max(10),
  }),

  sentence_shape: z.object({
    avg_length: z.number().int().nonnegative(),
    paragraph_style: z.enum(["short-burst", "long-thread", "mixed"]),
    opener_patterns: z.array(z.string()).max(10),
    closer_patterns: z.array(z.string()).max(10),
  }),

  tonality: z.object({
    cynicism_level: z.number().int().min(0).max(10),
    sarcasm_style: z.string().max(200),
    political_lean: z.enum(["left", "right", "mixed", "apolitical"]),
    taboo_topics: z.array(z.string()).max(10),
  }),

  few_shot_posts: z.array(VibePostSchema).min(2).max(5),
});

export type VibePost = z.infer<typeof VibePostSchema>;
export type VibeProfile = z.infer<typeof VibeProfileSchema>;
