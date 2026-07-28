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
  // The donor feed lives on "/" — the lista index has no page of its own.
  backHref = "/",
  onBack,
  trailing,
  align = "center",
  backIcon = "arrow",
}: {
  title: string;
  backHref?: string | null;
  /** When set, the back arrow becomes a button calling this instead of
   * navigating — used by the registration wizard to step back without a route
   * change (which would drop the in-memory form payload). */
  onBack?: () => void;
  trailing?: ReactNode;
  align?: "center" | "start";
  /** "close" swaps the arrow for an ✕ (and relabels it "Cerrar") — for screens
   * you exit rather than go back from, e.g. registration under a live session. */
  backIcon?: "arrow" | "close";
}) {
  const backLabel = backIcon === "close" ? "Cerrar" : "Volver";
  const BackIcon = backIcon === "close" ? CloseIcon : BackArrow;
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-neutral-100 bg-surface px-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
        >
          <BackIcon />
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
        >
          <BackIcon />
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

function CloseIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
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
