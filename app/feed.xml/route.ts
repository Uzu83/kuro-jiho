import { feedTextResponse, renderPublishedFeed } from "@/lib/seo/respond";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(request: Request): Promise<Response> {
  try {
    return await renderPublishedFeed(null, request);
  } catch {
    return feedTextResponse("フィードを作成できません", 500);
  }
}
