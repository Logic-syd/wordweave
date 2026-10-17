import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "语境 · 在阅读中学会表达", template: "%s · 语境" },
  description: "为中文母语者设计的技术英语与德语语境阅读工具。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
