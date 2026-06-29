import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Paths under (center) that are reachable WITHOUT a session.
const PUBLIC_CENTER_PATHS = ["/centro/login", "/centro/registro"];

// Paths under (admin) that are reachable WITHOUT a session.
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  // Carry any refreshed Supabase auth cookies (written onto `response` by
  // updateSession) over to a redirect response, so a token rotation is never
  // dropped on the redirect path. See Supabase SSR docs: if you return a
  // redirect, copy the cookies over.
  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  const { pathname } = request.nextUrl;
  const isCenter = pathname === "/centro" || pathname.startsWith("/centro/");
  const isPublicCenter = PUBLIC_CENTER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPublicAdmin = PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Gate ONLY the (center) app routes. Never gate (public).
  if (isCenter && !isPublicCenter && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/centro/login";
    url.search = ""; // no open-redirect: do not echo arbitrary ?next= back
    return redirectWithCookies(url);
  }

  // Already authed and sitting on the login page → bounce into the app.
  if (pathname === "/centro/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/centro";
    return redirectWithCookies(url);
  }

  // Gate (admin) routes on SESSION PRESENCE only — Drizzle isn't available in
  // middleware. The is_platform_admin authorization is enforced in server code
  // (requireAdmin() per page). Unauth → admin login.
  if (isAdmin && !isPublicAdmin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return redirectWithCookies(url);
  }

  // Already authed and sitting on the admin login → bounce into the queue.
  if (pathname === "/admin/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return redirectWithCookies(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets, so the session
  // token is refreshed on normal navigations but not on _next/* or files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
