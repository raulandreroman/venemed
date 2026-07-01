"use client";

import { useCallback } from "react";

import { recordShare } from "@/app/actions/share";
import { Button } from "@/components/ui";

/**
 * "Compartir lista" sticky footer button (Figma dashboard v2 210:11795).
 * Native-shares the PUBLIC donor link when available, falling back to
 * clipboard (secure-context caveat — gotcha #5, only works on HTTPS/localhost)
 * — fire-and-forget `recordShare` mirrors `PublishedShare`/`ShareCardButton`.
 */
export function ShareListaButton({ listaId }: { listaId: string }) {
  const onClick = useCallback(async () => {
    const message = "Ayuda al centro en VeneMed:";
    const url = new URL(`/listas/${listaId}`, window.location.origin).toString();

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url });
        recordShare(listaId, "unknown").catch(() => {});
        return;
      } catch {
        // cancelled/unsupported — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      recordShare(listaId, "copy_link").catch(() => {});
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  }, [listaId]);

  return (
    <Button type="button" variant="outline" fullWidth onClick={onClick}>
      <ShareIcon />
      Compartir lista
    </Button>
  );
}

function ShareIcon() {
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
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
