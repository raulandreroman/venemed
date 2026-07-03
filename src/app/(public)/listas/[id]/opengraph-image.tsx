import { ImageResponse } from "next/og";

import { BrandMark } from "@/app/_brand/mark";
import { getListaById, type ListaDetailData } from "@/db/queries";
import { centerTypeLabel, formatListaUpdated } from "@/lib/format";
import { loadInterFonts } from "@/lib/og/fonts";

// Per-lista social share image (issue #58, slice 3a). Rendered by Satori via
// next/og, so: inline styles only, flexbox only (every div with >1 child sets
// display:flex), no Tailwind/className, no CSS grid. es-VE copy.
//
// Colors are the design-system tokens from globals.css, inlined as constants
// (Satori can't read CSS custom properties). Single-accent rule: the blue
// accent is ONLY the footer "Ver lista" pill + the BrandMark logo field; every
// other surface here is neutral or a semantic state tint.
const ACCENT = "#1f5aa8"; // --color-accent
const ACCENT_ON = "#ffffff"; // --color-accent-on
const SURFACE = "#ffffff"; // --color-surface
const NEUTRAL_900 = "#111827"; // --color-neutral-900 (primary text)
const NEUTRAL_700 = "#374151"; // --color-neutral-700 (secondary text)
const NEUTRAL_500 = "#6b7280"; // --color-neutral-500 (tertiary text)
const NEUTRAL_100 = "#eef0f4"; // --color-neutral-100 (fills / separators)
const ERROR = "#c0362c"; // --color-error (urgent)
const ERROR_TINT = "#fcebe9"; // --color-error-tint

export const alt = "Lista de insumos en VeneMed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Match the page's ISR window (page.tsx exports revalidate = 60) so a stale
// social-cache refresh picks up edits within a minute, like the donor detail.
export const revalidate = 60;

/** Trim to `max` chars on a word boundary, appending an ellipsis. Belt-and-
 * suspenders with the 2-line clamp below so an extreme name can't overflow. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Generic branded fallback — used for not-found / draft / paused listas and
 * on any render error, so social crawlers never get an unstyled 404. */
function FallbackCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      <BrandMark size={96} />
      <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: NEUTRAL_900 }}>
        VeneMed
      </div>
      <div style={{ display: "flex", fontSize: 28, color: NEUTRAL_500 }}>
        Insumos médicos para Venezuela
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <BrandMark size={56} />
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: NEUTRAL_900 }}>
        VeneMed
      </div>
    </div>
  );
}

function ActiveCard({ lista }: { lista: ListaDetailData }) {
  // Mirror the donor detail/share derivations (detail-body.tsx, share-
  // description.ts): count every item regardless of isFulfilled.
  const urgent = lista.items.filter((it) => it.bucket === "need" && it.isUrgent);
  const needCount = lista.items.filter((it) => it.bucket === "need").length;

  const cityType = [lista.city, lista.centerType ? centerTypeLabel(lista.centerType) : null]
    .filter(Boolean)
    .join(" · ");

  const visibleUrgent = urgent.slice(0, 3);
  const overflow = urgent.length - visibleUrgent.length;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      <Wordmark />

      {/* body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "-webkit-box",
            // 2-line clamp; the pre-truncate is the hard safety net.
            lineClamp: 2,
            fontSize: 66,
            fontWeight: 700,
            lineHeight: 1.1,
            color: NEUTRAL_900,
          }}
        >
          {truncate(lista.centerName, 70)}
        </div>
        {cityType && (
          <div style={{ display: "flex", fontSize: 30, color: NEUTRAL_500 }}>
            {cityType}
          </div>
        )}

        {urgent.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: ERROR_TINT,
                color: ERROR,
                fontSize: 26,
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: 9999,
              }}
            >
              <div style={{ display: "flex", width: 12, height: 12, borderRadius: 9999, background: ERROR }} />
              Urgente
            </div>
            {visibleUrgent.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  background: ERROR_TINT,
                  color: ERROR,
                  fontSize: 26,
                  fontWeight: 500,
                  padding: "10px 20px",
                  borderRadius: 9999,
                }}
              >
                {truncate(item.name, 26)}
              </div>
            ))}
            {overflow > 0 && (
              // Neutral, not accent — keeps the footer "Ver lista" the only blue.
              <div
                style={{
                  display: "flex",
                  background: NEUTRAL_100,
                  color: NEUTRAL_700,
                  fontSize: 26,
                  fontWeight: 500,
                  padding: "10px 20px",
                  borderRadius: 9999,
                }}
              >
                +{overflow} más
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 30, color: NEUTRAL_700, marginTop: 8 }}>
            {needCount > 0
              ? `${needCount} ${needCount === 1 ? "insumo necesitado" : "insumos necesitados"}`
              : "Recibiendo donaciones"}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", fontSize: 24, color: NEUTRAL_500 }}>
            {formatListaUpdated(lista.updatedAt)}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: NEUTRAL_500 }}>
            venemedapp.org
          </div>
        </div>
        <div
          style={{
            display: "flex",
            background: ACCENT,
            color: ACCENT_ON,
            fontSize: 28,
            fontWeight: 600,
            padding: "16px 36px",
            borderRadius: 9999,
          }}
        >
          Ver lista
        </div>
      </div>
    </div>
  );
}

function ClosedCard({ lista }: { lista: ListaDetailData }) {
  const message =
    lista.closedReason === "cancelled"
      ? "Lista cancelada · gracias por compartir"
      : "Lista cumplida · gracias por compartir";
  const cityType = [lista.city, lista.centerType ? centerTypeLabel(lista.centerType) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      <Wordmark />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "-webkit-box",
            lineClamp: 2,
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.1,
            color: NEUTRAL_900,
          }}
        >
          {truncate(lista.centerName, 70)}
        </div>
        {cityType && (
          <div style={{ display: "flex", fontSize: 30, color: NEUTRAL_500 }}>
            {cityType}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: NEUTRAL_700, marginTop: 8 }}>
          {message}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 24, color: NEUTRAL_500 }}>
        venemedapp.org
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lista = await getListaById(id);

  const element = !lista ? (
    <FallbackCard />
  ) : lista.status === "closed" ? (
    <ClosedCard lista={lista} />
  ) : (
    <ActiveCard lista={lista} />
  );

  return new ImageResponse(element, { ...size, fonts: await loadInterFonts() });
}
