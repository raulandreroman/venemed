import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppBar } from "@/components/ui";
import { getListaById } from "@/db/queries";
import {
  DetailFooter,
  RequestDetailBody,
  detailTitle,
} from "./_components/detail-body";

// Surge read path: ISR. Query is additionally memoized in getListaById.
export const revalidate = 60;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const req = await getListaById(id);
  if (!req) return { title: "Lista no encontrada · VeneMed" };
  return {
    title: `${req.centerName} · VeneMed`,
    description: req.centerDescription ?? undefined,
  };
}

/**
 * Canonical donor detail — the sole "Perfil Centro" full page for both direct
 * visits and in-app navigation (the intercepted bottom sheet was retired in
 * issue #55). Back returns to the list via the AppBar.
 */
export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const req = await getListaById(id);
  if (!req) notFound();

  return (
    <>
      <AppBar title={detailTitle(req)} />

      <main className="flex-1 px-4 pb-28 pt-4">
        <RequestDetailBody req={req} />
      </main>

      <div className="sticky bottom-0 z-10 mx-auto w-full max-w-[390px] border-t border-neutral-100 bg-surface px-4 py-3">
        <DetailFooter req={req} />
      </div>
    </>
  );
}
