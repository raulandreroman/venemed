import { notFound } from "next/navigation";

import { getRequestById } from "@/db/queries";
import { isUuid } from "@/lib/uuid";
import {
  DetailFooter,
  RequestDetailBody,
} from "@/app/(public)/solicitudes/[id]/_components/detail-body";
import { RequestSheet } from "@/app/(public)/solicitudes/[id]/_components/request-sheet";

export const revalidate = 60;

type PageProps = { params: Promise<{ id: string }> };

/**
 * Intercepted detail — when /solicitudes/[id] is reached from the list, this
 * renders the same RequestDetailBody inside a bottom sheet over the list.
 * Direct visits hit the full page (solicitudes/[id]/page.tsx) instead.
 */
export default async function InterceptedRequestDetail({ params }: PageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const req = await getRequestById(id);
  if (!req) notFound();

  return (
    <RequestSheet footer={<DetailFooter req={req} />}>
      <RequestDetailBody req={req} />
    </RequestSheet>
  );
}
