type RoleTagValue = "center_admin" | "center_member" | "pending";

/**
 * membership.role (+ "pending" for an unaccepted invite) -> the Equipo pill.
 * A micro-pill (10px semibold) with its own geometry — deliberately smaller
 * than the generic Tag, matching the Figma RoleTag. Colors per role:
 * Responsable primary/100+700, Operador neutral/100+500, Pendiente warning/50+700.
 */
const ROLE_STYLES: Record<RoleTagValue, { label: string; className: string }> = {
  center_admin: { label: "Responsable", className: "bg-[#d6e4f5] text-accent-hover" },
  center_member: { label: "Operador", className: "bg-neutral-100 text-neutral-500" },
  pending: { label: "Pendiente", className: "bg-warning-tint text-[#8a3f07]" },
};

export function RoleTag({ role }: { role: RoleTagValue }) {
  const { label, className } = ROLE_STYLES[role];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
