/**
 * Shared Supabase env accessor for the auth (identity/session) layer.
 * Parallels src/db/index.ts's guard: fail loudly if the public auth env is
 * missing rather than letting @supabase/ssr throw an opaque error later.
 *
 * NOTE: only the PUBLIC url + anon key live here. SUPABASE_SERVICE_ROLE_KEY is
 * never read from any client/SSR auth path (see spec §4, §11).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set",
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
