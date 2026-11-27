import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

const serviceEnvSchema = z.object({
  url: z.url(),
  serviceRoleKey: z.string().min(1),
});

/**
 * RLS を迂回するサービスロールクライアント。
 * `server-only` により Client Component から import するとビルドが失敗する。
 * サービスロールの環境変数を読んでよいのはこのファイルだけ。
 */
export function createServiceClient() {
  const parsed = serviceEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Supabaseのサービス用環境変数が不足しているか不正です。NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を確認してください。",
    );
  }

  return createClient<Database>(parsed.data.url, parsed.data.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
