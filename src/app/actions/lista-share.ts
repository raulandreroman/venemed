"use server";

import type { ShareSheetData } from "@/components/share/share-sheet";
import { getListaById } from "@/db/queries";
import { partitionShareItems } from "@/lib/listas/share-text";

/**
 * Lazy-fetch the share payload for a lista at "Compartir" tap-time. The donor
 * list card only carries the lightweight, CDN-cached `ListaCardData`, so it
 * doesn't hold the address / reception-contact / quantities that the share
 * bottom-sheet (WhatsApp text) needs. Rather than bloat the surge-path card
 * payload with those fields, the card calls this action on tap and opens the
 * sheet once it resolves.
 *
 * Read-only: reuses the cached `getListaById` (same query the detail page uses),
 * so it does NOT revalidate anything. Returns null for a missing / non-active
 * lista (the caller degrades to a silent no-op — gotcha #5).
 */
export async function getListaShareData(
  listaId: string,
): Promise<ShareSheetData | null> {
  const req = await getListaById(listaId);
  if (!req) return null;

  return {
    centerName: req.centerName,
    city: req.city,
    ...partitionShareItems(req.items),
    addressLine: req.center.addressLine,
    landmark: req.receptionLandmark,
    receptionContactName: req.receptionContactName,
    receptionContactPhone: req.receptionContactPhone,
    updatedAt: req.updatedAt,
  };
}
