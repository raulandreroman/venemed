import { Tag } from "./tag";

type RoleTagValue = "center_admin" | "center_member" | "pending";

/** membership.role (+ "pending" for an unaccepted invite) -> the Equipo pill. */
export function RoleTag({ role }: { role: RoleTagValue }) {
  if (role === "center_admin") {
    return (
      <Tag variant="neutral" className="bg-accent-subtle text-accent">
        Responsable
      </Tag>
    );
  }
  if (role === "pending") {
    return <Tag variant="soon">Pendiente</Tag>;
  }
  return <Tag variant="neutral">Operador</Tag>;
}
