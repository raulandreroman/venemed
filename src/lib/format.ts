/**
 * VeneMed user-facing formatters (Spanish, es-VE).
 * Pure functions — safe to import in Server or Client Components.
 * All time math lives here; queries return raw Dates.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Display a Venezuelan E.164 phone with spacing, e.g.
 * "+584125550034" → "+58 412 555 0034". Returns the input unchanged if it
 * isn't a canonical 10-digit national number.
 */
export function formatVePhone(e164: string | null | undefined): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  const nat = d.startsWith("58") ? d.slice(2) : d;
  if (nat.length !== 10) return e164 ?? "";
  return `+58 ${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`;
}

/** "hace 3 min" / "hace 4 h" / "ayer" / "hace 3 d". */
export function formatRelativeTime(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  if (!date) return "";
  const ms = now.getTime() - toDate(date).getTime();
  if (ms < MINUTE) return "hace un momento";
  if (ms < HOUR) return `hace ${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) return `hace ${Math.round(ms / HOUR)} h`;
  if (ms < 2 * DAY) return "ayer";
  return `hace ${Math.round(ms / DAY)} d`;
}

/**
 * True when `date` is at least `hours` in the past. Powers the admin queue's
 * "Urgente" badge (pending centers waiting ≥ 24 h). Keeps the `now` read out of
 * the component render (react-hooks/purity).
 */
export function isOlderThanHours(
  date: Date | string | null,
  hours: number,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  return now.getTime() - toDate(date).getTime() >= hours * HOUR;
}

/** "Solicitado hace 3 min" / "Solicitado ayer" — relative card meta line. */
export function formatRequestedAt(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  if (!date) return "";
  return `Solicitado ${formatRelativeTime(date, now)}`;
}

/**
 * "Solicitado hoy, 6:00 a.m." / "Solicitado ayer, 8:00 p.m." /
 * "Solicitado 23 jun 2026, 10:00 a.m." — absolute card meta line (Figma 11:3 / 30:15714).
 */
export function formatRequestedClock(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  if (!date) return "";
  const d = toDate(date);
  return `Solicitado ${dayLabel(d, now)}, ${formatClockPeriods(d)}`;
}

/** "25 jun 2026" — closed banner / dates. */
export function formatShortDate(date: Date | string | null): string {
  if (!date) return "";
  const d = toDate(date);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "4:30 pm" — 12-hour clock, es-VE style. */
export function formatClock(date: Date | string | null): string {
  if (!date) return "";
  const d = toDate(date);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * supply_category enum -> Spanish label. Drives the donor category chip row,
 * the card meta, and the item category labels. `general` ("Otros") is the home
 * for free-text customs (field-insight-whatsapp §2).
 */
export function categoryLabel(value: string): string {
  const map: Record<string, string> = {
    surgical: "Quirófano",
    emergency: "Emergencias",
    pharmacy: "Farmacia",
    inpatient: "Hospitalización",
    pediatrics: "Pediatría",
    geriatrics: "Adultos mayores",
    // Non-medical categories (field-insight-whatsapp §2).
    food: "Alimentos",
    water: "Agua",
    hygiene: "Higiene",
    bedding: "Camas y cobijas",
    // `general` is the catch-all home for free-text customs → "Otros".
    general: "Otros",
  };
  return map[value] ?? capitalize(value);
}

/**
 * Inverse of `categoryLabel`: Spanish label -> `supply_category` enum value.
 * Used to restore a free-text custom item's picked category on EDIT (the DB
 * stores the Spanish label on `lista_item.category`). Falls back to `general`
 * for unknown/legacy labels. Includes the legacy "General" label (customs
 * written before this label became "Otros").
 */
export function categoryValueFromLabel(label: string): string {
  const map: Record<string, string> = {
    Quirófano: "surgical",
    Emergencias: "emergency",
    Farmacia: "pharmacy",
    Hospitalización: "inpatient",
    Pediatría: "pediatrics",
    // Legacy label (pre-Pediatría rename); rows backfilled by migration 0013,
    // kept for any stragglers.
    "Refugio infantil": "pediatrics",
    "Adultos mayores": "geriatrics",
    Alimentos: "food",
    Agua: "water",
    Higiene: "hygiene",
    "Camas y cobijas": "bedding",
    Otros: "general",
    General: "general",
  };
  return map[label] ?? "general";
}

/**
 * Donor-facing category GROUPS (field-insight-whatsapp §2). The enum stays
 * granular in storage (values can never be dropped — destructive type
 * recreation); the donor filter groups it to match the field mental model
 * ("comida, medicinas, kit higiene, camas"): the six medical departments
 * collapse into one «Medicinas» chip. Keys are what `?category=` carries.
 */
export const CATEGORY_GROUPS: Record<
  string,
  { label: string; values: string[] }
> = {
  food: { label: "Alimentos", values: ["food"] },
  water: { label: "Agua", values: ["water"] },
  hygiene: { label: "Higiene", values: ["hygiene"] },
  bedding: { label: "Camas y cobijas", values: ["bedding"] },
  medical: {
    label: "Medicinas",
    values: [
      "pharmacy",
      "emergency",
      "surgical",
      "inpatient",
      "pediatrics",
      "geriatrics",
    ],
  },
  general: { label: "Otros", values: ["general"] },
};

/** Chip display order — relief staples first, catch-all last. */
export const CATEGORY_GROUP_ORDER = [
  "food",
  "water",
  "hygiene",
  "bedding",
  "medical",
  "general",
] as const;

/** `supply_category` enum value -> its donor-facing group key. */
export function categoryGroupOf(value: string): string {
  for (const [key, group] of Object.entries(CATEGORY_GROUPS)) {
    if (group.values.includes(value)) return key;
  }
  return "general";
}

/** center.type enum -> Spanish label. */
export function centerTypeLabel(value: string): string {
  const map: Record<string, string> = {
    hospital: "Hospital",
    clinic: "Clínica",
    elder_care_home: "Casa de cuidado",
    childrens_shelter: "Refugio de niños",
    collection_center: "Centro de acopio",
  };
  return map[value] ?? capitalize(value);
}

/**
 * "hace un momento" / "hace 4 min" / "hace 3 h" / "hace 1 día" / "hace 5 días"
 * — the dashboard "Actualizada {X}" line. Distinct from `formatRelativeTime`
 * (which collapses to "ayer"/"d"): the freshness card copy spells out full
 * "día(s)".
 */
export function formatUpdatedAgo(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  if (!date) return "";
  const ms = now.getTime() - toDate(date).getTime();
  if (ms < MINUTE) return "hace un momento";
  if (ms < HOUR) return `hace ${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) return `hace ${Math.round(ms / HOUR)} h`;
  const days = Math.round(ms / DAY);
  return days <= 1 ? "hace 1 día" : `hace ${days} días`;
}

/**
 * True when `date` is at least `days` in the past (default 3) — powers the
 * dashboard's "Confirma que sigue vigente" freshness card. Keeps the `now`
 * read out of component render (purity).
 */
export function isListaStale(
  date: Date | string | null,
  now: Date = new Date(),
  days: number = 3,
): boolean {
  if (!date) return false;
  return now.getTime() - toDate(date).getTime() >= days * DAY;
}

/**
 * "Esta lista tiene 7 días sin ser actualizada" — donor detail staleness
 * banner (Figma 210:14154). Returns null under 7 full days, matching the donor
 * list's stale-sink threshold — under that the freshness nudge is the center's
 * business, not the donor's.
 */
export function formatStalenessBanner(
  date: Date | string | null,
  now: Date = new Date(),
): string | null {
  if (!date) return null;
  const days = Math.floor((now.getTime() - toDate(date).getTime()) / DAY);
  if (days < 7) return null;
  return `Esta lista tiene ${days} ${days === 1 ? "día" : "días"} sin ser actualizada`;
}

/** "Publicado hace 4 h" — detail item-section metadata line. */
export function formatPublishedAgo(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  return date ? `Publicado ${formatRelativeTime(date, now)}` : "";
}

/** "Actualizada hace 5 días" — donor card + detail freshness line (§6). */
export function formatListaUpdated(
  date: Date | string | null,
  now: Date = new Date(),
): string {
  return date ? `Actualizada ${formatUpdatedAgo(date, now)}` : "";
}

/** closed_reason enum -> Spanish tag label. */
export function closedReasonLabel(value: string | null): string {
  const map: Record<string, string> = {
    fulfilled: "Cumplida",
    cancelled: "Cancelada",
    expired: "Vencida",
  };
  return value ? map[value] ?? "Cerrada" : "Cerrada";
}

// ---- internal ----
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "hoy" / "ayer" / "23 jun 2026" by calendar-day distance from `now`. */
function dayLabel(d: Date, now: Date): string {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfDate = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();
  const diffDays = Math.round((startOfToday - startOfDate) / DAY);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "ayer";
  return formatShortDate(d);
}

/** "6:00 a.m." — 12-hour clock with es-VE periods (card design). */
function formatClockPeriods(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "p.m." : "a.m.";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
