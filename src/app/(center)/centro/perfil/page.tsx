import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppBar, Tag } from "@/components/ui";
import { CenterRequestCard } from "@/app/(center)/centro/_components/center-request-card";
import { ModoOperadorBanner } from "@/app/(center)/centro/_components/modo-operador-banner";
import { SignOutButton } from "@/app/(center)/_components/sign-out-button";
import {
  getCenterActiveRequests,
  getCenterProfile,
  getCenterRequestsClosedSince,
} from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import {
  centerTypeLabel,
  formatRelativeTime,
  formatTimeLeft,
  formatVePhone,
} from "@/lib/format";
import type { CenterType } from "@/lib/registro/validation";

import { LockedRow } from "./_components/locked-row";
import { ReceptionToggle } from "./_components/reception-toggle";
import {
  CenterDetailsSection,
  ResponsableSection,
  type CenterDetailsValues,
  type ResponsableValues,
} from "./_components/profile-sections";

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

  // Pausado screen lists the requests closed by the pause; the Activo screen's
  // "Desactivar recepción" sheet lists the active requests that WILL close.
  const closedOnPause = paused
    ? await getCenterRequestsClosedSince(
        current.centerId,
        profile.receptionPausedAt!,
      )
    : [];
  const activeRequests = paused
    ? []
    : (await getCenterActiveRequests(current.centerId)).map((r) => ({
        id: r.id,
        title: r.title ?? "Solicitud",
        vence: formatTimeLeft(r.expiresAt).toLowerCase(),
      }));

  const subtitle = [typeLabel, profile.city].filter(Boolean).join(" · ");

  const centerDetails: CenterDetailsValues = {
    name: profile.name,
    type: (profile.type ?? "") as CenterType | "",
    state: profile.state ?? "",
    city: profile.city,
    addressLine: profile.addressLine ?? "",
    addressReference: profile.addressReference ?? "",
    regularScheduleText: profile.regularScheduleText ?? "",
  };
  const responsable: ResponsableValues = {
    responsibleName: profile.responsibleName ?? "",
    cargo: profile.cargo ?? "",
    email: current.email ?? "",
    whatsappPhone: profile.whatsappPhone
      ? formatVePhone(profile.whatsappPhone)
      : "",
  };

  const isOperador = current.role === "center_member";

  return (
    <>
      <AppBar title="Ajustes" backHref="/centro" />

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

        {isOperador && <ModoOperadorBanner />}

        {/* (2) reception kill-switch — Responsable-only */}
        {!isOperador && (
          <ReceptionToggle
            paused={paused}
            pausedSince={
              paused ? `desde ${formatRelativeTime(profile.receptionPausedAt)}` : ""
            }
            activeRequests={activeRequests}
          />
        )}

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

        {/* (3) lifetime stats — Activas + Finalizadas (decision §5.3) */}
        <section className="flex items-stretch rounded-2xl border border-neutral-100 bg-surface shadow-sm">
          <StatCell label="Activas" value={profile.activas} />
          <span className="my-3 w-px self-stretch bg-neutral-100" />
          <StatCell label="Finalizadas" value={profile.cumplidas} />
        </section>

        {/* (4) Información del centro — inline editable (Responsable) / read-only (Operador) */}
        <CenterDetailsSection initial={centerDetails} readOnly={isOperador} />

        {/* (5) Persona responsable — inline editable (Responsable) / read-only (Operador) */}
        <ResponsableSection initial={responsable} readOnly={isOperador} />

        {/* (5b) Equipo — Responsable gets the entry point; Operador sees it
            (+ profile edit + reception) as locked rows. */}
        {isOperador ? (
          <Section title="Solo el responsable puede">
            <LockedRow
              title="Perfil del centro"
              subtitle="Editar datos y responsable"
            />
            <LockedRow
              title="Miembros del equipo"
              subtitle="Invitar y gestionar accesos"
            />
            <LockedRow
              title="Pausar recepción"
              subtitle="Cerrar la lista al público"
            />
          </Section>
        ) : (
          <Section title="Equipo">
            <Link
              href="/centro/equipo"
              className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-b-0"
            >
              <div>
                <p className="text-[15px] font-medium text-neutral-900">
                  Miembros del equipo
                </p>
                <p className="text-xs text-neutral-500">
                  Invitar y gestionar accesos
                </p>
              </div>
              <ChevronRight />
            </Link>
          </Section>
        )}

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
      className="shrink-0 text-neutral-300"
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
