import "server-only";

import { cache } from "react";
import { createCorrectionDirectory } from "@/lib/corrections/directory";
import { readCorrectionList } from "@/lib/corrections/model";
import { tryCreateAnonServerClient } from "@/lib/supabase/anon";

/** リクエスト内では1回だけ読む。データ側の寿命は anon クライアントの articles タグ。 */
export const loadCorrections = cache(async () => {
  const client = tryCreateAnonServerClient();
  return readCorrectionList(client ? createCorrectionDirectory(client) : null);
});
