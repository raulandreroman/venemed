import { ImageResponse } from "next/og";

import { getListaById } from "@/db/queries";
import { loadInterFonts } from "@/lib/og/fonts";
import { ListaCard, listaCardSize } from "@/lib/og/lista-card";

// Per-lista landscape social share image (issue #58). The card JSX lives in the
// shared, Satori-safe module @/lib/og/lista-card (also used by the story route).
export const alt = "Lista de insumos en VeneMed";
export const size = listaCardSize("landscape");
export const contentType = "image/png";
// Match the page's ISR window (page.tsx exports revalidate = 60) so a stale
// social-cache refresh picks up edits within a minute, like the donor detail.
export const revalidate = 60;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lista = await getListaById(id);

  return new ImageResponse(<ListaCard lista={lista} format="landscape" />, {
    ...size,
    fonts: await loadInterFonts(),
  });
}
