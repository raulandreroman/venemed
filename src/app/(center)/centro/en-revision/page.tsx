import { redirect } from "next/navigation";
import { AppBar, Button } from "@/components/ui";
import { requireCenter } from "@/lib/auth/require-center";
import { SignOutButton } from "../../_components/sign-out-button";

/**
 * "Casi listo" — pending_review centers (Figma 8:733). The phone is verified;
 * a moderator must approve the center before it can publish.
 */
export default async function EnRevisionPage() {
  const center = await requireCenter();
  if (center.status === "approved") redirect("/centro");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "pending_review" → render

  const steps = [
    `Te escribiremos por WhatsApp al ${maskPhone(center.phone)} en un plazo de 24 a 48 horas.`,
    "Confirmaremos la identidad del responsable y la legitimidad del centro.",
    "Activamos tu cuenta y podrás publicar tus alertas de necesidades.",
  ];

  return (
    <>
      <AppBar
        title="Casi listo"
        backHref={null}
        align="start"
        trailing={
          <span className="text-[13px] font-medium text-neutral-500">3 de 3</span>
        }
      />

      <main className="flex flex-1 flex-col">
        <div className="flex flex-col gap-[18px] px-5 py-[22px]">
          {/* stepper — all three steps complete */}
          <div className="flex gap-1.5">
            <span className="h-1.5 flex-1 rounded-full bg-accent" />
            <span className="h-1.5 flex-1 rounded-full bg-accent" />
            <span className="h-1.5 flex-1 rounded-full bg-accent" />
          </div>

          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-tint text-warning">
            <ClockIcon />
          </div>

          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-tint py-1.5 pl-2.5 pr-3 text-[13px] font-semibold text-warning">
            <span aria-hidden className="text-[10px]">
              ●
            </span>
            Pendiente de verificación
          </span>

          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-bold leading-7 text-neutral-900">
              Estamos verificando tu centro
            </h1>
            <p className="text-[15px] leading-[22px] text-neutral-500">
              Tu teléfono quedó verificado. Ahora nuestro equipo confirmará la
              veracidad del centro y de la persona responsable antes de activar
              tus alertas.
            </p>
          </div>

          <ol className="flex flex-col gap-3.5">
            {steps.map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[13px] font-bold text-accent-hover">
                  {i + 1}
                </span>
                <span className="text-[14px] leading-[21px] text-neutral-700">
                  {text}
                </span>
              </li>
            ))}
          </ol>

          {/* moderator note — inner accent bar + subtle box */}
          <div className="flex gap-2.5 rounded-md border border-neutral-300 bg-neutral-50 px-3.5 py-3">
            <span className="w-1 shrink-0 self-stretch rounded-sm bg-accent" />
            <div className="flex flex-col gap-0.5">
              <p className="text-[13px] font-semibold leading-[18px] text-neutral-900">
                Somos el equipo moderador de VeneMed.
              </p>
              <p className="text-[13px] leading-[18px] text-neutral-500">
                Nunca te pedimos dinero ni claves. Verificamos para proteger la
                red de ayuda.
              </p>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="mt-auto flex flex-col gap-2.5 border-t border-neutral-100 px-5 pb-5 pt-3.5">
          <SignOutButton label="Entendido" variant="primary" />
          <Button
            href="/centro/editar"
            variant="ghost"
            fullWidth
            className="border-[1.5px] border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-50"
          >
            Editar datos del centro
          </Button>
        </div>
      </main>
    </>
  );
}

/** "+584241234567" → "+58 424 ••• 4567". */
function maskPhone(e164: string | null): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  const nat = d.startsWith("58") ? d.slice(2) : d;
  if (nat.length < 7) return e164 ?? "";
  return `+58 ${nat.slice(0, 3)} ••• ${nat.slice(-4)}`;
}

function ClockIcon() {
  return (
    <svg
      width="30"
      height="30"
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
