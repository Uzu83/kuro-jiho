import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteAnalytics } from "@/app/site/analytics";
import {
  articleViewEvent,
  beforeAnalyticsEvent,
  beforeSpeedInsightEvent,
  eventFromArticleClick,
  isPublicAnalyticsPayload,
  sourceClickEvent,
  sourceDomain,
} from "@/lib/analytics/events";

const { analyticsProps, speedProps, pathState } = vi.hoisted(() => ({
  analyticsProps: [] as { beforeSend?: (event: { type: "pageview" | "event"; url: string }) => unknown }[],
  speedProps: [] as { beforeSend?: (event: { type: "vital"; url: string; route?: string }) => unknown }[],
  pathState: { pathname: "/" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.pathname,
}));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: { beforeSend?: (event: { type: "pageview" | "event"; url: string }) => unknown }) => {
    analyticsProps.push(props);
    return null;
  },
}));

vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: (event: { type: "vital"; url: string; route?: string }) => unknown }) => {
    speedProps.push(props);
    return null;
  },
}));

const root = path.resolve(import.meta.dirname, "../..");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function payload(event: { name: string; props: Record<string, string> } | null): string {
  return JSON.stringify(event);
}

describe("custom events", () => {
  it("sends theme and slot for a view, and nothing else", () => {
    const event = articleViewEvent("fukuoka", "07");
    expect(event).toEqual({ name: "article_view", props: { theme: "fukuoka", slot: "07" } });
    expect(isPublicAnalyticsPayload(event!.props)).toBe(true);
    expect(articleViewEvent("weather", "07")).toBeNull();
    expect(articleViewEvent("fukuoka", "99")).toBeNull();
    expect(payload(event)).not.toMatch(EMAIL);
    expect(payload(event)).not.toContain("?");
  });

  it("sends only the source domain, without the path or query", () => {
    const href = "https://User:secret@www.city.example.jp/path/notice?email=reader@example.com&token=abc#top";
    expect(sourceDomain(href)).toBeNull();
    const safe = "https://www.city.example.jp/path/notice?email=reader@example.com&utm_source=newsletter#part";
    expect(sourceDomain(safe)).toBe("www.city.example.jp");
    const event = sourceClickEvent("sports", safe);
    expect(event).toEqual({
      name: "source_click",
      props: { theme: "sports", domain: "www.city.example.jp" },
    });
    expect(payload(event)).not.toContain("notice");
    expect(payload(event)).not.toContain("email");
    expect(payload(event)).not.toContain("utm_source");
    expect(payload(event)).not.toContain("?");
    expect(payload(event)).not.toMatch(EMAIL);
    expect(sourceClickEvent("sports", "http://example.com/a")).toBeNull();
    expect(sourceClickEvent("nope", safe)).toBeNull();
  });

  it("does not copy the report link, its query, or the article url into the event", () => {
    const href =
      "https://github.com/Uzu83/kuro-jiho/issues/new?template=correction.yml&article_url=" +
      encodeURIComponent("https://news.example/articles/2026-12-01-07-notice?user=reader@example.com");
    const event = eventFromArticleClick({ theme: "f1", marker: "report_error_click", href });
    expect(event).toEqual({ name: "report_error_click", props: { theme: "f1" } });
    expect(payload(event)).not.toContain("article_url");
    expect(payload(event)).not.toContain("github.com");
    expect(payload(event)).not.toContain("?");
    expect(payload(event)).not.toMatch(EMAIL);
    expect(eventFromArticleClick({ theme: "f1", marker: "source_click", href: null })).toBeNull();
    expect(eventFromArticleClick({ theme: "f1", marker: null, href })).toBeNull();
  });

  it("rejects payloads that add a path, a query, or an extra key", () => {
    expect(isPublicAnalyticsPayload({ theme: "it", slot: "12", domain: "example.com" })).toBe(false);
    expect(isPublicAnalyticsPayload({ theme: "it", email: "a@b.com" })).toBe(false);
    expect(isPublicAnalyticsPayload({ theme: "it", domain: "example.com/path" })).toBe(false);
    expect(isPublicAnalyticsPayload({ theme: "it", domain: "example.com?q=1" })).toBe(false);
    expect(isPublicAnalyticsPayload({})).toBe(false);
  });
});

describe("page analytics", () => {
  it("drops admin urls and strips query strings and fragments", () => {
    const dirty = "https://news.example/articles/2026-12-01-07-notice?utm=mail&email=reader@example.com#sources";
    expect(beforeAnalyticsEvent({ type: "pageview" as const, url: dirty })).toEqual({
      type: "pageview",
      url: "https://news.example/articles/2026-12-01-07-notice",
    });
    expect(beforeAnalyticsEvent({ type: "event" as const, url: dirty })?.url).not.toContain("?");
    expect(JSON.stringify(beforeAnalyticsEvent({ type: "event" as const, url: dirty }))).not.toMatch(EMAIL);

    expect(beforeAnalyticsEvent({ type: "pageview" as const, url: "https://news.example/admin?next=/admin" })).toBeNull();
    expect(beforeAnalyticsEvent({ type: "pageview" as const, url: "https://news.example/admin/login" })).toBeNull();
    expect(beforeAnalyticsEvent({ type: "pageview" as const, url: "https://user:secret@news.example/sports" })).toBeNull();
    expect(beforeSpeedInsightEvent({ type: "vital" as const, url: dirty, route: "/articles/[slug]?email=a@b.com" })).toEqual({
      type: "vital",
      url: "https://news.example/articles/2026-12-01-07-notice",
      route: "/articles/[slug]",
    });
    expect(
      beforeSpeedInsightEvent({ type: "vital" as const, url: "https://news.example/sports", route: "/admin/articles" }),
    ).toBeNull();
  });

  it("does not mount analytics on /admin, and wires the filters on public pages", () => {
    analyticsProps.length = 0;
    speedProps.length = 0;
    pathState.pathname = "/admin/login";
    expect(renderToStaticMarkup(React.createElement(SiteAnalytics))).toBe("");
    expect(analyticsProps).toHaveLength(0);
    expect(speedProps).toHaveLength(0);

    pathState.pathname = "/articles/2026-12-01-07-notice";
    renderToStaticMarkup(React.createElement(SiteAnalytics));
    expect(analyticsProps).toHaveLength(1);
    expect(speedProps).toHaveLength(1);
    const sent = analyticsProps[0]?.beforeSend?.({
      type: "pageview",
      url: "https://news.example/articles/2026-12-01-07-notice?token=secret",
    });
    expect(sent).toEqual({
      type: "pageview",
      url: "https://news.example/articles/2026-12-01-07-notice",
    });

    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    const analytics = readFileSync(path.join(root, "app/site/analytics.tsx"), "utf8");
    const article = readFileSync(path.join(root, "app/articles/[slug]/article-analytics.tsx"), "utf8");
    expect(layout).toContain("<SiteAnalytics />");
    expect(analytics).toContain("isAdminPath");
    expect(analytics).toContain("beforeAnalyticsEvent");
    expect(analytics).toContain("beforeSpeedInsightEvent");
    expect(article).toContain("articleViewEvent(theme, slot)");
    expect(article).toContain("eventFromArticleClick");
    expect(article).not.toContain("track(name, {");
    expect(article).not.toMatch(/track\([^)]*href/);
  });
});
