import { ui } from "@/lib/ui";
import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page">
      <div className="empty-state">
        <h1>{ui("这篇文章不在这里了")}</h1>
        <p>{ui("文章可能已删除，你收藏的词仍保留在生词本。")}</p>
        <Link className="button primary" href="/library">
          {ui("返回文章库")}
        </Link>
      </div>
    </main>
  );
}
