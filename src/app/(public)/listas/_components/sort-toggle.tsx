"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type Sort = "recent" | "alphabetical";

const OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Reciente" },
  { value: "alphabetical", label: "Alfabético" },
];

/**
 * Sort control (Figma 30:15753 "Ordenar por"). Two options: "Reciente"
 * (fresh-first, the default — paramless canonical URL) and "Alfabético"
 * (center name A→Z, via ?sort=alphabetical).
 */
export function SortToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current: Sort =
    searchParams.get("sort") === "alphabetical" ? "alphabetical" : "recent";

  const select = useCallback(
    (value: Sort) => {
      const next = new URLSearchParams(searchParams.toString());
      // "recent" is the canonical, paramless URL; any other value sets ?sort=.
      if (value === "recent") next.delete("sort");
      else next.set("sort", value);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-neutral-500">Ordenar por</span>
      <div
        role="tablist"
        aria-label="Ordenar listas"
        data-pending={isPending || undefined}
        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1"
      >
        {OPTIONS.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(opt.value)}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-surface text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
