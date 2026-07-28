/**
 * Shared, dependency-free validation for the center registration flow.
 *
 * Used by BOTH the client wizard (on "Continuar") and the server action
 * `createCenterForCurrentUser` (defense-in-depth) — so the rules can never
 * drift. No `server-only` / `use client` directive: this module is isomorphic.
 * No validation library (the project intentionally has no zod — see spec §8).
 */
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
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

/** The validated, server-bound payload. `whatsappPhone` is a REQUIRED (#102),
 * unverified contact number (E.164 "+58…" once normalized) for delivery
 * coordination — auth is via email, so it's no longer tied to the session. */
export type CreateCenterInput = {
  name: string;
  /** null when the center-type feature is off (see `CENTER_TYPE_ENABLED`). */
  type: CenterType | null;
  state: string;
  city: string;
  addressLine: string;
  addressReference?: string;
  regularScheduleText?: string;
  whatsappPhone: string;
  responsibleName: string;
  cargo?: string; // responsable's role/title, optional (Figma "Cargo")
};

/**
 * Normalize an email for use as the login identity: trim + lowercase, or null
 * if it doesn't look like a valid address. Kept deliberately simple (no zod) —
 * Supabase does the authoritative validation on send; this is a UX pre-check.
 */
export function normalizeEmail(raw: string | undefined | null): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  // Minimal shape check: something@something.tld, no whitespace.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

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

/**
 * Like `vePhoneToNational` but re-adds the national trunk "0" for DISPLAY in the
 * editable phone field (#102 Part B), so what the user sees matches what they
 * type ("0424…"). Empty stays empty — never fabricate a "0" for a blank field.
 * Storage stays canonical E.164 (no "0"); the "0" is display-only.
 */
export function vePhoneToNationalDisplay(
  e164: string | undefined | null,
): string {
  const national = vePhoneToNational(e164);
  return national ? `0${national}` : "";
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

  // Only required when the center-type feature is on; off → type is null.
  if (CENTER_TYPE_ENABLED && (!input.type || !CENTER_TYPE_VALUES.includes(input.type))) {
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

  // WhatsApp is REQUIRED again (#102) — the coordination channel for donations.
  if (len(input.whatsappPhone) === 0) {
    errors.whatsappPhone = "Ingresa el número de contacto (WhatsApp).";
  } else if (!normalizeVePhone(input.whatsappPhone)) {
    errors.whatsappPhone = "Ingresa un número de teléfono válido.";
  }

  const responsible = len(input.responsibleName);
  if (responsible < 2 || responsible > 80) {
    errors.responsibleName =
      "Ingresa el nombre y apellido del responsable.";
  }

  if (len(input.cargo) > 60) {
    errors.cargo = "El cargo no debe superar 60 caracteres.";
  }

  return errors;
}

// ---- Focused subsets for the profile's two inline edit sections --------------
// They reuse validateRegistro's rules (single source) and keep only the keys
// each section owns. The responsable's login identity (email) is NOT editable.

export type CenterDetailsInput = Pick<
  CreateCenterInput,
  | "name"
  | "type"
  | "state"
  | "city"
  | "addressLine"
  | "addressReference"
>;

export type ResponsableInput = Pick<
  CreateCenterInput,
  "responsibleName" | "cargo" | "whatsappPhone" | "regularScheduleText"
>;

const CENTER_DETAIL_KEYS = [
  "name",
  "type",
  "state",
  "city",
  "addressLine",
  "addressReference",
] as const;

const RESPONSABLE_KEYS = [
  "responsibleName",
  "cargo",
  "whatsappPhone",
  "regularScheduleText",
] as const;

function pickErrors(
  errors: FieldErrors,
  keys: readonly (keyof CreateCenterInput)[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const k of keys) if (errors[k]) out[k] = errors[k];
  return out;
}

export function validateCenterDetails(input: CenterDetailsInput): FieldErrors {
  return pickErrors(validateRegistro(input), CENTER_DETAIL_KEYS);
}

export function validateResponsable(input: ResponsableInput): FieldErrors {
  return pickErrors(validateRegistro(input), RESPONSABLE_KEYS);
}
