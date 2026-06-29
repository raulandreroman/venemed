/**
 * Shared, dependency-free validation for the center registration flow.
 *
 * Used by BOTH the client wizard (on "Continuar") and the server action
 * `createCenterForCurrentUser` (defense-in-depth) — so the rules can never
 * drift. No `server-only` / `use client` directive: this module is isomorphic.
 * No validation library (the project intentionally has no zod — see spec §8).
 */
import { VE_STATES } from "@/lib/geo/ve-states";

export { VE_STATES };

/** Mirror of the `center_type` pg enum — declared literally to avoid pulling the
 * Drizzle schema (and `pg-core`) into the client bundle. */
export type CenterType =
  | "hospital"
  | "clinic"
  | "elder_care_home"
  | "childrens_shelter"
  | "collection_center";

export const CENTER_TYPE_OPTIONS: { value: CenterType; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clínica" },
  { value: "elder_care_home", label: "Hogar de cuidado de adultos mayores" },
  { value: "childrens_shelter", label: "Casa hogar de niños" },
  { value: "collection_center", label: "Centro de acopio" },
];

const CENTER_TYPE_VALUES = CENTER_TYPE_OPTIONS.map((o) => o.value);

/** The validated, server-bound payload. `whatsappPhone` is E.164 ("+58…"). */
export type CreateCenterInput = {
  name: string;
  type: CenterType;
  state: string;
  city: string;
  addressLine: string;
  addressReference?: string;
  regularScheduleText?: string;
  whatsappPhone: string;
  responsibleName: string;
};

export type FieldErrors = Partial<Record<keyof CreateCenterInput, string>>;

/**
 * Normalize a Venezuelan phone to E.164 ("+58XXXXXXXXXX") or return null.
 * Accepts national input as typed ("412 000 0000", "0412…") AND an already
 * E.164-formatted value ("+58412…"), so it is safe to re-run on the server.
 */
export function normalizeVePhone(raw: string | undefined | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  // Strip sequentially so a number carrying BOTH the country code and the
  // national trunk-0 (e.g. "5804241234567" — how Supabase may store a phone
  // whose OTP was sent un-normalized) still reduces to the canonical 10 digits.
  if (d.startsWith("58")) d = d.slice(2); // +58 country code
  if (d.startsWith("0")) d = d.slice(1); // national trunk prefix: 0412… → 412…
  if (d.length !== 10) return null;
  return `+58${d}`;
}

/**
 * Derive the national-only digits (no country code, no trunk-0) from a stored
 * E.164 / Supabase phone, for display in the locked phone field. Mirrors the
 * wizard's authed-prefill transform so create and edit show identical digits.
 * Isomorphic; safe to import from client and server.
 */
export function vePhoneToNational(e164: string | undefined | null): string {
  return (e164 ?? "").replace(/\D/g, "").replace(/^58/, "");
}

function len(v: string | undefined): number {
  return (v ?? "").trim().length;
}

/**
 * Validate the (possibly partial) registration payload. Returns an empty object
 * when valid. Messages are the Spanish (es-VE) copy from spec §4.1.
 */
export function validateRegistro(
  input: Partial<CreateCenterInput>,
): FieldErrors {
  const errors: FieldErrors = {};

  const name = len(input.name);
  if (name < 2 || name > 120) {
    errors.name = "Ingresa el nombre del centro (2 a 120 caracteres).";
  }

  if (!input.type || !CENTER_TYPE_VALUES.includes(input.type)) {
    errors.type = "Selecciona el tipo de centro.";
  }

  if (!input.state || !VE_STATES.includes(input.state as never)) {
    errors.state = "Selecciona el estado donde opera el centro.";
  }

  const city = len(input.city);
  if (city < 2 || city > 80) {
    errors.city = "Ingresa la ciudad (2 a 80 caracteres).";
  }

  const addr = len(input.addressLine);
  if (addr < 4 || addr > 160) {
    errors.addressLine = "Ingresa la dirección del centro.";
  }

  if (len(input.addressReference) > 160) {
    errors.addressReference = "La referencia no debe superar 160 caracteres.";
  }

  if (len(input.regularScheduleText) > 120) {
    errors.regularScheduleText =
      "El horario no debe superar 120 caracteres.";
  }

  if (!normalizeVePhone(input.whatsappPhone)) {
    errors.whatsappPhone = "Ingresa un número de teléfono válido.";
  }

  const responsible = len(input.responsibleName);
  if (responsible < 2 || responsible > 80) {
    errors.responsibleName =
      "Ingresa el nombre y apellido del responsable.";
  }

  return errors;
}
