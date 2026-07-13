import { ListaItemSections } from "@/components/lista/lista-item-sections";
import type { ShareSheetData } from "@/components/share/share-sheet";
import { Button, Tag } from "@/components/ui";
import type { ListaDetailData } from "@/db/queries";
import {
  formatPublishedAgo,
  formatStalenessBanner,
  formatVePhone,
} from "@/lib/format";
import { partitionShareItems } from "@/lib/listas/share-text";
import { ShareCtaButton } from "./share-cta-button";

// AppBar titles differ by state (Figma "Perfil Centro" frames).
export const DETAIL_TITLE_ACTIVE = "Lista del centro";
export const DETAIL_TITLE_CLOSED = "Perfil del centro";

export function detailTitle(req: ListaDetailData): string {
  return req.status === "closed" ? DETAIL_TITLE_CLOSED : DETAIL_TITLE_ACTIVE;
}

/**
 * Canonical donor detail — the "Perfil Centro" full page (Figma 210:14154 /
 * 205:10633). Sole renderer for both in-app nav and direct load (the bottom
 * sheet / @modal interceptor was retired, issue #55). Server Component — no
 * client hooks — fed by `getListaById`, so deep links keep SSR/ISR + metadata.
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
 * Footer primary CTA. Active listas → "Compartir este centro" (the core donor
 * action); closed listas → "Ver otros centros activos".
 */
export function DetailFooter({ req }: { req: ListaDetailData }) {
  const isClosed = req.status === "closed";
  if (isClosed) {
    return (
      <Button variant="primary" fullWidth href="/listas">
        Ver otros centros activos
      </Button>
    );
  }
  return (
    <ShareCtaButton
      listaId={req.id}
      path={`/listas/${req.id}`}
      data={shareSheetData(req)}
    />
  );
}

/** Assemble the WhatsApp/share payload from the donor detail data (all fields
 * already fetched by getListaById). */
function shareSheetData(req: ListaDetailData): ShareSheetData {
  return {
    centerName: req.centerName,
    city: req.city,
    ...partitionShareItems(req.items),
    addressLine: req.center.addressLine,
    landmark: req.receptionLandmark,
    receptionContactName: req.receptionContactName,
    receptionContactPhone: req.receptionContactPhone,
    updatedAt: req.updatedAt,
  };
}

// ---- active (Figma 210:14154) ----------------------------------------------

function ActiveDetailBody({ req }: { req: ListaDetailData }) {
  const staleBanner = formatStalenessBanner(req.updatedAt);
  const publishedAgo = formatPublishedAgo(req.publishedAt);

  return (
    <>
      {staleBanner && <StalenessBanner text={staleBanner} />}

      <IdentityBlock req={req} />

      <AddressCard req={req} className="mt-4" />

      <Divider />

      <ListaItemSections
        items={req.items}
        publishedAgo={publishedAgo}
        excessReason={req.excessReason}
      />
    </>
  );
}

// ---- closed / paused (Figma 205:10633) -------------------------------------

function ClosedDetailBody({ req }: { req: ListaDetailData }) {
  const { center } = req;

  return (
    <>
      <IdentityBlock req={req} />

      <AddressCard req={req} className="mt-4" />

      <Divider />

      {/* paused banner — peach, notify affordance deferred (no backend yet) */}
      <section className="rounded-2xl bg-warning-tint px-4 py-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface text-neutral-700">
          <PauseIcon />
        </span>
        <p className="mt-3 text-lg font-semibold text-neutral-900">
          No recibe donaciones ahora
        </p>
        <p className="mx-auto mt-1 max-w-[18rem] text-sm text-neutral-600">
          El centro pausó la recepción para procesar lo que ya tiene. Activamos
          avisos cuando vuelva a estar disponible.
        </p>
        <div className="mt-4">
          <Button variant="outline" fullWidth disabled>
            Avisarme cuando reabra
          </Button>
        </div>
      </section>

      {center.description && (
        <>
          <Divider />
          <section>
            <h2 className="text-lg font-semibold text-neutral-900">
              Sobre este centro
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
              {center.description}
            </p>
          </section>
        </>
      )}

      <Divider />

      <section>
        <h2 className="text-lg font-semibold text-neutral-900">Cómo llegar</h2>
        {center.addressLine && (
          <p className="mt-2 text-[15px] text-neutral-900">
            {center.addressLine}
          </p>
        )}
        {center.addressReference && (
          <p className="mt-1 text-sm text-neutral-500">
            {center.addressReference}
          </p>
        )}
        <MapLink query={mapQuery(center.addressLine, center.city)} />
      </section>
    </>
  );
}

// ---- shared bits -----------------------------------------------------------

/** Avatar + center name + "Verificado" / reception status tags. */
function IdentityBlock({ req }: { req: ListaDetailData }) {
  const { center } = req;
  const receiving = center.receptionPausedAt == null;
  return (
    <>
      <h1 className="text-[22px] font-bold leading-tight text-neutral-900">
        {req.centerName}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {center.verifiedAt && (
          <Tag variant="fulfilled">
            <CheckGlyph size={12} />
            Verificado
          </Tag>
        )}
        {receiving ? (
          <Tag variant="fulfilled" dot>
            Recibiendo donaciones
          </Tag>
        ) : (
          <Tag variant="soon" dot>
            Recepción pausada
          </Tag>
        )}
      </div>
    </>
  );
}

/** Gray "Dirección" card with pin icon + "Como llegar →" (Figma). */
function AddressCard({
  req,
  className = "",
}: {
  req: ListaDetailData;
  className?: string;
}) {
  const { center } = req;
  const landmark = req.receptionLandmark?.trim();
  const receptionName = req.receptionContactName?.trim();
  const receptionPhone = req.receptionContactPhone?.trim();
  const hasReception = !!landmark || !!receptionName || !!receptionPhone;
  if (!center.addressLine && !center.addressReference && !hasReception) return null;
  return (
    <section className={`rounded-2xl bg-neutral-100 p-4 ${className}`}>
      <div className="flex items-center gap-1.5 text-accent">
        <PinIcon />
        <span className="text-[15px] font-semibold">Dirección</span>
      </div>
      {center.addressLine && (
        <p className="mt-2 text-[15px] text-neutral-900">{center.addressLine}</p>
      )}
      {center.addressReference && (
        <p className="mt-1 text-sm text-neutral-500">{center.addressReference}</p>
      )}
      {landmark && (
        <p className="mt-1 text-sm text-neutral-500">
          Punto de referencia: {landmark}
        </p>
      )}
      {(receptionName || receptionPhone) && (
        <p className="mt-1 text-sm text-neutral-500">
          Recibe:{" "}
          {receptionName}
          {receptionName && receptionPhone && " · "}
          {receptionPhone && (
            <a
              href={`https://wa.me/${receptionPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {formatVePhone(receptionPhone)}
            </a>
          )}
        </p>
      )}
      <MapLink query={mapQuery(center.addressLine, center.city)} label="Como llegar" />
    </section>
  );
}

function StalenessBanner({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl bg-accent-subtle px-3 py-2.5 text-sm text-neutral-700">
      <ClockIcon />
      <span>{text}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-6 border-t border-neutral-100" />;
}

function MapLink({ query, label = "Abrir en mapas" }: { query: string; label?: string }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query,
      )}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent"
    >
      {label}
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

// ---- glyphs ----------------------------------------------------------------

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

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-neutral-500"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function mapQuery(addressLine: string | null, city: string): string {
  return [addressLine, city].filter(Boolean).join(", ") || city;
}
