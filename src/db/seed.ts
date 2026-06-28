/**
 * Seed sample data for VeneMed (supplies catalog + a few approved centers with
 * active requests). Content mirrors the Figma designs. Idempotent: clears the
 * domain tables first, then re-inserts. Run: pnpm db:seed
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { center, supply, request, requestItem } from "./schema";

config({ path: ".env.local" });
config();

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING / POSTGRES_URL not set");

const client = postgres(url, { prepare: false });
const db = drizzle(client, { schema: { center, supply, request, requestItem } });

const hoursFromNow = (base: Date, h: number) =>
  new Date(base.getTime() + h * 3600 * 1000);

async function main() {
  const now = new Date();

  // ---- reset domain tables (FK-safe order) ----
  await db.delete(requestItem);
  await db.delete(request);
  await db.delete(center);
  await db.delete(supply);

  // ---- supply catalog ----
  const supplies = await db
    .insert(supply)
    .values([
      { name: "Acetaminofén 500 mg", category: "pediatrics" },
      { name: "Suero fisiológico 500 ml", category: "pediatrics" },
      { name: "Jeringas 5 ml estériles", category: "pediatrics" },
      { name: "Guantes quirúrgicos", category: "surgical" },
      { name: "Gasas estériles", category: "general" },
      { name: "Alcohol isopropílico", category: "general" },
    ])
    .returning({ id: supply.id, name: supply.name });
  const supplyId = (name: string) => supplies.find((s) => s.name === name)!.id;

  // ---- centers (approved so they're publicly visible) ----
  const centers = await db
    .insert(center)
    .values([
      {
        name: "Hospital J.M. de los Ríos",
        type: "hospital",
        description: "Hospital pediátrico público · San Bernardino",
        city: "Caracas",
        state: "Distrito Capital",
        addressLine: "Av. Vollmer, San Bernardino · Caracas 1011",
        addressReference:
          "Entrada principal · pregunta por Recepción de donaciones",
        regularScheduleText: "Lun a Vie · 8:00 am — 6:00 pm",
        whatsappPhone: "+584120000001",
        status: "approved",
        verifiedAt: now,
      },
      {
        name: "Refugio Casa Esperanza",
        type: "childrens_shelter",
        description: "Refugio de niños · Petare",
        city: "Caracas",
        state: "Miranda",
        addressLine: "Calle Sucre, Petare",
        addressReference: "Portón azul · timbre 2",
        regularScheduleText: "Todos los días · 9:00 am — 5:00 pm",
        whatsappPhone: "+584120000002",
        status: "approved",
        verifiedAt: now,
      },
    ])
    .returning({ id: center.id, name: center.name, city: center.city });
  const centerId = (name: string) => centers.find((c) => c.name === name)!.id;

  // ---- requests (active) ----
  const jmRiosPublished = hoursFromNow(now, -4); // publicado hace 4 h
  const [reqA] = await db
    .insert(request)
    .values({
      centerId: centerId("Hospital J.M. de los Ríos"),
      kind: "need",
      status: "active",
      windowHours: 12,
      publishedAt: jmRiosPublished,
      expiresAt: hoursFromNow(jmRiosPublished, 12),
      city: "Caracas",
      categories: ["pediatrics"],
    })
    .returning({ id: request.id });

  const refugioPublished = hoursFromNow(now, -1);
  const [reqB] = await db
    .insert(request)
    .values({
      centerId: centerId("Refugio Casa Esperanza"),
      kind: "need",
      status: "active",
      windowHours: 24,
      publishedAt: refugioPublished,
      expiresAt: hoursFromNow(refugioPublished, 24),
      city: "Caracas",
      categories: ["general", "pediatrics"],
    })
    .returning({ id: request.id });

  // a surplus notice ("no enviar más de X")
  const surplusPublished = hoursFromNow(now, -2);
  const [reqC] = await db
    .insert(request)
    .values({
      centerId: centerId("Refugio Casa Esperanza"),
      kind: "surplus",
      status: "active",
      windowHours: 48,
      publishedAt: surplusPublished,
      expiresAt: hoursFromNow(surplusPublished, 48),
      city: "Caracas",
      categories: ["general"],
    })
    .returning({ id: request.id });

  // ---- request items ----
  await db.insert(requestItem).values([
    {
      requestId: reqA.id,
      supplyId: supplyId("Acetaminofén 500 mg"),
      category: "Pediatría",
    },
    {
      requestId: reqA.id,
      supplyId: supplyId("Suero fisiológico 500 ml"),
      category: "Pediatría",
    },
    {
      requestId: reqA.id,
      supplyId: supplyId("Jeringas 5 ml estériles"),
      category: "Pediatría",
    },
    {
      requestId: reqB.id,
      supplyId: supplyId("Gasas estériles"),
      category: "General",
    },
    {
      requestId: reqB.id,
      supplyId: supplyId("Acetaminofén 500 mg"),
      category: "Pediatría",
    },
    {
      requestId: reqC.id,
      customName: "Ropa usada",
      category: "General",
    },
  ]);

  console.log(
    `seeded: ${supplies.length} supplies, ${centers.length} centers, 3 requests (2 need + 1 surplus), 6 items`,
  );
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
