"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Debounced search input. Writes ?search= so the RSC list re-renders
 * server-side (no client data fetching). Placeholder per Figma 30:15734.
 */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const [isPending, startTransition] = useTransition();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) next.set("search", trimmed);
      else next.delete("search");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      data-pending={isPending || undefined}
      className="flex h-[52px] w-full items-center gap-2.5 rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 text-neutral-700 focus-within:border-2 focus-within:border-accent"
    >
      <SearchIcon />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por centro, ciudad o ayuda…"
        aria-label="Buscar listas"
        // text-base (16px) — iOS Safari zooms the viewport on focus for any
        // input under 16px; keep it ≥16px to prevent the zoom (issue #66).
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-neutral-500"
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-neutral-500"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
