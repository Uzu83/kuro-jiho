import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARTICLE_CHANGE_TYPES,
  ARTICLE_SLUG_PATTERN,
  ARTICLE_SLOTS,
  ARTICLE_STATUSES,
  ARTICLE_TEXT_LIMITS,
  ARTICLE_THEMES,
  articleUpdateSchema,
  parseArticleCreate,
  parseArticleUpdate,
  splitArticleError,
  type ArticleCreate,
  type ArticleSource,
  type ArticleUpdateContext,
  type ArticleValidationResult,
} from "./article-schema";

const migration = readFileSync(
  path.join(
    import.meta.dirname,
    "../supabase/migrations/20261127073300_articles_revisions_rate_limits.sql",
  ),
  "utf8",
);

function sqlInList(column: string): string[] {
  const match = migration.match(new RegExp(`\\b${column} in \\(([^)]+)\\)`));
  const list = match?.[1];
  if (!list) {
    throw new Error(`${column} の CHECK が見つかりません`);
  }

  return list.split(",").map((part) => part.trim().replace(/^'|'$/g, ""));
}

function articleBody(extra = "", citation = "［1］"): string {
  const head = `告示の要点をまとめる${citation}。${extra}`;
  const count = Array.from(head).length;
  if (count > ARTICLE_TEXT_LIMITS.body.max) {
    throw new Error("本文が長すぎます");
  }
  if (count >= ARTICLE_TEXT_LIMITS.body.min) {
    return head;
  }
  return head + "あ".repeat(ARTICLE_TEXT_LIMITS.body.min - count);
}

function source(id = "1", overrides: Partial<ArticleSource> = {}): ArticleSource {
  return {
    id,
    title: "告示",
    publisher: "福岡市",
    url: `https://example.com/notices/${id}`,
    accessed_at: "2026-12-01T06:30:00+09:00",
    ...overrides,
  };
}

function validCreate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "福岡市が告示を公開",
    slug: "2026-12-01-07-fukuoka-notice",
    theme: "fukuoka",
    slot: "07",
    date: "2026-12-01",
    status: "draft",
    ai_generated: true,
    summary: ["告示が出た", "対象は市内", "詳細は出典のとおり"],
    body_md: articleBody(),
    sources: [source("1", { license: "公開情報" })],
    verification: {
      checked: [{ claim: "告示が公開された", source_ids: ["1"] }],
      removed: [],
    },
    related: ["2026-11-30-20-older-note"],
    ...overrides,
  };
}

function contextFrom(
  article: ArticleCreate,
  overrides: Partial<ArticleUpdateContext> = {},
): ArticleUpdateContext {
  return {
    status: article.status,
    slug: article.slug,
    date: article.date,
    slot: article.slot,
    body_md: article.body_md,
    published_at: article.published_at,
    sources: article.sources,
    verification: { checked: article.verification.checked },
    related: article.related,
    ...overrides,
  };
}

function expectJapanese(messages: string[]) {
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    expect(message).toMatch(/^[^：]+：.+/);
    expect(message).not.toMatch(/Invalid|Expected|Required|Unrecognized|Too small|Too big/);
  }
}

function expectRejected(
  result: ArticleValidationResult<unknown>,
  pattern: RegExp,
): void {
  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }
  expectJapanese(result.errors);
  expect(result.errors.some((error) => pattern.test(error))).toBe(true);
}

describe("article schema and the migration", () => {
  it("uses the same theme, slot, status, and change types as the database", () => {
    expect(sqlInList("theme")).toEqual([...ARTICLE_THEMES]);
    expect(sqlInList("slot")).toEqual([...ARTICLE_SLOTS]);
    expect(sqlInList("status")).toEqual([...ARTICLE_STATUSES]);
    expect(sqlInList("change_type").filter((value) => value !== "create")).toEqual([
      ...ARTICLE_CHANGE_TYPES,
    ]);
    expect(ARTICLE_SLUG_PATTERN.source).toBe(
      "^\\d{4}-\\d{2}-\\d{2}-(07|12|17|20)-[a-z0-9-]+$",
    );
    expect(migration).toContain("cardinality(summary) = 3");
    expect(migration).toContain("jsonb_array_length(sources) >= 1");
    expect(migration).toContain("ai_generated = true");
    expect(migration).toContain("status <> 'published' or published_at is not null");
    expect(migration).toContain("change_type <> 'correction'");
  });
});

describe("parseArticleCreate", () => {
  it("accepts a complete article and keeps optional license and related slugs", () => {
    const input = validCreate({ title: "  福岡市が告示を公開  " });
    const result = parseArticleCreate(JSON.parse(JSON.stringify(input)));

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.data.title).toBe("福岡市が告示を公開");
    expect(result.data.ai_generated).toBe(true);
    expect(result.data.published_at).toBeNull();
    expect(result.data.sources[0]?.license).toBe("公開情報");
    expect(result.data.related).toEqual(["2026-11-30-20-older-note"]);
    expect(result.data.verification.removed).toEqual([]);
  });

  it("accepts a removed claim, a millisecond timestamp, and a published row", () => {
    const result = parseArticleCreate(
      validCreate({
        status: "published",
        published_at: "2026-12-01T07:00:00.123+09:00",
        sources: [source("1")],
        verification: {
          checked: [{ claim: "告示が公開された", source_ids: ["1"] }],
          removed: [{ claim: "参加者数", reason: "資料に人数がなかった" }],
        },
        related: [],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.status).toBe("published");
    expect(result.data.published_at).toBe("2026-12-01T07:00:00.123+09:00");
    expect(result.data.sources[0]?.license).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("accepts a leap day, markdown, and a comparison that is not HTML", () => {
    const result = parseArticleCreate(
      validCreate({
        slug: "2024-02-29-12-leap-note",
        slot: "12",
        date: "2024-02-29",
        theme: "it",
        body_md: articleBody(
          "1 < 2。**太字**と [公式](https://example.com/a) と <https://example.com/b>。",
        ),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.warnings).toEqual([]);
  });

  it("accepts every theme and every slot when the slug matches", () => {
    for (const theme of ARTICLE_THEMES) {
      for (const slot of ARTICLE_SLOTS) {
        const result = parseArticleCreate(
          validCreate({
            theme,
            slot,
            slug: `2026-12-01-${slot}-${theme}-note`,
          }),
        );
        expect(result.success, `${theme}/${slot}`).toBe(true);
      }
    }
  });

  it("rejects an empty source list", () => {
    expectRejected(parseArticleCreate(validCreate({ sources: [] })), /^sources：1件以上必要です$/);
  });

  it("rejects a missing or false ai_generated flag", () => {
    const withoutFlag = validCreate();
    delete withoutFlag.ai_generated;
    expectRejected(
      parseArticleCreate(withoutFlag),
      /^ai_generated：true だけを指定できます$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ ai_generated: false })),
      /^ai_generated：true だけを指定できます$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ ai_generated: "true" })),
      /^ai_generated：true だけを指定できます$/,
    );
  });

  it("rejects a citation whose source id does not exist", () => {
    const result = parseArticleCreate(validCreate({ body_md: articleBody("", "［3］") }));
    expectRejected(result, /^body_md：［3］に対応する出典がありません（出典idは 1）$/);
    if (!result.success) {
      expect(result.warnings).toEqual(["sources[0].id：本文の［1］で使われていません"]);
    }
  });

  it("rejects an http source URL", () => {
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { url: "http://example.com/notice" })],
        }),
      ),
      /^sources\[0\]\.url：https のURLにしてください$/,
    );
  });

  it("rejects a source timestamp without a time zone", () => {
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { accessed_at: "2026-12-01T06:30:00" })],
        }),
      ),
      /^sources\[0\]\.accessed_at：タイムゾーン（\+09:00）が必要です$/,
    );
  });

  it("rejects a slug whose slot does not match slot", () => {
    expectRejected(
      parseArticleCreate(validCreate({ slug: "2026-12-01-12-fukuoka-notice", slot: "07" })),
      /^slug：枠が slot（07）と一致しません$/,
    );
  });

  it("rejects image markdown", () => {
    expectRejected(
      parseArticleCreate(validCreate({ body_md: articleBody("![図](https://example.com/a.png)") })),
      /^body_md：画像記法（!\[）は使えません$/,
    );
  });

  it("warns about an unused source and still accepts the article", () => {
    const result = parseArticleCreate(
      validCreate({
        body_md: articleBody("［1］のあと［2］。"),
        sources: [source("1"), source("2"), source("4")],
        verification: {
          checked: [{ claim: "告示が公開された", source_ids: ["1", "2"] }],
          removed: [],
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.warnings).toEqual(["sources[2].id：本文の［4］で使われていません"]);
    expectJapanese(result.warnings);
  });

  it("returns every independent error in Japanese", () => {
    const result = parseArticleCreate(
      validCreate({
        title: "",
        ai_generated: false,
        sources: [],
        author: "kuro",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expectJapanese(result.errors);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^title：/),
        "ai_generated：true だけを指定できます",
        "sources：1件以上必要です",
        "author：指定できない項目です",
      ]),
    );
  });

  it("rejects lengths outside the article limits", () => {
    expectRejected(
      parseArticleCreate(validCreate({ title: "あ".repeat(61) })),
      /^title：1〜60字にしてください（いま61字）$/,
    );
    expect(parseArticleCreate(validCreate({ title: "あ".repeat(60) })).success).toBe(true);

    const summary = ["あ".repeat(80), "二点目", "三点目"];
    expect(parseArticleCreate(validCreate({ summary })).success).toBe(true);
    expectRejected(
      parseArticleCreate(validCreate({ summary: ["あ".repeat(81), "二点目", "三点目"] })),
      /^summary\[0\]：1〜80字にしてください（いま81字）$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ summary: ["一点目", "二点目"] })),
      /^summary：3件ちょうどにしてください$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ summary: ["", "二点目", "三点目"] })),
      /^summary\[0\]：1〜80字にしてください（いま0字）$/,
    );

    expectRejected(
      parseArticleCreate(validCreate({ body_md: "あ".repeat(299) })),
      /^body_md：300〜4000字にしてください（いま299字）$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ body_md: `［1］${"あ".repeat(4000)}` })),
      /^body_md：300〜4000字にしてください（いま4003字）$/,
    );
    expect(parseArticleCreate(validCreate({ body_md: `［1］${"あ".repeat(3997)}` })).success).toBe(
      true,
    );
  });

  it("rejects values the database checks would reject", () => {
    expectRejected(parseArticleCreate(validCreate({ theme: "news" })), /^theme：/);
    expectRejected(parseArticleCreate(validCreate({ slot: "08" })), /^slot：/);
    expectRejected(parseArticleCreate(validCreate({ status: "archived" })), /^status：/);
    expectRejected(
      parseArticleCreate(validCreate({ date: "2026-02-31" })),
      /^date：実在する日付にしてください$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ date: "2026-02-29", slug: "2026-02-29-07-note" })),
      /^date：実在する日付にしてください$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ slug: "2026-12-01-7-fukuoka-notice" })),
      /^slug：YYYY-MM-DD-枠-名前/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ slug: "2026-12-01-07-Fukuoka" })),
      /^slug：/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ verification: { checked: [], removed: [] } })),
      /^verification\.checked：1件以上必要です$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ verification: [] })),
      /^verification：オブジェクトにしてください$/,
    );
  });

  it("rejects source, citation, and timestamp shapes that cannot be stored safely", () => {
    expectRejected(
      parseArticleCreate(validCreate({ sources: [{ id: "1" }] })),
      /^sources\[0\]\.title：/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1"), source("1")],
          verification: {
            checked: [{ claim: "同じ出典", source_ids: ["1"] }],
            removed: [],
          },
        }),
      ),
      /^sources：id「1」が重複しています$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ sources: [source("01")] })),
      /^sources\[0\]\.id：/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ sources: [source(1 as unknown as string)] })),
      /^sources\[0\]\.id：文字列にしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { url: "https://user:pass@example.com/a" })],
        }),
      ),
      /^sources\[0\]\.url：ユーザー情報を含まない https のURLにしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { url: "javascript:alert(1)" })],
        }),
      ),
      /^sources\[0\]\.url：https のURLにしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({ sources: [source("1", { accessed_at: "2026-12-01T06:30:00Z" })] }),
      ),
      /^sources\[0\]\.accessed_at：\+09:00 付きのISO 8601/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { accessed_at: "2026-12-01T06:30:00+00:00" })],
        }),
      ),
      /^sources\[0\]\.accessed_at：\+09:00 付きのISO 8601/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          sources: [source("1", { accessed_at: "2026-02-31T06:30:00+09:00" })],
        }),
      ),
      /^sources\[0\]\.accessed_at：実在する日時にしてください$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ sources: [source("1", { license: "  " })] })),
      /^sources\[0\]\.license：1字以上にしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          verification: {
            checked: [{ claim: "出典がない", source_ids: ["9"] }],
            removed: [],
          },
        }),
      ),
      /^verification\.checked\[0\]\.source_ids：出典id「9」が sources にありません$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          verification: {
            checked: [{ claim: "重複", source_ids: ["1", "1"] }],
            removed: [],
          },
        }),
      ),
      /^verification\.checked\[0\]\.source_ids：出典id「1」が重複しています$/,
    );
  });

  it("rejects raw HTML and a script tag, including both at once", () => {
    expectRejected(
      parseArticleCreate(validCreate({ body_md: articleBody("<b>太字</b>") })),
      /^body_md：生のHTMLは使えません$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ body_md: articleBody('<img src="x">') })),
      /^body_md：生のHTMLは使えません$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ body_md: articleBody("<!-- hidden -->") })),
      /^body_md：生のHTMLは使えません$/,
    );

    const scripted = parseArticleCreate(
      validCreate({ body_md: articleBody('<script>alert(1)</script><b>x</b>') }),
    );
    expect(scripted.success).toBe(false);
    if (!scripted.success) {
      expect(scripted.errors).toEqual(
        expect.arrayContaining([
          "body_md：<script> は使えません",
          "body_md：生のHTMLは使えません",
        ]),
      );
    }
  });

  it("rejects a slug date that disagrees with date, and a self or duplicate related slug", () => {
    expectRejected(
      parseArticleCreate(
        validCreate({ slug: "2026-12-02-07-fukuoka-notice", date: "2026-12-01" }),
      ),
      /^slug：日付が date（2026-12-01）と一致しません$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ slug: "2026-13-01-07-fukuoka-notice" })),
      /^slug：日付が実在しません$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({ related: ["2026-12-01-07-fukuoka-notice"] }),
      ),
      /^related：記事自身の slug は入れられません$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({
          related: ["2026-11-30-20-older-note", "2026-11-30-20-older-note"],
        }),
      ),
      /^related：slug「2026-11-30-20-older-note」が重複しています$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ related: ["not-a-slug"] })),
      /^related\[0\]：YYYY-MM-DD-枠-名前/,
    );
  });

  it("requires published_at only when status is published", () => {
    expectRejected(
      parseArticleCreate(validCreate({ status: "published" })),
      /^published_at：公開するときは必須です$/,
    );
    expectRejected(
      parseArticleCreate(validCreate({ status: "published", published_at: null })),
      /^published_at：公開するときは必須です$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({ status: "published", published_at: "2026-12-01T07:00:00" }),
      ),
      /^published_at：タイムゾーンが必要です$/,
    );
    expect(
      parseArticleCreate(
        validCreate({
          status: "published",
          published_at: "2026-12-01T07:00:00Z",
        }),
      ).success,
    ).toBe(true);
    expect(
      parseArticleCreate(
        validCreate({
          status: "published",
          published_at: "2026-12-01T07:00:00+15:59",
        }),
      ).success,
    ).toBe(true);
    expectRejected(
      parseArticleCreate(
        validCreate({ status: "published", published_at: "2026-12-01T07:00:00+99:99" }),
      ),
      /^published_at：タイムゾーンのオフセットは -15:59 から \+15:59、または Z にしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({ status: "published", published_at: "2026-12-01T07:00:00+09:60" }),
      ),
      /^published_at：タイムゾーンのオフセットは -15:59 から \+15:59、または Z にしてください$/,
    );
    expectRejected(
      parseArticleCreate(
        validCreate({ status: "published", published_at: "2026-12-01T07:00:00+16:00" }),
      ),
      /^published_at：タイムゾーンのオフセットは -15:59 から \+15:59、または Z にしてください$/,
    );
    expect(
      parseArticleCreate(
        validCreate({ published_at: "2026-12-01T06:00:00+09:00" }),
      ).success,
    ).toBe(true);
  });

  it("rejects a non-object payload and server-managed columns", () => {
    expectRejected(parseArticleCreate(null), /^記事：オブジェクトにしてください$/);
    expectRejected(parseArticleCreate([]), /^記事：オブジェクトにしてください$/);
    expectRejected(
      parseArticleCreate(validCreate({ id: "00000000-0000-4000-8000-000000000001" })),
      /^id：指定できない項目です$/,
    );
    expectRejected(parseArticleCreate(validCreate({ version: 2 })), /^version：指定できない項目です$/);
    expectRejected(
      parseArticleCreate(validCreate({ change_type: "update" })),
      /^change_type：指定できない項目です$/,
    );
  });
});

describe("parseArticleUpdate", () => {
  function publishedContext(article: ArticleCreate): ArticleUpdateContext {
    return contextFrom(article, {
      status: "published",
      published_at: "2026-12-01T07:00:00+09:00",
    });
  }

  it("accepts a partial title change on a draft without change_note", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }

    const result = parseArticleUpdate(
      { change_type: "update", title: "見出しだけ直す" },
      contextFrom(created.data),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.title).toBe("見出しだけ直す");
    expect(result.data).not.toHaveProperty("slug");
    expect(result.data.change_note).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("requires change_note for every correction, including drafts", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }
    const context = contextFrom(created.data);

    expectRejected(
      parseArticleUpdate({ change_type: "correction", title: "訂正後" }, context),
      /^change_note：訂正では必須です$/,
    );
    expect(articleUpdateSchema.safeParse({ change_type: "correction", title: "訂正後" }).success).toBe(
      false,
    );
    expectRejected(
      parseArticleUpdate(
        { change_type: "correction", change_note: "   ", title: "訂正後" },
        context,
      ),
      /^change_note：空にはできません$/,
    );

    const corrected = parseArticleUpdate(
      { change_type: "correction", change_note: "  日付を直した  ", title: "訂正後" },
      context,
    );
    expect(corrected.success).toBe(true);
    if (corrected.success) {
      expect(corrected.data.change_note).toBe("日付を直した");
    }
  });

  it("requires change_note when the stored article is published", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }
    const context = publishedContext(created.data);

    expectRejected(
      parseArticleUpdate({ change_type: "update", title: "軽微な修正" }, context),
      /^change_note：公開済みの記事を更新するときは必須です$/,
    );
    expectRejected(
      parseArticleUpdate({ change_type: "unpublish", status: "unpublished" }, context),
      /^change_note：公開済みの記事を更新するときは必須です$/,
    );

    const updated = parseArticleUpdate(
      { change_type: "update", change_note: "表記を揃えた", title: "軽微な修正" },
      context,
    );
    expect(updated.success).toBe(true);

    const unpublished = parseArticleUpdate(
      {
        change_type: "unpublish",
        change_note: "公開を取りやめた",
        status: "unpublished",
      },
      context,
    );
    expect(unpublished.success).toBe(true);
  });

  it("publishes a draft only with status published and published_at", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }
    const context = contextFrom(created.data);

    expectRejected(
      parseArticleUpdate({ change_type: "publish" }, context),
      /^status：publish のときは published にしてください$/,
    );
    expectRejected(
      parseArticleUpdate({ change_type: "publish", status: "published" }, context),
      /^published_at：公開するときは必須です$/,
    );

    const published = parseArticleUpdate(
      {
        change_type: "publish",
        status: "published",
        published_at: "2026-12-01T07:00:00+09:00",
      },
      context,
    );
    expect(published.success).toBe(true);
  });

  it("checks slug, citations, and sources against the stored row", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }
    const context = contextFrom(created.data);

    expectRejected(
      parseArticleUpdate({ change_type: "update", slot: "12" }, context),
      /^slug：枠が slot（12）と一致しません$/,
    );

    const renamed = parseArticleUpdate(
      { change_type: "update", slug: "2026-12-01-07-renamed-notice" },
      context,
    );
    expect(renamed.success).toBe(true);

    const missingCitation = parseArticleUpdate(
      { change_type: "update", body_md: articleBody("", "［3］") },
      context,
    );
    expectRejected(missingCitation, /^body_md：［3］に対応する出典がありません/);
    if (!missingCitation.success) {
      expect(missingCitation.warnings).toEqual([
        "sources[0].id：本文の［1］で使われていません",
      ]);
    }

    const droppedSource = parseArticleUpdate(
      {
        change_type: "update",
        sources: [source("2")],
        verification: {
          checked: [{ claim: "別の出典", source_ids: ["2"] }],
          removed: [],
        },
      },
      context,
    );
    expectRejected(droppedSource, /^body_md：［1］に対応する出典がありません（出典idは 2）$/);

    const cited = parseArticleUpdate(
      {
        change_type: "update",
        body_md: articleBody("［1］と［2］"),
        sources: [source("1"), source("2")],
        verification: {
          checked: [{ claim: "二つの出典", source_ids: ["1", "2"] }],
          removed: [],
        },
      },
      context,
    );
    expect(cited.success).toBe(true);
    if (cited.success) {
      expect(cited.warnings).toEqual([]);
    }
  });

  it("warns when a patched body leaves a stored source unused", () => {
    const created = parseArticleCreate(
      validCreate({
        body_md: articleBody("［1］と［2］"),
        sources: [source("1"), source("2")],
        verification: {
          checked: [{ claim: "二つの出典", source_ids: ["1", "2"] }],
          removed: [],
        },
      }),
    );
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }

    const result = parseArticleUpdate(
      { change_type: "update", body_md: articleBody("［1］だけ") },
      contextFrom(created.data),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toEqual(["sources[1].id：本文の［2］で使われていません"]);
    }
  });

  it("rejects create as a change type and an empty patch", () => {
    const created = parseArticleCreate(validCreate());
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }
    const context = contextFrom(created.data);

    expectRejected(
      parseArticleUpdate({ change_type: "create", title: "新規" }, context),
      /^change_type：update、correction、publish、unpublish のいずれかにしてください$/,
    );
    expectRejected(
      parseArticleUpdate({ change_type: "update", ai_generated: false }, context),
      /^ai_generated：true だけを指定できます$/,
    );
    expectRejected(
      parseArticleUpdate(
        { change_type: "update", body_md: articleBody("![図](https://example.com/a.png)") },
        context,
      ),
      /^body_md：画像記法（!\[）は使えません$/,
    );
    expectRejected(
      parseArticleUpdate({ change_type: "update" }, context),
      /^記事：更新する項目を1つ以上指定してください$/,
    );
    expectRejected(
      parseArticleUpdate({ change_type: "update", author: "admin", title: "見出し" }, context),
      /^author：指定できない項目です$/,
    );
    expectRejected(
      parseArticleUpdate({ title: "見出し" }, context),
      /^change_type：/,
    );
  });

  it("does not clear published_at when the patch omits it", () => {
    const created = parseArticleCreate(
      validCreate({
        status: "published",
        published_at: "2026-12-01T07:00:00+09:00",
      }),
    );
    expect(created.success).toBe(true);
    if (!created.success) {
      return;
    }

    const result = parseArticleUpdate(
      { change_type: "update", change_note: "表記のみ", title: "見出し" },
      contextFrom(created.data),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.published_at).toBeUndefined();
    }

    expectRejected(
      parseArticleUpdate(
        {
          change_type: "update",
          change_note: "日時を消した",
          published_at: null,
        },
        contextFrom(created.data),
      ),
      /^published_at：公開するときは必須です$/,
    );
    expectRejected(
      parseArticleUpdate(
        {
          change_type: "update",
          change_note: "時差が不正",
          published_at: "2026-12-01T07:00:00+99:99",
        },
        contextFrom(created.data),
      ),
      /^published_at：タイムゾーンのオフセットは -15:59 から \+15:59、または Z にしてください$/,
    );
  });
});

describe("splitArticleError", () => {
  it("splits on the first fullwidth colon", () => {
    expect(splitArticleError("sources[0].url：https のURLにしてください")).toEqual({
      field: "sources[0].url",
      reason: "https のURLにしてください",
    });
    expect(splitArticleError("change_note：訂正：日付")).toEqual({
      field: "change_note",
      reason: "訂正：日付",
    });
  });
});
