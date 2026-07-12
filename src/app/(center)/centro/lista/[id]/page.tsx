import { notFound, redirect } from "next/navigation";

import { ShareSection } from "@/components/share-section";
import { AppBar, Tag } from "@/components/ui";
import type { CenterListaDetailData } from "@/db/queries";
import { getCenterListaById } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { closedReasonLabel } from "@/lib/format";

import { FinalizeButton } from "./_components/finalize-button";

/**
 * Center-side lista detail (Figma 29:3527) — distinct from the donor sheet.
 * Full page, scoped to the logged-in center: `getCenterListaById` filters by
 * center_id, so a foreign / missing id is notFound(). The status redirect guard
 * mirrors the dashboard. Active listas get the sticky Finalizar bar; terminal
 * listas render read-only.
 */
export default async function CenterRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const req = await getCenterListaById(center.centerId, id);
  if (!req) notFound();

  const isTerminal = req.status === "closed";
  const shareMessage = "Ayuda al centro en VeneMed:";

  return (
    <>
      <AppBar
        title="Detalle de solicitud"
        backHref="/centro"
        trailing={<OverflowGlyph />}
      />

      <main className="flex flex-1 flex-col px-4 pb-28 pt-4">
        {/* status chips */}
        <div className="flex flex-wrap items-center gap-2">
          {req.city && <Tag variant="neutral">{req.city}</Tag>}
          <StatusChip
            status={req.status}
            closedReason={req.closedReason}
          />
        </div>

        {/* título + meta */}
        <h1 className="mt-3 text-[22px] font-bold leading-tight text-neutral-900">
          Lista
        </h1>
        <p className="mt-1 text-sm text-neutral-500">#{req.shortId}</p>

        {/* terminal banner */}
        {isTerminal && (
          <div className="mt-4 rounded-2xl bg-neutral-100 p-4">
            <p className="font-semibold text-neutral-700">
              {req.closedReason === "fulfilled"
                ? "Esta solicitud se marcó como cumplida"
                : "Esta solicitud se cerró"}
            </p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Ya no es visible para los donantes.
            </p>
          </div>
        )}

        {/* Detalle de donación */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            Detalle de donación
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {req.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-neutral-100 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-neutral-900">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {item.category}
                  </p>
                </div>
                {item.quantity != null && (
                  <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-500">
                    × {item.quantity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Divider />

        {/* Dónde entregar */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-900">
            Dónde entregar
          </h2>
          {req.center.addressLine && (
            <p className="mt-2 text-[15px] text-neutral-900">
              {req.center.addressLine}
            </p>
          )}
          {req.center.addressReference && (
            <p className="mt-2 text-sm text-neutral-500">
              {req.center.addressReference}
            </p>
          )}
          {req.deliveryInstructions && (
            <p className="mt-2 rounded-xl bg-neutral-100 px-4 py-3 text-[15px] text-neutral-900">
              {req.deliveryInstructions}
            </p>
          )}
        </section>

        <Divider />

        {/* Cuándo entregar */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-900">
            Cuándo entregar
          </h2>
          {req.center.regularScheduleText && (
            <p className="mt-1 text-sm text-neutral-500">
              Horario regular del centro · {req.center.regularScheduleText}
            </p>
          )}
        </section>

        <Divider />

        {/* Comparte esta solicitud — public donor link */}
        <ShareSection
          requestId={req.id}
          message={shareMessage}
          path={`/listas/${req.id}`}
        />
      </main>

      {/* sticky Finalizar — active only */}
      {!isTerminal && (
        <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
          <FinalizeButton requestId={req.id} />
        </footer>
      )}
    </>
  );
}

function StatusChip({
  status,
  closedReason,
}: {
  status: CenterListaDetailData["status"];
  closedReason: CenterListaDetailData["closedReason"];
}) {
  if (status === "closed") {
    return (
      <Tag variant={closedReason === "fulfilled" ? "fulfilled" : "expired"}>
        {closedReasonLabel(closedReason)}
      </Tag>
    );
  }
  return (
    <Tag variant="fulfilled" dot>
      Activa
    </Tag>
  );
}

function Divider() {
  return <div className="my-6 border-t border-neutral-100" />;
}

/** Static overflow affordance (Figma 29:3527). Menu contents are unspecified in
 * §3.3 (deferred); rendered as a non-interactive glyph so it doesn't promise an
 * action the slice doesn't define. */
function OverflowGlyph() {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center text-neutral-700"
      aria-hidden="true"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
      </svg>
    </span>
  );
}
