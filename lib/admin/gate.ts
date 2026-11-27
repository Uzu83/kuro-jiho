/** 管理画面の入口判定。メールアドレスは扱わない。 */

const ADMIN_PREFIX = "/admin";

export type ProxyDecision =
  | { type: "continue" }
  | { type: "redirect"; error?: "denied"; next?: string }
  | { type: "sign-out" };

export type AdminSessionShape =
  | { configured: false }
  | { configured: true; authenticated: false }
  | { configured: true; authenticated: true; allowlisted: false }
  | { configured: true; authenticated: true; allowlisted: true };

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login";
}

/**
 * ログイン後に戻してよいパス。外部 URL やログイン画面自身は /admin に落とす。
 */
export function safeAdminNext(value: string | null | undefined): string {
  if (!value) {
    return "/admin";
  }

  const path = value.split("#")[0] ?? "";
  if (path.length === 0 || path.length > 200) {
    return "/admin";
  }
  if (!path.startsWith("/admin")) {
    return "/admin";
  }
  if (path.startsWith("/admin/login")) {
    return "/admin";
  }
  if (
    path.includes("//") ||
    path.includes("\\") ||
    path.includes("://") ||
    path.includes("@") ||
    path.includes("..") ||
    /%2f|%5c/i.test(path)
  ) {
    return "/admin";
  }
  if (!/^\/admin(?:\/[A-Za-z0-9._~%-]+)*(?:\?[A-Za-z0-9._~%=&-]+)?$/.test(path)) {
    return "/admin";
  }

  return path;
}

export function decideProxyAccess(input: {
  pathname: string;
  search: string;
  configured: boolean;
  hasSession: boolean;
  allowlisted: boolean;
}): ProxyDecision {
  if (!isAdminPath(input.pathname)) {
    return { type: "continue" };
  }

  if (isAdminLoginPath(input.pathname)) {
    if (input.configured && input.hasSession && input.allowlisted) {
      const requested = new URLSearchParams(input.search).get("next");
      return { type: "redirect", next: safeAdminNext(requested) };
    }
    if (input.configured && input.hasSession && !input.allowlisted) {
      return { type: "sign-out" };
    }
    return { type: "continue" };
  }

  if (!input.configured || !input.hasSession) {
    const next = safeAdminNext(`${input.pathname}${input.search}`);
    return { type: "redirect", next };
  }

  if (!input.allowlisted) {
    return { type: "sign-out" };
  }

  return { type: "continue" };
}

export function authorizeAdminAction(session: AdminSessionShape): "allow" | "login" | "deny" {
  const decision = decideProxyAccess({
    pathname: "/admin",
    search: "",
    configured: session.configured,
    hasSession: session.configured && session.authenticated,
    allowlisted: session.configured && session.authenticated && session.allowlisted,
  });

  if (decision.type === "continue") {
    return "allow";
  }
  if (decision.type === "sign-out") {
    return "deny";
  }
  return "login";
}

/** サーバーアクションの Origin が、このホストからの POST か。 */
export function isTrustedMutationOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.username !== "" || url.password !== "") {
    return false;
  }

  return url.host === host;
}

export function mutationHost(headerList: {
  get(name: string): string | null;
}): string | null {
  const forwarded = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!forwarded) {
    return null;
  }

  const host = forwarded.split(",")[0]?.trim() ?? "";
  if (host.length === 0 || host.includes("/") || host.includes("@") || /\s/.test(host)) {
    return null;
  }

  return host;
}
