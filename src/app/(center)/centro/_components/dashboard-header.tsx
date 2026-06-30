import { CenterMenu } from "./center-menu";

/** 1–2 letter initials from a center name, for the avatar circle. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Dashboard header (Figma 32:4898): avatar (initials) + center name + green
 * "Verificado" chip, with a trailing overflow menu. Sticky, white, bottom
 * border. NOT AppBar (which is back-arrow/centered-title oriented).
 */
export function DashboardHeader({ centerName }: { centerName: string }) {
  const initials = initialsOf(centerName);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-100 bg-surface px-4 py-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-accent-on">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold leading-tight text-neutral-900">
          {centerName}
        </h1>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">
          <CheckIcon />
          Verificado
        </span>
      </div>
      <CenterMenu />
    </header>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
