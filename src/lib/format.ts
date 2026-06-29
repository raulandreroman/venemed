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

/** Urgency bucket for the colored dot / accent on cards. */
export type UrgencyLevel = "urgent" | "soon" | "normal" | "expired";

/**
 * minutes-left bucket:
 *  - expired: already past expiresAt
 *  - urgent:  < 12 h   (red)
 *  - soon:    12–24 h  (amber)
 *  - normal:  > 24 h   (neutral)
 */
export function urgencyLevel(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): UrgencyLevel {
  if (!expiresAt) return "normal";
  const exp = toDate(expiresAt);
  const ms = exp.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  if (ms < 12 * HOUR) return "urgent";
  if (ms < 24 * HOUR) return "soon";
  return "normal";
}

/** "Vence en 8 h" / "Vence en 45 min" / "Vencida". Short form for pills/cards. */
export function formatTimeLeft(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): string {
  if (!expiresAt) return "Sin vencimiento";
  const ms = toDate(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "Vencida";
  if (ms < HOUR) return `Vence en ${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < DAY) return `Vence en ${Math.round(ms / HOUR)} h`;
  return `Vence en ${Math.round(ms / DAY)} d`;
}

/** Long form for the detail countdown block: "Vence en 8 horas" / "Vence en 45 minutos". */
export function formatTimeLeftLong(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): string {
  if (!expiresAt) return "Sin vencimiento";
  const ms = toDate(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "Vencida";
  if (ms < HOUR) {
    const n = Math.max(1, Math.round(ms / MINUTE));
    return `Vence en ${n} ${n === 1 ? "minuto" : "minutos"}`;
  }
  if (ms < DAY) {
    const n = Math.round(ms / HOUR);
    return `Vence en ${n} ${n === 1 ? "hora" : "horas"}`;
  }
  const n = Math.round(ms / DAY);
  return `Vence en ${n} ${n === 1 ? "día" : "días"}`;
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

/** progress 0..1 = elapsed / window, for the ProgressBar. Clamped. */
export function expiryProgress(
  publishedAt: Date | string | null,
  expiresAt: Date | string | null,
  now: Date = new Date(),
): number {
  if (!publishedAt || !expiresAt) return 0;
  const start = toDate(publishedAt).getTime();
  const end = toDate(expiresAt).getTime();
  if (end <= start) return 1;
  const ratio = (now.getTime() - start) / (end - start);
  return Math.min(1, Math.max(0, ratio));
}

/** "Hoy hasta las 4:30 pm" from the expiry clock time. */
export function formatDeliveryCutoff(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): string {
  if (!expiresAt) return "";
  const exp = toDate(expiresAt);
  const sameDay = exp.toDateString() === now.toDateString();
  const prefix = sameDay ? "Hoy hasta las" : `Hasta el ${formatShortDate(exp)},`;
  return `${prefix} ${formatClock(exp)}`;
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

/** category enum (request.categories[]) -> Spanish label for filter chips. */
export function categoryLabel(value: string): string {
  const map: Record<string, string> = {
    pediatrics: "Pediatría",
    surgical: "Quirófano",
    general: "General",
  };
  return map[value] ?? capitalize(value);
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
