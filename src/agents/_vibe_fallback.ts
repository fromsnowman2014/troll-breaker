import type { VibeProfile } from "../lib/schemas/vibe.js";

/**
 * Last-resort profile when no seed and no scrape exist for a site.
 * Per VIBE_EXTRACTION.md §7: never refuse; degrade with a visible badge.
 * The orchestrator/UI is responsible for surfacing the "generic" badge.
 */
export const GENERIC_KO_CYNICAL: VibeProfile = {
  site_id: "generic",
  display_name: "Generic Korean cynical",
  source: "bundled-seed",
  last_refreshed: "2026-06-07T00:00:00.000Z",
  lexicon: {
    high_signal_words: ["솔직히", "그저", "팩트는", "오히려", "참"],
    forbidden_words: ["~인 것 같아요", "~라고 생각합니다만"],
    emoji_or_emoticons: ["ㅋㅋ", "..."],
  },
  sentence_shape: {
    avg_length: 40,
    paragraph_style: "short-burst",
    opener_patterns: ["솔직히 말해서", "팩트는 이거임"],
    closer_patterns: ["그래서 결론은", "그저 웃지요"],
  },
  tonality: {
    cynicism_level: 6,
    sarcasm_style: "건조하게 비꼬는, 감정 배제",
    political_lean: "apolitical",
    taboo_topics: [],
  },
  few_shot_posts: [
    {
      title: "그래서 결론이 뭐임",
      body:
        "팩트만 보자. 주장 1번은 근거가 없고, 주장 2번은 출처가 없다. 그저 감정만 남았네. 결론: 할 말 없으면 그냥 가만히 있는 게 낫다.",
      top_comments: ["ㅇㅈ", "팩폭 ㄷㄷ"],
      collected_at: "2026-06-07T00:00:00.000Z",
    },
    {
      title: "이걸 또 진지하게 받는 사람이 있네",
      body:
        "감정적으로 받지 마시고요. 그저 데이터로 말하시면 됩니다. 그게 어렵나? 어려우면 시작을 안 하시면 됩니다.",
      top_comments: ["맞말", "ㅋㅋㅋ"],
      collected_at: "2026-06-07T00:00:00.000Z",
    },
  ],
};
