"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type Option = { value: string; label: string };

/**
 * Donor category filter (field-insight-whatsapp §2 "Categorías v2 · filtro
 * donante") — a horizontally-scrollable chip row rather than a `FilterSelect`
 * dropdown: ~8 options, one tap, scannable. Server-driven via `?category=`
 * (the `arrayContains` query already narrows centers, not items), written with
 * `router.replace` inside a transition so the RSC list re-renders server-side —
 * the same param pattern as `FilterSelect`/`SortToggle`. Selecting the active
 * chip clears the filter. Single-accent principle: the selected chip is the
 * only accent-filled control; the rest are neutral.
 */
export function CategoryChips({ options }: { options: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = searchParams.get("category") ?? "";

  const select = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      // Tapping the already-selected chip toggles the filter off.
      if (value && value !== current) next.set("category", value);
      else next.delete("category");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams, current],
  );

  const chips: Option[] = [{ value: "", label: "Todas" }, ...options];

  return (
    <div
      role="group"
      aria-label="Filtrar por categoría"
      data-pending={isPending || undefined}
      className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((chip) => {
        const active = current === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => select(chip.value)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "border-accent bg-accent text-accent-on"
                : "border-neutral-300 bg-surface text-neutral-700 hover:border-neutral-400"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
