import { ui } from "@/lib/ui";
export default function Loading() {
  return (
    <main className="page">
      <div className="skeleton heading-skeleton" />
      <div className="mode-grid">
        <div className="skeleton card-skeleton" />
        <div className="skeleton card-skeleton" />
      </div>
      <p className="muted">{ui("正在打开你的学习空间…")}</p>
    </main>
  );
}
