import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();

  return createBrowserClient<Database>(url, anonKey);
}
