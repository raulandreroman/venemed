import { ImageResponse } from "next/og";
import { BrandMark } from "../_brand/mark";

export const dynamic = "force-static";

const size = 512;

export function GET() {
  return new ImageResponse(<BrandMark size={size} maskable />, {
    width: size,
    height: size,
  });
}
