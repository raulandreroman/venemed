import Link from "next/link";

import { formatTimeLeft } from "@/lib/format";

type AvisoBannerProps = {
  /** insumo names the center is not accepting */
  items: string[];
  /** null = "Sin límite" → no auto-clear, no "vence en" clause */
  expiresAt: Date | string | null;
  /** optional reason (request.title) */
  reason: string | null;
  /**
   * donor → "No aceptan: …" (third person, what the center won't take);
   * center → "No aceptamos: …" + an "Editar" link to manage the aviso.
   */
  variant: "donor" | "center";
  /** center variant only: link to the aviso form/review screen */
  editHref?: string;
};

/**
 * Center-level "aviso de exceso" notice. An aviso de exceso is a
 * request(kind='surplus') under the hood but renders ONLY as this amber banner
 * — never a donor card or a standalone /solicitudes/<id> page. Attached above a
 * center's need cards on the donor list/detail, and on the center's own
 * dashboard/detail (with Editar). Server Component — no client hooks.
 */
export function AvisoBanner({
  items,
  expiresAt,
  reason,
  variant,
  editHref,
}: AvisoBannerProps) {
  const itemsLabel = items.length > 0 ? items.join(", ") : "ciertos insumos";
  const timeLabel = expiresAt
    ? formatTimeLeft(expiresAt).toLowerCase()
    : "sin fecha de cierre";
  const lead = variant === "donor" ? "No aceptan" : "No aceptamos";

  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-warning-tint p-3.5 text-warning">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        <BoxIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Aviso de exceso activo</p>
        <p className="mt-0.5 text-sm">
          <span className="font-semibold">{lead}:</span> {itemsLabel} · {timeLabel}
        </p>
        {reason && <p className="mt-0.5 text-sm text-warning/80">{reason}</p>}
      </div>
      {editHref && (
        <Link
          href={editHref}
          className="mt-0.5 shrink-0 text-sm font-semibold text-accent"
        >
          Editar
        </Link>
      )}
    </div>
  );
}

function BoxIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21 8-9-5-9 5v8l9 5 9-5Z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
