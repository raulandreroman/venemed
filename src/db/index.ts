import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase (via Vercel integration) provides POSTGRES_URL = transaction pooler (6543).
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL / DATABASE_URL is not set");
}

// `prepare: false` is required for Supabase's transaction pooler.
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
export { schema };
