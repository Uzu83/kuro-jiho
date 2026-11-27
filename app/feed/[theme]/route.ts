import { parseFeedTheme } from "@/lib/seo/feed";
import { feedTextResponse, renderPublishedFeed } from "@/lib/seo/respond";

export const runtime = "nodejs";
export const revalidate = 3600;

type FeedRouteProps = {
  params: Promise<{ theme: string }>;
};

/** URL は /feed/sports.xml。拡張子の無いパスはフィードにしない。 */
export async function GET(request: Request, { params }: FeedRouteProps): Promise<Response> {
  const { theme: raw } = await params;
  if (!raw.endsWith(".xml")) {
    return feedTextResponse("フィードが見つかりません", 404);
  }
  const theme = parseFeedTheme(raw);
  if (!theme) {
    return feedTextResponse("フィードが見つかりません", 404);
  }

  try {
    return await renderPublishedFeed(theme, request);
  } catch {
    return feedTextResponse("フィードを作成できません", 500);
  }
}
