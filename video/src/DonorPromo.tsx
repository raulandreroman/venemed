/**
 * VenemedDonantes — donor-facing mirror of VenemedPromo. Same structure,
 * scene for scene (intro → problema → la lista → enlace → imagen → frescura →
 * CTA), same durations, same components and motion system. Only the POV
 * flips: it speaks to the donor, not the centro.
 */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { colors } from "./theme";
import { FadeUp, SceneExit } from "./helpers";
import {
  AppScale,
  Frame,
  Headline,
  InstagramGlyph,
  LinkPill,
  PlatformPill,
  Sub,
  WhatsAppGlyph,
  Wordmark,
  demoLista,
  storyLista,
} from "./Composition";
import { RequestCard } from "./vendor/request-card";
import { StoryCard } from "./vendor/lista-card";
import { Tag } from "./vendor/ui";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
});

// Scene durations — same rhythm as VenemedPromo
const S1 = 90; // intro
const S2 = 130; // problem (donor POV)
const S3 = 175; // the lista (real donor card)
const S4 = 125; // open the link
const S5 = 165; // image share to IG / WhatsApp (real story card)
const S6 = 120; // freshness (donor POV)
const S7 = 115; // CTA
export const DONOR_DURATION = S1 + S2 + S3 + S4 + S5 + S6 + S7; // 920

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
      <Headline>Los centros necesitan insumos.</Headline>
    </FadeUp>
    <FadeUp delay={34}>
      <Sub>Pero cada uno necesita cosas distintas, y cambian cada día.</Sub>
    </FadeUp>
  </Frame>
);

const SceneLista: React.FC = () => (
  <Frame gap={48}>
    <FadeUp>
      <Headline>Cada centro publica su lista.</Headline>
    </FadeUp>
    <FadeUp delay={16}>
      <AppScale>
        <RequestCard request={demoLista} />
      </AppScale>
    </FadeUp>
    <FadeUp delay={72}>
      <Sub>Urgente, necesitamos y no aceptamos. Escrita por el propio centro.</Sub>
    </FadeUp>
  </Frame>
);

const SceneLink: React.FC = () => (
  <Frame>
    <FadeUp>
      <Headline>Ábrela y compártela.</Headline>
    </FadeUp>
    <FadeUp delay={30}>
      <LinkPill />
    </FadeUp>
    <FadeUp delay={50}>
      <Sub>Sin descargas. Sin registro. Solo un enlace.</Sub>
    </FadeUp>
  </Frame>
);

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
      <Headline>Información al día.</Headline>
    </FadeUp>
    <FadeUp delay={20}>
      <div style={{ zoom: 2.4 }}>
        <Tag variant="neutral">Actualizada hace 2 horas</Tag>
      </div>
    </FadeUp>
    <FadeUp delay={52}>
      <Sub>Cada centro confirma su lista. Donas exactamente lo que hace falta.</Sub>
    </FadeUp>
  </Frame>
);

const SceneCta: React.FC = () => (
  <Frame>
    <FadeUp>
      <Wordmark size={72} />
    </FadeUp>
    <FadeUp delay={14}>
      <Headline>Encuentra un centro cerca de ti.</Headline>
    </FadeUp>
    <FadeUp delay={38}>
      <div
        style={{
          backgroundColor: colors.accent,
          color: colors.accentOn,
          borderRadius: 12,
          padding: "30px 72px",
          fontSize: 44,
          fontWeight: 600,
        }}
      >
        venemedapp.org
      </div>
    </FadeUp>
    <FadeUp delay={58}>
      <Sub>Sin registro. Gratis. Hecho para Venezuela.</Sub>
    </FadeUp>
  </Frame>
);

const scenes: Array<{ Comp: React.FC; duration: number }> = [
  { Comp: SceneIntro, duration: S1 },
  { Comp: SceneProblem, duration: S2 },
  { Comp: SceneLista, duration: S3 },
  { Comp: SceneLink, duration: S4 },
  { Comp: SceneStoryShare, duration: S5 },
  { Comp: SceneFreshness, duration: S6 },
  { Comp: SceneCta, duration: S7 },
];

export const VenemedDonantes: React.FC = () => {
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
