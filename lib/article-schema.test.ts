import { describe, expect, it } from "vitest";
import { parseArticleCreate, parseArticleUpdate, type ArticleCreate } from "./article-schema";

function paragraph(seed: string): string {
  const unit = "公式発表の内容を、出典に沿って短くまとめた。";
  let body = seed;
  while (body.length < 300) body += unit;
  return body;
}

function article(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: ArticleCreate = {
    title: "福岡市が予算案を発表",
    slug: "2026-12-01-07-fukuoka-budget",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    status: "published",
    ai_generated: true,
    summary: ["予算案を発表した。", "市の資料で確認した。", "数値の詳細は出典を参照。"],
    body_md: paragraph("市は予算案を発表した。［1］ [資料](https://www.city.fukuoka.lg.jp/budget) も参照した。"),
    sources: [
      {
        id: "1",
        title: "令和8年度予算案",
        publisher: "福岡市",
        url: "https://www.city.fukuoka.lg.jp/budget",
        accessed_at: "2026-12-01T06:30:00+09:00",
      },
    ],
    verification: {
      checked: [{ claim: "予算案を発表した", source_ids: ["1"] }],
      removed: [],
    },
    related: [],
  };
  return { ...base, ...overrides };
}

function errorsOf(input: unknown): string[] {
  const result = parseArticleCreate(input);
  expect(result.ok).toBe(false);
  if (result.ok) return [];
  expect(result.errors.length).toBeGreaterThan(0);
  for (const error of result.errors) expect(error).toMatch(/^[^：]+：.+/);
  return result.errors;
}

describe("parseArticleCreate", () => {
  it("accepts a complete article and reports no warnings", () => {
    const result = parseArticleCreate(article());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.data.ai_generated).toBe(true);
    expect(result.data.slug).toBe("2026-12-01-07-fukuoka-budget");
    expect(result.data.sources[0]?.id).toBe("1");
  });

  it("accepts numeric source ids and warns when a source is unused", () => {
    const result = parseArticleCreate(
      article({
        sources: [
          {
            id: 1,
            title: "令和8年度予算案",
            publisher: "福岡市",
            url: "https://www.city.fukuoka.lg.jp/budget",
            accessed_at: "2026-12-01T06:30:00+09:00",
          },
          {
            id: "2",
            title: "補足資料",
            publisher: "福岡市",
            url: "https://www.city.fukuoka.lg.jp/extra",
            accessed_at: "2026-12-01T06:40:00+09:00",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sources.map((source) => source.id)).toEqual(["1", "2"]);
    expect(result.warnings).toEqual(["sources：出典「2」は本文で使われていません"]);
  });

  it("rejects an article with no sources", () => {
    expect(errorsOf(article({ sources: [] }))).toContain("sources：出典を1件以上入れてください");
  });

  it("rejects a missing or false ai_generated flag", () => {
    const missing = article();
    delete missing.ai_generated;
    expect(errorsOf(missing)).toContain("ai_generated：true のみ指定できます");
    expect(errorsOf(article({ ai_generated: false }))).toContain("ai_generated：true のみ指定できます");
  });

  it("rejects a citation that has no source", () => {
    expect(errorsOf(article({ body_md: paragraph("発表した。［3］") }))).toContain(
      "body_md：本文の［3］に対応する出典がありません",
    );
    expect(errorsOf(article({ body_md: paragraph("発表した。[3]") }))).toContain(
      "body_md：本文の［3］に対応する出典がありません",
    );
  });

  it("rejects an http source URL", () => {
    expect(
      errorsOf(
        article({
          sources: [
            {
              id: "1",
              title: "予算案",
              publisher: "福岡市",
              url: "http://www.city.fukuoka.lg.jp/budget",
              accessed_at: "2026-12-01T06:30:00+09:00",
            },
          ],
        }),
      ),
    ).toContain("sources[0].url：https のURLにしてください");
  });

  it("rejects an accessed_at timestamp without a time zone", () => {
    expect(
      errorsOf(
        article({
          sources: [
            {
              id: "1",
              title: "予算案",
              publisher: "福岡市",
              url: "https://www.city.fukuoka.lg.jp/budget",
              accessed_at: "2026-12-01T06:30:00",
            },
          ],
        }),
      ),
    ).toContain("sources[0].accessed_at：日本時間（+09:00）のISO日時にしてください");
  });

  it("rejects a slug that does not match the date and slot", () => {
    expect(errorsOf(article({ slot: "12" }))).toContain("slug：日付・枠が date と slot と一致していません");
  });

  it("rejects image syntax and raw HTML", () => {
    expect(errorsOf(article({ body_md: paragraph("発表した。［1］ ![図](https://example.com/a.png)") }))).toContain(
      "body_md：画像記法は使えません",
    );
    expect(errorsOf(article({ body_md: paragraph("発表した。［1］ <script>alert(1)</script>") }))).toContain(
      "body_md：生のHTMLは使えません",
    );
  });

  it("enforces the title, summary, and body limits", () => {
    expect(errorsOf(article({ title: "あ".repeat(61) }))).toContain("title：60文字以内にしてください");
    expect(errorsOf(article({ summary: ["一つだけ"] }))).toContain("summary：3件にしてください");
    expect(errorsOf(article({ body_md: "短い本文。［1］" }))).toContain("body_md：300文字以上にしてください");
  });
});

describe("parseArticleUpdate", () => {
  it("requires a change note for a correction", () => {
    const missing = parseArticleUpdate({ change_type: "correction", title: "見出しを直した" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors).toContain("change_note：訂正内容を書いてください");

    const present = parseArticleUpdate({
      change_type: "correction",
      title: "見出しを直した",
      change_note: "見出しの誤字を直した",
    });
    expect(present.ok).toBe(true);
  });

  it("requires a change note when the current article is published", () => {
    const missing = parseArticleUpdate({ change_type: "update", title: "見出しを直した" }, { status: "published" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors).toContain("change_note：公開済みの記事を変えるときは内容を書いてください");
    }

    const draft = parseArticleUpdate({ change_type: "update", title: "見出しを直した" }, { status: "draft" });
    expect(draft.ok).toBe(true);
  });
});
