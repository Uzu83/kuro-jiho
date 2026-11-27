import { ThemePageContent, themeMetadata } from "@/app/listings/theme-page";
import { LISTING_THEMES } from "@/lib/listings/model";

export const revalidate = 3600;

export function generateStaticParams() {
  return LISTING_THEMES.map((theme) => ({ theme }));
}

type ThemePageProps = {
  params: Promise<{ theme: string }>;
};

export async function generateMetadata({ params }: ThemePageProps) {
  const { theme } = await params;
  return themeMetadata(theme);
}

export default async function ThemePage({ params }: ThemePageProps) {
  const { theme } = await params;
  return ThemePageContent({ theme, redirectPage1: false });
}
