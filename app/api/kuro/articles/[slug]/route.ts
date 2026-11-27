import { getArticle, updateArticle } from "@/lib/kuro/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE は定義しない。未実装メソッドは 405 になる。

type SlugContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, context: SlugContext): Promise<Response> {
  const { slug } = await context.params;
  return getArticle(request, slug);
}

export async function PATCH(request: Request, context: SlugContext): Promise<Response> {
  const { slug } = await context.params;
  return updateArticle(request, slug);
}
