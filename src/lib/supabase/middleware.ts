import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Refreshes the auth token and returns BOTH the (possibly mutated) response
 * and the resolved user, so middleware.ts can decide on redirects.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: use getUser() (verifies the JWT with the Auth server), NOT
  // getSession() (which only reads the cookie). Do not run any code between
  // createServerClient and getUser, or you risk hard-to-debug logout bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
