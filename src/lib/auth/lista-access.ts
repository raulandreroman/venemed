import "server-only";
import type { CenterStatus } from "./current-center";

/**
 * Statuses allowed to own and manage a live lista.
 *
 * Moderation no longer BLOCKS a center from publishing — it ranks and labels
 * the lista on the donor surface (`ListaCardData.verified`). A `pending_review`
 * center builds, publishes, edits, reconfirms and shares its lista from the
 * moment it registers; approval only lifts the "Sin verificar" label and the
 * ordering penalty. `rejected` / `suspended` remain fully blocked.
 *
 * Team invitations deliberately stay approved-only (`equipo.ts`): letting an
 * unvetted center recruit members widens the unverified surface well past the
 * one lista this change means to unblock.
 */
export const LISTA_MANAGER_STATUSES = [
  "approved",
  "pending_review",
] as const satisfies readonly CenterStatus[];

/** True when the center may create/edit/close/share its lista. */
export function canManageLista(status: CenterStatus): boolean {
  return (LISTA_MANAGER_STATUSES as readonly CenterStatus[]).includes(status);
}
