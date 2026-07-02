import Link from "next/link";

import { Logo } from "@/components/ui";

/** Landed here when `acceptInvitation` finds the token unusable at the moment
 * of verification (unknown hash / not pending / expired / center unapproved).
 * Deliberately generic — never reveals which condition failed. */
export default function InvitacionInvalidaPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
      <Logo />
      <h1 className="text-xl font-bold text-neutral-900">
        Este enlace de invitación ya no es válido
      </h1>
      <p className="max-w-[300px] text-sm text-neutral-500">
        Pídele al centro un enlace nuevo.
      </p>
      <Link href="/" className="text-sm font-semibold text-accent">
        Ir al inicio
      </Link>
    </main>
  );
}
