import { readFile } from "node:fs/promises";
import path from "node:path";

// Inter TTFs for satori (next/og ImageResponse) — it can't use next/font.
// Committed under src/assets/fonts (Inter 4.1, SIL OFL).
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
};

export async function loadInterFonts(): Promise<OgFont[]> {
  const [regular, semibold, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, "Inter-Regular.ttf")),
    readFile(path.join(FONT_DIR, "Inter-SemiBold.ttf")),
    readFile(path.join(FONT_DIR, "Inter-Bold.ttf")),
  ]);
  return [
    { name: "Inter", data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(semibold), weight: 600, style: "normal" },
    { name: "Inter", data: toArrayBuffer(bold), weight: 700, style: "normal" },
  ];
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
