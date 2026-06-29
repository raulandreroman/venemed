/**
 * The 24 Venezuelan federal entities (23 estados + Distrito Capital), stored as
 * literal Spanish strings to match `center.state` (free `text`) and the values
 * written by `src/db/seed.ts` ("Distrito Capital", "Miranda", …). Shared by the
 * client select and the server-side validator so both agree on the allowed set.
 */
export const VE_STATES = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "La Guaira",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Yaracuy",
  "Zulia",
] as const;

export type VeState = (typeof VE_STATES)[number];
