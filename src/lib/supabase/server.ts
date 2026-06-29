import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Server-side Supabase client bound to the Next request cookies. Use in RSCs,
 * server actions, and route handlers. In Next 16, cookies() is async.
 *
 * The try/catch around setAll is required: RSCs get a read-only cookie store.
 * The token refresh that actually persists cookies happens in middleware
 * (src/lib/supabase/middleware.ts).
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render (read-only cookie store).
          // Safe to ignore: middleware is responsible for refreshing the
          // session cookie on every request.
        }
      },
    },
  });
}
