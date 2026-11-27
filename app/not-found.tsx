import Link from "next/link";
import { SiteFooter } from "@/app/site/footer";

export default function NotFound() {
  return (
    <main className="site-main">
      <p className="kicker">クロの時報</p>
      <h1>ページが見つかりません</h1>
      <p className="lead">アドレスを確認するか、トップから探してください。</p>
      <p>
        <Link href="/">トップへ戻る</Link>
      </p>
      <SiteFooter />
    </main>
  );
}
