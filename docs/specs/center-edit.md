# Edit Center Data — Implementation Spec

> Status: ready to build · Branch: `feat/center-registro` (PR #5) · Phase 2
> Stack: Next.js 16 App Router · React 19 RSC · Tailwind v4 · Drizzle + Supabase · pnpm
> Locale: es-VE · Mobile-first 390px · single-accent design system

## 1. Goal

Let an authenticated center edit its own "Datos del centro + Persona responsable"
after registration, reusing the exact same form UI the registration wizard uses.
No new PR — work lands on `feat/center-registro` and updates PR #5.

Concretely:

1. Extract the registration "Datos" form (fields + validation UI + Estado/Tipo
   selects + locked phone field) into a **shared client component** consumed by
   both the registration wizard (create) and a new edit page (edit). Registration
   behavior is unchanged (datos → OTP for anon, datos → write for authed).
2. New route **`/centro/editar`** (RSC) that loads the current center's data,
   pre-fills the shared form (phone locked/verified, no OTP), CTA "Guardar
   cambios", and on submit calls `updateCenterForCurrentUser`.
3. New action **`updateCenterForCurrentUser`** — server-trust update of *only the
   session's center*, re-validated, transactional, status unchanged, phone fixed
   to the verified value.
4. Repoint the en-revisión "Editar datos del centro" button from
   `/centro/registro` → `/centro/editar`.

## 2. Non-goals / invariants

- **Phone is not editable.** It is the OTP-verified value (`app_user.phone` =
  `center.whatsapp_phone`). It is shown locked. The action ignores any
  client-supplied phone for binding (display hint only).
- **Editing never changes `status`.** No self-approve, no reset to
  `pending_review`. A `pending_review` center stays pending; an `approved` center
  stays approved.
- **No `verified_at` / `rejection_reason` changes** from this flow.
- **Authorization is server-side**, derived from `getCurrentCenter()` →
  membership → centerId. A client-supplied center id is never trusted. Drizzle
  bypasses RLS, so this is the only authz boundary.
- **No new validation rules.** Reuse `validateRegistro` / `normalizeVePhone`
  verbatim. Never re-derive phone formats ad hoc.
- **`"use server"` modules export ONLY async functions.** Import types with
  `import type`. (We already hit the "X is not defined" runtime crash from a type
  re-export — see commit `560c279`.)

## 3. Files touched

| Action | Path |
| --- | --- |
| **NEW** | `src/app/(center)/centro/_components/center-datos-form.tsx` (shared form) |
| **EDIT** | `src/app/(center)/centro/registro/registro-wizard.tsx` (consume shared form) |
| **NEW** | `src/app/(center)/centro/editar/page.tsx` (edit RSC) |
| **NEW** | `src/app/(center)/centro/editar/edit-center-form.tsx` (thin client wrapper, optional — see §6) |
| **NEW** | `src/app/(center)/actions/editar.ts` (`"use server"` — update action) |
| **EDIT** | `src/app/(center)/centro/en-revision/page.tsx` (repoint button) |

> Note: the shared component lives under `centro/_components/` (sibling to the
> existing `(center)/_components/` that holds `otp-step.tsx`). Either folder is
> fine; pick `centro/_components/` so it sits next to both consumers. Keep the
> import path consistent across both consumers.

## 4. Shared form refactor — `center-datos-form.tsx`

### 4.1 What moves

Extract from `registro-wizard.tsx` **only the "Datos" step markup and its field
primitives** — NOT the wizard's step machine, NOT the intro (R0) step, NOT the
OTP step, NOT the Supabase `signInWithOtp` call.

Move into the new module:

- The `FormData` type, `EMPTY` constant, `toInput(d: FormData): CreateCenterInput`.
- The presentational field components `TextField`, `SelectField`, `PhoneField`.
- The `Stepper` component **stays usable by the wizard** but is registration-
  specific (3-step "Paso N de 3"). The edit page has no stepper. So make the
  stepper a **slot** the parent passes in (`headerSlot?: ReactNode`), rather than
  baking it into the shared form. The "Datos con errores" alert block and the two
  `<h2>` section headers ("Datos del centro", "Persona responsable") move INTO
  the shared form (they are identical in both flows).
- The error-count alert block (`role="alert"` "Faltan N datos por corregir").
- The whole `<form>` body from `<h2>Datos del centro` through the responsible
  name field + the submit button row.

### 4.2 Shared component contract

```tsx
// center-datos-form.tsx  — "use client"
import type { CreateCenterInput, FieldErrors } from "@/lib/registro/validation";

export type CenterDatosValues = {
  name: string;
  type: CenterType | "";
  state: string;
  city: string;
  addressLine: string;
  addressReference: string;
  regularScheduleText: string;
  nationalPhone: string;       // national digits ONLY (no +58); "" when unknown
  responsibleName: string;
};

export const EMPTY_DATOS: CenterDatosValues = { /* all "" */ };

export function CenterDatosForm(props: {
  /** Pre-filled values. Registration anon passes EMPTY_DATOS; authed/edit
   *  pass real values. */
  initialValues: CenterDatosValues;
  /** "create" keeps phone editable for anon; "edit" (and authed create) lock
   *  the phone. Drives nothing else — labels come from submitLabel. */
  phoneLocked: boolean;
  /** Button label: "Continuar" (create) | "Guardar cambios" (edit). */
  submitLabel: string;
  submitPendingLabel: string;  // "Enviando…" | "Guardando…"
  /** Called with validated CreateCenterInput AFTER local validation passes,
   *  plus the raw `CenterDatosValues` that produced it (so a parent can hoist
   *  the last-entered values into its own state and feed them back as
   *  `initialValues` later — e.g. the wizard repopulating the datos step after
   *  returning from OTP). Returns a promise; the form shows the pending label
   *  while it resolves. May redirect (server action) — in that case it never
   *  resolves. */
  onSubmit: (input: CreateCenterInput, values: CenterDatosValues) => Promise<void>;
  /** Optional header above the form (registration passes its <Stepper/>). */
  headerSlot?: ReactNode;
  /** Optional inline error under the submit button (e.g. OTP send failure,
   *  save failure). Parent-owned. */
  footerError?: string | null;
  /** Optional extra footer copy above the button (registration's
   *  "Paso 1 de 3 · Tus datos están protegidos"). */
  footerNote?: ReactNode;
}): ReactElement;
```

Internal behavior (moved verbatim from the wizard):

- Holds its own `useState<CenterDatosValues>(initialValues)` and
  `useState<FieldErrors>({})`, a `set(key)` change handler, and a `pending`
  boolean for the button.
- On submit: `preventDefault`, run `validateRegistro(toInput(values))`; if errors,
  `setErrors(found)` + `window.scrollTo({ top: 0 })` and stop. Else `setErrors({})`,
  set pending, `await props.onSubmit(toInput(values), values)`. (Mirror the existing
  `onContinue` logic exactly, minus the channel/OTP branch which now lives in the
  parent's `onSubmit`.) Pass `values` (the raw `CenterDatosValues`) alongside the
  mapped input so the parent can stash it for re-prefill.
- **State ownership caveat:** `initialValues` only seeds the internal `useState`
  on mount. The shared form unmounts whenever a parent early-returns (e.g. the
  wizard rendering the OTP step instead of the datos step), so on remount it
  re-seeds from whatever `initialValues` the parent passes *then*. A parent that
  wants entered data to survive a remount MUST keep those values in its own state
  and pass them back as `initialValues` — the shared form does not persist across
  unmount by itself.
- `PhoneField` gets `locked={props.phoneLocked}` and shows "Verificado en tu
  sesión." helper when locked (unchanged).
- Keep `toInput` mapping: `whatsappPhone: normalizeVePhone(d.nationalPhone) ?? d.nationalPhone`.

> The shared form owns local validation + field state + the error alert. The
> PARENT owns: what happens on a valid submit (`onSubmit`), the step/stepper
> chrome (`headerSlot`), and any cross-cutting send/save error (`footerError`).
> This keeps registration's OTP send out of the shared component.

### 4.3 Registration wizard after refactor

`registro-wizard.tsx` keeps its `Step` machine (`intro | datos | otp`), `mode`,
`channel`, OTP send, and `submitWrite`. Because the shared form unmounts while the
OTP step is on screen, the wizard MUST own the datos values so the `datos →
otp → datos` path (OTP "Cambiar número" / back) repopulates the form instead of
resetting to `EMPTY_DATOS`. Hold them in wizard state:

```tsx
// wizard state — seeds the datos step and survives the OTP round-trip
const [datosValues, setDatosValues] = useState<CenterDatosValues>({
  ...EMPTY_DATOS,
  nationalPhone: lockedNational,        // "" for anon; verified national for authed
});
const [lastInput, setLastInput] = useState<CreateCenterInput | null>(null);
```

The `datos` step's `return` becomes:

```tsx
<>
  <AppBar title="Registrar centro" … />
  <CenterDatosForm
    initialValues={datosValues}          // last-entered values, NOT a fresh EMPTY_DATOS
    phoneLocked={mode === "authed"}
    submitLabel="Continuar"
    submitPendingLabel="Enviando…"
    headerSlot={<Stepper current={1} label="Datos del centro" />}
    footerNote="Paso 1 de 3 · Tus datos están protegidos"
    footerError={sendError}
    onSubmit={async (input, values) => {
      // Hoist the just-validated values so a return from OTP re-prefills the form.
      setDatosValues(values);
      setLastInput(input);
      if (mode === "authed") {
        await createCenterForCurrentUser(input);   // redirects
        return;
      }
      // anon: send first OTP, then advance to otp step
      const phoneE164 = input.whatsappPhone;         // already E.164 from toInput
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164, options: { channel } });
      if (error) { setSendError(…); throw new Error("otp-send-failed"); } // keep form on screen
      setStep("otp");
    }}
  />
</>
```

Notes for the wizard:
- **Preserve entered datos across `datos → otp → datos`.** The shared form owns its
  field state and unmounts during the OTP early-return, so `initialValues` MUST be
  the wizard-held `datosValues` (the last-submitted values), never a freshly built
  `{ ...EMPTY_DATOS, nationalPhone }`. On every valid submit, `onSubmit` writes
  `setDatosValues(values)`; when the user taps OTP "Cambiar número" / back and the
  wizard re-renders the datos step, the shared form remounts seeded from those
  values and every entered field is restored. This matches the old wizard-level
  `data` state and is a hard requirement (no regression to a blank form).
  - Reaching the OTP step is only possible after a valid submit, so the
    last-submitted `datosValues` is exactly what needs restoring; live keystroke
    syncing is unnecessary. (If live preservation is ever wanted, add an optional
    `onValuesChange` to the shared form — not required here.)
- The wizard still needs `phoneE164` + `nationalNumber` for the `OtpStep`. Read
  them from `lastInput.whatsappPhone` (set inside `onSubmit`); do not re-derive.
- `submitWrite` (called by `OtpStep.onVerified`) still calls
  `createCenterForCurrentUser(lastInput)`.
- If OTP send fails, `onSubmit` must NOT advance; throwing keeps the shared form
  mounted and `footerError` renders the message. (The shared form should clear
  `pending` in a `finally`, so a thrown error re-enables the button.)
- The intro (R0) step and all the `Benefit`/icon components stay in the wizard
  file unchanged.

**Acceptance for the refactor:** registration (anon: intro→datos→otp→create;
authed: datos→create) behaves byte-for-byte as before. No visual diff on the
datos step.

## 5. Edit action — `actions/editar.ts`

```ts
"use server";
// ONLY async exports. import type for CreateCenterInput.
import type { CreateCenterInput } from "@/lib/registro/validation";

export async function updateCenterForCurrentUser(
  input: CreateCenterInput,
): Promise<void>
```

Behavior (mirror `createCenterForCurrentUser`'s server-trust + transaction
pattern in `actions/registro.ts`):

1. **Resolve session/authz via `getCurrentCenter()`.**
   - `kind === "anon"` → `redirect("/centro/login")`.
   - `kind === "no-membership"` → `redirect("/centro/registro")`.
   - `kind === "center"` → capture `current.center.centerId`,
     `current.center.userId`, `current.center.status`.
2. **Re-validate** `validateRegistro(input)`; if any errors →
   `throw new Error("Datos del centro inválidos.")`. (Defense-in-depth; tampering.)
3. **Phone is server-trusted, not client-trusted.** Resolve the verified phone
   from the session: `getUser()` → `normalizeVePhone(user.phone)`. If absent →
   `redirect("/centro/login")`. Do NOT write the client phone. The edit form locks
   the phone so a matching submission is expected, but the action simply persists
   the verified value and ignores `input.whatsappPhone` for binding. (Optionally
   assert equality and throw on mismatch, identical to create — recommended for
   symmetry, but the safe default is "ignore client phone, write verified".)
4. **Transaction** (`db.transaction`):
   - `UPDATE center SET name, type, city, state, addressLine, addressReference,
     regularScheduleText, whatsappPhone = verifiedPhone, updatedAt = now
     WHERE center.id = current.centerId`.
     - **Never** update `status`, `verifiedAt`, `rejectionReason`, `createdAt`.
     - Trim strings; `addressReference`/`regularScheduleText` → `null` when empty
       (mirror create).
   - `UPDATE app_user SET name = input.responsibleName.trim(), updatedAt = now
     WHERE app_user.id = current.userId`. (Phone unchanged here.)
   - Both keyed by server-resolved ids — never client ids.
5. **Redirect after commit** to the status route:
   `redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision")`.
   - `pending_review` → `/centro/en-revision`
   - `approved` → `/centro`
   - `rejected`/`suspended` → `/centro/rechazado`
   - This guarantees status-appropriate landing without hardcoding en-revisión.
6. No idempotency/unique-violation race here (no inserts), so the `isUniqueViolation`
   handler is unnecessary; a straightforward try-less transaction + redirect is
   fine. Let unexpected DB errors propagate.

> Why `app_user.name` and not a center field: "Persona responsable · Nombre y
> apellido" maps to `app_user.name` (create writes it there). Edit must update the
> same column so the round-trip is consistent.

## 6. Edit route — `/centro/editar`

`src/app/(center)/centro/editar/page.tsx` (RSC):

1. `const session = await getCurrentCenter();`
   - `anon` → `redirect("/centro/login")`.
   - `no-membership` → `redirect("/centro/registro")`.
   - `center` → continue with `session.center`.
2. **Load existing data** with Drizzle, scoped to `session.center.centerId`:
   - `center` row: `name, type, city, state, addressLine, addressReference,
     regularScheduleText, whatsappPhone, status`.
   - responsable name: `app_user.name WHERE app_user.id = session.center.userId`.
     (Can be a single joined select or two selects.)
3. **Map to `CenterDatosValues`**:
   - `nationalPhone`: derive national digits from the verified E.164 the same way
     the wizard does — `whatsappPhone.replace(/\D/g,"").replace(/^58/,"")`. Prefer
     deriving from `session.center.phone` (the verified `app_user.phone`) to stay
     aligned with the locked/verified semantics; `center.whatsapp_phone` is the
     same value. Use one source consistently.
   - `type`: cast the pg enum string to `CenterType` (values match
     `CENTER_TYPE_OPTIONS`).
   - empty/null DB values → `""`.
4. **Render**: `AppBar title="Editar datos del centro" backHref={statusRoute}`
   (back to the status page), then a thin client wrapper that renders
   `CenterDatosForm`:

```tsx
// edit-center-form.tsx — "use client"

// Local, dependency-free redirect detection. NEXT_REDIRECT is the digest Next
// stamps on the error thrown by redirect(); never import isRedirectError from
// next/dist/client/components/redirect (unstable internal path that moves across
// Next 16 minors).
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

<CenterDatosForm
  initialValues={initialValues}
  phoneLocked
  submitLabel="Guardar cambios"
  submitPendingLabel="Guardando…"
  headerSlot={null}                     // no stepper in edit
  footerError={error}                   // local useState for save failure
  onSubmit={async (input) => {
    try {
      await updateCenterForCurrentUser(input);  // ALWAYS ends in redirect() → throws
    } catch (e) {
      // MANDATORY: a successful save still throws NEXT_REDIRECT. Re-throw it
      // BEFORE setError so Next can perform the navigation; otherwise every
      // successful save is swallowed and shows a false "No pudimos guardar".
      if (isNextRedirectError(e)) throw e;
      setError("No pudimos guardar los cambios. Inténtalo de nuevo.");
      throw e;                          // re-enable button via form's finally
    }
  }}
/>
```

   - The thin wrapper exists because `onSubmit` needs client state for the save
     error and the page is an RSC. Pass `initialValues` + the action down as
     props/imports.
   - **`updateCenterForCurrentUser` always terminates in `redirect()`**, which
     throws an error carrying `digest === "NEXT_REDIRECT"` (the value actually
     starts with `"NEXT_REDIRECT"` and encodes the target). There is no "success
     return" path. Therefore, **if `onSubmit` wraps the call in try/catch, it MUST
     re-throw redirect errors before calling `setError`** — detect them with the
     local `isNextRedirectError` helper above (`e?.digest === "NEXT_REDIRECT"` /
     `startsWith("NEXT_REDIRECT")`). Skipping the re-throw turns every successful
     save into a false `"No pudimos guardar"` error and the navigation never
     happens.
   - **Do NOT** `import { isRedirectError } from "next/dist/client/components/redirect"`.
     That deep internal path is unstable across Next 16 minor releases and has
     broken builds on upgrade. Use the inline digest check, which depends only on
     the public NEXT_REDIRECT contract.
   - Equivalent valid alternative: **omit the try/catch entirely.** Then the
     redirect error propagates untouched and the form unmounts on success; the
     only cost is that the rare non-redirect throw (validation tamper) surfaces as
     an unhandled rejection instead of `footerError`. Either pattern is acceptable
     — what is NOT acceptable is a try/catch that calls `setError` without first
     re-throwing on `NEXT_REDIRECT`.
5. No OTP step, no Supabase calls on this route.

### Phone-source consistency note

The wizard's authed prefill uses `defaultPhone.replace(/\D/g,"").replace(/^58/,"")`.
Reuse that exact derivation in the edit page so the locked field shows identical
national digits. Do not invent a new transform; if a helper is warranted, factor
`vePhoneToNational(e164)` into `@/lib/registro/validation` (isomorphic, function
export OK there — it's not a `"use server"` module).

## 7. Wire en-revisión button

In `src/app/(center)/centro/en-revision/page.tsx`, change the "Editar datos del
centro" `Button href` from `/centro/registro` to `/centro/editar`.

```diff
- <Button href="/centro/registro" variant="ghost" …>
+ <Button href="/centro/editar" variant="ghost" …>
    Editar datos del centro
  </Button>
```

(That's the only wiring change. Other status screens that gain an edit entry
point later can reuse `/centro/editar`.)

## 8. Middleware / routing

`/centro/editar` is an **authed** route — it must NOT be in `PUBLIC_CENTER_PATHS`.
Confirm `src/middleware.ts` leaves it gated (anon → login) like other
`/centro/*` authed pages. The page also self-guards via `getCurrentCenter()`
(defense-in-depth), so even if middleware config drifts, anon/no-membership are
redirected.

## 9. Critical-learnings checklist (must respect)

- [ ] `actions/editar.ts` has `"use server"` and exports ONLY async functions.
      `CreateCenterInput` imported via `import type`.
- [ ] `cookies()`/`getUser()` awaited (server client already awaits cookies).
- [ ] No `react-hooks/set-state-in-effect` — all `setState` is in event handlers,
      never in `useEffect`. (The shared form sets state only in submit/change
      handlers.)
- [ ] `normalizeVePhone` reused on both sides; no ad-hoc phone parsing except the
      shared `vePhoneToNational` display helper (if added).
- [ ] `src/middleware.ts` kept; `/centro/editar` not made public.
- [ ] Wizard owns `datosValues` state and passes it as the datos-step
      `initialValues`; `onSubmit` calls `setDatosValues(values)`. No
      `{ ...EMPTY_DATOS }` rebuild on the datos step after first submit.
- [ ] `edit-center-form.tsx` does NOT import `isRedirectError` from
      `next/dist/client/components/redirect` (or any `next/dist/**` internal). Any
      `onSubmit` try/catch re-throws on `digest` starting with `"NEXT_REDIRECT"`
      before `setError`.

## 10. Acceptance criteria

**Build/CI green**
- [ ] `pnpm lint` passes (no `set-state-in-effect`, no unused, no react-hooks errors).
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm build` succeeds.

**Action-invocation guard (Verify phase)** — build + curl-GET does NOT catch
errors that only fire when a server action runs (we hit this). Add a guard that
actually invokes the module surface:
- [ ] Importing `@/app/(center)/actions/editar` does not throw at module load
      (no non-function export). E.g. a node/tsx smoke that `import`s the module
      and asserts `typeof updateCenterForCurrentUser === "function"`, plus a guard
      that invoking it with no session redirects (does not crash with
      "X is not defined").

**Functional**
- [ ] `/centro/editar` as a `pending_review` center pre-fills every field with the
      stored values; phone shows locked "+58 …" with "Verificado en tu sesión."
- [ ] Editing a field + "Guardar cambios" persists the change to `center` (and
      `responsibleName` to `app_user.name`), then redirects to
      `/centro/en-revision`. A successful save NEVER shows "No pudimos guardar"
      (the NEXT_REDIRECT is re-thrown, not swallowed).
- [ ] After save, `center.status` is UNCHANGED (still `pending_review`);
      `whatsapp_phone` unchanged (still the verified value); `updated_at` bumped.
- [ ] An `approved` center editing lands back on `/centro`; status stays `approved`.
- [ ] Anon hitting `/centro/editar` → `/centro/login`; no-membership → `/centro/registro`.
- [ ] en-revisión "Editar datos del centro" navigates to `/centro/editar`.

**No regression**
- [ ] Registration anon: intro → datos → OTP → create still works end-to-end.
- [ ] Registration authed (no-membership): datos → create (no OTP) still works.
- [ ] The datos step renders with no visual change (shared form).
- [ ] **Datos survive the OTP round-trip:** fill datos → Continuar → on the OTP
      step tap "Cambiar número" / back → every datos field is still populated with
      what was entered (not reset to blank). Matches the old wizard-level `data`
      state.

## 11. Final phase

Commit + push to `feat/center-registro` (updates PR #5). Do NOT open a new PR.
Commit message ends with the required `Claude-Session:` trailer.
