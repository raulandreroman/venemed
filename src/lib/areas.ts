import { categoryLabel } from "./format";

/**
 * The 6 center areas. Area === supply_category, 1:1 (center-workspace §5.6), so
 * a selected area IS the category written to request.categories[] and to each
 * request_item.category label. Identifiers are English; labels are Spanish and
 * come from the single `categoryLabel` map (no parallel label source).
 *
 * `general` is intentionally absent — it's a dormant legacy value, never an
 * authoring choice. Pure module: safe to import in client or server components.
 */
export const AREA_VALUES = [
  "surgical",
  "emergency",
  "pharmacy",
  "inpatient",
  "pediatrics",
  "geriatrics",
] as const;

export type AreaCategory = (typeof AREA_VALUES)[number];

export const AREAS: { value: AreaCategory; label: string }[] = AREA_VALUES.map(
  (value) => ({ value, label: categoryLabel(value) }),
);

export function isAreaCategory(value: unknown): value is AreaCategory {
  return (
    typeof value === "string" &&
    (AREA_VALUES as readonly string[]).includes(value)
  );
}
