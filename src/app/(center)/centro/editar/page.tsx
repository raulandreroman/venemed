import { eq } from "drizzle-orm";
import { AppBar } from "@/components/ui";
import { db } from "@/db";
import { appUser, center } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireResponsable } from "@/lib/auth/require-responsable";
import {
  vePhoneToNationalDisplay,
  type CenterType,
} from "@/lib/registro/validation";
import type { CenterDatosValues } from "../_components/center-datos-form";
import { EditCenterForm } from "./edit-center-form";

/**
 * Edit the current center's "Datos del centro + Persona responsable". Authed
 * route (NOT public): self-guards via getCurrentCenter(), loads the center +
 * responsible name scoped to the session, pre-fills the shared form, and
 * submits to `updateCenterForCurrentUser`. No OTP here.
 */
export default async function EditarPage() {
  // Responsable-only: matches the mutation's authorization boundary. Composes
  // requireCenter() (anon → /centro/login, no-membership → /centro/registro),
  // and bounces an Operador to /centro.
  const { centerId, userId, status } = await requireResponsable();

  const [row] = await db
    .select({
      name: center.name,
      type: center.type,
      city: center.city,
      state: center.state,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
      whatsappPhone: center.whatsappPhone,
      responsibleName: appUser.name,
      cargo: appUser.cargo,
    })
    .from(center)
    .leftJoin(appUser, eq(appUser.id, userId))
    .where(eq(center.id, centerId))
    .limit(1);

  const initialValues: CenterDatosValues = {
    name: row?.name ?? "",
    type: (row?.type ?? "") as CenterType | "",
    state: row?.state ?? "",
    city: row?.city ?? "",
    addressLine: row?.addressLine ?? "",
    addressReference: row?.addressReference ?? "",
    regularScheduleText: row?.regularScheduleText ?? "",
    // Required WhatsApp contact — national digits WITH the leading 0 for display.
    nationalPhone: vePhoneToNationalDisplay(row?.whatsappPhone),
    // Email is the login identity, not editable here — the field is hidden.
    email: "",
    responsibleName: row?.responsibleName ?? "",
    cargo: row?.cargo ?? "",
  };

  const statusRoute = ROUTE_BY_STATUS[status] ?? "/centro/en-revision";

  return (
    <>
      <AppBar title="Editar datos del centro" backHref={statusRoute} />
      <EditCenterForm initialValues={initialValues} />
    </>
  );
}
