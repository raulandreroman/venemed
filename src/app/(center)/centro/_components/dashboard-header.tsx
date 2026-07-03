import { CenterMenu } from "./center-menu";

/**
 * Dashboard header (Figma 32:4898): center name + green "Verificado" chip,
 * with a trailing overflow menu. Sticky, white, bottom border. NOT AppBar
 * (which is back-arrow/centered-title oriented).
 */
export function DashboardHeader({ centerName }: { centerName: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-100 bg-surface px-4 py-3">
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
