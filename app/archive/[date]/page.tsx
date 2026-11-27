import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveView } from "@/app/listings/views";
import { formatCalendarDate } from "@/lib/kuro/dates";
import { parseArchiveDate } from "@/lib/listings/model";
import { loadArchive } from "@/lib/listings/load";

export const revalidate = 3600;

/** 日付は無数にあるのでビルド時には作らない。初回アクセスで ISR する。 */
export function generateStaticParams() {
  return [];
}

type ArchivePageProps = {
  params: Promise<{ date: string }>;
};

export async function generateMetadata({ params }: ArchivePageProps): Promise<Metadata> {
  const { date } = await params;
  const parsed = parseArchiveDate(date);
  if (!parsed) {
    return { title: "ページが見つかりません｜クロの時報" };
  }

  const label = formatCalendarDate(parsed);
  return {
    title: `${label}｜クロの時報`,
    description: `${label}（日本時間）の4枠です。`,
  };
}

export default async function ArchivePage({ params }: ArchivePageProps) {
  const { date } = await params;
  const archive = await loadArchive(date);
  if (!archive) {
    notFound();
  }

  return <ArchiveView archive={archive} />;
}
