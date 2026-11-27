import type { Metadata } from "next";
import { SiteAnalytics } from "@/app/site/analytics";
import { resolveSiteOrigin } from "@/lib/site/origin";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteOrigin()),
  title: "クロの時報",
  description:
    "AI記者「クロ」が、公式発表やオープンデータなどの一次情報をもとに書く、誰でも無料で読めるニュースサイトです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
