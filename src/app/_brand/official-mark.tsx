import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";

// Official VeneMed logo (hands cradling a medical cross, Figma Kit de prensa)
// for generated icons (icon/apple-icon + manifest PNG routes). Read once at
// module load and inlined as a data: URI — satori can't fetch files itself.
const LOGO_PATH = path.join(process.cwd(), "src/assets/venemed-logo-mark.png");
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
const LOGO_ASPECT = 240 / 204;

export function officialLogoDataUri(): string {
  return LOGO_DATA_URI;
}

/**
 * Square icon card: the mark centered on a white field. Non-maskable icons get
 * a rounded field; maskable icons bleed to the edges (the OS crops arbitrary
 * shapes) with the mark inside the inner ~72% safe zone.
 */
export function OfficialIcon({
  size,
  maskable = false,
}: {
  size: number;
  maskable?: boolean;
}): ReactElement {
  const markWidth = size * (maskable ? 0.58 : 0.78);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        borderRadius: maskable ? 0 : size * 0.2,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_DATA_URI}
        alt=""
        width={markWidth}
        height={markWidth / LOGO_ASPECT}
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
