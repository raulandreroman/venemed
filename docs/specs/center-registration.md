# VeneMed — Center Registration (Phase 2) — Implementation Spec

> **Status**: ready to build. Last updated 2026-06-28.
> **Branch**: `feat/center-registro`, **stacked on** `feat/center-auth` (Phase 1, not yet merged to `main`). The PR targets `feat/center-auth` and auto-retargets to `main` once Phase 1 lands.
> **Scope**: the **center registration flow** `R0 → Datos → Verificar teléfono → En revisión`, and the transactional `createCenterForCurrentUser` write. **Replaces** the Phase 1 placeholder `src/app/(center)/centro/registro/page.tsx` with the real flow.
> **Reuses (do NOT rebuild)**: Phase 1 auth foundation — Supabase SSR clients, `getCurrentCenter`, `requireCenter`, `resolveLoginDestination`, the OTP UI in `login-form.tsx`, the `(center)` shell, design system (`src/components/ui/**`, `globals.css` tokens).
> **Related**: `docs/specs/center-auth.md` (Phase 1), `docs/specs/lista-model-v2.md` (schema model of record — replaced the retired `data-model.md`). Stack already scaffolded — **do not re-scaffold, do not add deps unless §10 says so.**
> **Figma**: back office page `7:34`, file `tGvDuvWW99K4QzDH0GlmW7`. Frames: R0 `29:2451`, Datos `8:493`, Datos con errores `29:1935`, Verificar teléfono `8:580`, Código incorrecto `8:623`, Intentos agotados `29:1998`, En revisión `8:733`.

---

## 1. Architecture — read first (same trust model as Phase 1)

Get this wrong and the write is unsound. **Nothing here changes the Phase 1 authorization model.**

- **Data access is Drizzle / postgres-js** (`src/db`, exports `db`); it connects with the Postgres role and **bypasses RLS**. Registration writes go through Drizzle, never the Supabase data API, never RLS.
- **Supabase Auth is ONLY identity/session.** Its single job in this flow: send the WhatsApp OTP to the entered phone, verify it, and mint an httpOnly session cookie. After verify, the browser holds a session and the server can trust `getUser().id` + verified phone.
- **Authorization / scoping is server-side.** The new center's `id` is generated server-side inside the write; the new membership binds `session.user.id → center.id`. **No client-supplied id is ever trusted** — the only thing the client sends is the *form payload* (center descriptive fields + responsable name), and every field is **re-validated server-side** before the write.
- **Identity model** (`src/db/schema.ts`, unchanged): `app_user.id` = Supabase `auth.users` uid (1:1); `membership.user_id → center_id`, one membership per user in v1; `center.status ∈ {pending_review, approved, rejected, suspended}`. A freshly registered center starts `pending_review`.

### Trust boundary (registration)

```
Browser (anon)  ──fill Datos (client state)──▶  [held in wizard React state]
Browser ──(whatsapp_phone)──▶ Supabase signInWithOtp({phone, channel}) ──WhatsApp OTP──▶ Browser
Browser ──(otp)────────────▶ Supabase verifyOtp ──▶ httpOnly session cookie (now authenticated)
Browser ──(full form payload)──▶ server action createCenterForCurrentUser(data)
                                       │ getUser() → uid + verified phone   ◀── trust starts here
Next.js server ────────────────────────┘ Drizzle TX: upsert app_user, insert center, insert membership
                                       └─ redirect /centro/en-revision (carries refreshed cookies)
```

---

## 2. Goal & non-goals

### Goal
A center owner opens `/centro/registro`, reads the R0 intro, taps **Comenzar**, fills the **Datos** form (center fields + responsable name), verifies the center's WhatsApp phone via the **reused** Phase 1 OTP step, and on success a single transactional server action creates `app_user` + `center` (`pending_review`) + `membership` (`center_admin`) and lands them on `/centro/en-revision`. The write is **idempotent**: a user who already has a membership is never duplicated — they are routed to their existing status. `pnpm lint` + `npx tsc --noEmit` pass (CI gate); `pnpm build` is green.

### Non-goals (explicit)
- **No changes to the login flow's behavior** beyond extracting the shared OTP step (§6). `finishLogin` is unchanged.
- **No real dashboard / solicitudes** — `/centro` stays the Phase 1 placeholder.
- **No admin/moderation surface.** Approval of a `pending_review` center happens in the `(admin)` phase; here we only create the row.
- **No new auth plumbing** — Supabase clients, middleware, guards are all Phase 1.
- **No "Cargo" persistence** (see §4 note) and **no schema migration** (see §5).

---

## 3. The flow (5 states) — screen-by-screen

All screens are mobile-first 390px, Spanish (es-VE), Inter, single-accent (accent only on the primary action). Reuse `AppBar`, `Button`, `Card`, `ProgressBar` from `src/components/ui`.

| # | State | Figma | Route / surface | Notes |
|---|-------|-------|-----------------|-------|
| 1 | **R0 · Comenzar registro** | `29:2451` | `/centro/registro` (wizard step `intro`) | Intro + benefits list + **Comenzar** CTA. Public (no session). |
| 2 | **Datos del centro** | `8:493` | wizard step `datos` | Form. `AppBar` title "Registrar centro", `1 de 3`, `ProgressBar` 1/3. Client + server validation → "Datos con errores" `29:1935`. |
| 3 | **Verificar teléfono** | `8:580` | wizard step `otp` | **Reused** Phase 1 OTP step. `2 de 3`, `ProgressBar` 2/3. Errors: "Código incorrecto" `8:623`, "Intentos agotados" `29:1998`. |
| 4 | *(write)* | — | server action | `createCenterForCurrentUser` runs on verify success, then redirects. |
| 5 | **En revisión** | `8:733` | `/centro/en-revision` | **Phase 1 page already exists.** Post-registration redirect lands here. `3 de 3`. |

### 3.1 R0 (`29:2451`)
- `AppBar title="Registrar centro" backHref="/"` (or `/centro/login` — match the existing placeholder's back affordance; R0 is the public landing the login screen's "Registra tu centro" link points to).
- H1 **"Crea la cuenta de tu centro"**; subtitle "En pocos minutos podrás publicar lo que tu centro necesita."
- Three icon rows (icon in `bg-accent-subtle` rounded tile): **Datos básicos del centro** / "Nombre, ubicación y responsable." · **Un teléfono con WhatsApp** / "Lo verificamos con un código." · **Unos 2 a 3 minutos** / "Puedes pausar y seguir después."
- Accent left-border note card (reuse the `/centro/en-revision` note style): "Verificaremos tu centro antes de activarlo, para proteger la red de ayuda."
- Bottom: primary `Button` **"Comenzar"** (advances wizard to `datos`) + "¿Ya tienes cuenta? **Iniciar sesión**" link to `/centro/login`.

### 3.2 Datos (`8:493` / errors `29:1935`)
- `AppBar title="Registrar centro" backHref` → back returns to `intro`. Trailing text "1 de 3". `ProgressBar value={1/3}` under the bar (3 segments visually; a single `ProgressBar` at 0.33 is acceptable, or three pills matching Figma — pick the pills to match `8:493`).
- Section "Datos del centro", then section "Persona responsable" (see §4 for the exact field list).
- Error state (`29:1935`): a red `Card` banner at top — bold **"Faltan N datos por corregir"** + "Revisa los campos marcados en rojo para continuar."; invalid fields get red border + per-field message in `text-error`. Banner count N = number of invalid fields.
- Bottom: footer note "Paso 1 de 3 · Tus datos están protegidos" + primary `Button` **"Continuar"**.

### 3.3 Verificar (`8:580`, `8:623`, `29:1998`)
- The **reused** OTP step (§6). Title "Verificar teléfono", "2 de 3", chat-bubble icon tile, "Ingresa el código", masked phone, **Cambiar número** (returns to `datos`), 6 boxes, resend countdown, **Verificar** CTA.
- **Código incorrecto** (`8:623`): boxes red, message "Código incorrecto. Te quedan {n} intentos." (client attempt counter, see §6.3).
- **Intentos agotados** (`29:1998`): lock icon, **"Demasiados intentos"**, "Por tu seguridad bloqueamos la verificación temporalmente tras varios códigos incorrectos.", info card "Podrás reintentar en {mm:ss}", disabled "Reenviar código" + secondary "Verificar con otro número" (→ `datos`).

### 3.4 En revisión (`8:733`)
- **Already implemented in Phase 1** (`/centro/en-revision`, guarded by `requireCenter`). The only Phase 2 requirement: the post-write redirect lands here, and a freshly created `pending_review` center renders it. (Phase 1's page already redirects approved→`/centro`, rejected/suspended→`/centro/rechazado`.)

---

## 4. Form fields — exact contract

The **field list is authoritative from the task** (schema-backed). Figma `8:493` shows a *condensed* mock (merges city+address into "Ciudad y dirección", and shows a non-persisted "Cargo"). **Reconcile in favor of the schema**: collect the fields below, lay them out under Figma's two section headers, and match Figma's copy/placeholders/error styling. Deltas vs Figma are intentional and listed in §4.2.

### 4.1 Fields (client `RegistroFormData`)

| UI label (es) | key | schema column | required | validation | placeholder / hint |
|---|---|---|---|---|---|
| Nombre del centro | `name` | `center.name` (NOT NULL) | ✅ | trim, 2–120 chars | "Ej: Hospital Universitario de Caracas" · "Tal como aparece en el documento legal" |
| Tipo de centro | `type` | `center.type` enum `center_type` | ✅ | one of the 5 enum values | select; options below |
| Estado | `state` | `center.state` (nullable) | ✅ *(at app layer)* | one of the VE states list | "Selecciona el estado" · error "Selecciona el estado donde opera el centro" |
| Ciudad | `city` | `center.city` (NOT NULL) | ✅ | trim, 2–80 chars | "Ej: Caracas" |
| Dirección | `addressLine` | `center.address_line` (nullable) | ✅ *(at app layer)* | trim, 4–160 chars | "Av. Principal, sector" · "Dónde se recibirán las donaciones" |
| Referencia (opcional) | `addressReference` | `center.address_reference` (nullable) | ⬜ | trim, ≤160 chars | "Punto de referencia cercano" |
| Horario de atención | `regularScheduleText` | `center.regular_schedule_text` (nullable) | ⬜ | trim, ≤120 chars | "Ej: Lun a Vie, 8am–4pm" |
| Teléfono (WhatsApp) | `whatsappPhone` | `center.whatsapp_phone` (NOT NULL) | ✅ | E.164 normalize (§4.3) | "+58" prefix box + "412 000 0000" · error "Ingresa un número de teléfono válido." |
| Nombre y apellido (responsable) | `responsibleName` | `app_user.name` (nullable) | ✅ *(at app layer)* | trim, 2–80 chars | "Quién coordina las donaciones" |

`center_type` enum → Spanish labels for the select:
`hospital → "Hospital"`, `clinic → "Clínica"`, `elder_care_home → "Hogar de cuidado de adultos mayores"`, `childrens_shelter → "Casa hogar de niños"`, `collection_center → "Centro de acopio"`.

`Estado` options: the 24 VE federal entities (`Distrito Capital`, `Miranda`, `Zulia`, … matching `src/db/seed.ts` strings). Define once as a `VE_STATES` const (e.g. `src/lib/geo/ve-states.ts`) so client select + server validation share the list. Store the literal Spanish string (schema `state` is free `text`).

### 4.2 Intentional deltas vs Figma `8:493`
- **Add `Tipo de centro`** select (Figma omits it; schema + task require `center.type`). Place it directly under "Nombre del centro".
- **Split "Ciudad y dirección"** into `Ciudad` + `Dirección` (schema has separate `city` NOT NULL + `address_line`). Keep Figma's hint "Dónde se recibirán las donaciones" on `Dirección`.
- **Add `Horario de atención`** (optional) — schema `regular_schedule_text`, task field.
- **Drop "Cargo"** — there is **no schema column** for a responsable title and it is not in the task field list. Do **not** persist it. (If product later wants it, that's an additive nullable column in a future phase, not now.)

### 4.3 Phone normalization (consistent with `login-form.tsx`)
- UI: fixed `+58` prefix box + national-number input (same component pattern as login). `inputMode="numeric"`, `autoComplete="tel-national"`.
- Normalize: strip non-digits; drop a single leading `0` if present (Venezuelan `0412…` → `412…`); require exactly **10** national digits → `phoneE164 = "+58" + national`.
- Validation message (es): "Ingresa un número de teléfono válido." (Figma's "11 dígitos" copy refers to the `0XXXXXXXXXX` form; our canonical form is `+58` + 10 digits — keep the generic message to avoid confusing the prefix UI.)
- **This phone is the OTP target AND `center.whatsapp_phone`.** Persist with the leading `+` (`+58…`), matching `on-login.ts`'s convention and `center.whatsapp_phone` elsewhere.

---

## 5. Schema / migration — none required

All nine fields map to existing columns (verified against `src/db/schema.ts`):
`center.{name,type,city,state,address_line,address_reference,regular_schedule_text,whatsapp_phone,status}` and `app_user.name`. **No migration is added in this phase.**

Optional hardening (NOT required for acceptance; only if we want DB-level idempotency in addition to the §7.2 pre-check): an **additive** unique index on `membership.user_id` (one membership per user in v1). If adopted, generate via `drizzle-kit` as `0002_*` and have `createCenterForCurrentUser` catch the unique-violation → resolve + redirect. Default recommendation: **skip it**; the application-level pre-check in a transaction is sufficient for v1 and avoids a stacked migration.

---

## 6. OTP step — reuse / extract (do NOT reinvent)

Phase 1's `login-form.tsx` already contains a fully working OTP step (two-step phone→6-box, `+58`, swappable `channel`, resend countdown, Spanish errors). **Extract its OTP-entry sub-step into a shared client component** and have both login and registro consume it.

### 6.1 New component — `src/app/(center)/_components/otp-step.tsx` (`"use client"`)
Extract verbatim from `login-form.tsx` lines ~232–317 (the `step === "otp"` render) + the verify/resend/digit handlers (`onVerify`, `sendCode`, `onDigitChange`, `onDigitKeyDown`, `onOtpPaste`, `maskPhone`, `formatCountdown`, `ChatIcon`). Props contract:

```ts
type OtpStepProps = {
  phoneE164: string;            // full +58… number to verify
  nationalNumber: string;      // for masking display
  channel: "sms" | "whatsapp"; // swappable transport
  onChangeNumber: () => void;  // "Cambiar número" → caller decides (login: back to phone step; registro: back to datos)
  onVerified: () => void | Promise<void>; // success handoff (login: finishLogin; registro: submit createCenter)
  stepLabel?: string;          // e.g. "2 de 3" (registro) — omitted for login
};
```
- Internally owns: `digits`, `loading`, `error`, `resendIn`, attempt counter (§6.3). Calls `supabase.auth.verifyOtp({ phone: phoneE164, token, type: "sms" })` (type stays `"sms"` regardless of `channel`, per Phase 1). On success → `await onVerified()`.
- **It does NOT call `signInWithOtp` on mount** — the caller sends the first code (so the caller controls when the code is sent and can show the countdown). Provide a `resend()` that calls `signInWithOtp({ phone, options:{channel} })` for the in-step "Reenviar".

### 6.2 Refactor `login-form.tsx` to consume `<OtpStep>`
- Keep the `phone` step in `login-form.tsx`. When the phone is submitted and `sendCode()` succeeds, render `<OtpStep phoneE164 nationalNumber channel onChangeNumber={()=>setStep("phone")} onVerified={finishLogin} />`.
- **This is a small, contained refactor** — verify login still works (acceptance). Do not change `finishLogin` or any auth action.

### 6.3 Error states + attempt counter
- `verifyOtp` invalid → catch error; show "Código incorrecto. Te quedan {n} intentos." Maintain a **client** attempt budget (start `3`, decrement per failed verify) purely to render Figma's `8:623` copy. The **authoritative** lockout is Supabase's `429` (rate limit).
- On `429` **or** local budget reaching `0` → render the **Intentos agotados** state (`29:1998`): disabled resend, a `mm:ss` cooldown countdown (reuse `formatCountdown`; seed from a fixed local cooldown e.g. 15:00 for display — Supabase enforces the real window), and "Verificar con otro número" → `onChangeNumber()`.
- `signInWithOtp` failures map exactly as Phase 1: `429` → "Demasiados intentos. Inténtalo de nuevo en un momento."; else generic send error. Never leak provider messages.

---

## 7. Server write — `createCenterForCurrentUser`

New server action. **Single source of truth for the write; fully re-validates input and is idempotent.**

### 7.1 Location & signature
`src/app/(center)/actions/registro.ts` (`"use server"`):

```ts
"use server";
export type CreateCenterInput = {
  name: string; type: CenterType; state: string; city: string;
  addressLine: string; addressReference?: string;
  regularScheduleText?: string; whatsappPhone: string; // +58… E.164
  responsibleName: string;
};
export async function createCenterForCurrentUser(input: CreateCenterInput): Promise<void>;
```
It ends in `redirect(...)` (so the function does not return on the happy path). Mark the module `import "server-only"` is implied by `"use server"`; do not import the service-role key.

### 7.2 Algorithm (order matters)
1. **Resolve session** — `const supabase = await createClient(); const { data:{ user } } = await supabase.auth.getUser();`. If `!user` → `redirect("/centro/login")` (defensive; should not happen post-verify). **`cookies()` is async** inside the Supabase server client — Phase 1 already awaits it.
2. **Idempotency pre-check** — `const current = await getCurrentCenter();`
   - `current.kind === "center"` → user already has a membership → **do NOT create a duplicate** → `redirect(ROUTE_BY_STATUS[current.center.status])` (reuse the map from `on-login.ts`; export it or re-derive — prefer exporting `ROUTE_BY_STATUS` from `on-login.ts`).
   - else continue (anon was redirected in step 1; remaining case is `no-membership`).
3. **Re-validate** the full payload server-side with the **same** validators used client-side (§8). On failure → throw (the client already validated; a server failure here means tampering) — surface a generic error. Re-derive `whatsappPhone` normalization server-side; do not trust client formatting.
4. **Transaction** (`await db.transaction(async (tx) => { … })`):
   - **Upsert `app_user`**: `tx.insert(appUser).values({ id: user.id, phone: user.phone ? "+"+user.phone : input.whatsappPhone, name: input.responsibleName, phoneVerifiedAt: now, lastLoginAt: now }).onConflictDoUpdate({ target: appUser.id, set: { name: input.responsibleName, phone: ..., phoneVerifiedAt: now, updatedAt: now } })`. (The login path may have already inserted this row; we add the `name`.)
   - **Insert `center`**: all descriptive fields + `status: "pending_review"` (the schema default, set explicitly). Capture `centerId = inserted.id` via `.returning({ id: center.id })`.
   - **Insert `membership`**: `{ userId: user.id, centerId, role: "center_admin" }`.
5. **Redirect** → `redirect("/centro/en-revision")`. (`redirect` throws; place it **outside** the `tx` callback so the transaction commits first.)

### 7.3 Idempotency & races
- Primary guard = step 2 pre-check. For a fast double-submit before the first TX commits, step 2 may not yet see the membership; the optional unique index (§5) would turn the second insert into a catchable error. v1 default: accept the tiny race window (the wizard disables the Verificar button while submitting; `onVerified` runs once). If the optional index is adopted, wrap the membership insert and on unique violation → re-resolve + redirect.

### 7.4 Cookie propagation
The OTP `verifyOtp` (browser client) already set the session cookie before the action runs. The server action's `redirect` is a normal Next redirect; refreshed auth cookies are carried by the Phase 1 middleware/SSR-client pattern on the subsequent navigation to `/centro/en-revision` (which runs `requireCenter`). No special cookie copying is needed inside the action itself (that pattern applies to **middleware** redirects — keep `src/middleware.ts` as-is, do not rename to `proxy`).

---

## 8. Validation — shared, manual (no zod)

No validation library is in the project (`package.json` has no zod). **Do not add one** — write a small shared validator usable from both the client wizard and the server action.

`src/lib/registro/validation.ts`:
```ts
export type FieldErrors = Partial<Record<keyof CreateCenterInput, string>>;
export function validateRegistro(input: Partial<CreateCenterInput>): FieldErrors; // empty = valid
export function normalizeVePhone(raw: string): string | null; // → "+58XXXXXXXXXX" or null
export const VE_STATES: readonly string[];
export const CENTER_TYPE_OPTIONS: { value: CenterType; label: string }[];
```
- Pure functions, no `server-only`/`use client` (shared). Messages are the Spanish copy in §4.1.
- Client: run `validateRegistro` on **Continuar**; if non-empty, render the "Datos con errores" banner (count = `Object.keys(errors).length`) + per-field messages; block advancing to OTP.
- Server: `createCenterForCurrentUser` runs the **same** `validateRegistro` before the TX (defense-in-depth).

> **CI gotcha**: do **not** call `setState` synchronously inside a `useEffect` body (ESLint `react-hooks/set-state-in-effect` is a hard error). The wizard's validation runs in event handlers (onSubmit/onContinue), not effects. The only effect is the resend countdown `setInterval` (already safe in Phase 1's pattern). If any derived state must sync in an effect, defer via `requestAnimationFrame`.

---

## 9. Wizard structure — single client component (decision)

**Decision: one client wizard component holds all state across steps.** Routed sub-steps (`/registro/datos`, `/registro/verificar`) are **rejected** because the OTP `verifyOtp` changes the session and any route transition / RSC re-render risks losing the in-memory form payload that must be submitted *after* verify. Keeping the whole flow in one client component guarantees the form data survives the OTP step.

### 9.1 Files
- `src/app/(center)/centro/registro/page.tsx` — **RSC** (replaces the placeholder). Resolves `getCurrentCenter()` and chooses the mode (§9.3), then renders `<RegistroWizard mode=… defaultPhone=… />`. Stays **public** (it's in `PUBLIC_CENTER_PATHS`; do not change middleware).
- `src/app/(center)/centro/registro/registro-wizard.tsx` — **`"use client"`** wizard. Internal `step: "intro" | "datos" | "otp"` state + `RegistroFormData` state. Renders R0, Datos (with `<DatosForm>` inline or a child), and `<OtpStep>` (§6).
- `src/app/(center)/centro/registro/datos-form.tsx` *(optional split)* — the Datos fields + client validation, or keep inline in the wizard.
- `src/app/(center)/actions/registro.ts` — `createCenterForCurrentUser` (§7).
- `src/lib/registro/validation.ts` — shared validators (§8).
- `src/lib/geo/ve-states.ts` *(or co-located in validation.ts)* — `VE_STATES`.
- `src/app/(center)/_components/otp-step.tsx` — extracted OTP step (§6).

### 9.2 How data survives the OTP step (the key design point)
1. User fills **Datos** → on **Continuar**, validate; on success store `RegistroFormData` in wizard state and call `signInWithOtp({ phone: data.whatsappPhone E.164, options:{ channel } })`, then set `step="otp"`.
2. `<OtpStep>` verifies → `onVerified` = an async closure that calls `createCenterForCurrentUser(currentFormData)` with the **wizard-held** payload. The browser now has a session; the payload was never lost because it lived in React state the whole time.
3. The server action does the write + redirect. The client never computes the destination.

### 9.3 Modes (handles the already-authed `no-membership` user)
`resolveLoginDestination` sends a verified user with no membership to `/centro/registro`. That user already has a session — they must NOT be asked to OTP again. The RSC page picks a mode:
- `getCurrentCenter().kind === "center"` → **redirect** to `ROUTE_BY_STATUS[status]` (already registered; page-level idempotency mirror of §7.2).
- `kind === "no-membership"` → `mode="authed"`: wizard collects Datos, **prefills `whatsappPhone` from the verified session phone and locks it** (we can't re-verify a different number without OTP), and on **Continuar** skips `otp`, calling `createCenterForCurrentUser` directly.
- `kind === "anon"` → `mode="anon"`: full `intro → datos → otp → create`.

---

## 10. Dependencies
**None added.** Everything uses existing deps (`@supabase/ssr`, `@supabase/supabase-js`, `drizzle-orm`, `postgres`, `next`, `react`). No zod, no form library.

---

## 11. Security & correctness checklist
- **Authorization server-side only** — new `center.id` generated server-side; membership binds `session.user.id`. No client id trusted. Only the form *payload* crosses the boundary and is **re-validated** server-side.
- **`getUser()` not `getSession()`** in the action (JWT-verified) — reuse the Phase 1 server client.
- **Idempotent** — pre-check `getCurrentCenter()`; existing-membership users redirect to status, never duplicate. Transaction keeps `app_user`/`center`/`membership` consistent (all-or-nothing).
- **`pending_review` on create** — explicit; the moderation/approval path is a later phase.
- **`cookies()` awaited** (async) via the Phase 1 server client.
- **Middleware untouched** — keep `src/middleware.ts` (do not rename to proxy); `/centro/registro` stays public.
- **No `setState` in `useEffect` body** — validation in handlers only; countdown effect mirrors Phase 1.
- **`revalidateTag`** — not needed here (no cached center list to bust in this phase). If added later, use the repo's two-arg form `revalidateTag(tag, "max")`.
- **Service-role key never imported** into this path.
- **No provider message leaks** — generic Spanish OTP/send errors.

---

## 12. Acceptance criteria
1. `pnpm lint` ✅ and `npx tsc --noEmit` ✅ (CI gate). `pnpm build` ✅ green (run locally before PR).
2. `/centro/registro` renders **R0 "Comenzar registro"** (`29:2451`) at 390px, Spanish — replacing the Phase 1 placeholder.
3. **Comenzar → Datos** (`8:493`): the §4.1 fields render under "Datos del centro" / "Persona responsable"; client validation produces the **"Datos con errores"** banner (`29:1935`) with per-field messages and blocks advancing.
4. Valid Datos → `signInWithOtp` → **Verificar teléfono** (`8:580`) using the **shared `<OtpStep>`**; wrong code → "Código incorrecto" (`8:623`); exhausted/429 → "Intentos agotados" (`29:1998`).
5. On verify success, `createCenterForCurrentUser(payload)` runs **with the form data preserved through the OTP step**, in a transaction: upsert `app_user{ id=uid, name, phone }`, insert `center{ …, status:"pending_review" }`, insert `membership{ role:"center_admin" }`.
6. **Idempotent**: a user who already has a membership is redirected to their status screen and **no duplicate** center/membership is created.
7. Post-write redirect lands on **`/centro/en-revision`** (`8:733`, Phase 1 page) and it renders for the new `pending_review` center.
8. **Login still works** after the `<OtpStep>` extraction (Phase 1 regression check).
9. **No schema migration** added; all fields map to existing columns.

---

## 13. Build order (suggested)
1. `src/lib/registro/validation.ts` + `VE_STATES` + `CENTER_TYPE_OPTIONS` (pure, testable first).
2. Extract `src/app/(center)/_components/otp-step.tsx` from `login-form.tsx`; refactor `login-form.tsx` to use it; **verify login** (regression).
3. `src/app/(center)/actions/registro.ts` — `createCenterForCurrentUser` (TX + idempotency). Export `ROUTE_BY_STATUS` from `on-login.ts` for reuse.
4. `registro-wizard.tsx` (`intro → datos → otp`) + Datos form/validation wiring + modes (§9.3).
5. Replace `registro/page.tsx` (RSC) — resolve `getCurrentCenter()`, pick mode, render wizard.
6. Manual pass: anon full path → en-revision; already-`no-membership` authed → skip OTP; already-`center` → redirect to status (idempotent); wrong-code / lockout copy. Then `pnpm lint && npx tsc --noEmit && pnpm build`.
7. PR into `feat/center-auth` (auto-retargets to `main` after Phase 1 merges).
