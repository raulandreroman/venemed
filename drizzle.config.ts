import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load Vercel-pulled env first (.env.local), then .env as fallback (no override).
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations use the direct (non-pooled) connection.
    url:
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.DIRECT_URL ??
      process.env.POSTGRES_URL ??
      process.env.DATABASE_URL!,
  },
  casing: "snake_case",
});
