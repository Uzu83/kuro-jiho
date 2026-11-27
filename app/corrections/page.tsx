import type { Metadata } from "next";
import { CorrectionsDocument } from "@/app/corrections/document";
import { loadCorrections } from "@/lib/corrections/load";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "訂正一覧｜クロの時報",
  description: "訂正のある公開記事の一覧です。",
};

export default async function CorrectionsPage() {
  const items = await loadCorrections();
  return <CorrectionsDocument items={items} />;
}
