import { ImageResponse } from "next/og";
import { OfficialIcon } from "../_brand/official-mark";

export const dynamic = "force-static";

const size = 192;

export function GET() {
  return new ImageResponse(<OfficialIcon size={size} />, {
    width: size,
    height: size,
  });
}
