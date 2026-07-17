/**
 * Publish-lista payload + validation. No-dependency, isomorphic (mirrors
 * `@/lib/registro/validation`) so BOTH the client form and the `publishLista`
 * server action (defense-in-depth) re-validate from one source. This is NOT a
 * "use server" module, so exporting types/consts here is fine — gotcha #1 only
 * applies to the action file, which imports `PublishListaInput` via
 * `import type`.
 */

import { isListaItemUnit } from "@/lib/format";

export const INSTRUCTIONS_MAX = 120;
export const EXCESS_REASON_MAX = 40;
// Reception contact (field-insight §3) — optional, opt-in.
export const RECEPTION_NAME_MAX = 80;
export const RECEPTION_LANDMARK_MAX = 120;

/**
 * Category picker offered for FREE-TEXT custom insumos (field-insight-whatsapp
 * §2). `value` is a `supply_category` enum value; the chip `label` is the
 * authoring copy ("Medicinas" reads clearer than "Farmacia" here). Catalog
 * items never show the picker — their category derives from the supply. `general`
 * ("Otros") is the default when the center skips the tap. Shared by the selector
 * UI and validation so the two never drift.
 */
export const CUSTOM_CATEGORY_OPTIONS = [
  { value: "food", label: "Alimentos" },
  { value: "water", label: "Agua" },
  { value: "hygiene", label: "Higiene" },
  { value: "bedding", label: "Camas y cobijas" },
  { value: "pharmacy", label: "Medicinas" },
  { value: "general", label: "Otros" },
] as const;

export const DEFAULT_CUSTOM_CATEGORY = "general";

/** One selected donation item: a catalog supply OR a free-text custom name,
 * bucketed as a need (donor should bring) or an excess (donor should NOT
 * bring). `isUrgent` is meaningful only for `bucket === "need"`. `category` (a
 * `supply_category` enum value) is carried only for customs — the picked home
 * category; catalog items derive it from the supply and ignore this field. */
export type PublishListaItemInput = {
  supplyId?: string;
  customName?: string;
  bucket: "need" | "excess";
  isUrgent?: boolean;
  category?: string;
  /** Optional positive quantity, need-bucket only. Ignored/nulled for excess. */
  quantity?: number;
  /** Unit of measure for `quantity` (a `lista_item_unit` enum value, #101).
   * Defaults to `unidad`; only meaningful when quantity is set (need bucket). */
  unit?: string;
};

/** Max quantity — a sane upper bound so a stray keystroke can't store an absurd
 * value on a public surface. */
export const QUANTITY_MAX = 1_000_000;

/** True when q is a usable quantity: a positive integer within bounds. */
export function isValidQuantity(q: unknown): q is number {
  return (
    typeof q === "number" &&
    Number.isInteger(q) &&
    q > 0 &&
    q <= QUANTITY_MAX
  );
}

export type PublishListaInput = {
  deliveryInstructions?: string;
  excessReason?: string;
  // Reception contact (field-insight §3): who to look for on arrival. The name
  // is required (#102 C1); the per-lista phone was dropped — the donor-facing
  // reception phone is the center's whatsapp_phone (#102 C2).
  receptionContactName?: string;
  receptionLandmark?: string;
  items: PublishListaItemInput[];
  /** client-generated, stable per attempt → dedupes a double-submit. */
  idempotencyKey: string;
};

export type PublishFieldErrors = Partial<
  Record<
    | "deliveryInstructions"
    | "excessReason"
    | "receptionContactName"
    | "receptionLandmark"
    | "items",
    string
  >
>;

export function validatePublishLista(
  input: PublishListaInput,
): PublishFieldErrors {
  const errors: PublishFieldErrors = {};

  const instructions = input.deliveryInstructions?.trim() ?? "";
  if (instructions.length > INSTRUCTIONS_MAX)
    errors.deliveryInstructions = `Máximo ${INSTRUCTIONS_MAX} caracteres.`;

  const excessReason = input.excessReason?.trim() ?? "";
  if (excessReason.length > EXCESS_REASON_MAX)
    errors.excessReason = `Máximo ${EXCESS_REASON_MAX} caracteres.`;

  // Reception name is REQUIRED (#102 C1); landmark stays optional.
  const receptionName = input.receptionContactName?.trim() ?? "";
  if (receptionName.length === 0)
    errors.receptionContactName = "Agrega el nombre de quien recibe.";
  else if (receptionName.length > RECEPTION_NAME_MAX)
    errors.receptionContactName = `Máximo ${RECEPTION_NAME_MAX} caracteres.`;

  const receptionLandmark = input.receptionLandmark?.trim() ?? "";
  if (receptionLandmark.length > RECEPTION_LANDMARK_MAX)
    errors.receptionLandmark = `Máximo ${RECEPTION_LANDMARK_MAX} caracteres.`;

  const items = input.items ?? [];
  const hasNeed = items.some((it) => it.bucket === "need");
  if (!hasNeed) {
    errors.items = "Agrega al menos un insumo.";
  } else {
    const allValid = items.every((it) => {
      const hasSupply = !!it.supplyId;
      const hasCustom = !!it.customName?.trim();
      const validBucket = it.bucket === "need" || it.bucket === "excess";
      // quantity is optional; when present it must be a positive int (excess
      // items carry none — the action nulls them regardless).
      const validQuantity =
        it.quantity == null || isValidQuantity(it.quantity);
      // unit is optional; when present it must be an enum member (the action
      // coerces to the default otherwise).
      const validUnit = it.unit == null || isListaItemUnit(it.unit);
      // exactly one of supplyId/customName
      return (
        hasSupply !== hasCustom && validBucket && validQuantity && validUnit
      );
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
