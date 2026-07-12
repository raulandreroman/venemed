-- Backfill denormalized category snapshots (field-insight-whatsapp §2).
--
-- Migration 0012 recategorized the legacy `supply` rows, but two snapshots
-- taken at publish time still carry the OLD values:
--   · `lista_item.category` — the Spanish label shown on the center's
--     published view ("Refugio infantil" for what is now Farmacia, etc.), and
--   · `lista.categories[]`  — the enum-value array the donor filter reads.
-- Both refresh naturally on the next edit/republish, but existing live listas
-- would keep serving stale chips ("Refugio infantil", "Quirófano") until then.
--
-- Also folds in the pediatrics label rename: "Refugio infantil" → "Pediatría".
-- Idempotent: recomputing from current `supply` state is a fixed point.

-- (a) lista_item labels for CATALOG items — recompute from the supply's
--     (now-correct) category. Free-text customs keep their picked label.
UPDATE "lista_item" li
SET "category" = CASE s."category"::text
  WHEN 'surgical'   THEN 'Quirófano'
  WHEN 'emergency'  THEN 'Emergencias'
  WHEN 'pharmacy'   THEN 'Farmacia'
  WHEN 'inpatient'  THEN 'Hospitalización'
  WHEN 'pediatrics' THEN 'Pediatría'
  WHEN 'geriatrics' THEN 'Adultos mayores'
  WHEN 'food'       THEN 'Alimentos'
  WHEN 'water'      THEN 'Agua'
  WHEN 'hygiene'    THEN 'Higiene'
  WHEN 'bedding'    THEN 'Camas y cobijas'
  ELSE 'Otros'
END
FROM "supply" s
WHERE li."supply_id" = s."id";--> statement-breakpoint

-- (b) custom items: legacy 'General'/'general' label → 'Otros', and the
--     pediatrics rename for any custom that picked the old label.
UPDATE "lista_item"
SET "category" = 'Otros'
WHERE "supply_id" IS NULL AND "category" IN ('General', 'general');--> statement-breakpoint

UPDATE "lista_item"
SET "category" = 'Pediatría'
WHERE "supply_id" IS NULL AND "category" = 'Refugio infantil';--> statement-breakpoint

-- (c) lista.categories[] — recompute the enum-value array from the items'
--     current supply categories (customs contribute 'general'). Only live
--     listas matter (closed ones are off the donor surface) but recomputing
--     all is harmless and keeps history truthful.
UPDATE "lista" l
SET "categories" = sub.cats
FROM (
  SELECT li."lista_id",
         array_agg(DISTINCT COALESCE(s."category"::text, 'general')) AS cats
  FROM "lista_item" li
  LEFT JOIN "supply" s ON s."id" = li."supply_id"
  GROUP BY li."lista_id"
) sub
WHERE l."id" = sub."lista_id";
