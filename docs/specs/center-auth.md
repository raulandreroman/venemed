# VeneMed — Center Auth Foundation + Login (Implementation Spec)

> **Status**: ready to build. Last updated 2026-06-28.
> **Branch**: `feat/center-auth` (off `main`). `main` is **protected** — land via PR (final phase).
> **Scope**: the **identity/session layer** for the center back office and the **login (L1)** flow only. Builds the Supabase-SSR plumbing, route protection, phone-OTP login, post-login identity resolution + status routing, a guarded `(center)` shell, and **placeholder** guarded pages for everything downstream.
> **Related**: `docs/specs/data-model.md` (schema source of truth), `docs/specs/donor-slice.md` (donor surface + design-system conventions to reuse). Stack already scaffolded (Next.js 16 App Router, React 19 RSC, TypeScript, Tailwind v4, Drizzle/postgres-js, pnpm). **Do not re-scaffold.**

---

## 1. Architecture — read first

This is the single most important section. Get it wrong and the authorization model is unsound.

- **Data access is Drizzle / postgres-js** (`src/db`, exports `db`). It connects with the Postgres role and **bypasses RLS entirely**. We do **not** use Supabase's data API for app data, and we do **not** rely on RLS policies for authorization.
- Therefore **Supabase Auth is ONLY the identity / session layer.** Its job is: send the SMS/WhatsApp OTP, verify it, mint a session, and give us a trustworthy `auth.users` uid + verified phone in an httpOnly cookie.
- **Authorization is enforced in SERVER code**, always by the logged-in center's `center_id`. Every server read/write that touches center-scoped data must:
  1. resolve the current Supabase session (cookie-based, server-side),
  2. resolve that session's `app_user → membership → center`,
  3. filter all Drizzle queries by that `center_id`.
  Never trust a `center_id` (or any scoping id) that arrived from the client. Derive it server-side from the session every time.
- **Identity model** (`src/db/schema.ts`):
  - `app_user` — `id` is set to the **Supabase `auth.users` uid** (1:1). `phone` is `unique not null`. (The column has a `defaultRandom()`, but on login we always supply `id = session.user.id`, so the default is never used for authed users.)
  - `membership` — `user_id → center_id`, `role` (`center_admin` | `center_member`); one membership per user in v1.
  - `center` — `status ∈ { pending_review, approved, rejected, suspended }`.
- **On every verified login** we: upsert `app_user { id: session.user.id, phone }`, resolve `membership → center`, and **route by `center.status`**.

### Trust boundary diagram

```
Browser ──(phone)──▶ Supabase Auth ──SMS/WhatsApp OTP──▶ Browser
Browser ──(otp)────▶ Supabase verifyOtp ──▶ httpOnly session cookie (set by @supabase/ssr)
                                              │
Next.js server (middleware + RSC + actions) ─┘ reads session from cookie
   └─ getCurrentCenter(): session.user.id ──▶ Drizzle ──▶ app_user → membership → center
   └─ ALL center-scoped Drizzle queries filtered by center.id   ◀── authz happens HERE
```

---

## 2. Goal & non-goals

### Goal
A center operator can open `/centro`, be redirected to `/centro/login`, enter their WhatsApp phone, receive and enter an OTP, and land on the correct screen for their center's status. The session is an httpOnly cookie refreshed on every request. Visiting any `(center)` route while unauthenticated redirects to login. Identity upsert + status routing logic is implemented and correct. `pnpm lint` + `npx tsc --noEmit` pass (CI gate); `pnpm build` is green (acceptance gate).

### Out of scope (explicit — later phases)
- **Registration flow** `R0 → datos → verificar → en revisión` and the actual `create-center` write. We build a **placeholder** `/centro/registro` page only ("regístrate" landing for users with no membership).
- **The real dashboard.** `/centro` is a **placeholder** that proves the guard + identity work: shows the center name (read via Drizzle by `center_id`) + sign-out. No solicitudes management UI.
- **create-solicitud** and any center mutations.
- **Admin / moderation** `(admin)` surface — not gated by this middleware, not touched here.
- **Roles / RBAC granularity** beyond "has a membership to this center". `role` is resolved and exposed but not branched on.
- **WhatsApp channel** — login sends OTP over **SMS** for v1, but the channel must be a single swappable constant (see §6.1) so flipping to `whatsapp` later is a one-line change. (Note the Figma copy says "por WhatsApp"; the channel constant governs the real transport. Keep the constant the source of truth; copy can follow when WhatsApp is enabled.)

---

## 3. Source designs (Figma `tGvDuvWW99K4QzDH0GlmW7`, back office page `7:34`)

Mobile-first, **390px**, Spanish (es-VE). Reuse the existing design system (`src/components/ui/**`, `globals.css` tokens, Inter, **single-accent** principle — accent `#1f5aa8` is the only action color; everything else neutral; semantic colors communicate state only).

| Screen | Node | Used for | Notes |
|---|---|---|---|
| **L1 · Iniciar sesión** | `29:2425` | `/centro/login` (phone step) | AppBar "Iniciar sesión" (back ‹). H1 "Ingresa tu teléfono", sub "Te enviaremos un código por WhatsApp para entrar a tu centro." Field "Teléfono (WhatsApp)" with fixed **`+58`** prefix box + number input, helper "Debe tener WhatsApp activo." Bottom: full-width primary **"Enviar código"**, under it muted "¿No tienes cuenta? **Registra tu centro**" → `/centro/registro`. |
| **2 · Verificar teléfono** | `8:580` | `/centro/login` (OTP step) | AppBar "Verificar teléfono" + "2 de 3" (we omit the step counter — login is 1 screen, not the 3-step registro wizard). Icon chip, H1 "Ingresa el código", sub "Enviamos un código de 6 dígitos por WhatsApp al +58 412 ••• 0034." link **"Cambiar número"**, 6 OTP boxes, "¿No te llegó? Reenviar en 0:42" (resend countdown), bottom primary **"Verificar"**, muted "No compartas este código con nadie." |
| **3 · En revisión** | `8:733` | `/centro/en-revision` (placeholder, `pending_review`) | "Casi listo". Clock icon, status pill "● Pendiente de verificación", H1 "Estamos verificando tu centro", explanatory paragraph + 3 numbered steps, accent-bordered note "Somos el equipo moderador de VeneMed…". Bottom primary "Entendido", secondary "Editar datos del centro". For the placeholder, primary = **"Cerrar sesión"** (sign-out); drop "Editar datos" (registro is out of scope). |
| **3e · Centro rechazado** | `29:2030` | `/centro/rechazado` (placeholder, `rejected`) | "Estado del registro". Warning triangle icon (error tint), pill "● Necesita corrección", H1 "Necesitamos corregir algunos datos", paragraph, **error-tinted note with left border** "Motivo del equipo de VeneMed" rendering `center.rejection_reason`. Bottom primary "Corregir datos del centro" (→ registro, out of scope → render as disabled/placeholder or link to `/centro/registro`), ghost "Contactar a soporte". For placeholder: primary = **"Cerrar sesión"**; show the rejection reason. |

`/centro/registro` has **no dedicated login-phase design** — it is the registration entry (R0 `29:2451`, out of scope). Build a minimal placeholder: centered card, "Regístrate", short copy, a sign-out link. It exists so the "no membership" route target resolves.

> Re-read any node with `get_screenshot` / `get_metadata` (fileKey above) during implementation.

---

## 4. Dependencies & environment

### Install
```bash
pnpm add @supabase/ssr
```
`@supabase/supabase-js` is already present. `@supabase/ssr` provides `createServerClient` / `createBrowserClient` with the cookie adapter for Next.js.

### Env (already in `.env.local`; documented in `.env.example`)
Used by this phase:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (browser + server).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/publishable key (browser + server auth client).
- `SUPABASE_SERVICE_ROLE_KEY` — **not used** by login. Do not import it into any client/SSR auth path. (Reserved for future admin-only server tasks.)

No new env vars are introduced. Phone OTP **rate limiting is handled by Supabase** (Auth → Rate Limits) — do not build our own.

> **Supabase dashboard prerequisite (ops, not code):** Phone Auth provider must be enabled with an SMS sender (e.g. Twilio) for the chosen channel. This is a project config step; the spec assumes it is enabled. The code path is identical regardless of provider.

---

## 5. File map

```
src/
  lib/
    supabase/
      server.ts        # createServerClient bound to next/headers cookies()  (RSC + actions + route handlers)
      client.ts        # createBrowserClient (client components)
      middleware.ts    # updateSession(request): refresh + return response with refreshed cookies
  middleware.ts        # Next middleware: calls updateSession, gates (center) routes
  lib/
    auth/
      current-center.ts  # getCurrentCenter(): session → app_user → membership → center (server-only)
      on-login.ts        # upsertUserAndResolveRoute(): upsert app_user, resolve membership, return redirect target
  app/
    (center)/
      layout.tsx                 # guarded shell: loads session+center server-side, renders children
      centro/
        page.tsx                 # PLACEHOLDER dashboard (approved): center name + sign-out
        login/
          page.tsx               # RSC wrapper (redirect if already authed) → renders <LoginForm/>
          login-form.tsx         # "use client" — phone step + OTP step (L1 + Verificar)
        en-revision/page.tsx     # PLACEHOLDER (pending_review) — Figma 8:733
        rechazado/page.tsx       # PLACEHOLDER (rejected) — Figma 29:2030, shows rejection_reason
        registro/page.tsx        # PLACEHOLDER (no membership) — "regístrate"
      actions/
        auth.ts                  # "use server" — signOut(); (optional) finishLogin() server action
```

Notes:
- `(center)` is a **route group** (no URL segment). All center pages live at `/centro/*`.
- `/centro/login`, `/centro/registro` must be reachable **without** a session — see §7 guard logic (these are the only `(center)` paths exempt from the auth redirect).

---

## 6. Supabase SSR clients

Three thin factories. They differ only in their **cookie adapter**. Use `getAll`/`setAll` (the current `@supabase/ssr` contract); do not use the deprecated `get`/`set`/`remove` triplet.

### 6.0 Shared env helper
A tiny module that reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and throws a clear error if missing (parallels `src/db/index.ts`'s guard). Both client and server factories use it.

### 6.1 `src/lib/supabase/server.ts` — server client (RSC, server actions, route handlers)

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// In Next 16, cookies() is async.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Safe to ignore: middleware (§6.3) is responsible for refreshing
            // the session cookie on every request.
          }
        },
      },
    },
  );
}
```
- Use this in: the guarded `(center)/layout.tsx`, `getCurrentCenter()`, the `signOut` action, and the login RSC wrapper.
- The `try/catch` around `setAll` is required: RSCs get a read-only cookie store. The token refresh that actually persists cookies happens in middleware.

### 6.2 `src/lib/supabase/client.ts` — browser client (client components)

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```
- Use this in `login-form.tsx` to call `signInWithOtp` and `verifyOtp`. The browser client writes the session cookie via document cookies; middleware/server then read it.

### 6.3 `src/lib/supabase/middleware.ts` — session refresh helper

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth token and returns BOTH the (possibly mutated) response
// and the resolved user, so middleware.ts can decide on redirects.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );

  // IMPORTANT: use getUser() (verifies the JWT with the Auth server), NOT
  // getSession() (which only reads the cookie). Do not run any code between
  // createServerClient and getUser, or you risk hard-to-debug logout bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```
- `getUser()` revalidates the token and triggers the refresh (writing new cookies into `response` through `setAll`). Returning `user` lets the gate avoid a second round-trip.

---

## 7. `src/middleware.ts` — refresh + gate

```ts
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Paths under (center) that are reachable WITHOUT a session.
const PUBLIC_CENTER_PATHS = ["/centro/login", "/centro/registro"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isCenter = pathname === "/centro" || pathname.startsWith("/centro/");
  const isPublicCenter = PUBLIC_CENTER_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Gate ONLY the (center) app routes. Never gate (public) or (admin).
  if (isCenter && !isPublicCenter && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/centro/login";
    url.search = ""; // no open-redirect: do not echo arbitrary ?next= back
    return NextResponse.redirect(url);
  }

  // Already authed and sitting on the login page → bounce into the app.
  if (pathname === "/centro/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/centro";
    return NextResponse.redirect(url);
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
```

Guard rules (must hold):
- **Unauthenticated → any gated `/centro/*`** (anything not in `PUBLIC_CENTER_PATHS`) → **redirect to `/centro/login`**. ✅ acceptance criterion.
- `(public)` (`/`, `/solicitudes/**`) and `(admin)` (`/admin/**`) are **never** gated by this middleware.
- The matcher still **runs** on public/admin paths (so the session cookie is refreshed everywhere), but the redirect branch is guarded by `isCenter`. This keeps sessions fresh without gating those surfaces.
- **No open redirects**: we always redirect to the fixed internal path `/centro/login` / `/centro`. We do **not** read a `?next=` param from the request and redirect to it. Post-login destination is decided server-side by status (§8), not by a client-supplied URL.

> Final routing-by-status (approved vs pending vs rejected vs no-membership) is **not** done in middleware — middleware only enforces "authed vs not". Status routing happens at the `(center)/layout.tsx` + `getCurrentCenter()` layer (§8–§9), because it needs Drizzle (DB) access, which we keep out of the Edge middleware path. The middleware does the cheap cookie/JWT check; the layout does the DB-backed authorization + status routing.

---

## 8. Post-login identity & status routing

### 8.1 `src/lib/auth/current-center.ts` — `getCurrentCenter()` (server-only)

The canonical server util every center-scoped server module calls.

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser, membership, center } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type CenterStatus =
  | "pending_review" | "approved" | "rejected" | "suspended";

export type CurrentCenter = {
  userId: string;            // = supabase auth uid = app_user.id
  phone: string | null;
  centerId: string;
  centerName: string;
  status: CenterStatus;
  rejectionReason: string | null;
  role: "center_admin" | "center_member";
};

// Returns:
//  { kind: "anon" }                    no session
//  { kind: "no-membership", userId }   session but no membership row
//  { kind: "center", center }          session + resolved center
export type CurrentCenterResult =
  | { kind: "anon" }
  | { kind: "no-membership"; userId: string; phone: string | null }
  | { kind: "center"; center: CurrentCenter };

export async function getCurrentCenter(): Promise<CurrentCenterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anon" };

  const rows = await db
    .select({
      userId: appUser.id,
      phone: appUser.phone,
      centerId: center.id,
      centerName: center.name,
      status: center.status,
      rejectionReason: center.rejectionReason,
      role: membership.role,
    })
    .from(appUser)
    .leftJoin(membership, eq(membership.userId, appUser.id))
    .leftJoin(center, eq(center.id, membership.centerId))
    .where(eq(appUser.id, user.id))
    .limit(1);

  const row = rows[0];
  if (!row || !row.centerId) {
    return { kind: "no-membership", userId: user.id, phone: user.phone ?? null };
  }
  return {
    kind: "center",
    center: {
      userId: row.userId,
      phone: row.phone,
      centerId: row.centerId,
      centerName: row.centerName!,
      status: row.status!,
      rejectionReason: row.rejectionReason,
      role: row.role!,
    },
  };
}
```
- **Authz primitive.** All center-scoped Drizzle queries derive `centerId` from `getCurrentCenter()` — never from client input.
- Uses `getUser()` (JWT-verified), not `getSession()`.

### 8.2 `src/lib/auth/on-login.ts` — upsert + resolve route

Called once right after a successful `verifyOtp`, from a **server action** (`finishLogin`) invoked by the login form. Responsibilities: (1) upsert `app_user`, (2) resolve membership/center, (3) return the redirect target path.

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCenter } from "./current-center";

const ROUTE_BY_STATUS = {
  approved: "/centro",
  pending_review: "/centro/en-revision",
  rejected: "/centro/rechazado",
  suspended: "/centro/rechazado", // suspended reuses the "needs attention" screen in v1
} as const;

// Returns the path the client should navigate to after login.
export async function resolveLoginDestination(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/centro/login"; // defensive; should not happen post-verify

  // (1) Upsert app_user with id = auth uid. Phone comes from the verified session.
  const phone = user.phone ? `+${user.phone}` : null; // Supabase stores phone w/o '+'
  await db
    .insert(appUser)
    .values({
      id: user.id,
      phone: phone ?? user.id, // phone is NOT NULL + unique; verified phone always present here
      phoneVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appUser.id,
      set: {
        phone: phone ?? undefined,
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    });

  // (2) + (3) Resolve membership → center → route.
  const result = await getCurrentCenter();
  if (result.kind === "no-membership") return "/centro/registro";
  if (result.kind === "anon") return "/centro/login";
  return ROUTE_BY_STATUS[result.center.status] ?? "/centro/en-revision";
}
```

**Routing table (authoritative):**

| State after login | Destination | Screen |
|---|---|---|
| `center.status = approved` | `/centro` | placeholder dashboard |
| `center.status = pending_review` | `/centro/en-revision` | Figma `8:733` |
| `center.status = rejected` | `/centro/rechazado` | Figma `29:2030` |
| `center.status = suspended` | `/centro/rechazado` | reuse rejected screen (v1) |
| no membership row | `/centro/registro` | placeholder "regístrate" |

**Phone normalization note:** Supabase's `signInWithOtp({ phone })` expects **E.164** (e.g. `+584120000034`). It stores `user.phone` **without** the leading `+`. The Figma `+58` prefix box is fixed Venezuela; the form must compose `+58` + the typed national number into E.164 before calling Supabase. We persist `app_user.phone` **with** the `+` for consistency with `center.whatsapp_phone` (which is stored as entered). `app_user.phone` is `unique` — in v1 a phone maps to exactly one auth uid, so the `onConflictDoUpdate(target: id)` path is the normal case; a phone colliding across two different uids is not expected and would surface as a DB unique-violation (acceptable to let it throw in this phase).

---

## 9. Guarded `(center)` layout + placeholder pages

### 9.1 `src/app/(center)/layout.tsx`
Server component shell that authorizes + status-routes for **all gated** center pages.

Behavior:
1. If pathname is a public center path, render children directly (the layout cannot read pathname easily; instead, **the login/registro pages live under the same group but opt out** — see note). Simplest correct design: **do not** put the heavy guard in the group layout for login/registro. Two clean options:

   - **Option A (recommended): nested layout.** Put the DB-backed guard in a layout that wraps only the authed pages. Structure:
     ```
     (center)/
       layout.tsx                 # thin: shared 390px shell + Inter, no guard
       centro/login/...           # public
       centro/registro/page.tsx   # public (placeholder)
       (app)/                     # nested group for authed pages
         layout.tsx               # GUARD: getCurrentCenter() + status routing
         ... actually keep routes flat; see below
     ```
     Because `centro/en-revision`, `centro/rechazado`, and `centro` are all authed, and `login`/`registro` are public, group the authed three under a guard layout. Practical layout: give each authed page (or a shared parent) access to `getCurrentCenter()` and let **the page** redirect if the status doesn't match that page. See Option B.

   - **Option B (recommended, simplest): per-page guard + a shared helper.** No nested guard layout. The group `layout.tsx` is just the visual shell. Each authed page calls a small `requireCenter(expectedStatuses)` helper at the top:
     ```ts
     // src/lib/auth/require-center.ts
     import { redirect } from "next/navigation";
     import { getCurrentCenter, type CurrentCenter } from "./current-center";

     export async function requireCenter(): Promise<CurrentCenter> {
       const r = await getCurrentCenter();
       if (r.kind === "anon") redirect("/centro/login");
       if (r.kind === "no-membership") redirect("/centro/registro");
       return r.center;
     }
     ```
     Then `/centro` (dashboard) additionally redirects if `status !== "approved"`:
     ```ts
     const center = await requireCenter();
     if (center.status === "pending_review") redirect("/centro/en-revision");
     if (center.status === "rejected" || center.status === "suspended") redirect("/centro/rechazado");
     // status === approved → render dashboard
     ```
     `/centro/en-revision` renders for `pending_review` (else redirect to the right screen), `/centro/rechazado` renders for `rejected`/`suspended`. This keeps each status screen authoritative and avoids a god-layout.

   **Decision: implement Option B.** Middleware already blocks anon access; `requireCenter()` is defense-in-depth + the no-membership branch; per-page status checks keep each screen honest if a user navigates directly.

2. The group `layout.tsx` provides the shared mobile shell (mirror `(public)/layout.tsx`): `mx-auto max-w-[390px] min-h-dvh flex flex-col bg-background`.

### 9.2 `/centro` — placeholder dashboard (approved)
- `requireCenter()` + approved-status guard (§9.1 Option B).
- Renders `AppBar` (title "Panel del centro", no back — or omit back) + a `Card` showing **the center name** (from `getCurrentCenter()`, i.e. read via Drizzle filtered by `center_id`) and a short "Back office (próximamente)" line.
- A **sign-out** control (form posting to the `signOut` server action, §10). Style with `Button variant="secondary"` or a ghost.
- This proves: guard works, identity resolves, center name is read by `center_id`, sign-out works.

### 9.3 `/centro/en-revision` — placeholder (pending_review), Figma `8:733`
- Guard: `requireCenter()`; if `status !== "pending_review"` redirect to the correct screen (`approved → /centro`, `rejected|suspended → /centro/rechazado`).
- Render per Figma `8:733` using design-system primitives: clock icon chip (accent-subtle bg), warning-tint status pill "● Pendiente de verificación", H1 "Estamos verificando tu centro", the explanatory paragraph + 3 numbered steps, and the **accent-left-bordered** note card "Somos el equipo moderador de VeneMed. Nunca te pedimos dinero ni claves…". Bottom: primary full-width **"Cerrar sesión"** (sign-out action). Omit "Editar datos del centro" (registro out of scope).

### 9.4 `/centro/rechazado` — placeholder (rejected), Figma `29:2030`
- Guard: `requireCenter()`; if `status !== "rejected" && status !== "suspended"` redirect appropriately.
- Render per Figma `29:2030`: warning-triangle icon in **error-tint** circle, error-tint pill "● Necesita corrección", H1 "Necesitamos corregir algunos datos", paragraph, and an **error-tinted note card with left border** titled "Motivo del equipo de VeneMed" rendering **`center.rejectionReason`** (fallback copy if null). Bottom: primary full-width **"Cerrar sesión"**; ghost "Contactar a soporte" may link to a `mailto:`/WhatsApp placeholder. Omit "Corregir datos del centro" (registro out of scope) or render it disabled.

### 9.5 `/centro/registro` — placeholder (no membership)
- **Public** (in `PUBLIC_CENTER_PATHS`), so reachable pre-login too (the login screen's "Registra tu centro" link points here).
- Minimal: centered `Card`, H1 "Regístrate", copy "El registro de centros estará disponible pronto." Link back to `/centro/login`. If a session exists, also offer sign-out.
- No guard call required (it's the no-membership destination); fine to render statically.

---

## 10. Login flow (L1) — implementation

### 10.1 `/centro/login/page.tsx` (RSC wrapper)
- Server component. Calls `getCurrentCenter()`; if `kind !== "anon"`, `redirect()` to the status destination (so an already-authed user never sees the form). Otherwise render `<LoginForm channel="sms" />`.
- (Middleware also bounces authed users off `/centro/login`; this is belt-and-suspenders and computes the correct status destination.)

### 10.2 `src/app/(center)/centro/login/login-form.tsx` (`"use client"`)
Two-step state machine in one client component, matching Figma L1 (`29:2425`) then Verificar (`8:580`).

**State:** `step: "phone" | "otp"`, `nationalNumber`, `code`, `loading`, `error`, `resendIn` (seconds).

**Channel:** a module constant so it's swappable:
```ts
const OTP_CHANNEL: "sms" | "whatsapp" = "sms"; // flip to "whatsapp" when enabled
```

**Step 1 — phone (Enviar código):**
- Fixed `+58` prefix box + numeric input (`inputMode="numeric"`, `autoComplete="tel-national"`), helper "Debe tener WhatsApp activo."
- Compose E.164: `const phone = "+58" + nationalNumber.replace(/\D/g, "")`. Basic validation (length) before submit.
- On submit:
  ```ts
  const supabase = createClient(); // browser client
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { channel: OTP_CHANNEL },
  });
  ```
  On success → `step = "otp"`, start the 60s `resendIn` countdown. On error → show a friendly Spanish message (do not leak provider internals). Supabase enforces rate limits; surface its error generically ("Inténtalo de nuevo en un momento.").
- Footer: "¿No tienes cuenta? **Registra tu centro**" → `<Link href="/centro/registro">`.

**Step 2 — OTP (Verificar):**
- Sub copy with the masked phone ("Enviamos un código de 6 dígitos por WhatsApp al +58 412 ••• 0034."). Compute the mask from the entered number.
- "Cambiar número" link → back to `step = "phone"` (clears code).
- 6-digit code entry (single `input maxLength={6} inputMode="numeric"` styled as boxes, or 6 boxes — keep it simple and accessible; a single input is acceptable for v1).
- Resend: "¿No te llegó? Reenviar en M:SS" disabled until `resendIn` hits 0, then becomes an active "Reenviar" that re-calls `signInWithOtp`.
- On "Verificar":
  ```ts
  const { error } = await supabase.auth.verifyOtp({
    phone, token: code, type: "sms",
  });
  ```
  - `type: "sms"` is correct for phone OTP regardless of delivery channel (it's the OTP *type*, not the transport). On error → "Código incorrecto o vencido."
  - On success the browser client sets the session cookie. Then call the **server action** `finishLogin()` (§10.3) to upsert + get the destination, and `router.replace(destination)`.

### 10.3 `src/app/(center)/actions/auth.ts`
```ts
"use server";
import { redirect } from "next/navigation";
import { resolveLoginDestination } from "@/lib/auth/on-login";
import { createClient } from "@/lib/supabase/server";

// Called after a successful client-side verifyOtp. Upserts app_user, resolves
// membership/center, and redirects server-side to the status destination.
export async function finishLogin() {
  const dest = await resolveLoginDestination();
  redirect(dest);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/centro/login");
}
```
- `finishLogin` runs server-side (reads the freshly-set session cookie), so the upsert and routing decision are trustworthy. The client form calls it via `await finishLogin()` from the verify handler (a server action can be imported and invoked from a client component; the `redirect()` inside performs navigation). Alternatively the form reads a returned path and `router.replace`s — either is fine; **prefer the server action `redirect()`** so destination logic never lives client-side.
- **Sign-out**: a `<form action={signOut}>` with a submit button on each placeholder page + the dashboard. `supabase.auth.signOut()` clears the cookie; `redirect("/centro/login")` returns the user to login. Middleware then keeps them out of gated pages.

---

## 11. Security checklist

- **httpOnly cookie session** via `@supabase/ssr` — tokens never exposed to JS beyond the SDK; refreshed in middleware on every request.
- **Authorization strictly by `center_id` server-side** — every center-scoped query derives the id from `getCurrentCenter()` (session → app_user → membership → center). No client-supplied scoping ids are trusted. (This phase only reads the center name, but the pattern is established for all later phases.)
- **`getUser()` everywhere**, never `getSession()`, for auth decisions — it verifies the JWT with the Auth server.
- **No open redirects** — middleware redirects only to fixed internal paths; no `?next=` echo; post-login destination is computed server-side from status, never from a client URL.
- **Rate limiting delegated to Supabase** (Auth rate limits) for both `signInWithOtp` and `verifyOtp`. Surface generic Spanish errors; don't leak provider messages.
- **Service-role key isolation** — `SUPABASE_SERVICE_ROLE_KEY` is never imported into client or SSR-auth code paths.
- **RLS is not relied upon** — Drizzle bypasses it by design; all enforcement is in server code (documented in §1 so no future contributor "secures" it via RLS and assumes app safety).
- **`server-only`** import guard on `current-center.ts` / `on-login.ts` so they can never be bundled to the client.
- **Suspended** centers are routed to a dead-end status screen (no dashboard access), same as rejected.

---

## 12. Acceptance criteria

1. `pnpm lint` ✅ and `npx tsc --noEmit` ✅ (the CI gate, `.github/workflows/ci.yml`).
2. `pnpm build` ✅ green.
3. `/centro/login` renders the L1 phone step (Figma `29:2425`) at 390px, Spanish.
4. Visiting `/centro` (or any gated `/centro/*`) **unauthenticated → redirects to `/centro/login`**.
5. `signInWithOtp({ phone, options: { channel } })` (channel via swappable constant) → OTP step → `verifyOtp` mints an httpOnly session.
6. Post-verify: `app_user` is upserted with `id = session.user.id` + verified phone; membership/center resolved; routing matches the §8.1 table (`approved → /centro`, `pending_review → /centro/en-revision`, `rejected → /centro/rechazado`, no membership → `/centro/registro`).
7. `/centro` placeholder shows the **center name read via Drizzle filtered by `center_id`** + working **sign-out**.
8. `/centro/en-revision`, `/centro/rechazado`, `/centro/registro` placeholders render styled to Figma (`8:733`, `29:2030`, and a minimal registro card).
9. `(public)` and `(admin)` surfaces are unaffected (no gating, still render).

> CI runs `pnpm lint` + `npx tsc --noEmit` only; run `pnpm build` locally before opening the PR. Land on `main` via PR (final phase) — `main` is protected.

---

## 13. Build order (suggested)

1. `pnpm add @supabase/ssr`.
2. Supabase clients: `server.ts`, `client.ts`, `lib/supabase/middleware.ts` (§6).
3. `src/middleware.ts` + matcher (§7). Verify: anon `/centro` → `/centro/login` redirect.
4. `getCurrentCenter()` + `requireCenter()` + `resolveLoginDestination()` (§8, §9.1).
5. Auth actions `auth.ts` (`signOut`, `finishLogin`) (§10.3).
6. `(center)/layout.tsx` shell + the four placeholder pages (§9), reusing `Button`/`Card`/`AppBar` + tokens.
7. Login RSC wrapper + `login-form.tsx` two-step (§10).
8. Manual pass: anon redirect, OTP send/verify (test phone), status routing per center fixture, sign-out. Then `pnpm lint && npx tsc --noEmit && pnpm build`.
9. PR into `main`.
```
