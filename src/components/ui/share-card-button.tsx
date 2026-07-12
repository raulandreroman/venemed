"use client";

import { useCallback, useState } from "react";

import { getListaShareData } from "@/app/actions/lista-share";
import { ShareSheet, type ShareSheetData } from "@/components/share/share-sheet";

import { Button } from "./button";

/**
 * Card "Compartir" affordance (Figma list 30:15714). Client Component that opens
 * the shared share bottom-sheet (Texto para WhatsApp / Imagen / Copiar enlace) —
 * the same panel the detail-view CTA uses — instead of firing a bare
 * navigator.share.
 *
 * The donor card only holds the lightweight, CDN-cached `ListaCardData`, so the
 * sheet's payload (address / reception contact / quantities) is LAZY-FETCHED on
 * tap via `getListaShareData` — showing the spinner while it loads — rather than
 * bloating the surge-path card. The fetched payload is cached in state so a
 * second tap reopens the sheet without another round-trip. A failed / empty
 * fetch degrades to a silent no-op (gotcha #5).
 */
export function ShareCardButton({
  requestId,
  path,
}: {
  requestId: string;
  path: string;
}) {
  // Busy while the share payload is fetched at tap time.
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ShareSheetData | null>(null);

  const onClick = useCallback(async () => {
    if (loading) return;
    // Reuse an already-fetched payload — no second round-trip.
    if (data) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const result = await getListaShareData(requestId);
      if (!result) return; // missing / non-active lista — silent no-op
      setData(result);
      setOpen(true);
    } catch {
      // Server action failed (offline, transient) — silent no-op.
    } finally {
      setLoading(false);
    }
  }, [loading, data, requestId]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="flex-1"
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? <SpinnerIcon /> : <ShareArrow />}
        {loading ? "Preparando…" : "Compartir"}
      </Button>
      {data && (
        <ShareSheet
          open={open}
          onClose={() => setOpen(false)}
          listaId={requestId}
          path={path}
          data={data}
        />
      )}
    </>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Up-right arrow used on the "Compartir" affordance (Figma list 30:15714). */
function ShareArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
