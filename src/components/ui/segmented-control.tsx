"use client";

import type { ReactNode } from "react";

/**
 * Equal-segment toggle on a neutral track (Figma 32:4929 "Ventana de tiempo").
 * Controlled local-state primitive (NOT the URL-driven Chip): selected segment
 * is a raised white card with accent text; the rest are transparent neutral.
 * Built reusable — slice 3 "Extender ventana" re-opens the same control.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full gap-1 rounded-xl bg-neutral-100 p-1"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
              selected
                ? "bg-surface text-accent shadow-sm"
                : "bg-transparent text-neutral-700 hover:text-neutral-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
