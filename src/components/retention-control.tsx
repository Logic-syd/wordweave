"use client";

import { ui } from "@/lib/ui";
import type { Settings } from "@/lib/schemas";

export function RetentionControl({
  value,
  onChange,
  disabled = false,
  hint = ui("保留有用的搭配与完整表达。调整后点击生成才会调用 API。"),
}: {
  value: Settings["retention"];
  onChange: (value: Settings["retention"]) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <fieldset disabled={disabled} className="settings-fields retention-control">
      <legend>{ui("英文保留量")}</legend>
      <div className="segmented">
        {(
          [
            ["low", "少", "Low"],
            ["medium", "中", "Medium"],
            ["high", "多", "High"],
          ] as const
        ).map(([level, zh, en]) => (
          <button
            type="button"
            key={level}
            aria-label={`${zh} / ${en}`}
            aria-pressed={value === level}
            className={value === level ? "selected" : ""}
            onClick={() => onChange(level)}
          >
            <span>{zh}</span>
            <small lang="en">{en}</small>
          </button>
        ))}
      </div>
      <p className="field-hint">{hint}</p>
    </fieldset>
  );
}
