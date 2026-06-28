import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Detail top bar (Figma 20:2): back arrow + centered title + optional trailing
 * action (e.g. external/share icon). Server-renderable.
 */
export function AppBar({
  title,
  backHref = "/solicitudes",
  trailing,
}: {
  title: string;
  backHref?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-neutral-100 bg-surface px-4">
      <Link
        href={backHref}
        aria-label="Volver"
        className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
      >
        <BackArrow />
      </Link>
      <h1 className="text-base font-semibold text-neutral-900">{title}</h1>
      <span className="inline-flex h-9 w-9 items-center justify-center">
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
