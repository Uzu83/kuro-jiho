import { ThemePageContent, themeMetadata } from "@/app/listings/theme-page";

export const revalidate = 3600;

/** 2ページ目以降は初回アクセスで ISR する。1ページ目は /[theme]。 */
export function generateStaticParams() {
  return [];
}

type ThemeNumberedPageProps = {
  params: Promise<{ theme: string; page: string }>;
};

export async function generateMetadata({ params }: ThemeNumberedPageProps) {
  const { theme } = await params;
  return themeMetadata(theme);
}

export default async function ThemeNumberedPage({ params }: ThemeNumberedPageProps) {
  const { theme, page } = await params;
  return ThemePageContent({ theme, pageParam: page, redirectPage1: true });
}
