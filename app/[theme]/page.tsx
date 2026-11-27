import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemeBoard } from "@/app/listings";
import { asTheme, pageCount, parsePageParam, THEME_PAGE_SIZE, themeName } from "@/lib/articles/board";
import { loadThemePage } from "@/lib/articles/surfaces";

export const revalidate = 3600;

type ThemePageProps = {
  params: Promise<{ theme: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: ThemePageProps): Promise<Metadata> {
  const { theme } = await params;
  const known = asTheme(theme);
  if (!known) {
    return { title: "テーマが見つかりません｜クロの時報" };
  }
  return { title: `${themeName(known)}｜クロの時報` };
}

export default async function ThemePage({ params, searchParams }: ThemePageProps) {
  const { theme: themeParam } = await params;
  const theme = asTheme(themeParam);
  if (!theme) {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);
  if (page === null) {
    notFound();
  }

  const result = await loadThemePage(theme, page, THEME_PAGE_SIZE);
  const pages = pageCount(result.total, THEME_PAGE_SIZE);
  if (page > pages) {
    notFound();
  }

  return (
    <ThemeBoard
      theme={theme}
      label={result.label}
      page={page}
      pages={pages}
      articles={result.articles}
    />
  );
}
