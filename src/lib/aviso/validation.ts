/**
 * Aviso de exceso (surplus-as-banner) payload + validation. Like
 * `@/lib/solicitudes/validation` this is an isomorphic, no-dependency module
 * (NOT a "use server" file), so exporting types/consts here is fine — gotcha #1
 * only applies to `@/app/(center)/actions/aviso.ts`, which imports
 * `PublishAvisoInput` via `import type`.
 *
 * An aviso IS a request(kind='surplus') under the hood: the reason reuses
 * `request.title` (≤40, optional) and the window reuses `window_hours` —
 * 12/24/48 h OR "Sin límite" (nullable `window_hours` + null `expires_at`, never
 * auto-cleared by the expiry cron). Because SegmentedControl's value can't be
 * `null` (its generic is `string | number`), the picker carries a string
 * sentinel `"sin-limite"`; the action maps it to `windowHours = null`.
 */

import type { PublishRequestItemInput } from "@/lib/solicitudes/validation";

export const AVISO_REASON_MAX = 40;

/** The "Sin límite" sentinel used by the window picker (no null in the control). */
export const SIN_LIMITE = "sin-limite" as const;
export type SinLimite = typeof SIN_LIMITE;

/** 12/24/48 h or "Sin límite" — the window options shown in the aviso form. */
export const AVISO_WINDOW_OPTIONS = [12, 24, 48, SIN_LIMITE] as const;
export type WindowChoice = 12 | 24 | 48 | SinLimite;

export type PublishAvisoInput = {
  /** optional reason (≤40), stored in request.title. */
  reason?: string;
  windowChoice: WindowChoice;
  /** the insumos the center is NOT accepting — at least one. */
  items: PublishRequestItemInput[];
  /** client-generated, stable per attempt → dedupes a double-submit. */
  idempotencyKey: string;
};

export type AvisoFieldErrors = Partial<
  Record<"reason" | "windowChoice" | "items", string>
>;

export function isWindowChoice(value: unknown): value is WindowChoice {
  return (
    value === SIN_LIMITE ||
    (typeof value === "number" &&
      (AVISO_WINDOW_OPTIONS as readonly unknown[]).includes(value))
  );
}

export function validateAviso(input: PublishAvisoInput): AvisoFieldErrors {
  const errors: AvisoFieldErrors = {};

  // Reason is OPTIONAL (the items are the descriptor); only length-bound it.
  const reason = input.reason?.trim() ?? "";
  if (reason.length > AVISO_REASON_MAX)
    errors.reason = `Máximo ${AVISO_REASON_MAX} caracteres.`;

  if (!isWindowChoice(input.windowChoice))
    errors.windowChoice = "Selecciona la ventana de tiempo.";

  const items = input.items ?? [];
  if (items.length === 0) {
    errors.items = "Agrega al menos un insumo.";
  } else {
    const allValid = items.every((it) => {
      const hasSupply = !!it.supplyId;
      const hasCustom = !!it.customName?.trim();
      return hasSupply !== hasCustom; // exactly one of the two
    });
    if (!allValid) errors.items = "Hay un insumo inválido.";
  }

  return errors;
}
