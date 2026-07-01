import { notFound } from "next/navigation";

import { getListaById } from "@/db/queries";
import {
  DetailFooter,
  RequestDetailBody,
} from "@/app/(public)/listas/[id]/_components/detail-body";
import { RequestSheet } from "@/app/(public)/listas/[id]/_components/request-sheet";

export const revalidate = 60;

type PageProps = { params: Promise<{ id: string }> };

/**
 * Intercepted detail — when /listas/[id] is reached from the list, this
 * renders the same RequestDetailBody inside a bottom sheet over the list.
 * Direct visits hit the full page (listas/[id]/page.tsx) instead.
 */
export default async function InterceptedRequestDetail({ params }: PageProps) {
  const { id } = await params;
  const req = await getListaById(id);
  if (!req) notFound();

  return (
    <RequestSheet footer={<DetailFooter req={req} />}>
      <RequestDetailBody req={req} />
    </RequestSheet>
  );
}
