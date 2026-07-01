"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { confirmVigente } from "@/app/(center)/actions/gestionar";
import { Button } from "@/components/ui";

/**
 * "¿Sigue vigente?" freshness card (Figma dashboard v2 210:11795) — shown only
 * when the lista's `updatedAt` is stale (≥3 days, `isListaStale`, computed by
 * the server page — this component never reads `Date.now()` itself). "Sí,
 * sigue vigente" calls the real `confirmVigente` action (a content-free touch
 * of `updatedAt`) then `router.refresh()`; the dashboard read is uncached, so
 * the card disappears once the refreshed data no longer evaluates stale.
 */
export function FreshnessCard({ updatedAgo }: { updatedAgo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await confirmVigente();
      router.refresh();
    } catch {
      setError("No pudimos confirmar. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <div className="rounded-2xl bg-accent-subtle p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-accent">
          <ClockIcon />
        </span>
        <h2 className="text-[15px] font-bold text-neutral-900">
          Tu lista se actualizó {updatedAgo}
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Confirma que sigue vigente para que los donantes confíen en la
        información.
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" fullWidth disabled={pending} onClick={onConfirm}>
          {pending ? "Confirmando…" : "Sí, sigue vigente"}
        </Button>
        <Button type="button" variant="outline" fullWidth href="/centro/lista/editar">
          Editar
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ClockIcon() {
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
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
