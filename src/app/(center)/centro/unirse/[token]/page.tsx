import Link from "next/link";

import { Logo } from "@/components/ui";
import { getInvitationForJoin } from "@/db/queries";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { hashInviteToken } from "@/lib/team/token";
import {
  MEMBER_CAP,
  isCenterFull,
  isInviteUsable,
  roleLabel,
} from "@/lib/team/validation";

import { JoinForm } from "./join-form";

/**
 * Public join landing for a team-invite link (Figma "Abrir enlace (correo)"
 * 253:4477). Resolves the token by its HASH only (never the raw value) and
 * funnels every invalid/expired/used/unapproved case to the SAME generic
 * message — a visitor can never learn WHY a link doesn't work.
 */
export default async function JoinInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hash = hashInviteToken(token);
  const invite = await getInvitationForJoin(hash);

  if (!isInviteUsable(invite)) {
    return (
      <InfoScreen
        title="Este enlace ya no es válido"
        body="Pídele al centro que te envíe un enlace de invitación nuevo."
      />
    );
  }

  // Already a member of SOME center → never silently move them.
  const current = await getCurrentCenter();
  if (current.kind === "center") {
    return (
      <InfoScreen
        title="Ya perteneces a un centro"
        body="Solo puedes estar en el equipo de un centro a la vez."
      />
    );
  }

  if (isCenterFull(invite.memberCount)) {
    return (
      <InfoScreen
        title="Este equipo está completo"
        body={`${invite.centerName} ya alcanzó el máximo de ${MEMBER_CAP} miembros.`}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col p-4">
      <div className="flex items-center gap-2 py-2">
        <Logo />
        <span className="text-base font-bold text-neutral-900">VeneMed</span>
      </div>

      <JoinForm
        token={token}
        inviteCard={
          <section className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-neutral-100 bg-surface p-5 text-center shadow-sm">
            <h1 className="text-xl font-bold leading-tight text-neutral-900">
              {invite.centerName} te invitó a unirte
            </h1>
            <p className="text-sm leading-relaxed text-neutral-500">
              {invite.inviterName ?? "El responsable"} te agregó como{" "}
              {roleLabel(invite.role)}. Podrás editar la lista del centro y
              agregar insumos.
            </p>
            <p className="text-xs text-neutral-400">
              Esta invitación vence en 24 h
            </p>
          </section>
        }
      />
    </main>
  );
}

function InfoScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
      <Logo />
      <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
      <p className="max-w-[300px] text-sm text-neutral-500">{body}</p>
      <Link href="/" className="text-sm font-semibold text-accent">
        Ir al inicio
      </Link>
    </main>
  );
}
