import { ImageResponse } from "next/og";
import { officialLogoDataUri } from "./_brand/official-mark";
import { loadInterFonts } from "@/lib/og/fonts";

// Site-wide Open Graph image — serves "/", "/listas", and any route without
// its own opengraph-image. Nested segments (e.g. /listas/[id]) override it.
// Fully static: no request-time APIs → prerendered at build time and cached.

export const alt =
  "VeneMed — El puente directo entre tu ayuda y quien la necesita";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Design tokens (from src/app/globals.css) — inlined because Satori has no
// className/Tailwind support.
const BG = "#ffffff"; // --color-surface
const FG = "#111827"; // --color-neutral-900 (primary text)
const MUTED = "#4b5563"; // --color-neutral-600 (body text)
const FAINT = "#9aa2b1"; // --color-neutral-400 (muted)
const ACCENT = "#1f5aa8"; // --color-accent (brand field of the mark)

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "88px 96px",
        }}
      >
        {/* Brand lockup: mark + wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={officialLogoDataUri()} alt="" width={165} height={140} style={{ objectFit: "contain" }} />
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: 96,
              color: FG,
              letterSpacing: -2,
            }}
          >
            VeneMed
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 52,
            lineHeight: 1.18,
            color: MUTED,
            maxWidth: 960,
          }}
        >
          El puente directo entre tu ayuda y quien la necesita
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 64,
              height: 4,
              background: ACCENT,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 30,
              color: FAINT,
            }}
          >
            venemedapp.org
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: await loadInterFonts(),
    },
  );
}
