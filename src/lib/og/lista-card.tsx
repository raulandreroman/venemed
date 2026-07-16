import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";

import type { ListaDetailData } from "@/db/queries";
import { formatItemQuantity, formatListaUpdated } from "@/lib/format";

/**
 * Shared social-share card for a lista, rendered by Satori (next/og
 * ImageResponse) from two routes: the landscape og:image (1200×630) and the
 * story route (1080×1920, attached to native shares). So: inline styles only,
 * flexbox only (every div with >1 child sets display:flex), no Tailwind/
 * className, no CSS grid. es-VE copy.
 *
 * Restyled to the designer's Figma card (a 390×742 frame). The whole layout is
 * authored once at that "design scale" and multiplied by a per-format `scale`
 * factor, so both formats stay visually identical bar the item caps.
 *
 * Colors are the design-system tokens from globals.css, inlined as constants
 * (Satori can't read CSS custom properties). NOTE two values the designer chose
 * that do NOT have a matching token in globals.css (design wins here):
 *   - WORDMARK #0e2a52 — the design calls it "primary/900"; the repo's #0e2a52
 *     is actually --color-accent-pressed (there is no primary/900; neutral/900
 *     is #111827).
 *   - AVISO_TEXT #8a3f07 — design "warning/700"; the repo has no warning/700
 *     (--color-warning is #b45309 = warning/600).
 */
const SURFACE = "#ffffff"; // --color-surface
const WORDMARK = "#0e2a52"; // design primary/900 (== --color-accent-pressed)
const NEUTRAL_900 = "#111827"; // --color-neutral-900 (headline name)
const NEUTRAL_700 = "#374151"; // --color-neutral-700 (headline/chip text)
const NEUTRAL_500 = "#6b7280"; // --color-neutral-500 (subline / meta)
const NEUTRAL_100 = "#eef0f4"; // --color-neutral-100 (neutral pill fill)
const ERROR_600 = "#c0362c"; // --color-error (urgent text/glyph)
const ERROR_50 = "#fcebe9"; // --color-error-tint (urgent pill fill)
const WARNING_50 = "#fef4e6"; // --color-warning-tint (aviso badge fill)
const AVISO_TEXT = "#8a3f07"; // design warning/700 (no token; > --color-warning)

// VeneMed logo mark (240×204 PNG). Satori can't read files at JSX time, so the
// PNG is read once at module load and inlined as a data: URI on an <img>.
const LOGO_PATH = path.join(process.cwd(), "src/assets/venemed-logo-mark.png");
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
const LOGO_ASPECT = 240 / 204; // ≈1.176 — rendered 40×34 at design scale

export type ListaCardFormat = "landscape" | "story";

type FormatSpec = {
  size: { width: number; height: number };
  scale: number; // multiplier applied to every design-scale value
  safeY: number; // vertical inset (IG overlays the story's top/bottom)
  itemCap: number;
  headerRow: boolean; // landscape design (Figma 360:15468): logo left, subline right
  headerGap: number; // design-scale gap between header and body
};

// Both formats render the same card, scaled. Story mirrors the 390-wide Figma
// frame (360:15308, ≈×2.77); landscape mirrors the 582-wide og variant
// (360:15468, ≈×2.06 with slightly tighter type ⇒ net ×1.8 on the 390 values).
const FORMATS: Record<ListaCardFormat, FormatSpec> = {
  landscape: {
    size: { width: 1200, height: 630 },
    scale: 1.8,
    safeY: 33,
    itemCap: 8,
    headerRow: true,
    headerGap: 16,
  },
  story: {
    size: { width: 1080, height: 1920 },
    scale: 1080 / 390, // ≈2.769
    safeY: 250,
    itemCap: 12,
    headerRow: false,
    headerGap: 48,
  },
};

/** center.type -> leading article for the conversational headline. Null (or an
 * unknown type) drops the article gracefully: "Hospital X está necesitando:". */
const CENTER_ARTICLE: Record<string, string> = {
  hospital: "El",
  clinic: "La",
  elder_care_home: "La",
  childrens_shelter: "El",
  collection_center: "El",
};

function centerArticle(type: string | null): string | null {
  return type ? CENTER_ARTICLE[type] ?? null : null;
}

type PillItem = { name: string; urgent: boolean };

/** Chip label: the insumo name plus its quantity ("Jeringas × 100") when set,
 * using the app's canonical quantity format so the share image never drifts
 * from the donor surfaces (#101). No quantity → bare name. */
function pillLabel(it: ListaDetailData["items"][number]): string {
  const qty = formatItemQuantity(it.quantity, it.unit);
  return qty ? `${it.name} ${qty}` : it.name;
}

function needPills(lista: ListaDetailData): PillItem[] {
  // Urgent items first (design's call), then the rest. Every need item counts
  // regardless of isFulfilled — mirrors the donor detail/share derivations.
  const need = lista.items.filter((it) => it.bucket === "need");
  const urgent = need.filter((it) => it.isUrgent).map((it) => ({ name: pillLabel(it), urgent: true }));
  const rest = need.filter((it) => !it.isUrgent).map((it) => ({ name: pillLabel(it), urgent: false }));
  return [...urgent, ...rest];
}

function excessNames(lista: ListaDetailData): string[] {
  return lista.items.filter((it) => it.bucket === "excess").map((it) => it.name.trim()).filter(Boolean);
}

function Logo({ scale }: { scale: number }): ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_DATA_URI}
      alt=""
      width={40 * scale}
      height={40 * scale / LOGO_ASPECT}
      style={{ objectFit: "contain" }}
    />
  );
}

function Header({ scale, row }: { scale: number; row: boolean }): ReactElement {
  const wordmark = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 * scale }}>
      <Logo scale={scale} />
      <div style={{ display: "flex", fontSize: 20 * scale, fontWeight: 700, color: WORDMARK }}>
        VeneMed
      </div>
    </div>
  );
  const subline = (
    <div style={{ display: "flex", fontSize: 14 * scale, fontWeight: 500, color: NEUTRAL_500 }}>
      Ver más listas en Venemedapp.org
    </div>
  );
  // Landscape (Figma 360:15468): one row, subline right. Story (360:15308):
  // stacked under the wordmark.
  return row ? (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {wordmark}
      {subline}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 * scale }}>
      {wordmark}
      {subline}
    </div>
  );
}

/** A rounded pill (chips + item pills + the aviso badge share the shape). */
function Pill({
  scale,
  bg,
  color,
  fontSize,
  fontWeight,
  padY = 5,
  children,
}: {
  scale: number;
  bg: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  padY?: number;
  children: ReactElement | string;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: bg,
        color,
        fontSize: fontSize * scale,
        fontWeight,
        borderRadius: 999,
        paddingLeft: 12 * scale,
        paddingRight: 12 * scale,
        paddingTop: padY * scale,
        paddingBottom: padY * scale,
      }}
    >
      {children}
    </div>
  );
}

function ChipRow({ lista, scale }: { lista: ListaDetailData; scale: number }): ReactElement | null {
  const hasUrgent = lista.items.some((it) => it.bucket === "need" && it.isUrgent);
  if (!lista.city && !hasUrgent) return null;
  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
      {lista.city ? (
        <Pill scale={scale} bg={NEUTRAL_100} color={NEUTRAL_700} fontSize={13} fontWeight={500}>
          {lista.city}
        </Pill>
      ) : (
        <div style={{ display: "flex" }} />
      )}
      {hasUrgent && (
        <Pill scale={scale} bg={ERROR_50} color={ERROR_600} fontSize={13} fontWeight={600}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 * scale }}>
            <div style={{ display: "flex", fontSize: 10 * scale }}>●</div>
            <div style={{ display: "flex" }}>Urgente</div>
          </div>
        </Pill>
      )}
    </div>
  );
}

function Headline({ lista, scale }: { lista: ListaDetailData; scale: number }): ReactElement {
  const article = centerArticle(lista.centerType);
  const hasNeeds = lista.items.some((it) => it.bucket === "need");
  return (
    // Satori has no inline rich text: to wrap the mixed-weight sentence
    // word-by-word (like the Figma text block), each word is its own flex
    // item in a wrapping row.
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        fontSize: 24 * scale,
        lineHeight: 34 / 24,
      }}
    >
      {[
        ...(article ? [{ text: article, weight: 400, color: NEUTRAL_700 }] : []),
        ...lista.centerName
          .split(/\s+/)
          .map((w) => ({ text: w, weight: 700, color: NEUTRAL_900 })),
        ...(hasNeeds ? "está necesitando:" : "está recibiendo donaciones")
          .split(" ")
          .map((w) => ({ text: w, weight: 500, color: NEUTRAL_700 })),
      ].map((token, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            fontWeight: token.weight,
            color: token.color,
            marginRight: 6 * scale,
          }}
        >
          {token.text}
        </div>
      ))}
    </div>
  );
}

function ItemPills({ lista, scale, cap }: { lista: ListaDetailData; scale: number; cap: number }): ReactElement | null {
  const pills = needPills(lista);
  if (pills.length === 0) return null;
  const shown = pills.slice(0, cap);
  const overflow = pills.length - shown.length;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 * scale }}>
      {shown.map((p, i) => (
        <Pill
          key={i}
          scale={scale}
          bg={p.urgent ? ERROR_50 : NEUTRAL_100}
          color={p.urgent ? ERROR_600 : NEUTRAL_700}
          fontSize={14}
          fontWeight={500}
        >
          {p.name}
        </Pill>
      ))}
      {overflow > 0 && (
        <Pill scale={scale} bg={NEUTRAL_100} color={NEUTRAL_700} fontSize={14} fontWeight={500}>
          {`+${overflow} más`}
        </Pill>
      )}
    </div>
  );
}

/** Warning badge: a white circle with an "!" glyph + the excess-item names. */
function AvisoBadge({
  lista,
  scale,
  fullWidth,
}: {
  lista: ListaDetailData;
  scale: number;
  fullWidth: boolean;
}): ReactElement | null {
  const names = excessNames(lista);
  if (names.length === 0) return null;
  const circle = 28 * scale;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10 * scale,
        // Landscape design hugs the content; the story design spans the card.
        ...(fullWidth ? { width: "100%" } : { alignSelf: "flex-start" }),
        background: WARNING_50,
        borderRadius: 999,
        paddingLeft: 12 * scale,
        paddingRight: 12 * scale,
        paddingTop: 8 * scale,
        paddingBottom: 8 * scale,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: circle,
          height: circle,
          borderRadius: 999,
          background: SURFACE,
          color: AVISO_TEXT,
          fontSize: 18 * scale,
          fontWeight: 700,
        }}
      >
        !
      </div>
      {/* Medium like the item pills — no weight difference (user call). */}
      <div style={{ display: "flex", fontSize: 14 * scale, fontWeight: 500, color: AVISO_TEXT }}>
        {`No aceptamos: ${names.join(", ")}`}
      </div>
    </div>
  );
}

/** Outer frame: white surface, vertically centered content within the IG-safe
 * inset, design-scale horizontal padding. */
function CardShell({ spec, children }: { spec: FormatSpec; children: ReactElement }): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingTop: spec.safeY,
        paddingBottom: spec.safeY,
        paddingLeft: 32 * spec.scale,
        paddingRight: 32 * spec.scale,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      {children}
    </div>
  );
}

/** Generic branded fallback — not-found / draft / paused listas and any render
 * error, so social crawlers never get an unstyled 404. */
function FallbackCard({ spec }: { spec: FormatSpec }): ReactElement {
  const { scale } = spec;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16 * scale,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_DATA_URI} alt="" width={96 * scale} height={96 * scale / LOGO_ASPECT} style={{ objectFit: "contain" }} />
      <div style={{ display: "flex", fontSize: 28 * scale, fontWeight: 700, color: WORDMARK }}>VeneMed</div>
      <div style={{ display: "flex", fontSize: 16 * scale, fontWeight: 500, color: NEUTRAL_500 }}>
        El puente directo entre tu ayuda y quien la necesita
      </div>
    </div>
  );
}

function ActiveCard({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }): ReactElement {
  const { scale } = spec;
  return (
    <CardShell spec={spec}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <ChipRow lista={lista} scale={scale} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 * scale }}>
          <Headline lista={lista} scale={scale} />
        </div>
        <div style={{ display: "flex", marginTop: 8 * scale, fontSize: 12 * scale, fontWeight: 400, color: NEUTRAL_500 }}>
          {formatListaUpdated(lista.updatedAt)}
        </div>
        <div style={{ display: "flex", marginTop: 24 * scale }}>
          <ItemPills lista={lista} scale={scale} cap={spec.itemCap} />
        </div>
        <div style={{ display: "flex", marginTop: 24 * scale }}>
          <AvisoBadge lista={lista} scale={scale} fullWidth={!spec.headerRow} />
        </div>
        {/* Branding moved from a top header to a bottom footer (design #105). */}
        <div style={{ display: "flex", marginTop: spec.headerGap * scale }}>
          <Header scale={scale} row={spec.headerRow} />
        </div>
      </div>
    </CardShell>
  );
}

function ClosedCard({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }): ReactElement {
  const { scale } = spec;
  const message =
    lista.closedReason === "cancelled"
      ? "Lista cancelada · gracias por compartir"
      : "Lista cumplida · gracias por compartir";

  return (
    <CardShell spec={spec}>
      <div style={{ display: "flex", flexDirection: "column", gap: spec.headerGap * scale }}>
        <Header scale={scale} row={spec.headerRow} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 * scale }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 24 * scale, fontWeight: 700, color: NEUTRAL_900, lineHeight: 34 / 24 }}>
            {lista.centerName}
          </div>
          <div style={{ display: "flex", fontSize: 16 * scale, fontWeight: 600, color: NEUTRAL_700 }}>
            {message}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

/**
 * The single card element both share routes render. `lista` null (not found /
 * draft / paused) → the branded fallback; closed → the thank-you card;
 * otherwise the active card.
 */
export function ListaCard({
  lista,
  format,
}: {
  lista: ListaDetailData | null;
  format: ListaCardFormat;
}): ReactElement {
  const spec = FORMATS[format];
  if (!lista || lista.status === "draft" || lista.status === "paused") {
    return <FallbackCard spec={spec} />;
  }
  if (lista.status === "closed") {
    return <ClosedCard lista={lista} spec={spec} />;
  }
  return <ActiveCard lista={lista} spec={spec} />;
}

export function listaCardSize(format: ListaCardFormat): { width: number; height: number } {
  return FORMATS[format].size;
}
