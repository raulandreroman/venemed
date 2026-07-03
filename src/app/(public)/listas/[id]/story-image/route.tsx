import { ImageResponse } from "next/og";

import { getListaById } from "@/db/queries";
import { loadInterFonts } from "@/lib/og/fonts";
import { ListaCard, listaCardSize } from "@/lib/og/lista-card";

// Per-lista STORY share image (1080×1920) — the portrait card attached to
// native shares (see @/lib/share/native-share). Same conversational card as the
// landscape og:image, from the shared Satori-safe @/lib/og/lista-card module.
//
// This is a per-lista DYNAMIC route (not force-static): `revalidate` opts the
// GET into ISR-style caching so it mirrors the page's 60s window rather than
// rebuilding on every request. Route Segment Config `revalidate` is valid on a
// Route Handler here (Cache Components is not enabled).
export const revalidate = 60;

const size = listaCardSize("story");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lista = await getListaById(id);

  return new ImageResponse(<ListaCard lista={lista} format="story" />, {
    ...size,
    fonts: await loadInterFonts(),
  });
}
