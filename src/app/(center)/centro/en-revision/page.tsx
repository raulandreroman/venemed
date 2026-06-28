import { redirect } from "next/navigation";
import { AppBar } from "@/components/ui";
import { requireCenter } from "@/lib/auth/require-center";
import { SignOutButton } from "../../_components/sign-out-button";

/**
 * PLACEHOLDER for pending_review centers — Figma 8:733 ("Casi listo").
 * The "Editar datos del centro" CTA is dropped (registro is out of scope);
 * the primary CTA is sign-out.
 */
export default async function EnRevisionPage() {
  const center = await requireCenter();
  if (center.status === "approved") redirect("/centro");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "pending_review" → render

  const steps = [
    "Te escribiremos por WhatsApp en un plazo de 24 a 48 horas.",
    "Confirmaremos la identidad del responsable y la legitimidad del centro.",
    "Activamos tu cuenta y podrás publicar tus alertas de necesidades.",
  ];

  return (
    <>
      <AppBar title="Casi listo" backHref={null} align="start" />
      <main className="flex flex-1 flex-col p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-tint text-warning">
          <ClockIcon />
        </div>

        <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-tint px-3 py-1 text-sm font-medium text-warning">
          <span aria-hidden>●</span> Pendiente de verificación
        </span>

        <h1 className="mt-3 text-2xl font-bold text-neutral-900">
          Estamos verificando tu centro
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Tu teléfono quedó verificado. Ahora nuestro equipo confirmará la
          veracidad del centro y de la persona responsable antes de activar tus
          alertas.
        </p>

        <ol className="mt-5 flex flex-col gap-4">
          {steps.map((text, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
                {i + 1}
              </span>
              <span className="text-[15px] leading-relaxed text-neutral-700">
                {text}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-xl border-l-4 border-accent bg-neutral-50 p-4">
          <p className="text-sm font-semibold text-neutral-900">
            Somos el equipo moderador de VeneMed.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            Nunca te pedimos dinero ni claves. Verificamos para proteger la red
            de ayuda.
          </p>
        </div>

        <div className="mt-auto pt-6">
          <SignOutButton label="Entendido · Cerrar sesión" />
        </div>
      </main>
    </>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
