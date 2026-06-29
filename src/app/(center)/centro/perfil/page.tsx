import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar, Tag } from "@/components/ui";
import { CenterRequestCard } from "@/app/(center)/centro/_components/center-request-card";
import { SignOutButton } from "@/app/(center)/_components/sign-out-button";
import { getCenterProfile, getCenterRequestsClosedSince } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import {
  centerTypeLabel,
  formatRelativeTime,
  formatVePhone,
} from "@/lib/format";

import { ReceptionToggle } from "./_components/reception-toggle";

/**
 * Center profile (Figma 57:1886 Activo / 57:2009 Pausado). Approved-only — same
 * status gate as the dashboard. Read-only center info + the reception kill-switch
 * (slice 3.4). "Tipo de centro" is gated behind CENTER_TYPE_ENABLED (default OFF)
 * and `center.type` is nullable, so the type never renders unless both hold.
 */
export default async function CenterProfilePage() {
  const current = await requireCenter();
  if (current.status === "pending_review") redirect("/centro/en-revision");
  if (current.status === "rejected" || current.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const profile = await getCenterProfile(current.centerId, current.userId);
  if (!profile) redirect("/centro");

  const paused = profile.receptionPausedAt != null;
  const showType = CENTER_TYPE_ENABLED && profile.type != null;
  const typeLabel = showType ? centerTypeLabel(profile.type!) : null;

  // Pausado screen also lists the requests closed by the pause.
  const closedOnPause = paused
    ? await getCenterRequestsClosedSince(
        current.centerId,
        profile.receptionPausedAt!,
      )
    : [];

  const subtitle = [typeLabel, profile.city].filter(Boolean).join(" · ");

  return (
    <>
      <AppBar title="Perfil del centro" backHref="/centro" />

      <main className="flex flex-1 flex-col gap-6 px-4 pb-12 pt-5">
        {/* (1) avatar + name + chips */}
        <section className="flex flex-col items-center gap-3 text-center">
          <span
            className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ${
              paused
                ? "bg-neutral-100 text-neutral-500"
                : "bg-accent text-accent-on"
            }`}
          >
            {initialsFrom(profile.name)}
          </span>
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-neutral-900">
              {profile.name}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* The profile route is approved-gated, so the center is verified. */}
            <Tag variant="fulfilled" dot>
              Verificado
            </Tag>
            {paused && (
              <Tag variant="soon" dot>
                En pausa
              </Tag>
            )}
          </div>
        </section>

        {/* (2) reception kill-switch */}
        <ReceptionToggle
          paused={paused}
          pausedSince={
            paused ? `desde ${formatRelativeTime(profile.receptionPausedAt)}` : ""
          }
        />

        {/* Pausado: requests closed at pause */}
        {paused && closedOnPause.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold text-neutral-900">
              Solicitudes cerradas al pausar
            </h2>
            {closedOnPause.map((r) => (
              <CenterRequestCard key={r.id} request={r} />
            ))}
          </section>
        )}

        {/* (3) lifetime stats — Activas + Cumplidas (decision §5.3) */}
        <section className="flex items-stretch rounded-2xl border border-neutral-100 bg-surface shadow-sm">
          <StatCell label="Activas" value={profile.activas} />
          <span className="my-3 w-px self-stretch bg-neutral-100" />
          <StatCell label="Cumplidas" value={profile.cumplidas} />
        </section>

        {/* (4) Información del centro */}
        <Section title="Información del centro">
          <InfoRow label="Nombre legal" value={profile.name} />
          {showType && <InfoRow label="Tipo" value={typeLabel!} />}
          <InfoRow label="Ciudad" value={cityLine(profile.city, profile.state)} />
          <InfoRow
            label="Dirección"
            value={profile.addressLine ?? "No especificada"}
          />
          <LinkRow href="/centro/editar" label="Editar datos del centro" />
        </Section>

        {/* (5) Persona responsable */}
        <Section title="Persona responsable">
          <InfoRow
            label="Nombre"
            value={profile.responsibleName ?? "No especificado"}
          />
          {profile.cargo && <InfoRow label="Cargo" value={profile.cargo} />}
          <InfoRow
            label="Teléfono WhatsApp"
            value={formatVePhone(profile.whatsappPhone)}
          />
          <LinkRow href="/centro/editar" label="Cambiar responsable" />
        </Section>

        {/* (6) Cuenta */}
        <Section title="Cuenta">
          <div className="pt-1">
            <SignOutButton variant="outline" />
          </div>
        </Section>
      </main>
    </>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-4 py-5">
      <span className="text-3xl font-bold text-neutral-900">{value}</span>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-3 last:border-b-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-base text-neutral-900">{value}</span>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between py-3 text-sm font-semibold text-accent"
    >
      {label}
      <ChevronRight />
    </Link>
  );
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Initials from the center name, e.g. "Hospital J.M. de los Ríos" → "HJ". */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return letters.toUpperCase() || "C";
}

function cityLine(city: string, state: string | null): string {
  return [city, state].filter(Boolean).join(", ");
}
