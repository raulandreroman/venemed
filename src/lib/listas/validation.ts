/**
 * Publish-lista payload + validation. No-dependency, isomorphic (mirrors
 * `@/lib/registro/validation`) so BOTH the client form and the `publishLista`
 * server action (defense-in-depth) re-validate from one source. This is NOT a
 * "use server" module, so exporting types/consts here is fine — gotcha #1 only
 * applies to the action file, which imports `PublishListaInput` via
 * `import type`.
 */

export const INSTRUCTIONS_MAX = 120;
export const EXCESS_REASON_MAX = 40;

/** One selected donation item: a catalog supply OR a free-text custom name,
 * bucketed as a need (donor should bring) or an excess (donor should NOT
 * bring). `isUrgent` is meaningful only for `bucket === "need"`. */
export type PublishListaItemInput = {
  supplyId?: string;
  customName?: string;
  bucket: "need" | "excess";
  isUrgent?: boolean;
  /** Optional positive quantity, need-bucket only (unit implied by the name).
   * Ignored/nulled for excess. */
  quantity?: number;
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
  items: PublishListaItemInput[];
  /** client-generated, stable per attempt → dedupes a double-submit. */
  idempotencyKey: string;
};

export type PublishFieldErrors = Partial<
  Record<"deliveryInstructions" | "excessReason" | "items", string>
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
      // exactly one of supplyId/customName
      return hasSupply !== hasCustom && validBucket && validQuantity;
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
