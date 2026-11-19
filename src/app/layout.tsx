import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./learning.css";
export const metadata: Metadata = {
  title: { default: "语境 · 听懂、说出、读明白", template: "%s · 语境" },
  description: "英语与德语的听力、口语和语境阅读，共用一个单词库。",
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
