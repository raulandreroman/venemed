import type { ReactElement } from "react";

import { BrandMark } from "@/app/_brand/mark";
import type { ListaDetailData } from "@/db/queries";
import { centerTypeLabel, formatListaUpdated } from "@/lib/format";

/**
 * Shared social-share card for a lista, rendered by Satori (next/og
 * ImageResponse) from two routes: the landscape og:image (1200×630) and the
 * story route (1080×1920, attached to native shares). So: inline styles only,
 * flexbox only (every div with >1 child sets display:flex), no Tailwind/
 * className, no CSS grid. es-VE copy, conversational voice.
 *
 * Colors are the design-system tokens from globals.css, inlined as constants
 * (Satori can't read CSS custom properties). Single-accent rule: with the "Ver
 * lista" button removed, the blue accent appears ONLY in the BrandMark logo;
 * everything else is neutral, with the excess line's "Por favor no traigan"
 * label carrying the semantic warning tint (a state signal, not an action).
 */
const SURFACE = "#ffffff"; // --color-surface
const NEUTRAL_900 = "#111827"; // --color-neutral-900 (primary text)
const NEUTRAL_700 = "#374151"; // --color-neutral-700 (secondary text)
const NEUTRAL_500 = "#6b7280"; // --color-neutral-500 (tertiary text)
const WARNING = "#b45309"; // --color-warning ("No aceptamos" signal)

export type ListaCardFormat = "landscape" | "story";

type FormatSpec = {
  size: { width: number; height: number };
  padTop: number;
  padBottom: number;
  padX: number;
  brandSize: number;
  wordmarkFont: number;
  eyebrowFont: number;
  headlineFont: number;
  itemsFont: number;
  excessFont: number;
  footerFont: number;
  bodyGap: number;
  itemCap: number;
};

// Story keeps critical content in the middle safe area — Instagram overlays UI
// roughly the top/bottom 250px, so the vertical padding is generous and the
// column is justified space-between within it.
const FORMATS: Record<ListaCardFormat, FormatSpec> = {
  landscape: {
    size: { width: 1200, height: 630 },
    padTop: 64,
    padBottom: 64,
    padX: 64,
    brandSize: 52,
    wordmarkFont: 32,
    eyebrowFont: 28,
    headlineFont: 52,
    itemsFont: 40,
    excessFont: 28,
    footerFont: 24,
    bodyGap: 20,
    itemCap: 7,
  },
  story: {
    size: { width: 1080, height: 1920 },
    padTop: 280,
    padBottom: 280,
    padX: 96,
    brandSize: 76,
    wordmarkFont: 46,
    eyebrowFont: 40,
    headlineFont: 84,
    itemsFont: 62,
    excessFont: 44,
    footerFont: 36,
    bodyGap: 40,
    itemCap: 11,
  },
};

/** center.type -> leading article for the conversational headline. Null (or an
 * unknown type) drops the article gracefully: "Hospital X necesita:". */
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

/** Natural Spanish enumeration: "a, b y c" (conj "y") or "a, b o c" (conj "o").
 * Caps at `max`, folding the remainder into a trailing "y N más" / "o N más". */
function enumerate(
  names: string[],
  conj: "y" | "o",
  max: number,
): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];

  if (clean.length > max) {
    const shown = clean.slice(0, max);
    const more = clean.length - max;
    return `${shown.join(", ")} ${conj} ${more} más`;
  }
  const head = clean.slice(0, -1);
  const last = clean[clean.length - 1];
  return `${head.join(", ")} ${conj} ${last}`;
}

function itemNames(lista: ListaDetailData, bucket: "need" | "excess"): string[] {
  // Count every matching item regardless of isFulfilled — mirrors the donor
  // detail/share derivations.
  return lista.items.filter((it) => it.bucket === bucket).map((it) => it.name);
}

function Wordmark({ spec }: { spec: FormatSpec }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spec.brandSize * 0.3 }}>
      <BrandMark size={spec.brandSize} />
      <div
        style={{
          display: "flex",
          fontSize: spec.wordmarkFont,
          fontWeight: 700,
          color: NEUTRAL_900,
        }}
      >
        VeneMed
      </div>
    </div>
  );
}

function CardShell({
  spec,
  children,
}: {
  spec: FormatSpec;
  children: ReactElement;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        paddingTop: spec.padTop,
        paddingBottom: spec.padBottom,
        paddingLeft: spec.padX,
        paddingRight: spec.padX,
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
function FallbackCard({ spec }: { spec: FormatSpec }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spec.bodyGap,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      <BrandMark size={spec.brandSize * 1.7} />
      <div style={{ display: "flex", fontSize: spec.headlineFont * 0.85, fontWeight: 700, color: NEUTRAL_900 }}>
        VeneMed
      </div>
      <div style={{ display: "flex", fontSize: spec.eyebrowFont, color: NEUTRAL_500 }}>
        Insumos médicos para Venezuela
      </div>
    </div>
  );
}

function Eyebrow({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }) {
  const cityType = [lista.city, lista.centerType ? centerTypeLabel(lista.centerType) : null]
    .filter(Boolean)
    .join(" · ");
  if (!cityType) return null;
  return (
    <div style={{ display: "flex", fontSize: spec.eyebrowFont, color: NEUTRAL_500 }}>
      {cityType}
    </div>
  );
}

function Footer({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spec.footerFont * 0.2 }}>
      <div style={{ display: "flex", fontSize: spec.footerFont, color: NEUTRAL_500 }}>
        {formatListaUpdated(lista.updatedAt)}
      </div>
      <div style={{ display: "flex", fontSize: spec.footerFont, color: NEUTRAL_500 }}>
        venemedapp.org
      </div>
    </div>
  );
}

function ActiveCard({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }) {
  const article = centerArticle(lista.centerType);
  const leadName = article ? `${article} ${lista.centerName}` : lista.centerName;

  const needs = itemNames(lista, "need");
  const excess = itemNames(lista, "excess");
  const needsSentence = enumerate(needs, "y", spec.itemCap);
  const excessSentence = enumerate(excess, "o", Math.min(spec.itemCap, 6));

  return (
    <CardShell spec={spec}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {/* top: brand + location eyebrow */}
        <div style={{ display: "flex", flexDirection: "column", gap: spec.bodyGap * 0.6 }}>
          <Wordmark spec={spec} />
          <Eyebrow lista={lista} spec={spec} />
        </div>

        {/* body: headline + conversational item list */}
        <div style={{ display: "flex", flexDirection: "column", gap: spec.bodyGap }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: spec.headlineFont * 0.22,
              fontSize: spec.headlineFont,
              lineHeight: 1.12,
            }}
          >
            <div style={{ display: "flex", fontWeight: 700, color: NEUTRAL_900 }}>
              {leadName}
            </div>
            <div style={{ display: "flex", fontWeight: 400, color: NEUTRAL_700 }}>
              {needs.length > 0 ? "necesita:" : "está recibiendo donaciones"}
            </div>
          </div>

          {needs.length > 0 && (
            <div style={{ display: "flex", fontSize: spec.itemsFont, fontWeight: 500, color: NEUTRAL_900, lineHeight: 1.25 }}>
              {needsSentence}
            </div>
          )}

          {excess.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: spec.excessFont, lineHeight: 1.3, marginTop: spec.bodyGap * 0.3 }}>
              <div style={{ display: "flex", color: WARNING, fontWeight: 600, marginRight: spec.excessFont * 0.32 }}>
                Por favor no traigan:
              </div>
              <div style={{ display: "flex", color: NEUTRAL_700 }}>
                {excessSentence}
              </div>
            </div>
          )}
        </div>

        <Footer lista={lista} spec={spec} />
      </div>
    </CardShell>
  );
}

function ClosedCard({ lista, spec }: { lista: ListaDetailData; spec: FormatSpec }) {
  const message =
    lista.closedReason === "cancelled"
      ? "Lista cancelada · gracias por compartir"
      : "Lista cumplida · gracias por compartir";

  return (
    <CardShell spec={spec}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spec.bodyGap * 0.6 }}>
          <Wordmark spec={spec} />
          <Eyebrow lista={lista} spec={spec} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spec.bodyGap }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: spec.headlineFont, fontWeight: 700, color: NEUTRAL_900, lineHeight: 1.12 }}>
            {lista.centerName}
          </div>
          <div style={{ display: "flex", fontSize: spec.itemsFont * 0.8, fontWeight: 600, color: NEUTRAL_700, lineHeight: 1.25 }}>
            {message}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: spec.footerFont, color: NEUTRAL_500 }}>
          venemedapp.org
        </div>
      </div>
    </CardShell>
  );
}

/**
 * The single card element both share routes render. `lista` null (not found /
 * draft / paused) → the branded fallback; closed → the thank-you card;
 * otherwise the conversational active card.
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
