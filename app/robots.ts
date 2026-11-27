import type { MetadataRoute } from "next";
import { robotsDocument } from "@/lib/seo/sitemap";
import { resolveSiteOrigin } from "@/lib/site/origin";

export default function robots(): MetadataRoute.Robots {
  return robotsDocument(resolveSiteOrigin());
}
