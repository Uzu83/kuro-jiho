import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideProxyAccess, isAdminLoginPath, isAdminPath } from "@/lib/admin/gate";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseEnv, hasPublicSupabaseEnv } from "@/lib/supabase/public-env";

function copyProxyHeaders(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(name);
    if (value) {
      to.headers.set(name, value);
    }
  }
  return to;
}

function loginRedirect(request: NextRequest, error: "denied" | undefined, next: string | undefined, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  if (error) {
    url.searchParams.set("error", error);
  }
  if (next) {
    url.searchParams.set("next", next);
  }
  return copyProxyHeaders(from, NextResponse.redirect(url));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!hasPublicSupabaseEnv()) {
    const decision = decideProxyAccess({
      pathname,
      search,
      configured: false,
      hasSession: false,
      allowlisted: false,
    });
    if (decision.type === "redirect") {
      return loginRedirect(request, decision.error, decision.next, NextResponse.next({ request }));
    }
    return NextResponse.next({ request });
  }

  const { url, anonKey } = getPublicSupabaseEnv();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const claims = await supabase.auth.getClaims();
  const hasSession = !claims.error && Boolean(claims.data?.claims.sub);
  let allowlisted = false;

  if (hasSession && isAdminPath(pathname)) {
    const allowed = await supabase.rpc("admin_session_allowed");
    allowlisted = !allowed.error && allowed.data === true;
  }

  const decision = decideProxyAccess({
    pathname,
    search,
    configured: true,
    hasSession,
    allowlisted,
  });

  if (decision.type === "sign-out") {
    await supabase.auth.signOut();
    return loginRedirect(request, "denied", undefined, supabaseResponse);
  }

  if (decision.type === "redirect") {
    if (isAdminLoginPath(pathname) && decision.next) {
      const url = new URL(decision.next, request.url);
      return copyProxyHeaders(supabaseResponse, NextResponse.redirect(url));
    }
    return loginRedirect(request, decision.error, decision.next, supabaseResponse);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
