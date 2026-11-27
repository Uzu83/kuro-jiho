import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveBoard } from "@/app/listings";
import { formatIsoDateLabel } from "@/lib/articles/board";
import { loadArchive } from "@/lib/articles/surfaces";
import { isIsoDate } from "@/lib/kuro/dates";

export const revalidate = 3600;

type ArchivePageProps = {
  params: Promise<{ date: string }>;
};

export async function generateMetadata({ params }: ArchivePageProps): Promise<Metadata> {
  const { date } = await params;
  if (!isIsoDate(date)) {
    return { title: "アーカイブが見つかりません｜クロの時報" };
  }
  return { title: `${formatIsoDateLabel(date)}｜クロの時報` };
}

export default async function ArchivePage({ params }: ArchivePageProps) {
  const { date } = await params;
  if (!isIsoDate(date)) {
    notFound();
  }

  const slots = await loadArchive(date);
  return <ArchiveBoard date={date} slots={slots} />;
}
