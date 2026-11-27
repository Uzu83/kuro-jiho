import { z } from "zod";

const publicEnvSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

/** URL と anon キーが両方あるときだけ true。値の中身は見ない。 */
export function hasPublicSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getPublicSupabaseEnv() {
  const parsed = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Supabaseの公開環境変数が不足しているか不正です。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を確認してください。",
    );
  }

  return parsed.data;
}
