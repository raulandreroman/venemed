/**
 * WhatsApp share-text builder (field-insight-whatsapp §4). Renders a lista as a
 * paste-ready message for WhatsApp groups — the surface where field coordination
 * actually happens. Uses WhatsApp inline markup (`*bold*` / `_italic_`), `•`
 * bullets, and blank lines between blocks. Any block with no data is omitted.
 *
 * Pure — no "use server", no client-only APIs — so it is safe to import from
 * either a Server or Client Component. The caller supplies the absolute `url`
 * (built client-side from `window.location.origin`, matching how the rest of the
 * share surfaces resolve URLs at click time).
 */
import {
  formatItemQuantity,
  formatUpdatedAgo,
  formatVePhone,
} from "@/lib/format";

export type ListaShareItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
};

export type ListaShareData = {
  centerName: string;
  city: string | null;
  /** need ∧ is_urgent — "URGENTE" block. */
  urgent: ListaShareItem[];
  /** need ∧ ¬is_urgent — "Necesitamos" block. */
  need: ListaShareItem[];
  /** excess bucket — "No aceptamos" line (names only, comma-joined, lowercase). */
  excess: ListaShareItem[];
  addressLine: string | null;
  landmark: string | null;
  receptionContactName: string | null;
  receptionContactPhone: string | null; // E.164
  updatedAt: Date | string;
  /** Absolute donor URL to /listas/[id]. */
  url: string;
};

/** Split a lista's items into the three share blocks, matching the donor-surface
 * derivation (Urgente = need ∧ urgent, Necesitamos = need ∧ ¬urgent, No
 * aceptamos = excess). Shared by every share entry point so the ordering stays
 * consistent. */
export function partitionShareItems(
  items: {
    name: string;
    bucket: "need" | "excess";
    isUrgent: boolean;
    quantity?: number | null;
    unit?: string | null;
  }[],
): Pick<ListaShareData, "urgent" | "need" | "excess"> {
  return {
    urgent: items
      .filter((it) => it.bucket === "need" && it.isUrgent)
      .map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit })),
    need: items
      .filter((it) => it.bucket === "need" && !it.isUrgent)
      .map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit })),
    excess: items
      .filter((it) => it.bucket === "excess")
      .map((it) => ({ name: it.name })),
  };
}

/** "• Comidas × 300" / "• Arroz × 20 kg" / "• Gasas" — the amount suffix (with
 * unit) only when quantity is set. */
function itemLine(it: ListaShareItem): string {
  const suffix = formatItemQuantity(it.quantity, it.unit);
  return suffix ? `• ${it.name} ${suffix}` : `• ${it.name}`;
}

/**
 * Item ordering across the message follows the donor-surface derivation:
 * urgent need → non-urgent need → excess. Each maps to its own labelled block.
 */
export function buildListaShareText(d: ListaShareData): string {
  const blocks: string[] = [];

  // Header — product label + center identity.
  blocks.push(
    [
      "*LISTA DE INSUMOS*",
      d.city ? `*${d.centerName}* — ${d.city}` : `*${d.centerName}*`,
    ].join("\n"),
  );

  if (d.urgent.length) {
    blocks.push(["*URGENTE:*", ...d.urgent.map(itemLine)].join("\n"));
  }
  if (d.need.length) {
    blocks.push(["*Necesitamos:*", ...d.need.map(itemLine)].join("\n"));
  }
  if (d.excess.length) {
    const names = d.excess.map((it) => it.name.toLowerCase()).join(", ");
    blocks.push(`*No aceptamos:* ${names}`);
  }

  // Dirección + reception contact — each line independent; block omitted when
  // nothing is set.
  const address: string[] = [];
  const addressLine = d.addressLine?.trim();
  if (addressLine) {
    address.push(
      `*Dirección:* ${d.city ? `${addressLine} · ${d.city}` : addressLine}`,
    );
  }
  const landmark = d.landmark?.trim();
  if (landmark) address.push(`Punto de referencia: ${landmark}`);
  const name = d.receptionContactName?.trim();
  const phone = d.receptionContactPhone?.trim();
  if (name || phone) {
    const recibe = [name, phone ? formatVePhone(phone) : null]
      .filter(Boolean)
      .join(" · ");
    address.push(`*Recibe:* ${recibe}`);
  }
  if (address.length) blocks.push(address.join("\n"));

  // Footer — link back to the always-current lista + freshness stamp.
  blocks.push(
    [
      "Lista completa y actualizada:",
      d.url,
      `_Actualizada ${formatUpdatedAgo(d.updatedAt)}_`,
    ].join("\n"),
  );

  return blocks.join("\n\n");
}
