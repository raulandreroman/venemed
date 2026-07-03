/**
 * Vendored from src/lib/og/lista-card.tsx — the ACTUAL story-share image
 * (1080×1920) that ships with native shares (PRs #75/#76). Changes vs. the
 * app, kept minimal:
 *  - Logo: node:fs data-URI → Remotion <Img src={staticFile(...)}>.
 *  - Data: local StoryLista type instead of @/db/queries' ListaDetailData.
 *  - formatListaUpdated → precomputed `updatedLabel` (deterministic renders).
 *  - Only the active-lista story path is vendored (landscape/fallback/closed
 *    variants are unused by the video).
 * All style values are verbatim, including the two designer constants that
 * intentionally have no globals.css token (WORDMARK #0e2a52, AVISO_TEXT #8a3f07).
 */
import type { ReactElement } from "react";
import { Img, staticFile } from "remotion";

const SURFACE = "#ffffff";
const WORDMARK = "#0e2a52";
const NEUTRAL_900 = "#111827";
const NEUTRAL_700 = "#374151";
const NEUTRAL_500 = "#6b7280";
const NEUTRAL_100 = "#eef0f4";
const ERROR_600 = "#c0362c";
const ERROR_50 = "#fcebe9";
const WARNING_50 = "#fef4e6";
const AVISO_TEXT = "#8a3f07";

const LOGO_ASPECT = 240 / 204;

// Story format spec (verbatim from FORMATS.story)
const SPEC = {
  size: { width: 1080, height: 1920 },
  scale: 1080 / 390,
  safeY: 250,
  itemCap: 12,
  headerRow: false,
  headerGap: 48,
};

const CENTER_ARTICLE: Record<string, string> = {
  hospital: "El",
  clinic: "La",
  elder_care_home: "La",
  childrens_shelter: "El",
  collection_center: "El",
};

export type StoryLista = {
  centerName: string;
  centerType: string | null;
  city: string | null;
  updatedLabel: string;
  items: { name: string; bucket: "need" | "excess"; isUrgent: boolean }[];
};

type PillItem = { name: string; urgent: boolean };

function needPills(lista: StoryLista): PillItem[] {
  const need = lista.items.filter((it) => it.bucket === "need");
  const urgent = need
    .filter((it) => it.isUrgent)
    .map((it) => ({ name: it.name, urgent: true }));
  const rest = need
    .filter((it) => !it.isUrgent)
    .map((it) => ({ name: it.name, urgent: false }));
  return [...urgent, ...rest];
}

function excessNames(lista: StoryLista): string[] {
  return lista.items
    .filter((it) => it.bucket === "excess")
    .map((it) => it.name.trim())
    .filter(Boolean);
}

function Logo({ scale }: { scale: number }): ReactElement {
  return (
    <Img
      src={staticFile("venemed-logo-mark.png")}
      style={{
        width: 40 * scale,
        height: (40 * scale) / LOGO_ASPECT,
        objectFit: "contain",
      }}
    />
  );
}

function Header({ scale }: { scale: number }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 * scale }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 * scale }}>
        <Logo scale={scale} />
        <div
          style={{
            display: "flex",
            fontSize: 20 * scale,
            fontWeight: 700,
            color: WORDMARK,
          }}
        >
          VeneMed
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 14 * scale,
          fontWeight: 500,
          color: NEUTRAL_500,
        }}
      >
        Ver más listas en Venemedapp.org
      </div>
    </div>
  );
}

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

function ChipRow({
  lista,
  scale,
}: {
  lista: StoryLista;
  scale: number;
}): ReactElement | null {
  const hasUrgent = lista.items.some(
    (it) => it.bucket === "need" && it.isUrgent,
  );
  if (!lista.city && !hasUrgent) return null;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {lista.city ? (
        <Pill
          scale={scale}
          bg={NEUTRAL_100}
          color={NEUTRAL_700}
          fontSize={13}
          fontWeight={500}
        >
          {lista.city}
        </Pill>
      ) : (
        <div style={{ display: "flex" }} />
      )}
      {hasUrgent && (
        <Pill
          scale={scale}
          bg={ERROR_50}
          color={ERROR_600}
          fontSize={13}
          fontWeight={600}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 * scale }}>
            <div style={{ display: "flex", fontSize: 10 * scale }}>●</div>
            <div style={{ display: "flex" }}>Urgente</div>
          </div>
        </Pill>
      )}
    </div>
  );
}

function Headline({
  lista,
  scale,
}: {
  lista: StoryLista;
  scale: number;
}): ReactElement {
  const article = lista.centerType
    ? CENTER_ARTICLE[lista.centerType] ?? null
    : null;
  const hasNeeds = lista.items.some((it) => it.bucket === "need");
  return (
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

function ItemPills({
  lista,
  scale,
  cap,
}: {
  lista: StoryLista;
  scale: number;
  cap: number;
}): ReactElement | null {
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
        <Pill
          scale={scale}
          bg={NEUTRAL_100}
          color={NEUTRAL_700}
          fontSize={14}
          fontWeight={500}
        >
          {`+${overflow} más`}
        </Pill>
      )}
    </div>
  );
}

function AvisoBadge({
  lista,
  scale,
}: {
  lista: StoryLista;
  scale: number;
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
        width: "100%",
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
      <div
        style={{
          display: "flex",
          fontSize: 14 * scale,
          fontWeight: 500,
          color: AVISO_TEXT,
        }}
      >
        {`No aceptamos: ${names.join(", ")}`}
      </div>
    </div>
  );
}

/** The active-lista story card, 1080×1920, exactly as the story-image route
 * renders it. */
export function StoryCard({ lista }: { lista: StoryLista }): ReactElement {
  const { scale } = SPEC;
  return (
    <div
      style={{
        width: SPEC.size.width,
        height: SPEC.size.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingTop: SPEC.safeY,
        paddingBottom: SPEC.safeY,
        paddingLeft: 32 * scale,
        paddingRight: 32 * scale,
        background: SURFACE,
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SPEC.headerGap * scale,
        }}
      >
        <Header scale={scale} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <ChipRow lista={lista} scale={scale} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 12 * scale,
            }}
          >
            <Headline lista={lista} scale={scale} />
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8 * scale,
              fontSize: 12 * scale,
              fontWeight: 400,
              color: NEUTRAL_500,
            }}
          >
            {lista.updatedLabel}
          </div>
          <div style={{ display: "flex", marginTop: 24 * scale }}>
            <ItemPills lista={lista} scale={scale} cap={SPEC.itemCap} />
          </div>
          <div style={{ display: "flex", marginTop: 24 * scale }}>
            <AvisoBadge lista={lista} scale={scale} />
          </div>
        </div>
      </div>
    </div>
  );
}
