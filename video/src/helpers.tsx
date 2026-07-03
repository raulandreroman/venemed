import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { DUR, EASE_ENTER, EASE_EXIT, EASE_FADE } from "./theme";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/**
 * Entrance: opacity resolves on EASE_FADE (faster), the rise settles on
 * EASE_ENTER (slower) — the standard fade-leads-transform pairing.
 */
export const FadeUp: React.FC<{
  delay?: number;
  distance?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, distance = 32, children, style }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        opacity: interpolate(frame, [delay, delay + DUR.fade], [0, 1], {
          ...clamp,
          easing: EASE_FADE,
        }),
        translate: interpolate(
          frame,
          [delay, delay + DUR.enter],
          [`0px ${distance}px`, "0px 0px"],
          { ...clamp, easing: EASE_ENTER },
        ),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * Scene exit: accelerating fade + slight upward drift over the last
 * DUR.exit frames, so the scene leaves with intent instead of lingering.
 */
export const SceneExit: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const start = durationInFrames - DUR.exit;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        opacity: interpolate(frame, [start, durationInFrames], [1, 0], {
          ...clamp,
          easing: EASE_EXIT,
        }),
        translate: interpolate(
          frame,
          [start, durationInFrames],
          ["0px 0px", "0px -14px"],
          { ...clamp, easing: EASE_EXIT },
        ),
      }}
    >
      {children}
    </div>
  );
};
