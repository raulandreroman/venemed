import Link from "next/link";
import { redirect } from "next/navigation";

import { ListaItemSections } from "@/components/lista/lista-item-sections";
import { Button } from "@/components/ui";
import { getCenterDashboardLista } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { formatUpdatedAgo, isListaStale } from "@/lib/format";
import { partitionShareItems } from "@/lib/listas/share-text";

import { ConnectionBanner } from "./_components/connection-banner";
import { DashboardError } from "./_components/dashboard-error";
import { DashboardHeader } from "./_components/dashboard-header";
import { FreshnessCard } from "./_components/freshness-card";
import { ModoOperadorBanner } from "./_components/modo-operador-banner";
import { ReactivateButton } from "./_components/reactivate-button";
import { ShareListaButton } from "./_components/share-lista-button";

const EDITOR_HREF = "/centro/lista/editar";

/**
 * Center dashboard v2 (Figma 210:11795 · needs-only 210:13213 · vacío
 * 210:13030 · error 210:13091). lista-model-v2: one evergreen lista per
 * center, no windows/countdown — the read is a single `getCenterDashboardLista`
 * call (uncached, center-scoped), not a filtered list.
 */
export default async function CenterDashboardPage() {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "approved" → render dashboard

  // Only the Responsable (center_admin) can invite — the equipo page is
  // requireResponsable-gated, so an Operador shortcut would be a dead link.
  const canInvite = center.role === "center_admin";

  let lista;
  try {
    lista = await getCenterDashboardLista(center.centerId);
  } catch {
    return (
      <>
        <DashboardHeader centerName={center.centerName} canInvite={canInvite} />
        <ConnectionBanner />
        {center.role === "center_member" && (
          <div className="px-4 pt-4">
            <ModoOperadorBanner />
          </div>
        )}
        <DashboardError />
      </>
    );
  }

  if (!lista) {
    return (
      <>
        <DashboardHeader centerName={center.centerName} canInvite={canInvite} />
        <ConnectionBanner />
        {center.role === "center_member" && (
          <div className="px-4 pt-4">
            <ModoOperadorBanner />
          </div>
        )}
        <EmptyState />
      </>
    );
  }

  const insumos = lista.items.filter((it) => it.bucket === "need").length;
  const urgentes = lista.items.filter(
    (it) => it.bucket === "need" && it.isUrgent,
  ).length;
  const noAceptados = lista.items.filter((it) => it.bucket === "excess").length;
  const updatedAgo = formatUpdatedAgo(lista.updatedAt);
  const stale = isListaStale(lista.updatedAt);
  // Figma vista Operador (209:4338) sits on white (surface); responsable
  // dashboards keep the #f7f8fa page background (layout default).
  const isOperador = center.role === "center_member";
  const pageBg = isOperador ? "bg-surface" : "bg-background";

  return (
    <>
      <DashboardHeader centerName={center.centerName} canInvite={canInvite} />
      <ConnectionBanner />

      <main className={`flex flex-1 flex-col gap-5 px-4 pb-24 pt-4 ${pageBg}`}>
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {insumos} {insumos === 1 ? "insumo" : "insumos"} · {urgentes}{" "}
            {urgentes === 1 ? "urgente" : "urgentes"} · {noAceptados}{" "}
            {noAceptados === 1 ? "no aceptado" : "no aceptados"}
          </p>
          <p className="text-sm text-neutral-500">Actualizada {updatedAgo}</p>
        </div>

        {lista.status === "paused" && (
          <div className="rounded-2xl border border-warning/20 bg-warning-tint p-4">
            <h2 className="text-base font-bold text-neutral-900">
              Recepción pausada
            </h2>
            <p className="mt-1 text-sm text-neutral-700">
              Tu lista está en pausa y no es visible para donantes. Reactívala
              para volver a recibir ayuda.
            </p>
          </div>
        )}

        {stale && <FreshnessCard updatedAgo={updatedAgo} />}

        {isOperador && <ModoOperadorBanner />}

        <ListaItemSections
          items={lista.items}
          truncateAt={4}
          className="flex flex-col gap-4"
          emptyExcessSlot={
            <Link
              href="/centro/lista/editar?paso=exceso"
              className="self-start text-sm font-semibold text-accent hover:underline"
            >
              + Avisar lo que tienes en exceso
            </Link>
          }
        />
      </main>

      <footer
        className={`sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-100 px-4 py-3 ${pageBg}`}
      >
        <Button href={EDITOR_HREF} fullWidth>
          Editar lista
        </Button>
        {lista.status === "paused" ? (
          <ReactivateButton requestId={lista.id} receptionPaused />
        ) : (
          <ShareListaButton
            listaId={lista.id}
            data={{
              centerName: center.centerName,
              city: lista.city,
              ...partitionShareItems(lista.items),
              addressLine: lista.addressLine,
              landmark: lista.receptionLandmark,
              receptionContactName: lista.receptionContactName,
              receptionContactPhone: lista.receptionContactPhone,
              updatedAt: lista.updatedAt,
            }}
          />
        )}
      </footer>
    </>
  );
}

/** Empty state (Figma "Vacío" 210:13030). The centered CTA replaces the sticky
 * footer — no lista published yet. */
function EmptyState() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <BoxIcon />
      </span>
      <h2 className="text-xl font-bold text-neutral-900">
        Aún no tienes una lista
      </h2>
      <p className="max-w-[300px] text-sm text-neutral-500">
        Crea tu primera lista para que los donantes sepan exactamente qué
        necesita el centro ahora mismo.
      </p>
      <Button href={EDITOR_HREF}>
        <PlusIcon />
        Crear mi primera lista
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
