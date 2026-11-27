"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { redactAnalyticsEvent } from "@/lib/seo/events";
import { isPrivatePath } from "@/lib/seo/public-url";

export function PublicAnalytics() {
  const pathname = usePathname() ?? "/";
  if (isPrivatePath(pathname)) {
    return null;
  }

  return (
    <>
      <Analytics beforeSend={redactAnalyticsEvent} />
      <SpeedInsights beforeSend={redactAnalyticsEvent} />
    </>
  );
}
