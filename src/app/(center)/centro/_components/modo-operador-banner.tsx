/**
 * "Estás en modo Operador" banner (adapted from Figma 209:4338's Operador
 * lock-state onto the pre-lista-v2 dashboard/profile surfaces). Shown to a
 * `center_member` on the dashboard and the profile — they can still edit the
 * lista/insumos + share; other actions (profile, team, reception) belong to
 * whoever invited them.
 */
export function ModoOperadorBanner() {
  return (
    <div className="rounded-xl bg-accent-subtle p-4 text-accent">
      <p className="text-sm font-semibold">Estás en modo Operador</p>
      <p className="mt-0.5 text-sm">
        Puedes editar la lista y agregar insumos. Otras acciones las gestiona
        quien invitó.
      </p>
    </div>
  );
}
