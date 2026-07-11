"use client";

import { useState } from "react";

import { ShareSheet, type ShareSheetData } from "@/components/share/share-sheet";
import { Button } from "@/components/ui";

/**
 * Share block for the "Lista publicada" confirm screen (Figma 32:5064). Opens
 * the shared share bottom-sheet (WhatsApp text / image / copy link) —
 * field-insight-whatsapp §4 — the same sheet the dashboard and donor detail use.
 */
export function PublishedShare({
  listaId,
  path,
  data,
}: {
  listaId: string;
  path: string;
  data: ShareSheetData;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" fullWidth onClick={() => setOpen(true)}>
        <ShareIcon />
        Compartir lista
      </Button>
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        listaId={listaId}
        path={path}
        data={data}
      />
    </>
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
