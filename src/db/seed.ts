/**
 * Seed sample data for VeneMed (supplies catalog + a few approved centers with
 * active requests). Content mirrors the Figma designs. Idempotent: clears the
 * domain tables first, then re-inserts. Run: pnpm db:seed
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { appUser, center, membership, lista, listaItem, supply } from "./schema";

config({ path: ".env.local" });
config();

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING / POSTGRES_URL not set");

const client = postgres(url, { prepare: false });
const db = drizzle(client, {
  schema: { appUser, center, membership, lista, listaItem, supply },
});

/**
 * Provision an APPROVED-center membership for the test email, so e2e (and manual
 * QA) reach the real /centro dashboard with data. Memberships are normally
 * created on first login; we short-circuit that here by creating (or reusing)
 * the Supabase auth user for TEST_CENTER_EMAIL via the service-role admin API,
 * then linking app_user(id = auth uid) → membership → the given center.
 *
 * No-op (with a notice) when the Supabase admin creds or TEST_CENTER_EMAIL are
 * absent, so a bare `db:seed` against a plain Postgres still succeeds.
 */
async function provisionTestMembership(centerId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.TEST_CENTER_EMAIL?.trim().toLowerCase();

  if (!supabaseUrl || !serviceKey || !email) {
    console.log(
      "  • skipped test-membership (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TEST_CENTER_EMAIL not all set)",
    );
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find an existing auth user for this email (auth.users survives db:seed,
  // which only resets the domain tables), else create one email-confirmed.
  let userId: string | undefined;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw listErr;
  userId = list.users.find((u) => u.email === email)?.id;

  if (!userId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    userId = created.user.id;
  }

  const now = new Date();
  // app_user.id = auth uid (1:1). Upsert: the row may already exist from a
  // prior login/seed since seed never deletes app_user.
  await db
    .insert(appUser)
    .values({
      id: userId,
      email,
      name: "Coordinador de prueba",
      emailVerifiedAt: now,
    })
    .onConflictDoUpdate({
      target: appUser.id,
      set: { email, emailVerifiedAt: now, updatedAt: now },
    });

  // membership was cascade-deleted with the centers above; re-create it.
  await db
    .insert(membership)
    .values({ userId, centerId, role: "center_admin" })
    .onConflictDoNothing();

  console.log(
    `  • linked TEST_CENTER_EMAIL (${email}) → approved center as center_admin`,
  );
}

const hoursFromNow = (base: Date, h: number) =>
  new Date(base.getTime() + h * 3600 * 1000);

async function main() {
  const now = new Date();

  // ---- reset domain tables (FK-safe order) ----
  await db.delete(listaItem);
  await db.delete(lista);
  await db.delete(center);
  await db.delete(supply);

  // ---- supply catalog ----
  const supplies = await db
    .insert(supply)
    .values([
      // surgical (Quirófano)
      { name: "Guantes quirúrgicos", category: "surgical" },
      { name: "Gasas estériles", category: "surgical" },
      { name: "Suturas", category: "surgical" },
      // emergency (Emergencias)
      { name: "Suero fisiológico 500 ml", category: "emergency" },
      { name: "Jeringas 5 ml estériles", category: "emergency" },
      { name: "Solución antiséptica", category: "emergency" },
      // pharmacy (Farmacia)
      { name: "Acetaminofén 500 mg", category: "pharmacy" },
      { name: "Alcohol isopropílico", category: "pharmacy" },
      { name: "Antibióticos (amoxicilina)", category: "pharmacy" },
      // inpatient (Hospitalización)
      { name: "Sábanas clínicas", category: "inpatient" },
      { name: "Sonda Foley", category: "inpatient" },
      { name: "Mascarillas N95", category: "inpatient" },
      // pediatrics (Refugio infantil)
      { name: "Acetaminofén pediátrico (jarabe)", category: "pediatrics" },
      { name: "Suero oral", category: "pediatrics" },
      { name: "Pañales infantiles", category: "pediatrics" },
      // geriatrics (Adultos mayores)
      { name: "Pañales para adulto", category: "geriatrics" },
      { name: "Suplemento nutricional", category: "geriatrics" },
      { name: "Tensiómetro", category: "geriatrics" },
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

  // ---- listas (one evergreen lista per approved center — lista-model-v2) ----
  const jmRiosPublished = hoursFromNow(now, -4); // publicado hace 4 h
  const [listaA] = await db
    .insert(lista)
    .values({
      centerId: centerId("Hospital J.M. de los Ríos"),
      status: "active",
      deliveryInstructions:
        "Entregar en Recepción de donaciones, entrada principal. Preguntar por la coordinadora de turno.",
      publishedAt: jmRiosPublished,
      city: "Caracas",
      categories: ["pediatrics"],
    })
    .returning({ id: lista.id });

  const refugioPublished = hoursFromNow(now, -1);
  const [listaB] = await db
    .insert(lista)
    .values({
      centerId: centerId("Refugio Casa Esperanza"),
      status: "active",
      deliveryInstructions:
        "Portón azul, timbre 2. Recibimos en horario de la mañana preferiblemente.",
      excessReason: "El depósito de ropa está lleno.",
      publishedAt: refugioPublished,
      city: "Caracas",
      categories: ["general", "pediatrics"],
    })
    .returning({ id: lista.id });

  // ---- lista items (need / urgent-need / excess bucket) ----
  await db.insert(listaItem).values([
    // J.M. de los Ríos: 2 need + 1 urgent need
    {
      listaId: listaA.id,
      supplyId: supplyId("Acetaminofén 500 mg"),
      category: "Pediatría",
    },
    {
      listaId: listaA.id,
      supplyId: supplyId("Suero fisiológico 500 ml"),
      category: "Pediatría",
    },
    {
      listaId: listaA.id,
      supplyId: supplyId("Jeringas 5 ml estériles"),
      category: "Pediatría",
      isUrgent: true,
    },
    // Refugio Casa Esperanza: needs + an excess ("no aceptamos") item
    {
      listaId: listaB.id,
      supplyId: supplyId("Gasas estériles"),
      category: "General",
    },
    {
      listaId: listaB.id,
      supplyId: supplyId("Acetaminofén 500 mg"),
      category: "Pediatría",
      isUrgent: true,
    },
    {
      listaId: listaB.id,
      customName: "Ropa usada",
      category: "General",
      bucket: "excess",
    },
  ]);

  // Link the test phone to an approved center (J.M. de los Ríos has an active
  // lista with items) so login reaches the populated /centro dashboard.
  await provisionTestMembership(centerId("Hospital J.M. de los Ríos"));

  console.log(
    `seeded: ${supplies.length} supplies, ${centers.length} centers, 2 listas, 6 items`,
  );
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
