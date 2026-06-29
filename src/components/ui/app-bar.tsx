import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Detail top bar (Figma 20:2): back arrow + centered title + optional trailing
 * action (e.g. external/share icon). Server-renderable.
 *
 * Pass `backHref={null}` for screens with no back affordance (e.g. the center
 * status screens "Casi listo" / "Estado del registro"). When `align` is
 * "start" the title is left-aligned (back-office headers) instead of centered.
 */
export function AppBar({
  title,
  backHref = "/solicitudes",
  onBack,
  trailing,
  align = "center",
}: {
  title: string;
  backHref?: string | null;
  /** When set, the back arrow becomes a button calling this instead of
   * navigating — used by the registration wizard to step back without a route
   * change (which would drop the in-memory form payload). */
  onBack?: () => void;
  trailing?: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-neutral-100 bg-surface px-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
        >
          <BackArrow />
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label="Volver"
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
        >
          <BackArrow />
        </Link>
      ) : (
        <span className="h-9 w-9" />
      )}
      <h1
        className={`text-base font-semibold text-neutral-900 ${
          align === "start" ? "mr-auto pl-1" : ""
        }`}
      >
        {title}
      </h1>
      <span className="inline-flex h-9 min-w-9 items-center justify-end whitespace-nowrap">
        {trailing}
      </span>
    </header>
  );
}

function BackArrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}
