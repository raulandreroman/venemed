import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShareSection } from "@/components/share-section";
import { AppBar, Button, Countdown, Tag, UrgencyTag } from "@/components/ui";
import {
  getRequestById,
  type RequestDetailData,
} from "@/db/queries";
import { formatDeliveryCutoff, formatShortDate } from "@/lib/format";

// Surge read path: ISR. Query is additionally memoized in getRequestById.
export const revalidate = 60;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req) return { title: "Solicitud no encontrada · VeneMed" };
  return {
    title: `${req.centerName} · VeneMed`,
    description: req.centerDescription ?? undefined,
  };
}

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req) notFound();

  const isClosed = req.status === "closed" || req.status === "expired";
  return isClosed ? (
    <ClosedRequestDetail req={req} />
  ) : (
    <ActiveRequestDetail req={req} />
  );
}

// ---- active (Figma 20:2) ---------------------------------------------------

function ActiveRequestDetail({ req }: { req: RequestDetailData }) {
  const isSurplus = req.kind === "surplus";
  const { center } = req;

  return (
    <>
      <AppBar title="Detalle de solicitud" trailing={<ShareGlyph />} />

      <main className="flex-1 px-4 pb-28 pt-4">
        {/* tags */}
        <div className="flex flex-wrap items-center gap-2">
          {req.city && <Tag variant="neutral">{req.city}</Tag>}
          {isSurplus ? (
            <Tag variant="surplus">No enviar</Tag>
          ) : (
            <UrgencyTag expiresAt={req.expiresAt} />
          )}
        </div>

        {/* center */}
        <h1 className="mt-3 text-2xl font-bold leading-tight text-primary">
          {req.centerName}
        </h1>
        {req.centerDescription && (
          <p className="mt-1 text-sm text-neutral-500">
            {req.centerDescription}
          </p>
        )}

        {/* countdown (active need + surplus reuse the lifecycle) */}
        <div className="mt-4">
          <Countdown
            publishedAt={req.publishedAt}
            expiresAt={req.expiresAt}
            windowHours={req.windowHours}
            initialNow={new Date()}
          />
        </div>

        {/* items */}
        <section className="mt-6">
          <h2 className="text-lg font-bold text-primary">
            {isSurplus ? "No enviar" : "Qué necesita el centro"}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {req.items.map((item) => (
              <ItemRow
                key={item.id}
                name={item.name}
                category={item.category}
                surplus={isSurplus}
              />
            ))}
          </ul>
        </section>

        <Divider />

        {/* dónde entregar */}
        <section>
          <h2 className="text-lg font-bold text-primary">Dónde entregar</h2>
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
          <MapLink query={mapQuery(center.addressLine, center.city)} />
        </section>

        <Divider />

        {/* cuándo entregar */}
        <section>
          <h2 className="text-lg font-bold text-primary">Cuándo entregar</h2>
          <p className="mt-2 text-[15px] font-semibold text-neutral-900">
            {formatDeliveryCutoff(req.expiresAt)}
          </p>
          {center.regularScheduleText && (
            <p className="mt-1 text-sm text-neutral-500">
              Horario regular del centro · {center.regularScheduleText}
            </p>
          )}
        </section>

        <Divider />

        <ShareSection message={shareMessage(req)} path={`/solicitudes/${req.id}`} />
      </main>

      <BottomBar>
        <Button variant="primary" fullWidth href="/solicitudes">
          Volver
        </Button>
      </BottomBar>
    </>
  );
}

// ---- closed / expired (Figma 20:73) ----------------------------------------

function ClosedRequestDetail({ req }: { req: RequestDetailData }) {
  const { center } = req;

  // Resolve the terminal state explicitly. A request is only "fulfilled" when
  // the center actually received the help; expired/cancelled windows did not.
  const state: "fulfilled" | "cancelled" | "expired" =
    req.closedReason === "fulfilled"
      ? "fulfilled"
      : req.closedReason === "cancelled"
        ? "cancelled"
        : "expired";
  const isFulfilled = state === "fulfilled";

  const tagLabel =
    state === "fulfilled"
      ? "Cumplida"
      : state === "cancelled"
        ? "Cancelada"
        : "Vencida";
  const tagVariant = isFulfilled ? "fulfilled" : "expired";

  const closedDate = req.closedAt ?? req.expiresAt;

  const bannerTitle =
    state === "fulfilled"
      ? `Esta solicitud se cerró el ${formatShortDate(closedDate)}`
      : state === "cancelled"
        ? `Esta solicitud se canceló el ${formatShortDate(closedDate)}`
        : `Esta solicitud venció el ${formatShortDate(closedDate)}`;
  const bannerSubtitle =
    state === "fulfilled"
      ? `Ventana de ${req.windowHours} h completada · Centro ya recibió la ayuda`
      : state === "cancelled"
        ? "Esta solicitud fue cancelada"
        : "La ventana se cerró sin completarse";

  return (
    <>
      <AppBar title="Detalle de solicitud" />

      <main className="flex-1 px-4 pb-28 pt-4">
        {/* tags */}
        <div className="flex flex-wrap items-center gap-2">
          {req.city && <Tag variant="neutral">{req.city}</Tag>}
          <Tag variant={tagVariant} dot={false}>
            {tagVariant === "fulfilled" && <CheckGlyph />}
            {tagLabel}
          </Tag>
        </div>

        {/* center */}
        <h1 className="mt-3 text-2xl font-bold leading-tight text-primary">
          {req.centerName}
        </h1>
        {req.centerDescription && (
          <p className="mt-1 text-sm text-neutral-500">
            {req.centerDescription}
          </p>
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
          <h2 className="text-lg font-bold text-primary">Qué se pidió</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {req.items.map((item) => (
              <ItemRow
                key={item.id}
                name={item.name}
                category={item.category}
              />
            ))}
          </ul>
        </section>

        <Divider />

        {/* centro receptor */}
        <section>
          <h2 className="text-lg font-bold text-primary">Centro receptor</h2>
          {center.addressLine && (
            <p className="mt-2 text-[15px] text-neutral-900">
              {center.addressLine}
            </p>
          )}
        </section>
      </main>

      <BottomBar>
        <Button variant="primary" fullWidth href="/solicitudes">
          Ver solicitudes activas
        </Button>
      </BottomBar>
    </>
  );
}

// ---- shared bits -----------------------------------------------------------

function ItemRow({
  name,
  category,
  surplus = false,
}: {
  name: string;
  category: string;
  surplus?: boolean;
}) {
  return (
    <li className="rounded-xl bg-neutral-100 px-4 py-3">
      <p
        className={`text-[15px] font-semibold ${
          surplus ? "text-neutral-400 line-through" : "text-neutral-900"
        }`}
      >
        {name}
      </p>
      <p className="mt-0.5 text-sm text-neutral-500">{category}</p>
    </li>
  );
}

function Divider() {
  return <div className="my-6 border-t border-neutral-200" />;
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mx-auto w-full max-w-[390px] border-t border-neutral-200 bg-surface px-4 py-3">
      {children}
    </div>
  );
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

function ShareGlyph() {
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

function shareMessage(req: RequestDetailData): string {
  const verb = req.kind === "surplus" ? "Ayuda a difundir" : "Ayuda a";
  return `${verb} ${req.centerName}${req.city ? ` (${req.city})` : ""} en VeneMed:`;
}
