/**
 * Publish-solicitud payload + validation. No-dependency, isomorphic (mirrors
 * `@/lib/registro/validation`) so BOTH the client form and the `publishRequest`
 * server action (defense-in-depth) re-validate from one source. This is NOT a
 * "use server" module, so exporting types/consts here is fine — gotcha #1 only
 * applies to the action file, which imports `PublishRequestInput` via
 * `import type`.
 */

export const TITLE_MAX = 40;
export const INSTRUCTIONS_MAX = 120;
export const WINDOW_OPTIONS = [12, 24, 48] as const;
export type WindowHours = (typeof WINDOW_OPTIONS)[number];

/** One selected donation item: a catalog supply OR a free-text custom name. */
export type PublishRequestItemInput = {
  supplyId?: string;
  customName?: string;
};

export type PublishRequestInput = {
  title: string;
  windowHours: number;
  deliveryInstructions?: string;
  items: PublishRequestItemInput[];
  /** client-generated, stable per attempt → dedupes a double-submit. */
  idempotencyKey: string;
};

export type PublishFieldErrors = Partial<
  Record<"title" | "windowHours" | "deliveryInstructions" | "items", string>
>;

export function isWindowHours(value: unknown): value is WindowHours {
  return (
    typeof value === "number" &&
    (WINDOW_OPTIONS as readonly number[]).includes(value)
  );
}

export function validatePublishRequest(
  input: PublishRequestInput,
): PublishFieldErrors {
  const errors: PublishFieldErrors = {};

  const title = input.title?.trim() ?? "";
  if (!title) errors.title = "Escribe un título para la solicitud.";
  else if (title.length > TITLE_MAX)
    errors.title = `Máximo ${TITLE_MAX} caracteres.`;

  if (!isWindowHours(input.windowHours))
    errors.windowHours = "Selecciona la ventana de tiempo.";

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
