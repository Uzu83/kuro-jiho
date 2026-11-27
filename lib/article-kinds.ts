export const ARTICLE_THEMES = ["fukuoka", "it", "gadget", "sports", "f1"] as const;
export const ARTICLE_SLOTS = ["07", "12", "17", "20"] as const;

export type ArticleTheme = (typeof ARTICLE_THEMES)[number];
export type ArticleSlot = (typeof ARTICLE_SLOTS)[number];
