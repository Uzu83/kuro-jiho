"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { beforeAnalyticsEvent, beforeSpeedInsightEvent } from "@/lib/analytics/events";
import { isAdminPath } from "@/lib/admin/gate";

/** ルートに置く。管理画面では計測コンポーネントを出さない。 */
export function SiteAnalytics() {
  const pathname = usePathname();
  if (isAdminPath(pathname)) {
    return null;
  }

  return (
    <>
      <Analytics beforeSend={beforeAnalyticsEvent} />
      <SpeedInsights beforeSend={beforeSpeedInsightEvent} />
    </>
  );
}
