-- Catalog v2 data migration (field-insight-whatsapp §"Catalog v2").
-- HAND-WRITTEN, on purpose: this migration USES the enum values that migration
-- 0011 added (food/water/hygiene/bedding). Postgres forbids using a new enum
-- value in the same transaction that added it, so 0011 (ADD VALUE) and this
-- file (data) MUST stay separate migrations.
--
-- (a) Converge legacy near-dupes onto the Catalog v2 canonical names.
--
-- Prod (Jul 2026) holds 6 legacy supply rows; two are near-duplicates of Catalog
-- v2 items — the same real-world insumo under a slightly different name:
--   'Guantes quirúrgicos'      → v2 'Guantes quirúrgicos estériles' (surgical)
--   'Jeringas 5 ml estériles'  → v2 'Jeringas estériles'            (emergency)
-- Without this, the v2 INSERT (c) would add the v2 spelling alongside the legacy
-- row and donors/centers would see both variants. Rename here — BEFORE the unique
-- index and the INSERTs — so each renamed row then matches its v2 INSERT and that
-- INSERT no-ops via ON CONFLICT, leaving ONE row per item. lista_item references
-- supply by supply_id, so the rename carries existing references over untouched.
-- Canonical = the v2 name (shorter, size-agnostic); neither legacy name was
-- strictly more precise ('5 ml' merely narrows syringes to a single size).
-- Collision-safe: only 6 legacy rows exist and neither canonical name is already
-- among them, so no rename can duplicate an existing row before the index lands.
-- Idempotent: on a re-run (rows already renamed) these UPDATEs match 0 rows — a
-- harmless no-op — as do the name-matched category fixes and the ON CONFLICT INSERT.
UPDATE "supply" SET "name" = 'Guantes quirúrgicos estériles' WHERE "name" = 'Guantes quirúrgicos';--> statement-breakpoint
UPDATE "supply" SET "name" = 'Jeringas estériles' WHERE "name" = 'Jeringas 5 ml estériles';--> statement-breakpoint
-- (b) Fix the categories of the existing prod rows (matched by canonical name).
UPDATE "supply" SET "category" = 'pharmacy'  WHERE "name" = 'Acetaminofén 500 mg';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Jeringas estériles';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Suero fisiológico 500 ml';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Gasas estériles';--> statement-breakpoint
UPDATE "supply" SET "category" = 'pharmacy'  WHERE "name" = 'Alcohol isopropílico';--> statement-breakpoint
UPDATE "supply" SET "category" = 'surgical'  WHERE "name" = 'Guantes quirúrgicos estériles';--> statement-breakpoint
-- (c) Case-insensitive uniqueness on the catalog name → the INSERT below can
-- ON CONFLICT DO NOTHING (idempotent re-runs; no dupes across dev/prod).
CREATE UNIQUE INDEX IF NOT EXISTS "supply_lower_name_key" ON "supply" (lower("name"));--> statement-breakpoint
-- (d) Full Catalog v2 (~85 items). Generated from src/db/catalog.ts (the single
-- source of truth, also consumed by the dev seed). ON CONFLICT DO NOTHING so
-- rows already present (the fixed prod rows above) are left untouched.
INSERT INTO "supply" ("name", "category") VALUES
  ('Comidas preparadas', 'food'),
  ('Arroz', 'food'),
  ('Pasta', 'food'),
  ('Harina de maíz precocida', 'food'),
  ('Granos (caraotas, lentejas)', 'food'),
  ('Atún y sardinas enlatadas', 'food'),
  ('Leche en polvo', 'food'),
  ('Fórmula infantil', 'food'),
  ('Compotas y alimentos para bebés', 'food'),
  ('Aceite comestible', 'food'),
  ('Azúcar', 'food'),
  ('Sal', 'food'),
  ('Café', 'food'),
  ('Galletas y alimentos no perecederos', 'food'),
  ('Agua potable embotellada', 'water'),
  ('Botellones de agua', 'water'),
  ('Pastillas potabilizadoras', 'water'),
  ('Filtros de agua', 'water'),
  ('Bidones y envases para agua', 'water'),
  ('Kits de higiene personal', 'hygiene'),
  ('Jabón de baño', 'hygiene'),
  ('Champú', 'hygiene'),
  ('Pasta y cepillos de dientes', 'hygiene'),
  ('Toallas sanitarias', 'hygiene'),
  ('Pañales infantiles', 'hygiene'),
  ('Papel higiénico', 'hygiene'),
  ('Toallas', 'hygiene'),
  ('Alcohol en gel', 'hygiene'),
  ('Detergente', 'hygiene'),
  ('Cloro y desinfectante', 'hygiene'),
  ('Bolsas de basura', 'hygiene'),
  ('Colchonetas', 'bedding'),
  ('Cobijas y mantas', 'bedding'),
  ('Sábanas', 'bedding'),
  ('Almohadas', 'bedding'),
  ('Hamacas', 'bedding'),
  ('Carpas y toldos', 'bedding'),
  ('Mosquiteros', 'bedding'),
  ('Acetaminofén 500 mg', 'pharmacy'),
  ('Ibuprofeno 400 mg', 'pharmacy'),
  ('Amoxicilina 500 mg', 'pharmacy'),
  ('Antibióticos pediátricos (suspensión)', 'pharmacy'),
  ('Sales de rehidratación oral', 'pharmacy'),
  ('Loratadina (antialérgico)', 'pharmacy'),
  ('Antihipertensivos', 'pharmacy'),
  ('Insulina', 'pharmacy'),
  ('Multivitamínicos', 'pharmacy'),
  ('Vitaminas prenatales', 'pharmacy'),
  ('Alcohol isopropílico', 'pharmacy'),
  ('Solución antiséptica (povidona)', 'pharmacy'),
  ('Agua oxigenada', 'pharmacy'),
  ('Suero fisiológico 500 ml', 'emergency'),
  ('Solución Ringer lactato', 'emergency'),
  ('Jeringas estériles', 'emergency'),
  ('Catéteres IV', 'emergency'),
  ('Equipos de venoclisis', 'emergency'),
  ('Gasas estériles', 'emergency'),
  ('Vendas', 'emergency'),
  ('Esparadrapo', 'emergency'),
  ('Guantes de nitrilo', 'emergency'),
  ('Mascarillas quirúrgicas', 'emergency'),
  ('Kits de sutura', 'emergency'),
  ('Férulas', 'emergency'),
  ('Collarines cervicales', 'emergency'),
  ('Ampollas de adrenalina', 'emergency'),
  ('Guantes quirúrgicos estériles', 'surgical'),
  ('Suturas', 'surgical'),
  ('Hojas de bisturí', 'surgical'),
  ('Campos quirúrgicos estériles', 'surgical'),
  ('Batas quirúrgicas', 'surgical'),
  ('Compresas estériles', 'surgical'),
  ('Sábanas clínicas', 'inpatient'),
  ('Sondas Foley', 'inpatient'),
  ('Bolsas recolectoras de orina', 'inpatient'),
  ('Termómetros', 'inpatient'),
  ('Tensiómetros', 'inpatient'),
  ('Oxímetros de pulso', 'inpatient'),
  ('Nebulizadores', 'inpatient'),
  ('Sillas de ruedas', 'inpatient'),
  ('Muletas', 'inpatient'),
  ('Colchones antiescaras', 'inpatient'),
  ('Acetaminofén pediátrico (jarabe)', 'pediatrics'),
  ('Suero oral pediátrico', 'pediatrics'),
  ('Teteros y biberones', 'pediatrics'),
  ('Vitaminas pediátricas', 'pediatrics'),
  ('Pañitos húmedos', 'pediatrics'),
  ('Pañales para adulto', 'geriatrics'),
  ('Suplementos nutricionales (Ensure)', 'geriatrics'),
  ('Andaderas', 'geriatrics'),
  ('Bastones', 'geriatrics'),
  ('Cremas para escaras', 'geriatrics')
ON CONFLICT DO NOTHING;
