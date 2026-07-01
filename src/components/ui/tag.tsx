import type { ReactNode } from "react";

type TagVariant =
  | "neutral" // city pill / generic
  | "urgent" // red dot
  | "soon" // amber dot
  | "excess" // amber "No aceptamos" summary (state, not time)
  | "normal" // neutral dot (low urgency)
  | "fulfilled" // green "Cumplida"
  | "expired"; // muted "Vencida"

const styles: Record<TagVariant, string> = {
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

type TagProps = {
  variant?: TagVariant;
  dot?: boolean;
  className?: string;
  children: ReactNode;
};

/** Small rounded label/pill. */
export function Tag({
  variant = "neutral",
  dot = false,
  className = "",
  children,
}: TagProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]} ${className}`}
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
