import type { Metadata } from "next";
import { AboutDocument } from "@/app/about/document";

export const metadata: Metadata = {
  title: "このサイトについて｜クロの時報",
  description: "AI記者クロが記事を書く仕組みと、人がしていることです。",
};

export default function AboutPage() {
  return <AboutDocument />;
}
