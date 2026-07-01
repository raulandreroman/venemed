"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";

/**
 * Dashboard read failure (Figma "Error" 210:13091). Client so "Reintentar" can
 * `router.refresh()` (the dashboard read is uncached, so a refresh re-attempts
 * the query without a full reload).
 */
export function DashboardError() {
  const router = useRouter();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-error-tint text-error">
        <ErrorIcon />
      </span>
      <h2 className="text-xl font-bold text-neutral-900">
        No pudimos cargar tu lista
      </h2>
      <p className="max-w-[300px] text-sm text-neutral-500">
        Ocurrió un problema al conectar con el servidor. Inténtalo de nuevo.
      </p>
      <Button type="button" variant="outline" onClick={() => router.refresh()}>
        Reintentar
      </Button>
    </main>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}
