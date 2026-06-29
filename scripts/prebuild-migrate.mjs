// Apply pending Drizzle migrations on the Vercel PRODUCTION build only.
//
// Guarded by VERCEL_ENV so it never runs on preview deploys, local builds, or
// CI (each of those manages its own DB). Runs before `next build`, so the prod
// database schema is migrated before the new code serves traffic. Idempotent —
// drizzle-kit records applied migrations in its journal table. Uses the direct
// (non-pooling) connection configured in drizzle.config.ts.
//
// NOTE: additive migrations are safe here; destructive changes need the
// expand/contract pattern (ship the additive migration + new code first, drop
// the old column in a later deploy) so the migration never breaks the still-
// running previous deployment mid-rollout.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "unset";

if (env === "production") {
  console.log("[prebuild] VERCEL_ENV=production → applying Drizzle migrations");
  execSync("pnpm db:migrate", { stdio: "inherit" });
} else {
  console.log(`[prebuild] skipping migrations (VERCEL_ENV=${env})`);
}
