import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui";
import { getCenterRequests, type CenterRequestCardData } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";

import { CenterRequestCard } from "./_components/center-request-card";
import { DashboardHeader } from "./_components/dashboard-header";

const CREATE_HREF = "/centro/solicitudes/nueva";

type SearchParams = { estado?: string };

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "activas", label: "Activas" },
  { value: "inactivas", label: "Inactivas" },
] as const;

/**
 * Center dashboard (Figma 8:1009). Read-only: the center's own requests scoped
 * server-side by center_id, split into Activas (active/paused) and Inactivas
 * (closed/expired), with a Todas/Activas/Inactivas filter bar (URL `?estado=`).
 */
export default async function CenterDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "approved" → render dashboard

  const { estado } = await searchParams;
  const filter =
    estado === "activas" || estado === "inactivas" ? estado : "todas";

  const requests = await getCenterRequests(center.centerId);
  const isEmpty = requests.length === 0;
  const activas = requests.filter(
    (r) => r.status === "active" || r.status === "paused",
  );
  const inactivas = requests.filter(
    (r) => r.status === "closed" || r.status === "expired",
  );

  // Under "todas" hide an empty section; under a specific tab show its empty note.
  const showActivas =
    filter === "activas" || (filter === "todas" && activas.length > 0);
  const showInactivas =
    filter === "inactivas" || (filter === "todas" && inactivas.length > 0);

  return (
    <>
      <DashboardHeader centerName={center.centerName} />

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <main className="flex flex-1 flex-col gap-5 px-4 pb-24 pt-4">
            <FilterChips active={filter} />

            {showActivas && (
              <RequestSection
                title="Solicitudes activas"
                requests={activas}
                emptyText="No tienes solicitudes activas."
              />
            )}
            {showInactivas && (
              <RequestSection
                title="Solicitudes inactivas"
                requests={inactivas}
                emptyText="No tienes solicitudes inactivas."
              />
            )}
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

function FilterChips({ active }: { active: string }) {
  return (
    <div className="flex gap-2">
      {FILTERS.map((f) => {
        const isActive = active === f.value;
        const href = f.value === "todas" ? "/centro" : `/centro?estado=${f.value}`;
        return (
          <Link
            key={f.value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent text-accent-on"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}

function RequestSection({
  title,
  requests,
  emptyText,
}: {
  title: string;
  requests: CenterRequestCardData[];
  emptyText: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
      {requests.length > 0 ? (
        requests.map((r) => <CenterRequestCard key={r.id} request={r} />)
      ) : (
        <p className="py-4 text-sm text-neutral-500">{emptyText}</p>
      )}
    </section>
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
