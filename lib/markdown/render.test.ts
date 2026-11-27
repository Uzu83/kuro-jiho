import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
  it("does not render script tags or raw HTML", async () => {
    const html = await renderMarkdown(
      [
        "# 見出し",
        "",
        "本文 **強調** と [公式](https://example.com/news)",
        "",
        '<script>alert("xss")</script>',
        "<SCRIPT src=\"https://evil.example/a.js\"></SCRIPT>",
        "<b>raw</b>",
        '<img src="x" onerror="alert(1)">',
        '<a href="javascript:alert(1)">click</a>',
        "",
        "[click](javascript:alert(1))",
      ].join("\n"),
    );

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<\/script/i);
    expect(html).not.toMatch(/<b[\s>]/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("<h1>見出し</h1>");
    expect(html).toContain("<strong>強調</strong>");
    expect(html).toContain("https://example.com/news");
  });

  it("keeps safe markdown links and escapes nothing into a tag", async () => {
    const html = await renderMarkdown("1 < 2 かつ **太字**");

    expect(html).toContain("<strong>太字</strong>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<2");
  });
});
