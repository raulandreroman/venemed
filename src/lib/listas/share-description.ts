import type { ListaDetailData } from "@/db/queries";

/**
 * Generic count + city — never an enumeration of item names. External share
 * caches (WhatsApp, Twitter, Facebook) are sticky, so named items would go
 * stale the moment the center edits its lista. Counts mirror the donor UI's
 * bucket derivations in `detail-body.tsx` (need ∧ isUrgent = Urgente); the UI
 * counts every item regardless of `isFulfilled`, so this does too. Reused by
 * the per-lista OG image. es-VE copy.
 */
export function buildShareDescription(req: ListaDetailData): string {
  if (req.status === "closed") {
    return req.closedReason === "cancelled"
      ? "Lista cancelada · gracias por compartir"
      : "Lista cumplida · gracias por compartir";
  }

  const prefix = [req.centerName, req.city].filter(Boolean).join(" · ");

  const urgentCount = req.items.filter(
    (it) => it.bucket === "need" && it.isUrgent,
  ).length;
  if (urgentCount > 0) {
    return `${prefix} · ${urgentCount} ${
      urgentCount === 1 ? "insumo urgente" : "insumos urgentes"
    }`;
  }

  const needCount = req.items.filter((it) => it.bucket === "need").length;
  if (needCount > 0) {
    return `${prefix} · ${needCount} ${
      needCount === 1 ? "insumo necesitado" : "insumos necesitados"
    }`;
  }

  return prefix;
}
