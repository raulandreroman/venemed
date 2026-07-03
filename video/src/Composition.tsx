import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { colors, radius } from "./theme";
import { FadeUp, SceneExit } from "./helpers";
import { RequestCard, type DemoLista } from "./vendor/request-card";
import { StoryCard, type StoryLista } from "./vendor/lista-card";
import { Button, Card } from "./vendor/ui";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
});

// Scene durations (frames @ 30fps)
const S1 = 90; // intro
const S2 = 130; // problem
const S3 = 175; // publish your lista (real donor card)
const S4 = 125; // donors see + share the link
const S5 = 165; // image share to IG / WhatsApp (real story card)
const S6 = 120; // freshness
const S7 = 115; // CTA
export const TOTAL_DURATION = S1 + S2 + S3 + S4 + S5 + S6 + S7; // 920

// ---- demo data (mirrors the seeded donor surface) ----------------------------

export const demoLista: DemoLista = {
  centerName: "Hospital Central de San Cristóbal",
  centerDescription: "Hospital público, área de emergencias",
  city: "San Cristóbal",
  hasUrgent: true,
  urgentItems: [
    { id: "1", name: "Gasas estériles", isUrgent: true },
    { id: "2", name: "Antibióticos IV", isUrgent: true },
  ],
  needItems: [
    { id: "3", name: "Guantes de nitrilo", isUrgent: false },
    { id: "4", name: "Jeringas 5 ml", isUrgent: false },
    { id: "5", name: "Solución fisiológica", isUrgent: false },
  ],
  excessItems: [{ name: "ropa usada" }],
  updatedLabel: "Actualizada hace 2 horas",
};

export const storyLista: StoryLista = {
  centerName: "Hospital Central de San Cristóbal",
  centerType: "hospital",
  city: "San Cristóbal",
  updatedLabel: "Actualizada hace 2 horas",
  items: [
    { name: "Gasas estériles", bucket: "need", isUrgent: true },
    { name: "Antibióticos IV", bucket: "need", isUrgent: true },
    { name: "Guantes de nitrilo", bucket: "need", isUrgent: false },
    { name: "Jeringas 5 ml", bucket: "need", isUrgent: false },
    { name: "Solución fisiológica", bucket: "need", isUrgent: false },
    { name: "ropa usada", bucket: "excess", isUrgent: false },
  ],
};

// ---- scene chrome -------------------------------------------------------------

export const Frame: React.FC<{ children: React.ReactNode; gap?: number }> = ({
  children,
  gap = 56,
}) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      padding: "140px 90px",
    }}
  >
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

export const Headline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h1
    style={{
      margin: 0,
      fontSize: 92,
      lineHeight: 1.15,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      color: colors.neutral900,
    }}
  >
    {children}
  </h1>
);

export const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    style={{
      margin: 0,
      fontSize: 46,
      lineHeight: 1.4,
      fontWeight: 400,
      color: colors.neutral600,
      maxWidth: 800,
    }}
  >
    {children}
  </p>
);

/** App UI is authored at its real 390px mobile scale; `zoom` blows it up for
 * video legibility while keeping layout metrics intact. */
export const AppScale: React.FC<{
  zoom?: number;
  width?: number;
  children: React.ReactNode;
}> = ({ zoom = 2.2, width = 390, children }) => (
  <div style={{ zoom, width, textAlign: "left" }}>{children}</div>
);

const LOGO_ASPECT = 240 / 204;

export const Wordmark: React.FC<{ size?: number }> = ({ size = 104 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
    <Img
      src={staticFile("venemed-logo-mark.png")}
      style={{
        width: size * 1.6,
        height: (size * 1.6) / LOGO_ASPECT,
        objectFit: "contain",
      }}
    />
    <div
      style={{
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "#0e2a52", // wordmark primary/900, as on the share cards
      }}
    >
      VeneMed
    </div>
  </div>
);

// ---- scenes --------------------------------------------------------------------

const SceneIntro: React.FC = () => (
  <Frame>
    <FadeUp>
      <Wordmark />
    </FadeUp>
    <FadeUp delay={12}>
      <Sub>Insumos médicos, donde se necesitan.</Sub>
    </FadeUp>
  </Frame>
);

const SceneProblem: React.FC = () => (
  <Frame>
    <FadeUp>
      <Headline>Los donantes quieren ayudar.</Headline>
    </FadeUp>
    <FadeUp delay={34}>
      <Sub>Pero no saben qué necesita tu centro, ni qué ya sobra.</Sub>
    </FadeUp>
  </Frame>
);

const ScenePublish: React.FC = () => (
  <Frame gap={48}>
    <FadeUp>
      <Headline>Publica tu lista.</Headline>
    </FadeUp>
    <FadeUp delay={16}>
      <AppScale>
        <RequestCard request={demoLista} />
      </AppScale>
    </FadeUp>
    <FadeUp delay={72}>
      <Sub>Urgente, necesitamos y no aceptamos. Una sola lista, siempre al día.</Sub>
    </FadeUp>
  </Frame>
);

export const LinkPill: React.FC = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 20,
      backgroundColor: colors.accentSubtle,
      border: `2px solid ${colors.accentBorder}`,
      borderRadius: radius.pill,
      padding: "26px 48px",
      fontSize: 40,
      fontWeight: 600,
      color: colors.accent,
    }}
  >
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 14a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 10a5 5 0 0 0-7.07 0l-3.54 3.54a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke={colors.accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    venemedapp.org
  </div>
);

const SceneShareLink: React.FC = () => (
  <Frame>
    <FadeUp>
      <Headline>Los donantes la ven y la comparten.</Headline>
    </FadeUp>
    <FadeUp delay={30}>
      <LinkPill />
    </FadeUp>
    <FadeUp delay={50}>
      <Sub>Sin descargas. Sin registro. Solo un enlace.</Sub>
    </FadeUp>
  </Frame>
);

export const PlatformPill: React.FC<{ icon: React.ReactNode; label: string }> = ({
  icon,
  label,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      backgroundColor: colors.surface,
      border: `2px solid ${colors.neutral200}`,
      borderRadius: radius.pill,
      padding: "20px 40px",
      fontSize: 36,
      fontWeight: 600,
      color: colors.neutral700,
    }}
  >
    {icon}
    {label}
  </div>
);

export const InstagramGlyph: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <rect
      x="2.5"
      y="2.5"
      width="19"
      height="19"
      rx="5.5"
      stroke={colors.neutral700}
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="4.2" stroke={colors.neutral700} strokeWidth="2" />
    <circle cx="17.3" cy="6.7" r="1.4" fill={colors.neutral700} />
  </svg>
);

export const WhatsAppGlyph: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3Z"
      stroke={colors.neutral700}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M8.6 9.2c0 3.4 2.8 6.2 6.2 6.2.6 0 1.2-.4 1.4-1l.2-.7c.1-.4-.1-.8-.5-1l-1.5-.7a.9.9 0 0 0-1 .2l-.4.4a4.8 4.8 0 0 1-2.6-2.6l.4-.4c.3-.2.4-.7.2-1l-.7-1.5c-.2-.4-.6-.6-1-.5l-.7.2c-.6.2-1 .8-1 1.4Z"
      fill={colors.neutral700}
    />
  </svg>
);

/** The story-image share scene: the ACTUAL 1080×1920 story card (vendored from
 * lib/og/lista-card.tsx) shown as a story preview, with the platforms it ships
 * to. */
const SceneStoryShare: React.FC = () => (
  <Frame gap={48}>
    <FadeUp>
      <Headline>O compártela como imagen.</Headline>
    </FadeUp>
    <FadeUp delay={18}>
      <div
        style={{
          borderRadius: 36,
          overflow: "hidden",
          border: `3px solid ${colors.neutral200}`,
          boxShadow: "0 30px 70px rgba(17, 24, 39, 0.14)",
        }}
      >
        <AppScale zoom={0.42} width={1080}>
          <StoryCard lista={storyLista} />
        </AppScale>
      </div>
    </FadeUp>
    <FadeUp delay={52} style={{ display: "flex", gap: 28 }}>
      <PlatformPill icon={<InstagramGlyph />} label="Instagram" />
      <PlatformPill icon={<WhatsAppGlyph />} label="WhatsApp" />
    </FadeUp>
    <FadeUp delay={68}>
      <Sub>Lista para historias y estados, con un solo toque.</Sub>
    </FadeUp>
  </Frame>
);

const SceneFreshness: React.FC = () => (
  <Frame>
    <FadeUp>
      <Headline>Confírmala con un toque.</Headline>
    </FadeUp>
    <FadeUp delay={20}>
      <AppScale>
        <Card>
          <p className="text-sm text-neutral-700">
            Actualizada hace 5 días · ¿sigue vigente?
          </p>
          <div className="mt-3">
            <Button variant="primary" size="md" fullWidth>
              Sí, sigue vigente
            </Button>
          </div>
        </Card>
      </AppScale>
    </FadeUp>
    <FadeUp delay={52}>
      <Sub>Nada expira. Tu lista vive mientras la necesites.</Sub>
    </FadeUp>
  </Frame>
);

const SceneCta: React.FC = () => (
  <Frame>
    <FadeUp>
      <Wordmark size={72} />
    </FadeUp>
    <FadeUp delay={14}>
      <Headline>Registra tu centro hoy.</Headline>
    </FadeUp>
    <FadeUp delay={38}>
      <div
        style={{
          backgroundColor: colors.accent,
          color: colors.accentOn,
          borderRadius: radius.md,
          padding: "30px 72px",
          fontSize: 44,
          fontWeight: 600,
        }}
      >
        venemedapp.org
      </div>
    </FadeUp>
    <FadeUp delay={58}>
      <Sub>Gratis. Hecho para Venezuela.</Sub>
    </FadeUp>
  </Frame>
);

// ---- main -----------------------------------------------------------------------

const scenes: Array<{ Comp: React.FC; duration: number }> = [
  { Comp: SceneIntro, duration: S1 },
  { Comp: SceneProblem, duration: S2 },
  { Comp: ScenePublish, duration: S3 },
  { Comp: SceneShareLink, duration: S4 },
  { Comp: SceneStoryShare, duration: S5 },
  { Comp: SceneFreshness, duration: S6 },
  { Comp: SceneCta, duration: S7 },
];

export const VenemedPromo: React.FC = () => {
  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily }}>
      {scenes.map(({ Comp, duration }, i) => {
        const el = (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SceneExit durationInFrames={duration}>
              <Comp />
            </SceneExit>
          </Sequence>
        );
        from += duration;
        return el;
      })}
    </AbsoluteFill>
  );
};
