import Link from "next/link";
import { InfoPage } from "@/app/site/info-page";
import type { CorrectionListItem } from "@/lib/corrections/model";

export function CorrectionsDocument({ items }: { items: readonly CorrectionListItem[] }) {
  return (
    <InfoPage
      title="訂正一覧"
      lead="訂正のある公開記事です。新しい訂正から並べています。履歴は各記事に残しています。"
      current="/corrections"
    >
      {items.length === 0 ? (
        <p className="empty-note">訂正のある記事はまだありません。</p>
      ) : (
        <ul className="story-list">
          {items.map((item) => (
            <li key={item.slug} className="story-card">
              <p className="story-meta">
                <span>{item.themeLabel}</span>
                <time dateTime={item.latestAt}>{item.latestLabel}</time>
                <span>訂正 {item.count}件</span>
              </p>
              <p className="story-title">
                <Link href={`/articles/${item.slug}#corrections`}>{item.title}</Link>
              </p>
              <p className="story-summary">{item.note}</p>
            </li>
          ))}
        </ul>
      )}
    </InfoPage>
  );
}
