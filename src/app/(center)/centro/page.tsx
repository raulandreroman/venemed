import { redirect } from "next/navigation";

import { Button, Card } from "@/components/ui";
import {
  getCenterDashboardStats,
  getCenterRequests,
} from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";

import { CenterRequestCard } from "./_components/center-request-card";
import { DashboardHeader } from "./_components/dashboard-header";

const CREATE_HREF = "/centro/solicitudes/nueva"; // slice 2; 404 for now is fine

/**
 * Center dashboard (Figma 32:4898 / empty 32:4873). Read-only: the center's own
 * stats + requests, scoped server-side by center_id. The create flow is slice 2.
 */
export default async function CenterDashboardPage() {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "approved" → render dashboard

  const [stats, requests] = await Promise.all([
    getCenterDashboardStats(center.centerId),
    getCenterRequests(center.centerId),
  ]);

  const isEmpty = requests.length === 0;

  return (
    <>
      <DashboardHeader centerName={center.centerName} />

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <main className="flex flex-1 flex-col gap-4 px-4 pb-24 pt-4">
            {/* stat tiles */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Solicitudes activas" value={stats.activas} />
              <StatTile label="Por vencer" value={stats.porVencer} accent />
            </div>

            {/* requests */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold text-neutral-900">
                Tus solicitudes
              </h2>
              {requests.map((r) => (
                <CenterRequestCard key={r.id} request={r} />
              ))}
            </section>
          </main>

          {/* sticky create CTA */}
          <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
            <Button href={CREATE_HREF} fullWidth>
              <PlusIcon />
              Crear solicitud
            </Button>
          </footer>
        </>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span
        className={`text-3xl font-bold ${accent ? "text-warning" : "text-neutral-900"}`}
      >
        {value}
      </span>
      <span className="text-sm text-neutral-500">{label}</span>
    </Card>
  );
}

/** Empty state — Figma 4b (32:4873). The centered CTA replaces the sticky footer. */
function EmptyState() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <BoxIcon />
      </span>
      <h2 className="text-xl font-bold text-neutral-900">
        Aún no tienes solicitudes
      </h2>
      <p className="max-w-[300px] text-sm text-neutral-500">
        Crea tu primera solicitud para que los donantes sepan exactamente qué
        necesita el centro ahora mismo.
      </p>
      <Button href={CREATE_HREF}>
        <PlusIcon />
        Crear solicitud
      </Button>
    </main>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
