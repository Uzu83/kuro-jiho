import { ARTICLE_SLUG_PATTERN, ARTICLE_THEMES, type ArticleTheme } from "@/lib/article-schema";
import { formatJst, themeLabel } from "@/lib/articles/public";

export type CorrectionNoteInput = {
  articleId: string;
  createdAt: string;
  note: string | null;
  version: number;
};

export type CorrectionArticleInput = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  status: string;
};

export type CorrectionListItem = {
  slug: string;
  title: string;
  themeLabel: string;
  latestAt: string;
  latestLabel: string;
  note: string;
  count: number;
};

export type CorrectionDirectory = {
  listCorrectionRows(): Promise<{
    notes: CorrectionNoteInput[];
    articles: CorrectionArticleInput[];
  }>;
};

type ValidNote = {
  articleId: string;
  createdAt: string;
  label: string;
  note: string;
  version: number;
};

function isTheme(value: string): value is ArticleTheme {
  return (ARTICLE_THEMES as readonly string[]).includes(value);
}

function validNote(row: CorrectionNoteInput): ValidNote | null {
  const note = row.note?.trim() ?? "";
  if (!row.articleId || note.length === 0 || !Number.isInteger(row.version)) {
    return null;
  }
  const label = formatJst(row.createdAt);
  if (!label) {
    return null;
  }
  return {
    articleId: row.articleId,
    createdAt: row.createdAt,
    label,
    note,
    version: row.version,
  };
}

function later(left: ValidNote, right: ValidNote): boolean {
  const leftAt = Date.parse(left.createdAt);
  const rightAt = Date.parse(right.createdAt);
  if (leftAt !== rightAt) {
    return leftAt > rightAt;
  }
  return left.version > right.version;
}

/** 公開済みで、本文のある訂正が1件以上ある記事だけを、新しい訂正から並べる。 */
export function toCorrectionList(
  notes: readonly CorrectionNoteInput[],
  articles: readonly CorrectionArticleInput[],
): CorrectionListItem[] {
  const byArticle = new Map<string, ValidNote[]>();
  for (const row of notes) {
    const note = validNote(row);
    if (!note) {
      continue;
    }
    const group = byArticle.get(note.articleId);
    if (group) {
      group.push(note);
    } else {
      byArticle.set(note.articleId, [note]);
    }
  }

  const items: CorrectionListItem[] = [];
  for (const article of articles) {
    if (article.status !== "published" || !ARTICLE_SLUG_PATTERN.test(article.slug) || !isTheme(article.theme)) {
      continue;
    }
    const title = article.title.trim();
    const group = byArticle.get(article.id);
    const first = group?.[0];
    if (!title || !group || !first) {
      continue;
    }
    let latest = first;
    for (const note of group.slice(1)) {
      if (later(note, latest)) {
        latest = note;
      }
    }
    items.push({
      slug: article.slug,
      title,
      themeLabel: themeLabel(article.theme),
      latestAt: latest.createdAt,
      latestLabel: latest.label,
      note: latest.note,
      count: group.length,
    });
  }

  items.sort((left, right) => {
    const byTime = Date.parse(right.latestAt) - Date.parse(left.latestAt);
    if (byTime !== 0) {
      return byTime;
    }
    if (left.slug === right.slug) {
      return 0;
    }
    return left.slug < right.slug ? 1 : -1;
  });

  return items;
}

/** クライアントが無い（環境変数が無い）ときは空。取得失敗は呼び出し元の例外のまま。 */
export async function readCorrectionList(
  directory: CorrectionDirectory | null,
): Promise<CorrectionListItem[]> {
  if (!directory) {
    return [];
  }
  const { notes, articles } = await directory.listCorrectionRows();
  return toCorrectionList(notes, articles);
}
