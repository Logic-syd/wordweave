"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import {
  lessonKey,
  savedLessons,
  saveLesson,
  type Lesson,
} from "@/lib/saved-lessons";

export function SaveLessonButton({ lesson }: { lesson: Lesson }) {
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const key = lessonKey(lesson);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void savedLessons()
        .then((items) => {
          if (live) setSaved(items.some((item) => lessonKey(item) === key));
        })
        .catch(() => {
          if (live)
            setError(
              "无法读取收藏，请允许浏览器存储。 / Allow browser storage to save items.",
            );
        });
    };
    refresh();
    window.addEventListener("wordweave:local-data", refresh);
    return () => {
      live = false;
      window.removeEventListener("wordweave:local-data", refresh);
    };
  }, [key]);
  return (
    <div className="lesson-save">
      <button
        type="button"
        className="button secondary"
        disabled={saved || busy}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await saveLesson(lesson);
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败 / Save failed");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
        {saved
          ? "已保存到我的库 / Saved"
          : busy
            ? "正在保存 / Saving"
            : "保存到我的库 / Save to my library"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function DailyLessonBar({
  day,
  lesson,
}: {
  day: string;
  lesson: Lesson;
}) {
  const title = {
    listen: "今日听力 / Daily listening",
    speak: "今日口语 / Daily speaking",
    read: "今日阅读 / Daily reading",
  }[lesson.skill];
  return (
    <section
      className="daily-lesson"
      aria-label="每日精选"
      data-day={day}
      data-content-id={lesson.contentId}
    >
      <div>
        <strong>{title}</strong>
        <small>
          <time>{day}</time> · 精选轮换 / Curated rotation
        </small>
      </div>
      <SaveLessonButton key={lessonKey(lesson)} lesson={lesson} />
      <Link className="daily-library-link" href="/library">
        我的库 / My library →
      </Link>
    </section>
  );
}
