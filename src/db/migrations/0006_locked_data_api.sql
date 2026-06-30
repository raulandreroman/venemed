-- Defense-in-depth for the Supabase Data API (PostgREST + Realtime).
--
-- The app never reads tables through the public `anon` key — all data access is
-- the privileged direct postgres-js connection (see src/db/index.ts), which is
-- the table owner and therefore BYPASSES RLS. So enabling RLS here does not
-- touch the app's data path; it only locks the Data API that ships with the
-- anon key in the browser bundle.
--
-- With RLS enabled and NO permissive policies, every anon/authenticated read or
-- write through PostgREST/Realtime is denied. We also REVOKE table grants from
-- those roles so the lockdown holds even if a policy is ever added by mistake.
--
-- See GitHub issue #26 (external security audit).

ALTER TABLE "app_user"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "center"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supply"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_item"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moderation_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_event"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Belt-and-suspenders: strip any table privileges the Data API roles may hold so
-- a stray future `GRANT`/policy can't silently re-open access.
REVOKE ALL ON ALL TABLES    IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;
