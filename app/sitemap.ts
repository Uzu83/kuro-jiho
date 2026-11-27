import type { MetadataRoute } from "next";
import { loadPublishedFeed } from "@/lib/seo/catalog";
import { siteOrigin } from "@/lib/seo/public-url";
import { sitemapUrls } from "@/lib/seo/sitemap";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await loadPublishedFeed();
  return sitemapUrls(entries, siteOrigin()).map((url) => ({ url }));
}
