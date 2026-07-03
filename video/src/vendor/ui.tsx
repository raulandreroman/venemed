/**
 * Vendored from the VeneMed web app (src/components/ui/*) so the video renders
 * the ACTUAL product components. Changes vs. the app, kept minimal:
 *  - Button: <Link> branch dropped (no next/link in Remotion); renders <button>.
 *  - Chip: only the non-interactive ItemChip is vendored (the filter Chip needs
 *    next/navigation).
 *  - ShareArrow: copied out of share-card-button.tsx (the client component's
 *    visual, without navigator.share).
 * Class strings are verbatim — do not restyle here; restyle in the app first.
 */
import type { ComponentProps, ReactNode } from "react";

// ---- card.tsx (verbatim) ----------------------------------------------------

type CardProps = ComponentProps<"div"> & { children: ReactNode };

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-neutral-300 bg-surface p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---- tag.tsx (verbatim) -----------------------------------------------------

type TagVariant =
  | "neutral"
  | "urgent"
  | "soon"
  | "excess"
  | "normal"
  | "fulfilled"
  | "expired";

const tagStyles: Record<TagVariant, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  urgent: "bg-error-tint text-error",
  soon: "bg-warning-tint text-warning",
  excess: "bg-warning-tint text-warning",
  normal: "bg-neutral-100 text-neutral-700",
  fulfilled: "bg-success-tint text-success",
  expired: "bg-neutral-100 text-neutral-500",
};

const dotColor: Partial<Record<TagVariant, string>> = {
  urgent: "bg-error",
  soon: "bg-warning",
  normal: "bg-neutral-500",
};

export function Tag({
  variant = "neutral",
  dot = false,
  className = "",
  children,
}: {
  variant?: TagVariant;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tagStyles[variant]} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${dotColor[variant] ?? "bg-current"}`}
        />
      )}
      {children}
    </span>
  );
}

// ---- chip.tsx → ItemChip (verbatim) ------------------------------------------

export function ItemChip({
  children,
  muted = false,
  tone = "neutral",
}: {
  children: ReactNode;
  muted?: boolean;
  tone?: "neutral" | "urgent";
}) {
  const toneClass =
    tone === "urgent"
      ? "bg-error-tint text-error font-medium"
      : "bg-neutral-100 text-neutral-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${
        muted ? "bg-neutral-100 text-neutral-500 line-through" : toneClass
      }`}
    >
      {children}
    </span>
  );
}

// ---- button.tsx (verbatim styles; <button> only) ------------------------------

type Variant = "primary" | "ghost" | "secondary" | "outline" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "border border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-100 focus:border-accent",
  ghost:
    "bg-transparent text-accent hover:bg-accent-subtle active:bg-accent-subtle active:text-accent-pressed",
  outline:
    "border border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-100",
  danger: "bg-error text-surface hover:bg-error/90 active:bg-error/80",
};

const sizes: Record<Size, string> = {
  md: "h-12 px-5 text-base",
  sm: "h-9 px-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={[base, variants[variant], sizes[size], fullWidth ? "w-full" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

// ---- share-card-button.tsx → ShareArrow (verbatim) ----------------------------

export function ShareArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
