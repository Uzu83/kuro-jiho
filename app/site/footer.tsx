import Link from "next/link";

export const FOOTER_LINKS = [
  { href: "/about", label: "このサイトについて" },
  { href: "/policy", label: "編集方針" },
  { href: "/corrections", label: "訂正一覧" },
  { href: "/feed.xml", label: "RSS" },
] as const;

export function SiteFooter({ current }: { current?: string }) {
  return (
    <footer className="site-footer">
      <nav aria-label="サイト情報">
        <ul>
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              {link.href.endsWith(".xml") ? (
                <a href={link.href}>{link.label}</a>
              ) : (
                <Link href={link.href} aria-current={link.href === current ? "page" : undefined}>
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
