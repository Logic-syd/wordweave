import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./learning.css";
import "./learning-nav.css";
import "./reading-workspace.css";
import "./daily-learning.css";
import "./study-workspace.css";
import "./study-themes.css";
export const metadata: Metadata = {
  title: {
    default: "语境 · 听说读 / WordWeave · Listen, Speak, Read",
    template: "%s · WordWeave",
  },
  description:
    "英语与德语的听力、口语和语境阅读，共用一个单词库。 / Practise English and German listening, speaking and contextual reading with shared vocabulary.",
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
