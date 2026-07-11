-- Catalog v2 data migration (field-insight-whatsapp §"Catalog v2").
-- HAND-WRITTEN, on purpose: this migration USES the enum values that migration
-- 0011 added (food/water/hygiene/bedding). Postgres forbids using a new enum
-- value in the same transaction that added it, so 0011 (ADD VALUE) and this
-- file (data) MUST stay separate migrations.
--
-- (a) Fix the categories of the existing prod rows (matched by exact name).
UPDATE "supply" SET "category" = 'pharmacy'  WHERE "name" = 'Acetaminofén 500 mg';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Jeringas 5 ml estériles';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Suero fisiológico 500 ml';--> statement-breakpoint
UPDATE "supply" SET "category" = 'emergency' WHERE "name" = 'Gasas estériles';--> statement-breakpoint
UPDATE "supply" SET "category" = 'pharmacy'  WHERE "name" = 'Alcohol isopropílico';--> statement-breakpoint
UPDATE "supply" SET "category" = 'surgical'  WHERE "name" = 'Guantes quirúrgicos';--> statement-breakpoint
-- (b) Case-insensitive uniqueness on the catalog name → the INSERT below can
-- ON CONFLICT DO NOTHING (idempotent re-runs; no dupes across dev/prod).
CREATE UNIQUE INDEX IF NOT EXISTS "supply_lower_name_key" ON "supply" (lower("name"));--> statement-breakpoint
-- (c) Full Catalog v2 (~85 items). Generated from src/db/catalog.ts (the single
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
