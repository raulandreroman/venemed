import type { ReactNode } from "react";

/** A disabled, non-interactive row under "Solo el responsable puede" — the
 * Operador view of a Responsable-only action (perfil edit / equipo / pausar
 * recepción). Presentational only; no link, no click handler. */
export function LockedRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <LockIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-neutral-400">{title}</p>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>
    </div>
  );
}

function LockIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
