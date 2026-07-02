import type { ReactNode } from "react";

import type { CenterStatus } from "@/lib/auth/current-center";

/**
 * Center moderation status pill (Figma "Status Badge"): h30 pill, 8px leading
 * dot, 13px semibold, with the darker Figma text/dot triples per state — a
 * dedicated primitive rather than the generic Tag, whose tint/text pairs don't
 * match. `suspended` reuses the Pendiente (warning) palette.
 */
const STATUS_STYLES: Record<
  CenterStatus,
  { bg: string; dot: string; text: string }
> = {
  pending_review: { bg: "bg-[#fef4e6]", dot: "bg-[#b45309]", text: "text-[#8a3f07]" },
  approved: { bg: "bg-[#e8f5ee]", dot: "bg-[#1e7d52]", text: "text-[#155e3e]" },
  rejected: { bg: "bg-[#fcebe9]", dot: "bg-[#c0362c]", text: "text-[#962820]" },
  suspended: { bg: "bg-[#fef4e6]", dot: "bg-[#b45309]", text: "text-[#8a3f07]" },
};

export function StatusBadge({
  status,
  children,
}: {
  status: CenterStatus;
  children: ReactNode;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${s.bg} ${s.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}
