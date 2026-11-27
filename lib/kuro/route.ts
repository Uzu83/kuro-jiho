import "server-only";

import { readKuroTokenSha256 } from "@/lib/kuro/auth";
import { handleCreateArticle, handleCreateSkip, handleGetArticle, handleListArticles, handleUpdateArticle, type KuroDeps } from "@/lib/kuro/handlers";
import { MESSAGES, jsonError } from "@/lib/kuro/http";
import { revalidateArticleSurfaces, revalidateSkipSurfaces } from "@/lib/kuro/revalidate";
import { createSupabaseKuroStore } from "@/lib/kuro/supabase-store";

function deps(): KuroDeps {
  return {
    store: createSupabaseKuroStore(),
    tokenSha256: readKuroTokenSha256(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    revalidateArticle: revalidateArticleSurfaces,
    revalidateSkip: revalidateSkipSurfaces,
  };
}

function failed(error: unknown): Response {
  console.error(error instanceof Error ? error.name : "Error");
  return jsonError(500, MESSAGES.failed);
}

export function listArticles(request: Request): Promise<Response> {
  return handleListArticles(request, deps()).catch(failed);
}

export function createArticle(request: Request): Promise<Response> {
  return handleCreateArticle(request, deps()).catch(failed);
}

export async function getArticle(request: Request, slug: string): Promise<Response> {
  return handleGetArticle(request, slug, deps()).catch(failed);
}

export async function updateArticle(request: Request, slug: string): Promise<Response> {
  return handleUpdateArticle(request, slug, deps()).catch(failed);
}

export function createSkip(request: Request): Promise<Response> {
  return handleCreateSkip(request, deps()).catch(failed);
}
