import { ShareSection } from "@/components/share-section";
import { Button, Tag } from "@/components/ui";
import type { ListaDetailData } from "@/db/queries";
import { formatListaUpdated, formatShortDate } from "@/lib/format";
import { ShareCtaButton } from "./share-cta-button";

export const DETAIL_TITLE = "Detalle de la lista";

/**
 * Shared detail content for a lista, rendered byte-identical by both the
 * full-page route (`listas/[id]/page.tsx`) and the intercepted bottom
 * sheet (`@modal/(.)listas/[id]/page.tsx`). Server Component — no client
 * hooks — fed by `getListaById`, so deep links keep SSR/ISR + metadata.
 */
export function RequestDetailBody({ req }: { req: ListaDetailData }) {
  const isClosed = req.status === "closed";
  return isClosed ? (
    <ClosedDetailBody req={req} />
  ) : (
    <ActiveDetailBody req={req} />
  );
}

/**
 * Footer primary CTA. Active listas → "Compartir lista" (the core donor
 * action); closed listas → "Ver listas activas" (Figma 20:73).
 */
export function DetailFooter({ req }: { req: ListaDetailData }) {
  const isClosed = req.status === "closed";
  if (isClosed) {
    return (
      <Button variant="primary" fullWidth href="/listas">
        Ver listas activas
      </Button>
    );
  }
  return (
    <ShareCtaButton
      requestId={req.id}
      message={shareMessage(req)}
      path={`/listas/${req.id}`}
    />
  );
}

// ---- active (Figma 20:2) ---------------------------------------------------

function ActiveDetailBody({ req }: { req: ListaDetailData }) {
  const { center } = req;

  const urgent = req.items.filter((it) => it.bucket === "need" && it.isUrgent);
  const necesitamos = req.items.filter(
    (it) => it.bucket === "need" && !it.isUrgent,
  );
  const noAceptamos = req.items.filter((it) => it.bucket === "excess");

  return (
    <>
      {/* tags */}
      <div className="flex flex-wrap items-center gap-2">
        {req.city && <Tag variant="neutral">{req.city}</Tag>}
        <span />
      </div>

      {/* center */}
      <h1 className="mt-3 text-[22px] font-bold leading-tight text-neutral-900">
        {req.centerName}
      </h1>
      {req.centerDescription && (
        <p className="mt-1 text-sm text-neutral-500">{req.centerDescription}</p>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        {formatListaUpdated(req.updatedAt)}
      </p>

      {/* items — Urgente / Necesitamos / No aceptamos */}
      {urgent.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">Urgente</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {urgent.map((item) => (
              <ItemRow
                key={item.id}
                name={item.name}
                category={item.category}
                rowClassName="bg-error-tint"
                textClassName="text-error"
              />
            ))}
          </ul>
        </section>
      )}

      {necesitamos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            Necesitamos
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {necesitamos.map((item) => (
              <ItemRow key={item.id} name={item.name} category={item.category} />
            ))}
          </ul>
        </section>
      )}

      {noAceptamos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-warning">No aceptamos</h2>
          {req.excessReason && (
            <p className="mt-0.5 text-sm text-neutral-500">
              {req.excessReason}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {noAceptamos.map((item) => (
              <ItemRow
                key={item.id}
                name={item.name}
                category={item.category}
                rowClassName="bg-warning-tint"
                textClassName="text-warning"
              />
            ))}
          </ul>
        </section>
      )}

      <Divider />

      {/* dónde entregar */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">
          Dónde entregar
        </h2>
        {center.addressLine && (
          <p className="mt-2 text-[15px] text-neutral-900">
            {center.addressLine}
          </p>
        )}
        {center.addressReference && (
          <p className="mt-2 text-sm text-neutral-500">
            {center.addressReference}
          </p>
        )}
        {req.deliveryInstructions && (
          <p className="mt-2 rounded-xl bg-neutral-100 px-4 py-3 text-[15px] text-neutral-900">
            {req.deliveryInstructions}
          </p>
        )}
        <MapLink query={mapQuery(center.addressLine, center.city)} />
      </section>

      <Divider />

      {/* cuándo entregar */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">
          Cuándo entregar
        </h2>
        {center.regularScheduleText && (
          <p className="mt-1 text-sm text-neutral-500">
            Horario regular del centro · {center.regularScheduleText}
          </p>
        )}
      </section>

      <Divider />

      <div id="comparte">
        <ShareSection
          requestId={req.id}
          message={shareMessage(req)}
          path={`/listas/${req.id}`}
        />
      </div>
    </>
  );
}

// ---- closed (Figma 20:73) ----------------------------------------

function ClosedDetailBody({ req }: { req: ListaDetailData }) {
  const { center } = req;

  // Resolve the terminal state explicitly. A lista is only "fulfilled" when
  // the center actually received the help; otherwise it was cancelled
  // (no expiry path anymore — lista-model-v2 §3e).
  const state: "fulfilled" | "cancelled" =
    req.closedReason === "fulfilled" ? "fulfilled" : "cancelled";
  const isFulfilled = state === "fulfilled";

  const tagLabel = isFulfilled ? "Cumplida" : "Cancelada";
  const tagVariant = isFulfilled ? "fulfilled" : "expired";

  const closedDate = req.closedAt;

  const bannerTitle = isFulfilled
    ? `Esta solicitud se cerró el ${formatShortDate(closedDate)}`
    : `Esta solicitud se canceló el ${formatShortDate(closedDate)}`;
  const bannerSubtitle = isFulfilled
    ? "Centro ya recibió la ayuda"
    : "Esta solicitud fue cancelada";

  return (
    <>
      {/* tags */}
      <div className="flex flex-wrap items-center gap-2">
        {req.city && <Tag variant="neutral">{req.city}</Tag>}
        <Tag variant={tagVariant} dot={false}>
          {tagVariant === "fulfilled" && <CheckGlyph />}
          {tagLabel}
        </Tag>
      </div>

      {/* center */}
      <h1 className="mt-3 text-[22px] font-bold leading-tight text-neutral-900">
        {req.centerName}
      </h1>
      {req.centerDescription && (
        <p className="mt-1 text-sm text-neutral-500">{req.centerDescription}</p>
      )}

      {/* closed banner — green/success only when actually fulfilled */}
      <div
        className={`mt-4 flex gap-3 rounded-2xl p-4 ${
          isFulfilled ? "bg-success-tint" : "bg-neutral-100"
        }`}
      >
        {isFulfilled && (
          <span className="mt-0.5 shrink-0 text-success">
            <CheckGlyph size={18} />
          </span>
        )}
        <div>
          <p
            className={`font-semibold ${
              isFulfilled ? "text-success" : "text-neutral-700"
            }`}
          >
            {bannerTitle}
          </p>
          <p
            className={`mt-0.5 text-sm ${
              isFulfilled ? "text-success/80" : "text-neutral-500"
            }`}
          >
            {bannerSubtitle}
          </p>
        </div>
      </div>

      <Divider />

      {/* qué se pidió */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">Qué se pidió</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {req.items.map((item) => (
            <ItemRow key={item.id} name={item.name} category={item.category} />
          ))}
        </ul>
      </section>

      <Divider />

      {/* centro receptor */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">
          Centro receptor
        </h2>
        {center.addressLine && (
          <p className="mt-2 text-[15px] text-neutral-900">
            {center.addressLine}
          </p>
        )}
      </section>
    </>
  );
}

// ---- shared bits -----------------------------------------------------------

function ItemRow({
  name,
  category,
  rowClassName = "bg-neutral-100",
  textClassName = "text-neutral-900",
}: {
  name: string;
  category: string;
  rowClassName?: string;
  textClassName?: string;
}) {
  return (
    <li className={`rounded-xl px-4 py-3 ${rowClassName}`}>
      <p className={`text-[15px] font-semibold ${textClassName}`}>{name}</p>
      <p className="mt-0.5 text-sm text-neutral-500">{category}</p>
    </li>
  );
}

function Divider() {
  return <div className="my-6 border-t border-neutral-100" />;
}

function MapLink({ query }: { query: string }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query,
      )}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent"
    >
      Abrir en mapas
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </a>
  );
}

export function ShareGlyph() {
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
      className="text-neutral-700"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function CheckGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function mapQuery(addressLine: string | null, city: string): string {
  return [addressLine, city].filter(Boolean).join(", ") || city;
}

function shareMessage(req: ListaDetailData): string {
  return `Ayuda a ${req.centerName}${req.city ? ` (${req.city})` : ""} en VeneMed:`;
}
