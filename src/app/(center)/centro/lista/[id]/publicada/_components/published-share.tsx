"use client";

import {
  ShareOptions,
  type ShareSheetData,
} from "@/components/share/share-sheet";

/**
 * Share block for the "Lista publicada" confirm screen (Figma 32:5064). The
 * three share options (WhatsApp text / image / copy link) render INLINE —
 * sharing is the whole point of this screen, so no extra sheet hop
 * (field-insight-whatsapp §4).
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
  return <ShareOptions listaId={listaId} path={path} data={data} />;
}
