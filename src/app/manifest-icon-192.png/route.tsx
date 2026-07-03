import { ImageResponse } from "next/og";
import { BrandMark } from "../_brand/mark";

export const dynamic = "force-static";

const size = 192;

export function GET() {
  return new ImageResponse(<BrandMark size={size} />, {
    width: size,
    height: size,
  });
}
