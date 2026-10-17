export default function Loading() {
  return (
    <main className="page">
      <div className="skeleton heading-skeleton" />
      <div className="mode-grid">
        <div className="skeleton card-skeleton" />
        <div className="skeleton card-skeleton" />
      </div>
      <p className="muted">正在打开你的学习空间…</p>
    </main>
  );
}
