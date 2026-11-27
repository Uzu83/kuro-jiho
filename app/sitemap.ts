import type { MetadataRoute } from "next";
import { loadPublishedFeed } from "@/lib/seo/load";
import { sitemapEntries } from "@/lib/seo/sitemap";
import { resolveSiteOrigin } from "@/lib/site/origin";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await loadPublishedFeed(null);
  return sitemapEntries(resolveSiteOrigin(), articles);
}
