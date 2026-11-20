"use client";
import { ui } from "@/lib/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <div className="empty-state">
        <h1>{ui("暂时无法打开学习空间")}</h1>
        <p>
          {ui(
            "请检查 PostgreSQL 是否已启动，并确认已执行数据库迁移与演示数据初始化。",
          )}
        </p>
        <button className="button primary" onClick={reset}>
          {ui("重新连接")}
        </button>
        <p className="muted">{ui("启动步骤见仓库 README。")}</p>
      </div>
    </main>
  );
}
