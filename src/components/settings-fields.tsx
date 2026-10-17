"use client";
import type { Settings } from "@/lib/schemas";
const topics = [
  "购物",
  "通勤",
  "同事交流",
  "租房",
  "咖啡",
  "电影",
  "足球",
  "旅行",
];
export function SettingsFields({
  mode,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  mode: string;
  value: Settings;
  onChange: (value: Settings) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const set = (key: keyof Settings, next: Settings[keyof Settings]) =>
    onChange({ ...value, [key]: next });
  if (mode === "tech")
    return (
      <fieldset disabled={disabled} className="settings-fields">
        <legend>英文保留量</legend>
        <div className="segmented">
          {[
            ["low", "少"],
            ["medium", "中"],
            ["high", "多"],
          ].map(([v, label]) => (
            <button
              type="button"
              key={v}
              className={value.retention === v ? "selected" : ""}
              aria-pressed={value.retention === v}
              onClick={() => set("retention", v as Settings["retention"])}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="field-hint">
          保留有用的搭配与完整表达。调整后点击生成才会调用 API。
        </p>
      </fieldset>
    );
  return (
    <div className="settings-fields">
      <div className="form-row">
        <label>
          德语难度
          <select
            disabled={disabled}
            value={value.level}
            onChange={(e) => set("level", e.target.value as Settings["level"])}
          >
            <option>A1</option>
            <option>A2</option>
            <option>B1</option>
          </select>
        </label>
        <label>
          阅读时长
          <select
            disabled={disabled}
            value={value.minutes}
            onChange={(e) =>
              set("minutes", e.target.value as Settings["minutes"])
            }
          >
            <option value="3-5">3–5 分钟</option>
            <option value="5-8">5–8 分钟</option>
          </select>
        </label>
        <label>
          每篇新词
          <select
            disabled={disabled || value.reviewOnly}
            value={value.newWordCount}
            onChange={(e) =>
              set(
                "newWordCount",
                Number(e.target.value) as Settings["newWordCount"],
              )
            }
          >
            <option value={3}>3 个</option>
            <option value={5}>5 个</option>
            <option value={8}>8 个</option>
          </select>
        </label>
      </div>
      {!compact && (
        <>
          <label>
            今天想读什么？
            <div className="topic-chips">
              {topics.map((t) => (
                <button
                  type="button"
                  disabled={disabled}
                  key={t}
                  className={value.topic === t ? "chip selected" : "chip"}
                  onClick={() => set("topic", t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              disabled={disabled}
              value={value.topic}
              maxLength={120}
              onChange={(e) => set("topic", e.target.value)}
              placeholder="也可以输入一个自己的主题"
            />
          </label>
        </>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.reviewOnly}
          onChange={(e) => set("reviewOnly", e.target.checked)}
        />
        <span>只复习，不加新词</span>
      </label>
      <label>
        指定学习词{" "}
        <span className="muted normal">（可选，用逗号分隔，填写词典原形）</span>
        <input
          disabled={disabled || value.reviewOnly}
          value={value.requestedWords}
          onChange={(e) => set("requestedWords", e.target.value)}
          maxLength={300}
          placeholder="例如：Bahnhof, umsteigen, pünktlich"
        />
      </label>
    </div>
  );
}
