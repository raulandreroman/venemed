import type { CenterType } from "@/db/admin-queries";
import type { CenterStatus } from "@/lib/auth/current-center";

/**
 * center_type enum → Spanish label, matching the Figma admin frames
 * (A2 `51:1869` / A3 `53:1123`). Distinct from the donor-facing
 * `centerTypeLabel` in `@/lib/format` (which uses shorter labels) — the
 * moderation surface shows the fuller institutional names the designers wrote.
 * `import type` only, so this stays safe to import from client components.
 */
export const CENTER_TYPE_LABEL: Record<CenterType, string> = {
  hospital: "Hospital público",
  clinic: "Clínica",
  elder_care_home: "Casa adultos mayores",
  childrens_shelter: "Casa hogar / refugio",
  collection_center: "Centro de acopio",
};

export function centerTypeLabel(type: CenterType): string {
  return CENTER_TYPE_LABEL[type] ?? type;
}

/** center.status → Spanish status-pill label. */
export const STATUS_LABEL: Record<CenterStatus, string> = {
  pending_review: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  suspended: "Suspendido",
};

/** moderation_event.action → Spanish history label. */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    approved: "Aprobado",
    rejected: "Rechazado",
    suspended: "Suspendido",
    expired_by_cron: "Vencido automáticamente",
  };
  return map[action] ?? action;
}
