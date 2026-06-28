"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type Option = { value: string; label: string };

/**
 * Native-select-backed pill dropdown (Figma 30:15714 "Ubicación"/"Sector").
 * Writes/clears ?<param>= via router.replace inside a transition so the RSC
 * list re-renders server-side — no client data fetching. The control itself
 * is neutral (not an action); only its focus ring is accent.
 */
export function FilterSelect({
  param,
  label,
  allLabel,
  options,
}: {
  param: string;
  label: string;
  allLabel: string;
  options: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = searchParams.get(param) ?? "";

  const onChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(param, value);
      else next.delete(param);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams, param],
  );

  const selected = options.find((o) => o.value === current);

  return (
    <div
      data-pending={isPending || undefined}
      className="relative inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3.5 py-2 text-[13px] font-medium text-neutral-700 focus-within:ring-2 focus-within:ring-accent/40"
    >
      <span className="max-w-[120px] truncate">
        {selected ? selected.label : label}
      </span>
      <ChevronDown />
      <select
        aria-label={label}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-neutral-500"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
