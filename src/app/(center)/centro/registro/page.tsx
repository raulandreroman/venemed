import { redirect } from "next/navigation";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { RegistroWizard } from "./registro-wizard";

/**
 * Center registration entry (R0 → Datos → Verificar → En revisión). Public
 * (listed in PUBLIC_CENTER_PATHS). Resolves the session to pick the wizard mode:
 *  - "center"        → already registered → redirect to status (idempotency mirror).
 *  - "no-membership" → authed user: skip OTP, prefill+lock the verified phone.
 *  - "anon"          → full flow: intro → datos → otp → create.
 */
export default async function RegistroPage() {
  const session = await getCurrentCenter();

  if (session.kind === "center") {
    redirect(ROUTE_BY_STATUS[session.center.status] ?? "/centro/en-revision");
  }

  if (session.kind === "no-membership") {
    return <RegistroWizard mode="authed" defaultPhone={session.phone} />;
  }

  return <RegistroWizard mode="anon" />;
}
