import type { VibeProfile } from "@/lib/schemas/vibe.js";
import type { Source } from "@/lib/schemas/fact.js";

export const fixtureVibe: VibeProfile = {
  site_id: "example.com",
  display_name: "Example Community",
  source: "bundled-seed",
  last_refreshed: "2026-06-01T00:00:00.000Z",
  lexicon: {
    high_signal_words: ["그저", "팩트", "오히려"],
    forbidden_words: ["~인 것 같아요"],
    emoji_or_emoticons: ["ㅋㅋ"],
  },
  sentence_shape: {
    avg_length: 35,
    paragraph_style: "short-burst",
    opener_patterns: ["팩트는"],
    closer_patterns: ["그래서 결론"],
  },
  tonality: {
    cynicism_level: 7,
    sarcasm_style: "건조하게 비꼬는",
    political_lean: "apolitical",
    taboo_topics: [],
  },
  few_shot_posts: [
    {
      title: "예시 1",
      body: "팩트는 이거임. 그저 웃지요.",
      top_comments: ["ㅇㅈ"],
      collected_at: "2026-06-01T00:00:00.000Z",
    },
    {
      title: "예시 2",
      body: "오히려 좋네.",
      top_comments: ["ㅋㅋㅋ"],
      collected_at: "2026-06-01T00:00:00.000Z",
    },
  ],
};

export const fixtureSources: Source[] = [
  {
    title: "Example wiki entry",
    url: "https://en.wikipedia.org/wiki/Example",
    snippet: "Example is a placeholder used in tests.",
  },
  {
    title: "News article",
    url: "https://news.example.com/article",
    publisher: "Example News",
    snippet: "Reported facts about the example.",
  },
];
