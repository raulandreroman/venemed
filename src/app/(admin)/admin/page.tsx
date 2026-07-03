import Link from "next/link";

import { Card, Tag } from "@/components/ui";
import {
  listCentersByStatus,
  type CenterQueueRow,
} from "@/db/admin-queries";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import { formatRelativeTime, isOlderThanHours } from "@/lib/format";

import { AdminToast } from "../_components/admin-toast";
import { centerTypeLabel } from "../_components/labels";
import { QueueTabs, tabToStatus, type QueueTab } from "../_components/queue-tabs";

type SearchParams = { tab?: string; done?: string };

/**
 * A2 · Moderation queue (Figma `51:1869`). All centers of the active tab's
 * status, newest first. Tab state lives in `?tab=` (RSC, no client state).
 */
export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { tab } = await searchParams;
  const { tab: activeTab, status } = tabToStatus(tab);

  // Active-tab rows + the pending count for the tab badge (reuse rows when the
  // active tab IS pendientes to avoid a second query).
  const rows = await listCentersByStatus(status);
  const pendingCount =
    status === "pending_review"
      ? rows.length
      : (await listCentersByStatus("pending_review")).length;

  const updatedLabel = freshnessLabel(rows);

  return (
    <>
      {/* Header — centered two-line title, flanked by spacers. */}
      <header className="sticky top-0 z-10 border-b border-neutral-100 bg-surface">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="h-9 w-9" />
          <div className="flex flex-col items-center">
            <h1 className="text-base font-semibold text-neutral-900">
              Moderación
            </h1>
            <p className="text-xs text-neutral-500">{updatedLabel}</p>
          </div>
          {/* Balances the left spacer so the title stays centered. */}
          <span className="h-9 w-9" />
        </div>
        <QueueTabs active={activeTab} pendingCount={pendingCount} />
      </header>

      <main className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <ul className="flex flex-col gap-3 p-4">
            {rows.map((c) => (
              <li key={c.id}>
                <QueueRow center={c} tab={activeTab} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <AdminToast />
    </>
  );
}

function QueueRow({ center: c, tab }: { center: CenterQueueRow; tab: QueueTab }) {
  const isUrgent = tab === "pendientes" && isOlderThanHours(c.createdAt, 24);

  return (
    <Link href={`/admin/centros/${c.id}`} className="block">
      <Card className="flex items-center gap-3 transition-colors hover:bg-neutral-50">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-semibold text-neutral-900">
              {c.name}
            </p>
            {isUrgent && (
              <Tag variant="soon" className="shrink-0">
                <ClockGlyph /> Urgente
              </Tag>
            )}
          </div>
          <p className="truncate text-sm text-neutral-500">
            {CENTER_TYPE_ENABLED && c.type
              ? `${centerTypeLabel(c.type)} · ${c.city}`
              : c.city}
          </p>
          <p className="mt-1.5 text-sm text-neutral-700">{metaLine(c, tab)}</p>
        </div>
        <span aria-hidden className="shrink-0 text-neutral-400">
          <Chevron />
        </span>
      </Card>
    </Link>
  );
}

function metaLine(c: CenterQueueRow, tab: QueueTab): string {
  if (tab === "aprobados") {
    return `Aprobado ${formatRelativeTime(c.verifiedAt ?? c.updatedAt)}`;
  }
  if (tab === "rechazados") {
    return `Rechazado ${formatRelativeTime(c.updatedAt)}`;
  }
  return `Solicitado ${formatRelativeTime(c.createdAt)}`;
}

function freshnessLabel(rows: CenterQueueRow[]): string {
  if (rows.length === 0) return "Actualizado ahora";
  const freshest = rows.reduce((max, r) => {
    const t = Math.max(
      r.createdAt.getTime(),
      r.updatedAt.getTime(),
      r.verifiedAt?.getTime() ?? 0,
    );
    return t > max ? t : max;
  }, 0);
  return `Actualizado ${formatRelativeTime(new Date(freshest))}`;
}

const EMPTY_COPY: Record<QueueTab, { title: string; sub: string }> = {
  pendientes: {
    title: "No hay centros por revisar",
    sub: "Cuando un centro se registre aparecerá aquí.",
  },
  aprobados: {
    title: "Aún no hay centros aprobados",
    sub: "Los centros que apruebes aparecerán aquí.",
  },
  rechazados: {
    title: "Aún no hay centros rechazados",
    sub: "Los centros que rechaces aparecerán aquí.",
  },
};

function EmptyState({ tab }: { tab: QueueTab }) {
  const copy = EMPTY_COPY[tab];
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <InboxGlyph />
      </span>
      <p className="mt-4 text-base font-semibold text-neutral-900">
        {copy.title}
      </p>
      <p className="mt-1 text-sm text-neutral-500">{copy.sub}</p>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function InboxGlyph() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}
