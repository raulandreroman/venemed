import { redirect } from "next/navigation";

import { AppBar } from "@/components/ui";
import { getSuppliesByCategory } from "@/db/queries";
import { AREA_VALUES } from "@/lib/areas";
import { requireCenter } from "@/lib/auth/require-center";

import { CreateRequestForm } from "./_components/create-request-form";

/**
 * Crear solicitud (Figma 32:4929). Server wrapper: same status gate as the
 * dashboard (only approved centers author), then loads the catalog grouped by
 * area for the co-located selector and hands it to the client form.
 */
export default async function NuevaSolicitudPage() {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  // Tiny catalog (3 supplies/area) — fetch all 6 areas so the client selector
  // can switch areas with no async round-trip when the sheet opens.
  const lists = await Promise.all(
    AREA_VALUES.map((v) => getSuppliesByCategory(v)),
  );
  const suppliesByArea = Object.fromEntries(
    AREA_VALUES.map((v, i) => [v, lists[i]]),
  );

  return (
    <>
      <AppBar title="Nueva solicitud" backHref="/centro" align="start" />
      <CreateRequestForm suppliesByArea={suppliesByArea} />
    </>
  );
}
