import { redirect } from "next/navigation";

import { AppBar } from "@/components/ui";
import {
  countCenterMembers,
  getPendingInvitations,
  getTeamMembers,
} from "@/db/queries";
import { requireResponsable } from "@/lib/auth/require-responsable";
import { MEMBER_CAP, isCenterFull } from "@/lib/team/validation";

import { InviteMemberButton } from "./_components/invite-member-button";
import { MemberRow } from "./_components/member-row";
import { PendingInvitationRow } from "./_components/pending-invitation-row";

/**
 * Equipo — "Personas con acceso a {center}" (Figma 205:8874, adapted for the
 * email+link invite flow). Responsable-only: an Operador who somehow reaches
 * this URL is bounced to /centro by `requireResponsable()`.
 */
export default async function EquipoPage() {
  const current = await requireResponsable();
  if (current.status === "pending_review") redirect("/centro/en-revision");
  if (current.status === "rejected" || current.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const [members, pendingInvitations, memberCount] = await Promise.all([
    getTeamMembers(current.centerId),
    getPendingInvitations(current.centerId),
    countCenterMembers(current.centerId),
  ]);
  const atCap = isCenterFull(memberCount);

  return (
    <>
      <AppBar title="Equipo" backHref="/centro/perfil" />

      <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-5">
        <section>
          <h1 className="text-lg font-bold text-neutral-900">
            Personas con acceso a {current.centerName}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {memberCount} de {MEMBER_CAP} miembros
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold text-neutral-500">
            Miembros
          </h2>
          <div className="flex flex-col">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={{
                  userId: m.userId,
                  name: m.name,
                  role: m.role,
                  createdAt: m.createdAt,
                  isSelf: m.userId === current.userId,
                }}
              />
            ))}
          </div>
        </section>

        {pendingInvitations.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-semibold text-neutral-500">
              Invitaciones pendientes
            </h2>
            <div className="flex flex-col">
              {pendingInvitations.map((inv) => (
                <PendingInvitationRow key={inv.id} invite={inv} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
        <InviteMemberButton centerName={current.centerName} atCap={atCap} />
      </footer>
    </>
  );
}
