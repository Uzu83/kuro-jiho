import { createArticle, listArticles } from "@/lib/kuro/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE は定義しない。未実装メソッドは 405 になる。

export function GET(request: Request): Promise<Response> {
  return listArticles(request);
}

export function POST(request: Request): Promise<Response> {
  return createArticle(request);
}
