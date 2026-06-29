import { notFound, redirect } from "next/navigation";

import { ShareSection } from "@/components/share-section";
import { AppBar, Countdown, Tag } from "@/components/ui";
import type { CenterRequestDetailData } from "@/db/queries";
import { getCenterRequestById } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { closedReasonLabel, formatDeliveryCutoff } from "@/lib/format";

import { ExtenderButton } from "./_components/extender-button";
import { FinalizarButton } from "./_components/finalizar-button";

/**
 * Center-side request detail (Figma 29:3527) — distinct from the donor sheet.
 * Full page, scoped to the logged-in center: `getCenterRequestById` filters by
 * center_id, so a foreign / missing id is notFound(). The status redirect guard
 * mirrors the dashboard. Active requests get the countdown card (+ Extender) and
 * the sticky Finalizar bar; terminal requests render read-only.
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

  const req = await getCenterRequestById(center.centerId, id);
  if (!req) notFound();

  const isTerminal = req.status === "closed" || req.status === "expired";
  const shareMessage = req.title
    ? `Ayuda al centro con: ${req.title}`
    : "Ayuda al centro en VeneMed:";

  // Window-start for the progress bar: extend resets `expiresAt = now + window`
  // while keeping the true `publishedAt`, so derive the start from the window so
  // the bar reads fresh while "Publicado hace X" stays honest.
  const windowStart =
    req.expiresAt != null
      ? new Date(
          new Date(req.expiresAt).getTime() - req.windowHours * 3600 * 1000,
        )
      : req.publishedAt;

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
          {req.title ?? "Solicitud"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">#{req.shortId}</p>

        {/* countdown card (+ Extender) — active only */}
        {!isTerminal && (
          <div className="mt-4">
            <Countdown
              tone="accent"
              publishedAt={req.publishedAt}
              expiresAt={req.expiresAt}
              windowStart={windowStart}
              windowHours={req.windowHours}
              initialNow={new Date()}
              action={<ExtenderButton requestId={req.id} />}
            />
          </div>
        )}

        {/* terminal banner */}
        {isTerminal && (
          <div className="mt-4 rounded-2xl bg-neutral-100 p-4">
            <p className="font-semibold text-neutral-700">
              {req.status === "expired"
                ? "Esta solicitud venció"
                : req.closedReason === "fulfilled"
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
              <li key={item.id} className="rounded-xl bg-neutral-100 px-4 py-3">
                <p className="text-[15px] font-semibold text-neutral-900">
                  {item.name}
                </p>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {item.category}
                </p>
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
          <p className="mt-2 text-[15px] font-semibold text-neutral-900">
            {formatDeliveryCutoff(req.expiresAt)}
          </p>
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
          path={`/solicitudes/${req.id}`}
        />
      </main>

      {/* sticky Finalizar — active only */}
      {!isTerminal && (
        <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
          <FinalizarButton requestId={req.id} />
        </footer>
      )}
    </>
  );
}

function StatusChip({
  status,
  closedReason,
}: {
  status: CenterRequestDetailData["status"];
  closedReason: CenterRequestDetailData["closedReason"];
}) {
  if (status === "closed") {
    return (
      <Tag variant={closedReason === "fulfilled" ? "fulfilled" : "expired"}>
        {closedReasonLabel(closedReason)}
      </Tag>
    );
  }
  if (status === "expired") {
    return <Tag variant="expired">Vencida</Tag>;
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
