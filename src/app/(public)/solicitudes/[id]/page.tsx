import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppBar } from "@/components/ui";
import { getRequestById } from "@/db/queries";
import { isUuid } from "@/lib/uuid";
import {
  DETAIL_TITLE,
  DetailFooter,
  RequestDetailBody,
  ShareGlyph,
} from "./_components/detail-body";

// Surge read path: ISR. Query is additionally memoized in getRequestById.
export const revalidate = 60;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Solicitud no encontrada · VeneMed" };
  const req = await getRequestById(id);
  if (!req) return { title: "Solicitud no encontrada · VeneMed" };
  return {
    title: `${req.centerName} · VeneMed`,
    description: req.centerDescription ?? undefined,
  };
}

/**
 * Full-page detail — rendered on direct visit / refresh / deep link. When the
 * route is reached from the list it is intercepted into a bottom sheet
 * (@modal/(.)solicitudes/[id]). Both share the same RequestDetailBody.
 */
export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const req = await getRequestById(id);
  if (!req) notFound();

  const isActive = !(req.status === "closed" || req.status === "expired");

  return (
    <>
      <AppBar title={DETAIL_TITLE} trailing={isActive ? <ShareGlyph /> : undefined} />

      <main className="flex-1 px-4 pb-28 pt-4">
        <RequestDetailBody req={req} />
      </main>

      <div className="sticky bottom-0 z-10 mx-auto w-full max-w-[390px] border-t border-neutral-100 bg-surface px-4 py-3">
        <DetailFooter req={req} />
      </div>
    </>
  );
}
