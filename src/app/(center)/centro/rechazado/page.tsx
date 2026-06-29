import { redirect } from "next/navigation";
import { AppBar, Button } from "@/components/ui";
import { requireCenter } from "@/lib/auth/require-center";
import { supportWhatsappHref } from "@/lib/support";
import { SignOutButton } from "../../_components/sign-out-button";

/**
 * PLACEHOLDER for rejected (and suspended) centers — Figma 29:2030
 * ("Estado del registro"). Renders center.rejectionReason. The "Corregir datos"
 * CTA is dropped (registro is out of scope); the primary CTA is sign-out.
 */
export default async function RechazadoPage() {
  const center = await requireCenter();
  if (center.status === "approved") redirect("/centro");
  if (center.status === "pending_review") redirect("/centro/en-revision");
  // status === "rejected" | "suspended" → render

  const reason =
    center.rejectionReason?.trim() ||
    "El equipo de VeneMed no especificó un motivo. Escríbenos a soporte para más detalles.";

  return (
    <>
      <AppBar title="Estado del registro" backHref={null} align="start" />
      <main className="flex flex-1 flex-col p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-tint text-error">
          <WarningIcon />
        </div>

        <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-error-tint px-3 py-1 text-sm font-medium text-error">
          <span aria-hidden>●</span> Necesita corrección
        </span>

        <h1 className="mt-3 text-2xl font-bold text-neutral-900">
          Necesitamos corregir algunos datos
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Revisamos tu registro pero no pudimos verificar el centro. Corrige lo
          indicado y lo revisaremos de nuevo.
        </p>

        <div className="mt-5 rounded-xl border-l-4 border-error bg-error-tint p-4">
          <p className="text-sm font-semibold text-error">
            Motivo del equipo de VeneMed
          </p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700">
            {reason}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <SignOutButton />
          <Button href={supportWhatsappHref()} variant="ghost" fullWidth>
            Contactar a soporte
          </Button>
        </div>
      </main>
    </>
  );
}

function WarningIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
