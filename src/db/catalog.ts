/**
 * VeneMed supply catalog — the single source of truth (Catalog v2,
 * field-insight-whatsapp §"Catalog v2"). One home category per item; names are
 * short, searchable, es-VE. Consumed by the dev seed (`seed.ts`) and mirrored
 * by the prod data migration (0012_catalog_v2) so dev and prod stay in lockstep.
 *
 * `category` is a `supply_category` enum value (English identifier); the Spanish
 * label is derived at read time via `categoryLabel`.
 */
import type { supplyCategory } from "./schema";

export type SupplyCategory = (typeof supplyCategory.enumValues)[number];

export type CatalogItem = { name: string; category: SupplyCategory };

export const CATALOG: CatalogItem[] = [
  // ---- Alimentos (food) ----
  { name: "Comidas preparadas", category: "food" },
  { name: "Arroz", category: "food" },
  { name: "Pasta", category: "food" },
  { name: "Harina de maíz precocida", category: "food" },
  { name: "Granos (caraotas, lentejas)", category: "food" },
  { name: "Atún y sardinas enlatadas", category: "food" },
  { name: "Leche en polvo", category: "food" },
  { name: "Fórmula infantil", category: "food" },
  { name: "Compotas y alimentos para bebés", category: "food" },
  { name: "Aceite comestible", category: "food" },
  { name: "Azúcar", category: "food" },
  { name: "Sal", category: "food" },
  { name: "Café", category: "food" },
  { name: "Galletas y alimentos no perecederos", category: "food" },

  // ---- Agua (water) ----
  { name: "Agua potable embotellada", category: "water" },
  { name: "Botellones de agua", category: "water" },
  { name: "Pastillas potabilizadoras", category: "water" },
  { name: "Filtros de agua", category: "water" },
  { name: "Bidones y envases para agua", category: "water" },

  // ---- Higiene (hygiene) ----
  { name: "Kits de higiene personal", category: "hygiene" },
  { name: "Jabón de baño", category: "hygiene" },
  { name: "Champú", category: "hygiene" },
  { name: "Pasta y cepillos de dientes", category: "hygiene" },
  { name: "Toallas sanitarias", category: "hygiene" },
  { name: "Pañales infantiles", category: "hygiene" },
  { name: "Papel higiénico", category: "hygiene" },
  { name: "Toallas", category: "hygiene" },
  { name: "Alcohol en gel", category: "hygiene" },
  { name: "Detergente", category: "hygiene" },
  { name: "Cloro y desinfectante", category: "hygiene" },
  { name: "Bolsas de basura", category: "hygiene" },

  // ---- Camas y cobijas (bedding) ----
  { name: "Colchonetas", category: "bedding" },
  { name: "Cobijas y mantas", category: "bedding" },
  { name: "Sábanas", category: "bedding" },
  { name: "Almohadas", category: "bedding" },
  { name: "Hamacas", category: "bedding" },
  { name: "Carpas y toldos", category: "bedding" },
  { name: "Mosquiteros", category: "bedding" },

  // ---- Farmacia (pharmacy) ----
  { name: "Acetaminofén 500 mg", category: "pharmacy" },
  { name: "Ibuprofeno 400 mg", category: "pharmacy" },
  { name: "Amoxicilina 500 mg", category: "pharmacy" },
  { name: "Antibióticos pediátricos (suspensión)", category: "pharmacy" },
  { name: "Sales de rehidratación oral", category: "pharmacy" },
  { name: "Loratadina (antialérgico)", category: "pharmacy" },
  { name: "Antihipertensivos", category: "pharmacy" },
  { name: "Insulina", category: "pharmacy" },
  { name: "Multivitamínicos", category: "pharmacy" },
  { name: "Vitaminas prenatales", category: "pharmacy" },
  { name: "Alcohol isopropílico", category: "pharmacy" },
  { name: "Solución antiséptica (povidona)", category: "pharmacy" },
  { name: "Agua oxigenada", category: "pharmacy" },

  // ---- Emergencias (emergency) ----
  { name: "Suero fisiológico 500 ml", category: "emergency" },
  { name: "Solución Ringer lactato", category: "emergency" },
  { name: "Jeringas estériles", category: "emergency" },
  { name: "Catéteres IV", category: "emergency" },
  { name: "Equipos de venoclisis", category: "emergency" },
  { name: "Gasas estériles", category: "emergency" },
  { name: "Vendas", category: "emergency" },
  { name: "Esparadrapo", category: "emergency" },
  { name: "Guantes de nitrilo", category: "emergency" },
  { name: "Mascarillas quirúrgicas", category: "emergency" },
  { name: "Kits de sutura", category: "emergency" },
  { name: "Férulas", category: "emergency" },
  { name: "Collarines cervicales", category: "emergency" },
  { name: "Ampollas de adrenalina", category: "emergency" },

  // ---- Quirófano (surgical) ----
  { name: "Guantes quirúrgicos estériles", category: "surgical" },
  { name: "Suturas", category: "surgical" },
  { name: "Hojas de bisturí", category: "surgical" },
  { name: "Campos quirúrgicos estériles", category: "surgical" },
  { name: "Batas quirúrgicas", category: "surgical" },
  { name: "Compresas estériles", category: "surgical" },

  // ---- Hospitalización (inpatient) ----
  { name: "Sábanas clínicas", category: "inpatient" },
  { name: "Sondas Foley", category: "inpatient" },
  { name: "Bolsas recolectoras de orina", category: "inpatient" },
  { name: "Termómetros", category: "inpatient" },
  { name: "Tensiómetros", category: "inpatient" },
  { name: "Oxímetros de pulso", category: "inpatient" },
  { name: "Nebulizadores", category: "inpatient" },
  { name: "Sillas de ruedas", category: "inpatient" },
  { name: "Muletas", category: "inpatient" },
  { name: "Colchones antiescaras", category: "inpatient" },

  // ---- Pediatría (pediatrics) ----
  { name: "Acetaminofén pediátrico (jarabe)", category: "pediatrics" },
  { name: "Suero oral pediátrico", category: "pediatrics" },
  { name: "Teteros y biberones", category: "pediatrics" },
  { name: "Vitaminas pediátricas", category: "pediatrics" },
  { name: "Pañitos húmedos", category: "pediatrics" },

  // ---- Adultos mayores (geriatrics) ----
  { name: "Pañales para adulto", category: "geriatrics" },
  { name: "Suplementos nutricionales (Ensure)", category: "geriatrics" },
  { name: "Andaderas", category: "geriatrics" },
  { name: "Bastones", category: "geriatrics" },
  { name: "Cremas para escaras", category: "geriatrics" },
];
