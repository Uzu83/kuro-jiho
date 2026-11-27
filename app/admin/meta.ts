import { ARTICLE_SLOTS, ARTICLE_THEMES } from "@/lib/article-schema";
import type { Choice } from "@/lib/admin/draft";
import { themeLabel } from "@/lib/articles/public";
import { slotClock } from "@/lib/listings/model";

export function themeChoices(): Choice[] {
  return ARTICLE_THEMES.map((theme) => ({ value: theme, label: themeLabel(theme) }));
}

export function slotChoices(): Choice[] {
  return ARTICLE_SLOTS.map((slot) => ({ value: slot, label: `${slotClock(slot)}（${slot}）` }));
}

export function statusChoices(): Choice[] {
  return [
    { value: "draft", label: "下書き" },
    { value: "published", label: "公開" },
    { value: "unpublished", label: "非公開" },
  ];
}
