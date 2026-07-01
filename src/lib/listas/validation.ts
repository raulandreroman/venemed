/**
 * Publish-lista payload + validation. No-dependency, isomorphic (mirrors
 * `@/lib/registro/validation`) so BOTH the client form and the `publishLista`
 * server action (defense-in-depth) re-validate from one source. This is NOT a
 * "use server" module, so exporting types/consts here is fine — gotcha #1 only
 * applies to the action file, which imports `PublishListaInput` via
 * `import type`.
 */

export const INSTRUCTIONS_MAX = 120;

/** One selected donation item: a catalog supply OR a free-text custom name. */
export type PublishListaItemInput = {
  supplyId?: string;
  customName?: string;
};

export type PublishListaInput = {
  deliveryInstructions?: string;
  items: PublishListaItemInput[];
  /** client-generated, stable per attempt → dedupes a double-submit. */
  idempotencyKey: string;
};

export type PublishFieldErrors = Partial<
  Record<"deliveryInstructions" | "items", string>
>;

export function validatePublishLista(
  input: PublishListaInput,
): PublishFieldErrors {
  const errors: PublishFieldErrors = {};

  const instructions = input.deliveryInstructions?.trim() ?? "";
  if (instructions.length > INSTRUCTIONS_MAX)
    errors.deliveryInstructions = `Máximo ${INSTRUCTIONS_MAX} caracteres.`;

  const items = input.items ?? [];
  if (items.length === 0) {
    errors.items = "Agrega al menos un insumo.";
  } else {
    const allValid = items.every((it) => {
      const hasSupply = !!it.supplyId;
      const hasCustom = !!it.customName?.trim();
      // exactly one of the two
      return hasSupply !== hasCustom;
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
