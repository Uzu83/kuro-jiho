import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ThemeView } from "@/app/listings/views";
import { themeLabel } from "@/lib/articles/public";
import { loadTheme } from "@/lib/listings/load";
import { parsePageParam, parseThemeParam } from "@/lib/listings/model";

export async function themeMetadata(theme: string): Promise<Metadata> {
  const parsed = parseThemeParam(theme);
  if (!parsed) {
    return { title: "ページが見つかりません｜クロの時報" };
  }

  const label = themeLabel(parsed);
  return {
    title: `${label}｜クロの時報`,
    description: `${label}の記事を新しい順に掲載します。`,
  };
}

export async function ThemePageContent({
  theme,
  pageParam,
  redirectPage1,
}: {
  theme: string;
  pageParam?: string;
  redirectPage1: boolean;
}) {
  const parsed = parseThemeParam(theme);
  const page = parsePageParam(pageParam);
  if (!parsed || page === null) {
    notFound();
  }
  if (redirectPage1 && page === 1) {
    redirect(`/${parsed}`);
  }

  const model = await loadTheme(parsed, page);
  if (model.outOfRange) {
    notFound();
  }

  return <ThemeView model={model} />;
}
