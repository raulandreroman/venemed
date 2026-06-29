"use client";

import { Button } from "@/components/ui";

/**
 * A2 queue error boundary. `reset()` re-runs the failed RSC render.
 */
export default function AdminQueueError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error-tint text-error">
        <WarningIcon />
      </span>
      <p className="mt-4 text-base font-semibold text-neutral-900">
        No pudimos cargar la cola.
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        Revisa tu conexión e inténtalo de nuevo.
      </p>
      <Button onClick={reset} className="mt-6">
        Reintentar
      </Button>
    </main>
  );
}

function WarningIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
