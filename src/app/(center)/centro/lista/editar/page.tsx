import { redirect } from "next/navigation";

import { getActiveSupplies, getCenterListaForEdit } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";

import { ListaEditor } from "./_components/lista-editor";

/**
 * Crear/editar lista (Figma "Creación de lista" 210:11093 et seq). Server
 * wrapper: same status gate as the dashboard, then loads the full catalog for
 * the co-located selector plus the center's existing evergreen lista (if any —
 * lista-model-v2 is create-once-then-edit, one live lista per center) so the
 * editor pre-fills. `?paso=exceso` (the dashboard's "+ Avisar lo que tienes en
 * exceso" deep link, shown when there are zero excess items) jumps straight to
 * step 2's aviso-de-exceso form.
 */
export default async function EditarListaPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const [supplies, existing, { paso }] = await Promise.all([
    getActiveSupplies(),
    getCenterListaForEdit(center.centerId),
    searchParams,
  ]);

  return (
    <ListaEditor
      supplies={supplies}
      initial={existing}
      initialStep={paso === "exceso" ? 2 : 1}
    />
  );
}
