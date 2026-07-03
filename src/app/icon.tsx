import { ImageResponse } from "next/og";

import { OfficialIcon } from "./_brand/official-mark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<OfficialIcon size={size.width} />, { ...size });
}
