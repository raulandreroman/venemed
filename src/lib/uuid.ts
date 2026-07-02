const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID string. Guards `[id]` route params
 * before they reach a DB query (a non-UUID otherwise throws a raw Postgres
 * cast error → 500 instead of a 404). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
