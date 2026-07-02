import Link from "next/link";

import { Logo } from "@/components/ui";

/** Landed here when the just-verified user already belongs to a center — the
 * one-center-per-user rule blocks silently moving them. */
export default function YaTienesCentroPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
      <Logo />
      <h1 className="text-xl font-bold text-neutral-900">
        Ya perteneces a un centro
      </h1>
      <p className="max-w-[300px] text-sm text-neutral-500">
        Solo puedes estar en el equipo de un centro a la vez.
      </p>
      <Link href="/centro" className="text-sm font-semibold text-accent">
        Ir a mi centro
      </Link>
    </main>
  );
}
