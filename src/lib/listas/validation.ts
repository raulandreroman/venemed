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
};

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
      // exactly one of supplyId/customName
      return hasSupply !== hasCustom && validBucket;
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
