import type { ReactNode } from "react";

import { formatTimeLeft, urgencyLevel, type UrgencyLevel } from "@/lib/format";

type TagVariant =
  | "neutral" // city pill / generic
  | "urgent" // red dot
  | "soon" // amber dot
  | "normal" // neutral dot (low urgency)
  | "fulfilled" // green "Cumplida"
  | "expired" // muted "Vencida"
  | "surplus"; // amber "No enviar"

const styles: Record<TagVariant, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  urgent: "bg-urgent-tint text-urgent",
  soon: "bg-orange-50 text-soon",
  normal: "bg-neutral-100 text-neutral-700",
  fulfilled: "bg-success-tint text-success",
  expired: "bg-neutral-200 text-neutral-500",
  surplus: "bg-orange-50 text-soon",
};

const dotColor: Partial<Record<TagVariant, string>> = {
  urgent: "bg-urgent",
  soon: "bg-soon",
  normal: "bg-neutral-400",
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

const levelToVariant: Record<UrgencyLevel, TagVariant> = {
  urgent: "urgent",
  soon: "soon",
  normal: "normal",
  expired: "expired",
};

/** "Vence en N h" pill with a colored dot driven by minutes-left. */
export function UrgencyTag({
  expiresAt,
  className = "",
}: {
  expiresAt: Date | string | null;
  className?: string;
}) {
  const level = urgencyLevel(expiresAt);
  return (
    <Tag
      variant={levelToVariant[level]}
      dot={level !== "expired"}
      className={className}
    >
      {formatTimeLeft(expiresAt)}
    </Tag>
  );
}
