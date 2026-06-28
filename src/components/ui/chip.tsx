"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type ChipProps = {
  /** searchParams key this chip toggles, e.g. "city" | "type" | "category". */
  param: string;
  /** value written to the param when selected. */
  value: string;
  /** visible label (already localized). */
  label: string;
  className?: string;
};

/**
 * Selectable filter chip. Toggles ?<param>=<value> in the URL so the RSC list
 * re-renders server-side with new filters (no client data fetching).
 */
export function Chip({ param, value, label, className = "" }: ChipProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selected = searchParams.get(param) === value;

  const toggle = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (selected) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [router, pathname, searchParams, param, value, selected]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={selected}
      data-pending={isPending || undefined}
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        selected
          ? "border-accent bg-accent text-accent-on"
          : "border-neutral-300 bg-surface text-neutral-700 hover:bg-neutral-100"
      } ${className}`}
    >
      {label}
    </button>
  );
}

/** Non-interactive chip for card item rows ("Acetaminofén 500 mg"). */
export function ItemChip({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${
        muted
          ? "bg-neutral-100 text-neutral-500 line-through"
          : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}
