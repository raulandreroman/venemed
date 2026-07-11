"use client";

import { useState } from "react";

import { ShareSheet, type ShareSheetData } from "@/components/share/share-sheet";
import { Button } from "@/components/ui";

/**
 * Footer primary CTA for an active lista: "Compartir esta lista". Sharing is the
 * core donor action. Tapping it opens the share bottom-sheet (WhatsApp text /
 * image / copy link) — field-insight-whatsapp §4 — instead of firing a bare
 * navigator.share.
 */
export function ShareCtaButton({
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
      <Button variant="primary" fullWidth onClick={() => setOpen(true)}>
        Compartir esta lista
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
