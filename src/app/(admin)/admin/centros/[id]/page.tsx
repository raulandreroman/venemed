import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppBar, StatusBadge } from "@/components/ui";
import { getCenterForReview } from "@/db/admin-queries";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import { formatRelativeTime, formatVePhone } from "@/lib/format";

import {
  STATUS_LABEL,
  actionLabel,
  centerTypeLabel,
} from "../../../_components/labels";
import { ReviewActions } from "./review-actions";

type PageProps = { params: Promise<{ id: string }> };

/**
 * A3 · Center review detail (Figma `53:1123`). Full center + responsable +
 * moderation history, with the sticky Aprobar/Rechazar bar for pending centers.
 */
export default async function CenterReviewPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const c = await getCenterForReview(id);
  if (!c) notFound();

  const waDigits = c.whatsappPhone?.replace(/\D/g, "") ?? "";
  const decidedAt = c.verifiedAt ?? c.createdAt;

  return (
    <>
      <AppBar title="Revisar centro" backHref="/admin" />

      <main className="flex flex-1 flex-col pb-24">
        {/* status pill */}
        <div className="px-4 pt-4">
          <StatusBadge status={c.status}>
            {STATUS_LABEL[c.status]} · {formatRelativeTime(decidedAt)}
          </StatusBadge>
        </div>

        {/* identity */}
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[22px] font-bold leading-7 text-neutral-900">
              {c.name}
            </h2>
            <p className="truncate text-sm text-neutral-500">
              {CENTER_TYPE_ENABLED && c.type
                ? `${centerTypeLabel(c.type)} · ${c.city}`
                : c.city}
            </p>
          </div>
        </div>

        {/* Datos del centro */}
        <Section title="Datos del centro">
          <Field label="Nombre legal" value={c.name} />
          {CENTER_TYPE_ENABLED && c.type && (
            <Field label="Tipo de centro" value={centerTypeLabel(c.type)} />
          )}
          <Field label="Estado" value={c.state} />
          <Field label="Ciudad" value={c.city} />
          <Field
            label="Dirección"
            value={
              c.addressLine ? (
                <>
                  {c.addressLine}
                  {c.addressReference && (
                    <span className="mt-0.5 block text-neutral-500">
                      {c.addressReference}
                    </span>
                  )}
                </>
              ) : null
            }
          />
          {c.regularScheduleText && (
            <Field label="Horario" value={c.regularScheduleText} />
          )}
          {c.description && (
            <Field label="Descripción" value={c.description} />
          )}
        </Section>

        {/* Persona responsable */}
        <Section title="Persona responsable">
          <Field label="Nombre" value={c.responsable?.name ?? null} />
          {c.responsable?.cargo && (
            <Field label="Cargo" value={c.responsable.cargo} />
          )}
          <Field label="Correo de acceso" value={c.responsable?.email ?? null} />
          {c.whatsappPhone && (
            <div>
              <p className="text-xs text-neutral-500">Teléfono de contacto</p>
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[15px] font-semibold text-accent"
              >
                {formatVePhone(c.whatsappPhone)}
                <ExternalGlyph />
              </a>
              <p className="mt-0.5 text-xs text-neutral-500">
                Toca para abrir WhatsApp
              </p>
            </div>
          )}
        </Section>

        {/* Historial de moderación */}
        <Section title="Historial de moderación" last>
          {c.history.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Sin actividad de moderación aún.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {c.history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {actionLabel(h.action)}
                      <span className="font-normal text-neutral-500">
                        {" · "}
                        {formatRelativeTime(h.createdAt)}
                        {h.actorName ? ` · ${h.actorName}` : ""}
                      </span>
                    </p>
                    {h.reason && (
                      <p className="mt-0.5 text-sm text-neutral-700">
                        {h.reason}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>

      {c.status === "pending_review" && (
        <ReviewActions centerId={c.id} centerName={c.name} city={c.city} />
      )}
    </>
  );
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={`px-4 py-5 ${last ? "" : "border-b border-neutral-100"}`}
    >
      <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <div className="mt-0.5 text-[15px] text-neutral-900">
        {value ?? <span className="text-neutral-400">No indicado</span>}
      </div>
    </div>
  );
}

function ExternalGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
