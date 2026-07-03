import type { ReactElement } from "react";

// Brand mark for generated icons (apple-icon + manifest PNG routes).
// Accent-blue field with a white medical cross. Drawn with divs so it renders
// under Satori (next/og ImageResponse), which has no full SVG support.
const ACCENT = "#1f5aa8"; // --color-accent
const ON_ACCENT = "#ffffff"; // --color-accent-on

export function BrandMark({
  size,
  maskable = false,
}: {
  size: number;
  maskable?: boolean;
}): ReactElement {
  // Maskable icons are cropped by the OS to arbitrary shapes, so the field
  // must bleed to the edges (no rounding) and the glyph must stay inside the
  // inner ~80% safe zone. Non-maskable icons get a rounded field.
  const cross = size * (maskable ? 0.46 : 0.6); // glyph extent
  const arm = cross * 0.34; // bar thickness

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ACCENT,
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      <div
        style={{
          position: "relative",
          width: cross,
          height: cross,
          display: "flex",
        }}
      >
        {/* vertical bar */}
        <div
          style={{
            position: "absolute",
            left: (cross - arm) / 2,
            top: 0,
            width: arm,
            height: cross,
            background: ON_ACCENT,
            borderRadius: arm * 0.28,
          }}
        />
        {/* horizontal bar */}
        <div
          style={{
            position: "absolute",
            top: (cross - arm) / 2,
            left: 0,
            width: cross,
            height: arm,
            background: ON_ACCENT,
            borderRadius: arm * 0.28,
          }}
        />
      </div>
    </div>
  );
}
