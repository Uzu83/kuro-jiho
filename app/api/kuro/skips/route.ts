import { createSkip } from "@/lib/kuro/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE は定義しない。未実装メソッドは 405 になる。

export function POST(request: Request): Promise<Response> {
  return createSkip(request);
}
