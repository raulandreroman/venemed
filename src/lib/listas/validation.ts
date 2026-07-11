/**
 * Publish-lista payload + validation. No-dependency, isomorphic (mirrors
 * `@/lib/registro/validation`) so BOTH the client form and the `publishLista`
 * server action (defense-in-depth) re-validate from one source. This is NOT a
 * "use server" module, so exporting types/consts here is fine — gotcha #1 only
 * applies to the action file, which imports `PublishListaInput` via
 * `import type`.
 */

import { normalizeVePhone } from "@/lib/registro/validation";

export const INSTRUCTIONS_MAX = 120;
export const EXCESS_REASON_MAX = 40;
// Reception contact (field-insight §3) — optional, opt-in.
export const RECEPTION_NAME_MAX = 80;
export const RECEPTION_LANDMARK_MAX = 120;

/** One selected donation item: a catalog supply OR a free-text custom name,
 * bucketed as a need (donor should bring) or an excess (donor should NOT
 * bring). `isUrgent` is meaningful only for `bucket === "need"`. */
export type PublishListaItemInput = {
  supplyId?: string;
  customName?: string;
  bucket: "need" | "excess";
  isUrgent?: boolean;
};

export type PublishListaInput = {
  deliveryInstructions?: string;
  excessReason?: string;
  // Reception contact (field-insight §3): who to look for on arrival. All
  // optional; the phone is published to the anonymous donor surface.
  receptionContactName?: string;
  receptionContactPhone?: string;
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
    | "receptionContactPhone"
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

  // Reception contact — all optional; only length/format when present.
  const receptionName = input.receptionContactName?.trim() ?? "";
  if (receptionName.length > RECEPTION_NAME_MAX)
    errors.receptionContactName = `Máximo ${RECEPTION_NAME_MAX} caracteres.`;

  const receptionLandmark = input.receptionLandmark?.trim() ?? "";
  if (receptionLandmark.length > RECEPTION_LANDMARK_MAX)
    errors.receptionLandmark = `Máximo ${RECEPTION_LANDMARK_MAX} caracteres.`;

  const receptionPhone = input.receptionContactPhone?.trim() ?? "";
  if (receptionPhone.length > 0 && !normalizeVePhone(receptionPhone))
    errors.receptionContactPhone = "Teléfono inválido.";

  const items = input.items ?? [];
  const hasNeed = items.some((it) => it.bucket === "need");
  if (!hasNeed) {
    errors.items = "Agrega al menos un insumo.";
  } else {
    const allValid = items.every((it) => {
      const hasSupply = !!it.supplyId;
      const hasCustom = !!it.customName?.trim();
      const validBucket = it.bucket === "need" || it.bucket === "excess";
      // exactly one of supplyId/customName
      return hasSupply !== hasCustom && validBucket;
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
