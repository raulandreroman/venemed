# VeneMed — Admin Moderation (Surface A) — Implementation Spec

> **Status**: ready to implement. Branch `feat/admin-moderation` (off `main`). `main` is PROTECTED — land via PR (final phase).
> **Last updated**: 2026-06-29.
> **Read first**: `AGENTS.md`, `docs/specs/data-model.md`, `docs/specs/center-auth.md`.
> **Design source**: Figma `tGvDuvWW99K4QzDH0GlmW7`, page **7:34 (Back Office)**, section **51:1868 "Admin · Moderación"** (+ A1/A2/A3/A4 frames under section `53:*`).

---

## 0. Summary

Build the internal moderation surface that vets centers. Admins are `app_user`s with `is_platform_admin = true` (flag flipped manually in the DB — **no self-registration**). They authenticate with the **same phone-OTP** mechanism as centers. After OTP verify, an admin is routed to `/admin` (the moderation queue), reviews a center, and **approves** or **rejects (with reason)** it. Every decision writes an append-only `moderation_event` with `actor_user_id` = the admin's `app_user.id`.

**Design decision — viewport:** the design brief (`docs/briefs/missing-screens-design-brief.md` §8.1) floated desktop-first, but the **delivered Figma frames are 390 px mobile-first** (A1/A2/A3/A4 are all 390-wide). We follow the designers: **admin is mobile-first 390 px**, reusing the same `max-w-[390px]` column shell and `src/components/ui/**` primitives as the center back office.

**What this slice ships:**

| ID | Screen | Route | Figma node |
|----|--------|-------|------------|
| A1 | Admin login (phone → OTP) | `/admin/login` | `53:1361` (phone), `53:1385` (code) |
| A2 | Moderation queue (tabs Pendientes/Aprobados/Rechazados) | `/admin` | `51:1869` (+`53:1690`, `53:1794`, empties `53:1419/1449/1479`) |
| A3 | Center review detail | `/admin/centros/[id]` | `53:1123` |
| A4 | Reject-reason sheet | overlay on A3 | `53:1273` |
| D3 | Post-decision toast | inline on A2/A3 | `53:1340` |

Out of scope (P1 fast-follow, not this slice): A5 centers directory, A6 request takedown, A7 metrics, `suspendCenter` UI (the action is specced and may be included server-side but has no screen yet).

---

## 1. Reuse map (do NOT rebuild)

| Need | Reuse |
|------|-------|
| Supabase SSR clients | `src/lib/supabase/{server,client,middleware}.ts` |
| Session → user (JWT-verified) | `createClient().auth.getUser()` (never `getSession()`) |
| OTP send/verify UI | `src/app/(center)/_components/otp-step.tsx` (`<OtpStep>`) |
| Phone-step form pattern | `src/app/(center)/centro/login/login-form.tsx` |
| Post-verify routing | `resolveLoginDestination()` in `src/lib/auth/on-login.ts` (extend it) |
| Route gating | `src/middleware.ts` (extend it) |
| Auth primitive | `getCurrentCenter()` pattern in `src/lib/auth/current-center.ts` (mirror it for admin) |
| UI primitives | `src/components/ui/**` (`AppBar`, `Button`, `Card`, `Tag`, `Chip`) |
| Tokens | `src/app/globals.css` (`accent`, `accent-subtle`, `success/warning/error` + tints) |
| Phone canonicalizer | `normalizeVePhone()` in `src/lib/registro/validation.ts` |

**Design language (hard rules from AGENTS.md):** Inter; single-accent — accent (`#1F5AA8`) ONLY for actions (buttons, links, active tab, focus); semantic colors ONLY signal state (status badges). Spanish es-VE. Mobile-first 390 px. Use tokens, never hardcode hex.

---

## 2. Auth & gating (define precisely — center login must not break)

### 2.1 Admin identity primitive — `requireAdmin()`

New file `src/lib/auth/require-admin.ts` (`import "server-only"`). Mirrors `requireCenter()` but checks the platform-admin flag instead of membership.

```ts
import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  userId: string;   // = supabase auth uid = app_user.id; the moderation actor id
  phone: string | null;
  name: string | null;
};

/**
 * Authz primitive for the (admin) surface. Resolves session → app_user and
 * asserts is_platform_admin. Non-admins (including authed center users) are
 * redirected to "/". Anonymous users are redirected to the admin login.
 * Data access is Drizzle (bypasses RLS), so this is the ONLY authorization
 * gate for moderation — never trust a client-supplied actor id.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const rows = await db
    .select({
      id: appUser.id,
      phone: appUser.phone,
      name: appUser.name,
      isAdmin: appUser.isPlatformAdmin,
    })
    .from(appUser)
    .where(eq(appUser.id, user.id))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isAdmin) redirect("/"); // authed-but-not-admin → donor home
  return { userId: row.id, phone: row.phone, name: row.name };
}
```

> **Why `/` for non-admins and `/admin/login` for anon?** An anonymous visitor needs to authenticate (send them to the admin login). An *authenticated* non-admin (a center user who guessed `/admin`) is already signed in; bouncing them to a login would loop — send them to the public home instead.

### 2.2 Extend `resolveLoginDestination()` — admins route to `/admin` FIRST

`src/lib/auth/on-login.ts`. After the `app_user` upsert (which **must not** touch `is_platform_admin` — the manual flag is preserved because `onConflictDoUpdate.set` omits it), check the flag **before** center-membership routing. Admins frequently have **no membership** and must never be sent to `/centro/registro`.

```ts
// (2) Admins short-circuit BEFORE membership routing. Admins may have no
//     membership; they must not be routed to /centro/registro.
const [adminRow] = await db
  .select({ isAdmin: appUser.isPlatformAdmin })
  .from(appUser)
  .where(eq(appUser.id, user.id))
  .limit(1);
if (adminRow?.isAdmin) return "/admin";

// (3) Otherwise: existing center-membership routing (unchanged).
const result = await getCurrentCenter();
if (result.kind === "no-membership") return "/centro/registro";
if (result.kind === "anon") return "/centro/login";
return ROUTE_BY_STATUS[result.center.status] ?? "/centro/en-revision";
```

This single change means the **existing `finishLogin` server action works for both surfaces** — an admin who happens to log in via `/centro/login` still lands on `/admin`, and the dedicated `/admin/login` (below) reuses it verbatim. Center login behavior is **unchanged** for non-admins.

> `on-login.ts` is a plain server-only module (not `"use server"`), so adding the `import { eq }`/`appUser` usage and the early return is safe. `eq` and `appUser` are already imported there.

### 2.3 Extend `src/middleware.ts` — gate `(admin)` routes (session-only)

Middleware runs without Drizzle (it only has the Supabase SSR client), so it gates on **session presence only**. The `is_platform_admin` authorization is enforced in the `(admin)` layout via `requireAdmin()` (§2.4). This matches the AGENTS.md rule: *authorize in server code, never RLS*.

Add, alongside the existing center logic (keep all center logic intact):

```ts
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
const isPublicAdmin = PUBLIC_ADMIN_PATHS.some(
  (p) => pathname === p || pathname.startsWith(p + "/"),
);

// Gate (admin) routes: unauth → admin login. (Admin-flag check is in the layout.)
if (isAdmin && !isPublicAdmin && !user) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return redirectWithCookies(url);
}

// Already authed on the admin login → bounce into the queue.
if (pathname === "/admin/login" && user) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin";
  return redirectWithCookies(url);
}
```

Notes:
- Use the **existing** `redirectWithCookies()` helper so a refreshed Supabase token is carried over the redirect (AGENTS.md gotcha #3).
- The matcher already covers `/admin/*` (it excludes only `_next` + static assets). No matcher change needed.
- Order: keep center checks and admin checks independent; neither path-matches the other.

### 2.4 `(admin)` layout enforces `requireAdmin()`

New `src/app/(admin)/layout.tsx`. Mirrors `(center)/layout.tsx` (mobile-first 390 px column). The DB-backed authz lives here (defense-in-depth over middleware): a `requireAdmin()` call **per gated page** (not in the layout body, because the layout also wraps `/admin/login`). 

**Decision:** the route group `(admin)` contains BOTH `/admin/login` (public) and the gated screens. So the layout is the **visual shell only**; each gated page (`/admin`, `/admin/centros/[id]`) calls `requireAdmin()` itself — exactly the pattern `(center)` uses (`requireCenter()` per page, layout is shell-only). The login page does NOT call `requireAdmin()`.

```tsx
// src/app/(admin)/layout.tsx
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-background">
      {children}
    </div>
  );
}
```

### 2.5 Admin login entry — recommendation: a dedicated `/admin/login`

**Recommended: a thin `/admin/login` page** (Figma A1 `53:1361`). Rationale:
- The Figma A1 has admin-specific copy and an **"Acceso de moderador"** badge; it omits the center's "¿No tienes cuenta? Registra tu centro" CTA (admins can't self-register).
- It gives middleware a clean unauth target for `/admin/*` without leaking center registration affordances to staff.
- It reuses **all** the OTP machinery — only the phone-step copy differs.

Implementation reuses the shared `<OtpStep>` and the **existing `finishLogin`** action (which now routes admins to `/admin` via §2.2). No new action is needed.

```
src/app/(admin)/admin/login/page.tsx        // RSC wrapper: if already admin-authed → redirect /admin
src/app/(admin)/admin/login/admin-login-form.tsx  // "use client"; mirrors login-form.tsx with admin copy
```

`admin-login-form.tsx` is a copy-variant of `login-form.tsx`:
- Same two-step state machine (`phone` → `<OtpStep>`), same `signInWithOtp({ phone, options: { channel } })`, same `verifyOtp` inside `<OtpStep>`.
- `onVerified={finishLogin}` (imported from `@/app/(center)/actions/auth` — it is a `"use server"` action, importable cross-group).
- Copy per Figma A1: badge "Acceso de moderador" (shield, `bg-accent-subtle text-accent`), title "Ingresa tu teléfono", subtitle "Te enviaremos un código por WhatsApp para entrar a tu cuenta de moderación.", helper "Debe ser el número registrado como moderador.", button "Enviar código". **No** registration link.
- `backHref="/"`.

> **Alternative considered (reuse `/centro/login`):** also works because §2.2 routes admins to `/admin` post-verify, but it would show staff the "Registra tu centro" CTA and force middleware to bounce unauth `/admin` hits to a center-branded screen. The dedicated page is the simplest *faithful* option and is already designed (A1). Picked it.

### 2.6 Auth flow (end to end)

```
anon → GET /admin
  → middleware: no session → 307 /admin/login
  → A1 phone step → signInWithOtp (WhatsApp/SMS)
  → A1 code step (<OtpStep>) → verifyOtp → session cookie set
  → finishLogin() → resolveLoginDestination()
       → upsert app_user (is_platform_admin preserved)
       → is_platform_admin? → redirect /admin     ← NEW short-circuit
  → GET /admin → middleware: session ok → (admin) page → requireAdmin() passes → queue
```

Non-admin who reaches `/admin`: middleware passes (has session) → `requireAdmin()` → `redirect("/")`.

---

## 3. Queries (admin sees ALL centers — never `center_id`-scoped)

New file `src/db/admin-queries.ts` (`import "server-only"`). Admin reads span **all** centers (unlike center queries, which are scoped to the logged-in `center_id`). Authorization is enforced upstream by `requireAdmin()` in the page — these functions assume an authorized caller.

### 3.1 `listCentersByStatus(status)`

Powers the A2 queue tabs. One status at a time (the active tab), newest-submitted first.

```ts
export type CenterQueueRow = {
  id: string;
  name: string;
  type: CenterType;          // enum value; map to Spanish label in the UI
  city: string;
  state: string | null;
  whatsappPhone: string;
  status: CenterStatus;
  rejectionReason: string | null;
  createdAt: Date;           // "Solicitado hace X" (pending) / submitted-ago
  verifiedAt: Date | null;   // approved tab: "Aprobado hace X"
  updatedAt: Date;           // rejected tab: "Rechazado hace X"
};

export async function listCentersByStatus(
  status: CenterStatus,
): Promise<CenterQueueRow[]>;
```

- Drizzle: `select(...).from(center).where(eq(center.status, status)).orderBy(desc(center.createdAt))`.
- **Pending** ordered by `createdAt asc`-vs-`desc`? Figma shows newest activity but oldest-waiting is the triage priority. **Decision: `createdAt desc`** (matches "newest first" in the brief A2 spec and the Figma "Solicitado hace 3 h / 9 h / 1 d 4 h" ordering). The "Urgente" badge (Figma) is derived: pending & `now - createdAt >= 24h`.
- **Cached** with `unstable_cache`, key `["admin-centers", status]`, `tags: ["admin-centers", \`admin-centers:${status}\`]`. Short `revalidate` (e.g. 30) so the queue feels live; the mutating actions also `revalidateTag` (see §4).

### 3.2 `getCenterForReview(id)`

Powers A3. Full center record + responsable (the `center_admin` member's `app_user.name` + phone) + counts.

```ts
export type CenterReview = {
  id: string;
  name: string;
  type: CenterType;
  description: string | null;
  city: string;
  state: string | null;
  addressLine: string | null;
  addressReference: string | null;
  regularScheduleText: string | null;
  whatsappPhone: string;
  status: CenterStatus;
  rejectionReason: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  responsable: { name: string | null; phone: string | null } | null;
  counts: { requestsTotal: number };   // optional context for vetting
  history: ModerationHistoryRow[];      // see §3.3
};

export async function getCenterForReview(id: string): Promise<CenterReview | null>;
```

- Center row by `eq(center.id, id)`; `return null` when absent → page renders `notFound()`.
- **Responsable**: join `membership` (where `centerId = id`, `role = 'center_admin'`) → `app_user` for `name` + `phone`. (Schema enforces one user per center in v1 via `membership_user_id_key`, but query defensively with `limit(1)`.) The responsable phone equals `center.whatsappPhone` by construction (registration binds both to the OTP-verified number) — show the WhatsApp link from `center.whatsappPhone`.
- **`counts.requestsTotal`**: `count()` of `request` where `centerId = id`. Cheap context for the reviewer; expand later if needed.
- **No `cargo` field exists** in the schema (Figma A3 shows "Cargo · Coordinadora de logística"). v1 has no backing data for a role title → **omit the "Cargo" line** (or render nothing). Flagged as a future field if product wants it.
- Not cached (review detail is low-traffic and must reflect the latest decision immediately) — a plain async function.

### 3.3 `listModerationHistory(centerId)` (for A3 audit trail)

```ts
export type ModerationHistoryRow = {
  id: string;
  action: string;            // 'approved' | 'rejected' | 'suspended' | 'expired_by_cron' | ...
  reason: string | null;
  createdAt: Date;
  actorName: string | null;  // app_user.name of the acting admin (null for system/cron)
};

export async function listModerationHistory(
  centerId: string,
): Promise<ModerationHistoryRow[]>;
```

- `select` from `moderationEvent` left-join `appUser` on `actorUserId`, where `subjectType = 'center'` and `subjectId = centerId`, `orderBy(desc(createdAt))`.
- Folded into `getCenterForReview` as `history` (single round trip is fine, or call separately).

> All three live in `admin-queries.ts` to keep them out of the donor-cached `queries.ts` surface and clearly separate the unscoped admin reads. `CenterStatus`/`CenterType` types are imported from `@/lib/auth/current-center` / re-derived from the schema enums.

---

## 4. Moderation actions (`"use server"`, `requireAdmin()` first)

New file `src/app/(admin)/actions/moderation.ts`.

**Hard rule (AGENTS.md gotcha #1):** a `"use server"` file exports **ONLY async functions**. No `export type`/`const`. Import types with `import type`. Status/action string literals stay inline or in a non-`"use server"` module.

Every action:
1. Calls `requireAdmin()` **first** → obtains the trusted `actorUserId`. The client never supplies an actor id.
2. Runs a **transaction**: mutate `center` + insert the `moderation_event` atomically (all-or-nothing audit).
3. `revalidateTag(..., "max")` (Next 16 two-arg form) for the affected list tags.
4. Returns a small result object (no redirect — A3 stays on the page and shows the D3 toast, then the list refreshes).

### 4.1 `approveCenter(id)`

```ts
export async function approveCenter(centerId: string): Promise<ModerationResult>;
```

- Guard: `const admin = await requireAdmin()`.
- Transaction:
  - `update center set status='approved', verified_at=now, rejection_reason=null, updated_at=now where id=centerId` (only if current status is `pending_review` or `rejected` — re-review path; reject re-approve is allowed).
  - `insert moderation_event { actorUserId: admin.userId, subjectType:'center', subjectId: centerId, action:'approved', reason: null }`.
- Revalidate: `["admin-centers","admin-centers:pending_review","admin-centers:approved","admin-centers:rejected"]` each with `"max"`, **plus `"landing-stats"`** (the donor landing's `approvedCenters` count + the `getCurrentCenter`-driven center routing both change when a center becomes approved).
- The center's own status screens (`/centro/en-revision` → `/centro`) are uncached/dynamic; no extra revalidation needed there.

### 4.2 `rejectCenter(id, reason)`

```ts
export async function rejectCenter(
  centerId: string,
  reason: string,
): Promise<ModerationResult>;
```

- Guard: `requireAdmin()`.
- **Validate `reason`**: trim; require non-empty (the Figma A4 requires a *motivo* chip; the free-text note is optional). The UI composes `reason` = selected motivo label + optional note (see §5.3). Server still re-validates non-empty (defense-in-depth) and caps length (e.g. ≤ 400 chars) → throw a generic error on violation.
- Transaction:
  - `update center set status='rejected', rejection_reason=<reason>, verified_at=null, updated_at=now where id=centerId`.
  - `insert moderation_event { actorUserId: admin.userId, subjectType:'center', subjectId: centerId, action:'rejected', reason }`.
- Revalidate the four `admin-centers` tags (a pending row leaves the Pendientes tab and appears under Rechazados). `landing-stats` unaffected (reject doesn't change approved count) — skip it.
- The center sees `rejection_reason` on `/centro/rechazado` (already wired via `getCurrentCenter().center.rejectionReason`).

### 4.3 `suspendCenter(id, reason)` (server-side only; no screen this slice)

```ts
export async function suspendCenter(
  centerId: string,
  reason: string,
): Promise<ModerationResult>;
```

- Same shape as reject: guard, validate reason, transaction `status='suspended'`, `rejection_reason=reason` (reused as the "needs attention" message — `suspended` maps to `/centro/rechazado` in `ROUTE_BY_STATUS`), `moderation_event action:'suspended'`. Revalidate `admin-centers` + `landing-stats` (a suspended center drops out of the approved count).
- Included for completeness/audit symmetry; wired to UI in the A5 fast-follow.

### 4.4 Result type & error handling

`ModerationResult` is a **non-exported** shape (cannot live in the `"use server"` file). Define it in a sibling non-action module, e.g. `src/app/(admin)/actions/types.ts`, and `import type { ModerationResult }`:

```ts
export type ModerationResult =
  | { ok: true; status: "approved" | "rejected" | "suspended" }
  | { ok: false; error: string };
```

- Actions catch DB errors and return `{ ok: false, error: "No se pudo guardar la decisión. Inténtalo de nuevo." }` rather than throwing, so the A3 client can show an inline error and the D3 toast only fires on `ok`.
- `revalidateTag` is called **after** the transaction commits, **before** returning.

### 4.5 Action string vocabulary

`moderation_event.action` is free `text`. Use: `'approved'`, `'rejected'`, `'suspended'`. (Cron already uses `'expired_by_cron'` for request subjects.) `subject_type='center'`, `subject_id=center.id`, `actor_user_id=<admin>`.

---

## 5. UI (mobile-first 390 px — Figma-faithful)

All screens use the `(admin)` shell (`max-w-[390px]`), `AppBar`, `Button`, `Card`, `Tag`, `Chip`, Inter, tokens.

### 5.1 A2 · `/admin` — Moderation queue (Figma `51:1869`)

`src/app/(admin)/admin/page.tsx` (RSC). Tab state via **`searchParams`** (`?tab=pendientes|aprobados|rechazados`, default `pendientes`).

- **First line:** `await requireAdmin()`.
- **AppBar:** centered title **"Moderación"**, subtitle **"Actualizado hace 1 min"** (relative to the most-recent center activity, or a static "ahora" — derive from the freshest `createdAt/updatedAt` in the list), trailing **"…"** (overflow; inert in v1 or a link to A5 later). Use `AppBar` with a custom subtitle slot if needed, else a small custom header matching the back-office `align="start"` pattern.
- **Tabs:** `Pendientes` (with a count badge — `bg-accent-subtle text-accent` pill showing the pending count), `Aprobados`, `Rechazados`. Active tab: accent text + accent underline (single-accent — the active/selected affordance is an *action* color). Tabs are `<Link href="/admin?tab=...">` (RSC, no client state needed). The **count badge** comes from `listCentersByStatus('pending_review').length` (or a cheap `count()`); fetch the active tab's rows for the list.
- **Rows** (one `Card` each, the whole card is a `<Link href="/admin/centros/[id]">`):
  - Leading **avatar**: 40 px accent circle (`bg-accent text-accent-on`) with the center's initials (first letters of the first two words of `name`).
  - **Name** (H2/16 semibold, `text-neutral-900`).
  - **Meta** line: `{typeLabel} · {city}` (`text-neutral-500`) — `typeLabel` maps the `center_type` enum to Spanish ("hospital"→"Hospital público", "clinic"→"Clínica", "elder_care_home"→"Casa adultos mayores", "childrens_shelter"→"Casa hogar / refugio", "collection_center"→"Centro de acopio").
  - **Submitted-ago** line: "Solicitado hace {X}" (pending) / "Aprobado hace {X}" (aprobados) / "Rechazado hace {X}" (rechazados), using the existing relative-time formatter (`src/lib/format.ts`).
  - Trailing **chevron** (right arrow, `text-neutral-400`).
  - **"Urgente" tag** (`Tag variant="warning"` / warning-tint) on pending rows older than 24 h (Figma shows it on "hace 1 d 4 h").
- **States:**
  - **Loading**: a skeleton list (3–4 placeholder cards) via `loading.tsx` in the route, or Suspense. No synchronous `setState` in effects (lint rule).
  - **Empty**: per-tab copy (Figma A2.Empty) — Pendientes: "No hay centros por revisar" + sub "Cuando un centro se registre aparecerá aquí."; Aprobados/Rechazados: analogous. Centered icon + text, neutral.
  - **Error**: `error.tsx` boundary with "No pudimos cargar la cola." + a **Reintentar** button (`reset()`).
- **Post-action toast (D3 `53:1340`)**: when arriving from a decision, show a transient success toast ("Centro aprobado" / "Centro rechazado"). Implement as a lightweight client toast triggered by a `?done=approved|rejected` searchParam set on navigation back, or by a client store — keep it simple (searchParam + auto-dismiss). Toast is **state feedback**, may use `success` color for the check icon; body stays neutral.

### 5.2 A3 · `/admin/centros/[id]` — Center review detail (Figma `53:1123`)

`src/app/(admin)/admin/centros/[id]/page.tsx` (RSC).

- **First line:** `const admin = await requireAdmin()`. Then `const c = await getCenterForReview(id); if (!c) notFound();`.
- **AppBar:** back arrow (`backHref="/admin"`), centered title **"Revisar centro"**.
- **Status pill:** "{StatusLabel} · hace {X}" with a leading dot — neutral pill for `pending_review` ("Pendiente"), `success` for `approved`, `error` for `rejected`, `warning` for `suspended`. Use `Tag` with the matching variant (state color, per single-accent rules).
- **Identity:** avatar (initials) + name (H1/22) + "{typeLabel} · {city}".
- **Section "Datos del centro":** label/value rows for **Nombre legal** (`name`), **Tipo de centro** (`typeLabel`), **Estado** (`state`), **Ciudad** (`city`), **Dirección** (`addressLine`, with `addressReference` on a second line if present), and **Horario** (`regularScheduleText`) + **Descripción** (`description`) when present. Labels `text-neutral-500` caption, values `text-neutral-900` body.
- **Section "Persona responsable":** **Nombre** (`responsable.name`), **Teléfono WhatsApp** as an **accent link** to `https://wa.me/{digits}` (digits = `whatsappPhone` without `+`) with "Toca para abrir WhatsApp" helper. **Omit "Cargo"** (no schema field — §3.2).
- **Section "Historial de moderación":** the `history` rows (action label + actor name + relative time + reason when present). Newest first. Empty → "Sin actividad de moderación aún." (Brief A3 requires the audit trail.)
- **Sticky bottom bar (StickyBar `53:1176`):** two buttons — **Rechazar** (`Button variant="secondary"`, outline) opens the A4 sheet; **Aprobar** (`Button` primary, accent) calls `approveCenter`. For `pending_review` show both; for already-decided centers show context-appropriate actions (e.g. an approved center → "Suspender"/"Re-revisar" in the A5 follow-up; for this slice, show Approve/Reject only on `pending_review`, and a read-only state otherwise).
- **Approve interaction:** the sticky bar is a small **client component** (`review-actions.tsx`, `"use client"`) receiving `centerId`. Approve → `await approveCenter(centerId)`; on `ok` → `router.push("/admin?tab=pendientes&done=approved")` (refreshes the revalidated list + fires the D3 toast); on `!ok` → inline error. Use a pending state on the button (disabled + "Aprobando…").

### 5.3 A4 · Reject-reason sheet (Figma `53:1273`)

Client component `reject-sheet.tsx`, opened from A3's Rechazar button (bottom sheet overlay; mirror the existing center modal pattern, e.g. `Modal · Desactivar recepción` `61:2160`).

- **Header:** "Rechazar centro" + "{name} · {city}".
- **Helper:** "Selecciona el motivo principal. La nota que escribas llegará al responsable por WhatsApp."
- **"Motivos comunes" chips** (single-select, `Chip`): **Datos incompletos**, **Teléfono no responde**, **Información no verificable**, **Centro duplicado**. Selected chip = accent fill (`bg-accent text-accent-on`); the rest neutral. **Selecting a motivo is REQUIRED** (the primary button is disabled until one is chosen).
- **"Nota para el centro" (opcional)** textarea, max 280 chars with a live "{n} / 280" counter.
- **Footer:** **Cancelar** (`variant="secondary"`) closes; **Rechazar y notificar** (primary) → composes `reason = motivoLabel + (note ? " — " + note : "")` and calls `rejectCenter(centerId, reason)`.
- On `ok` → close sheet → `router.push("/admin?tab=pendientes&done=rejected")`. On `!ok` → inline error in the sheet.
- Accessibility: focus-trap the sheet, `Esc`/backdrop closes (= Cancelar), the primary button reflects a pending state. No synchronous `setState` in a `useEffect` body (defer with `requestAnimationFrame` if ever needed — lint hard error).

### 5.4 A1 · `/admin/login` — see §2.5.

### 5.5 Component notes

- Prefer reusing `AppBar`; if the two-line title (title + "Actualizado hace…") doesn't fit `AppBar`'s API, render a small bespoke header in the page that matches the back-office header tokens — do not fork `AppBar` unnecessarily.
- Avatar/initials and the tab bar are new small primitives; colocate them under `src/app/(admin)/_components/` (e.g. `queue-tabs.tsx`, `center-avatar.tsx`) rather than polluting `src/components/ui` unless reused by the center surface.
- All copy es-VE. All colors via tokens.

---

## 6. Audit (every action writes a `moderation_event`)

- `approveCenter` → `action:'approved'`, `reason:null`.
- `rejectCenter` → `action:'rejected'`, `reason:<composed>`.
- `suspendCenter` → `action:'suspended'`, `reason:<reason>`.
- Always `subject_type:'center'`, `subject_id:center.id`, `actor_user_id:<admin.userId from requireAdmin()>`.
- Insert is inside the same transaction as the `center` update → no decision without its audit row, and no orphan audit row.
- The A3 "Historial de moderación" section reads these back (`listModerationHistory`).

---

## 7. File manifest

**New:**
```
src/lib/auth/require-admin.ts                              # requireAdmin() + AdminUser
src/db/admin-queries.ts                                    # listCentersByStatus, getCenterForReview, listModerationHistory
src/app/(admin)/layout.tsx                                 # 390px shell
src/app/(admin)/actions/moderation.ts                      # "use server": approve/reject/suspendCenter
src/app/(admin)/actions/types.ts                           # ModerationResult (non-action types)
src/app/(admin)/_components/queue-tabs.tsx                 # tab links (or RSC)
src/app/(admin)/_components/center-avatar.tsx              # initials avatar
src/app/(admin)/_components/admin-toast.tsx                # D3 post-decision toast (client)
src/app/(admin)/admin/page.tsx                             # A2 queue (REPLACES the placeholder)
src/app/(admin)/admin/loading.tsx                          # A2 skeleton
src/app/(admin)/admin/error.tsx                            # A2 error boundary
src/app/(admin)/admin/login/page.tsx                       # A1 RSC wrapper
src/app/(admin)/admin/login/admin-login-form.tsx           # A1 client form (reuses <OtpStep>, finishLogin)
src/app/(admin)/admin/centros/[id]/page.tsx                # A3 detail
src/app/(admin)/admin/centros/[id]/review-actions.tsx      # A3 sticky bar (client)
src/app/(admin)/admin/centros/[id]/reject-sheet.tsx        # A4 sheet (client)
```

**Modified:**
```
src/lib/auth/on-login.ts     # admin short-circuit in resolveLoginDestination (before membership routing)
src/middleware.ts            # gate (admin) routes; bounce authed off /admin/login
```

No schema/migration changes (all required columns — `app_user.is_platform_admin`, `center.status/rejection_reason/verified_at`, `moderation_event.*` — already exist).

---

## 8. Acceptance criteria

**CI gates (must be green):**
- [ ] `pnpm lint` passes — including `react-hooks/set-state-in-effect` (no synchronous `setState` in effects).
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm build` succeeds.
- [ ] No `"use server"` file exports a non-async member (approve/reject/suspend file exports only async fns; types live in `actions/types.ts` and are `import type`-d).
- [ ] `revalidateTag` uses the two-arg form `revalidateTag(tag, "max")`. `cookies()`/`getUser()` awaited. `src/middleware.ts` retained.

**Auth & gating:**
- [ ] Anonymous `GET /admin` → 307 `/admin/login` (cookies carried on the redirect).
- [ ] Authenticated **non-admin** (center user) `GET /admin` → `requireAdmin()` redirects to `/`.
- [ ] Admin completes OTP at `/admin/login` → lands on `/admin` (queue). An admin with **no membership** is **never** sent to `/centro/registro`.
- [ ] An admin logging in via `/centro/login` also lands on `/admin` (resolveLoginDestination short-circuit).
- [ ] **Center login still works**: a non-admin approved center → `/centro`; `pending_review` → `/centro/en-revision`; `rejected` → `/centro/rechazado`; no-membership → `/centro/registro`. (Unchanged — verify via the existing center e2e.)

**Queries:**
- [ ] `listCentersByStatus` returns ALL centers of a status (not `center_id`-scoped), newest first.
- [ ] `getCenterForReview` returns full center + responsable name/phone + history; `notFound()` for a bad id.

**Moderation actions (mutate status + write audit, transactionally):**
- [ ] `approveCenter` sets `status='approved'`, `verified_at=now`, clears `rejection_reason`, and inserts a `moderation_event { action:'approved', actor_user_id=<admin> }` — atomically.
- [ ] `rejectCenter` rejects an empty/whitespace reason; on a valid reason sets `status='rejected'`, `rejection_reason`, and inserts `moderation_event { action:'rejected', reason, actor_user_id=<admin> }`.
- [ ] The actor id is taken from `requireAdmin()`, never from client input.
- [ ] After approve/reject, the A2 list tags (and `landing-stats` on approve) are revalidated; the moved center disappears from Pendientes and appears under the right tab.
- [ ] The rejected center's reason surfaces on its `/centro/rechazado` screen.

**UI (mobile-first 390 px, Figma-faithful):**
- [ ] `/admin` matches A2 (`51:1869`): AppBar "Moderación", tabs with pending count badge, center rows (avatar, name, type·city, submitted-ago, chevron, conditional "Urgente"), empty + loading + error states, D3 toast on return.
- [ ] `/admin/centros/[id]` matches A3 (`53:1123`): status pill, identity, Datos del centro, Persona responsable (WhatsApp link), moderation history, sticky Aprobar/Rechazar bar.
- [ ] Reject opens the A4 sheet (`53:1273`): required motivo chip, optional note (280 cap + counter), "Rechazar y notificar" → `rejectCenter`.
- [ ] Single-accent respected (accent only on actions/active tab/links/focus; status badges use semantic colors only). es-VE throughout. Tokens only, no hardcoded hex.

**Verification method (AGENTS.md gotcha #2):** server actions are NOT exercised by `build` + `curl GET`. Verify approve/reject by driving the actual submit — extend the Playwright e2e with an admin spec that: provisions a `pending_review` test center, flips a test phone's `is_platform_admin=true`, logs in via OTP (use a distinct `TEST_CENTER_PHONE_2`-class number to dodge the ~1/min OTP limit), approves/rejects, and asserts the status + `moderation_event` row. Keep DB writes bounded/idempotent (never add `db:seed`/`db:migrate` to CI).

---

## 9. Open questions / deferred

1. **Admin login number provisioning.** `is_platform_admin` is flipped manually; the admin must already exist as an `app_user` (a row is created on first OTP login). Operationally: have the person log in once (creating the row), then flip the flag — or pre-insert the row. Document in the runbook.
2. **"Cargo" (responsable role title)** — not in the schema; omitted in v1. Add a `membership`/`app_user` column if product wants it on A3.
3. **`suspendCenter` UI** — action specced; screen is the A5 fast-follow.
4. **Queue freshness / "Actualizado hace X"** — derived from the freshest row timestamp; revisit if a realtime indicator is wanted.
5. **Re-review of rejected centers** (Figma A3.Re-envío `53:1579`, "Detalle con Cambios") — the data supports re-approving a `rejected` center; the diff/changes UI is a fast-follow.
