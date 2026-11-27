import type { MetadataRoute } from "next";
import { robotsDisallow } from "@/lib/seo/sitemap";
import { absolutePublicUrl, siteOrigin } from "@/lib/seo/public-url";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  const sitemap = absolutePublicUrl(origin, "/sitemap.xml");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: robotsDisallow(),
    },
    ...(sitemap ? { sitemap } : {}),
  };
}
