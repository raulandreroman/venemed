import Link from "next/link";

import { Logo } from "@/components/ui";
import { MEMBER_CAP } from "@/lib/team/validation";

/** Landed here when the center hit the member cap between the invitee opening
 * the link and finishing verification. */
export default function EquipoLlenoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
      <Logo />
      <h1 className="text-xl font-bold text-neutral-900">
        Este equipo ya está completo
      </h1>
      <p className="max-w-[300px] text-sm text-neutral-500">
        El centro ya alcanzó el máximo de {MEMBER_CAP} miembros.
      </p>
      <Link href="/" className="text-sm font-semibold text-accent">
        Ir al inicio
      </Link>
    </main>
  );
}
