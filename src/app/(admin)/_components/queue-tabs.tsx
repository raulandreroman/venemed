import Link from "next/link";
import type { CenterStatus } from "@/lib/auth/current-center";

export type QueueTab = "pendientes" | "aprobados" | "rechazados";

export const TABS: { key: QueueTab; label: string; status: CenterStatus }[] = [
  { key: "pendientes", label: "Pendientes", status: "pending_review" },
  { key: "aprobados", label: "Aprobados", status: "approved" },
  { key: "rechazados", label: "Rechazados", status: "rejected" },
];

export function tabToStatus(tab: string | undefined): {
  tab: QueueTab;
  status: CenterStatus;
} {
  const match = TABS.find((t) => t.key === tab) ?? TABS[0];
  return { tab: match.key, status: match.status };
}

/**
 * A2 queue tabs (Figma `51:1869`). Pure RSC — tab state lives in the URL
 * (`?tab=`), so switching re-renders the server list with no client data
 * fetching. Active tab uses the accent (an action/selected affordance,
 * single-accent compliant); the pending-count badge is accent-subtle.
 */
export function QueueTabs({
  active,
  pendingCount,
}: {
  active: QueueTab;
  pendingCount: number;
}) {
  return (
    <nav className="flex border-b border-neutral-100 bg-surface">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-sm font-semibold transition-colors ${
              isActive
                ? "border-accent text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
            {t.key === "pendientes" && pendingCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-subtle px-1.5 text-xs font-semibold text-accent">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
