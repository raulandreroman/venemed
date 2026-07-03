import { ImageResponse } from "next/og";
import { OfficialIcon } from "../_brand/official-mark";

export const dynamic = "force-static";

const size = 512;

export function GET() {
  return new ImageResponse(<OfficialIcon size={size} maskable />, {
    width: size,
    height: size,
  });
}
