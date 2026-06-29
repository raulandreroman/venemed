import { redirect } from "next/navigation";

import { AppBar } from "@/components/ui";
import { getActiveSupplies } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";

import { CreateRequestForm } from "./_components/create-request-form";

/**
 * Crear solicitud (Figma 32:4929). Server wrapper: same status gate as the
 * dashboard (only approved centers author), then loads the full catalog for the
 * co-located selector and hands it to the client form. The "área" facet was
 * dropped — the selector searches one flat list.
 */
export default async function NuevaSolicitudPage() {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const supplies = await getActiveSupplies();

  return (
    <>
      <AppBar title="Nueva solicitud" backHref="/centro" align="start" />
      <CreateRequestForm supplies={supplies} />
    </>
  );
}
