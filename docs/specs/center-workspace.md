# Center Workspace (Phase 3) — scope

> **Status**: scoped — all decisions resolved (2026-06-29 review). One minor sub-question: keep or drop `general` as a 7th catch-all category (§5.6). Ready to slice.
> The center back office can register/login/edit but cannot yet *publish or manage requests*. This is the heart of the product: without it the donor surface has nothing real to show. Schema is already in place; this phase is UI + server actions + queries + one migration.

## 1. Goal & boundaries

Approved centers can **publish** solicitudes and **manage** them through their lifecycle, and donors see those requests on the (already-built, cached) public surface.

**In scope** (all designed, 390px mobile, Figma `Back Office` page):

| # | Screen | Figma |
|---|---|---|
| Dashboard | `4 · Dashboard del centro` + `4b · vacío` + `4c · menú abierto` | `32:4898` / `32:4873` / `66:2365` |
| Create | `5 · Crear solicitud` | `32:4929` |
| Insumo selector | `6 · Selector de insumos` (bottom-sheet) | `32:5006` |
| Published | `7 · Solicitud publicada` | `32:5064` |
| Request detail (center) | `Detalle · Solicitud (Centro)` + `Confirm Finalizar` | `29:3527` / `77:1525` |
| Center profile | `Perfil del centro · Activo / Pausado` + `Modal · Desactivar recepción` | `57:1886` / `57:2009` / `60:2102` |
| Overflow menu | `Menu · Overflow` | `66:2278` |

**Out of scope** (explicitly deferred):
- **Offline / PWA** — the `· Offline` and `· Reconectado` frames are **Phase 4**. We rely on the data-model sync columns (`idempotency_key`, `updated_at`) but build no client cache / draft-with-confirm here.
- **Surplus** — *redesigned, deferred* (decision §5.4). Surplus will **not** be a separate solicitud (the current `5 · Crear solicitud` framing is rejected). It becomes a center-level "no enviar más de X" surfaced as **a banner on a future center page** and **a mini-banner on each of that center's solicitudes**. This needs its own design pass + mini-spec, so it's out of Phase 3 as scoped here; the `kind = surplus` enum value stays dormant. The Phase 3 create flow is **need-only**.
- **Admin A5** (centers directory / suspend UI) — separate, never designed.

## 2. Data-model readiness

The schema already models everything Phase 3 writes. Confirmed against `src/db/schema.ts`:

- `request`: `kind` (need/surplus), `status` (draft/active/paused/closed/expired), `title` (≤40), `deliveryInstructions` (≤120), `windowHours`, `publishedAt`/`expiresAt`/`closedAt`/`closedReason`, denormalized `city` + `categories[]`, `shareCount`, `idempotencyKey`.
- `request_item`: `supplyId` (catalog) **or** `customName` (free text), `category`, `isFulfilled`.
- `supply`: catalog with `category` + `isActive`. Seed has 6.
- Cron `expireDueRequests()` already flips lapsed active/paused → expired and revalidates tags.

**Schema changes** (migration `0004`) — three parts:

**(a) `supply_category` → 6 area values** (decision §5.6): area = category, 1:1. **Only ADD the 4 new values** (`emergency`, `pharmacy`, `inpatient`, `geriatrics`) alongside the existing `surgical`/`pediatrics` via `ALTER TYPE … ADD VALUE`. **Do NOT drop `general`** — removing an enum value forces a full type recreation (USING-cast every dependent column, drop/recreate) for zero benefit; instead **retire it as a dormant value** (the §8 seed retags every supply off `general`, so nothing uses it). `ADD VALUE` is transaction-safe on PG12+ *as long as the new value isn't used in the same migration* — and it isn't (seed runs separately), so the generated SQL should be clean; still **review it**. Donor list/detail + landing-stats read `categories[]` generically; the donor **chip set** widens to 6 (+ dormant `general`).

**(b) center-level reception switch.** The `Perfil · Pausado` frame shows a **"Recepción de donaciones"** toggle whose OFF state "cierra las solicitudes activas" and hides the center from the public list. No such column exists today. Proposed:

```
center.reception_paused_at  timestamp with time zone  null   -- null = receiving
```

(A timestamp, not a bool, so "Pausada · desde hace 12 min" renders for free.) Donor list/detail queries must exclude requests whose center is paused — though if pausing also closes active requests, the existing `status = active` filter already covers the live surge; the flag mainly gates re-publishing and the public directory.

**(c) `request` human-friendly short id** (decision 2026-06-29). The card meta is "{área} · #{id}" and Figma shows global descending numbers (#1044, #1043, …). UUIDs aren't human-friendly, so add a monotonic display id:

```
request.short_id  bigint  generated always as identity   -- → "#1044"
```

Global sequence (not per-center), matching the Figma. Slice 1 (PR #14) ships the interim `#{id.slice(0,8)}`; **slice 2 adds the column and swaps `center-request-card.tsx` to render `request.short_id`**. Backfill is automatic (identity assigns to existing rows on add? no — `ADD COLUMN … GENERATED ALWAYS AS IDENTITY` backfills existing rows with a sequence, so seeded requests get numbers too; verify the generated SQL).

## 3. Slices (suggested PR breakdown)

Each slice is an independently shippable PR with its own e2e.

### 3.1 — Dashboard (read-only) + queries
`/centro` becomes the real dashboard (`32:4898`): header with center name + `Verificado` chip, two stat tiles (**Solicitudes activas**, **Por vencer** = active expiring **< 6 h**, `EXPIRING_SOON_HOURS`, confirmed), **"Tus solicitudes"** list of the center's own requests (card shows title, area · #id, item chips + "+N más", relative published time / window, Compartir + countdown), sticky **"+ Crear solicitud"**. Empty state = `4b`.

> **Routing**: routes stay **Spanish** (e.g. create flow = `/centro/solicitudes/nueva`, detail = `/centro/solicitudes/[id]`), consistent with the existing `/centro`, `/solicitudes`, `/centro/registro` paths. The "identifiers English" rule covers code (tables/columns/vars); URL paths are user-facing and already circulate in Spanish (donor links `/solicitudes/[id]`).
- **Queries** (new, `center_id`-scoped, *not* the cached donor ones): `getCenterRequests(centerId)`, `getCenterDashboardStats(centerId)`.
- No writes. Lowest-risk first slice; unblocks visual review of everything else.

### 3.2 — Create solicitud + insumo selector + published
The core authoring flow (`5` → `6` → `7`):
- **Form** (`5`): título (≤40, counter), **Área del centro** chips (single-select), **Detalle de donación** (chips from selector), **Ventana de tiempo** 12/24/48 segmented, **Instrucciones de entrega** (≤120, counter). Primary **"Publicar solicitud"**.
- **Selector** (`6`, intercepted bottom-sheet like donor detail): search, **"Sugeridos · {área}"** from catalog, multi-check, **"Otro insumo (escríbelo)"** → `customName`, footer **"Agregar N insumos"**.
- **Publish action** (`"use server"`): insert `request` (status `active`, stamp `publishedAt`/`expiresAt = now + windowHours`, denormalize `city` from center + `categories[]` from items) + `request_item` rows, in one transaction, keyed by `idempotencyKey`. Then `revalidateTag("active-requests","max")`, `"landing-stats"`, and the center dashboard. Redirect to `7 · publicada` (share CTAs + "Ver en la lista").

### 3.3 — Request detail (center) + Finalizar + Extender
Center-side detail (`29:3527`) — distinct from the donor sheet:
- Countdown card with progress bar, **"+ Extender ventana"**, donation items, Dónde/Cuándo entregar, share row, sticky **"Finalizar solicitud"** (→ `closed` / `fulfilled`, confirm sheet `77:1525`).
- **Actions**: `finalizeRequest(id)` → status `closed`, `closedReason='fulfilled'`, `closedAt=now`; `extendWindow(id, hours)` → the **+12/+24/+48 picker** (Figma `Sheet · Extender ventana` `80:1873`) **adds** time: `expiresAt += chosen`, `windowHours += chosen` (anchors the progress-bar start at the original publish). Both `center_id`-guarded + revalidate (`active-requests`, `request:<id>`).

### 3.4 — Center profile + reception toggle
`Perfil del centro` (`57:1886`/`57:2009`): read-only center info (reuses `formatVePhone` + `cargo` we just shipped), links to edit + "Cambiar responsable", **Cerrar sesión**, lifetime stats (**Activas** + **Cumplidas** only — `Donantes` is being **removed per product** (decision §5.3), so the row drops from 3 stats to 2), and the **Recepción de donaciones** toggle. OFF (`Modal · Desactivar recepción` confirm) → set `reception_paused_at`, **close all active requests** with `closedReason='cancelled'` (decision §5.2), revalidate donor tags. ON → clear the flag.

## 4. Server actions & cache (summary)

New `"use server"` module(s) under `src/app/(center)/actions/` — remember gotcha #1 (async-only exports) and #2 (drive real submits in e2e):
`publishRequest`, `finalizeRequest`, `extendWindow`, `setReception`. All resolve `center_id` via `requireCenter()` and authorize every write by it (never trust client ids). Every mutation that touches a published request calls `revalidateTag(tag,"max")` for `active-requests`, `landing-stats`, and `request:<id>`.

## 5. Decisions

**Resolved (2026-06-29 review):**

1. **`paused` request status → unused.** Pause is modeled only as the *center-level* reception toggle (which closes, not pauses); per-request `paused` stays dormant in the enum.
2. **Reception-OFF closes active requests with `closedReason = 'cancelled'`.**
3. **`Donantes` profile stat removed** (product). Profile shows **Activas + Cumplidas** (the latter derived from `closed/fulfilled` count).
4. **Surplus redesigned & deferred** — not a separate solicitud. It becomes a center-level "no enviar más de X" shown as a banner on a future center page + a mini-banner on each of that center's solicitudes. Needs its own design + mini-spec; out of Phase 3 (see §1). Create flow is need-only.
5. **"Extender ventana" = the +12/+24/+48 picker that ADDS time** (Figma `80:1873` "Suma tiempo extra"): `expiresAt += chosen`, `windowHours += chosen`. *(Corrected from the earlier "reset from now" reading after the designer added the dedicated Extender sheet.)*
6. **Area = category, 1:1.** Expand `supply_category` from 3 → 6 values matching the areas, so area *is* the category (drives "Sugeridos · {área}", the denormalized `categories[]`, and donor chips):

   | Area | `supply_category` |
   |---|---|
   | Quirófano | `surgical` |
   | Emergencias | `emergency` |
   | Farmacia | `pharmacy` |
   | Hospitalización | `inpatient` |
   | Refugio infantil | `pediatrics` |
   | Adultos mayores | `geriatrics` |

   **Ripples** (tracked under the migration in §2): **`general` is retired (dormant, not dropped)** — the 6 seeded supplies are retagged off it into the new buckets and the catalog is expanded so every area has suggestions (full list in §8). The donor surface category chips render the 6 area values.

## 6. Testing

Extend the Playwright suite (runs against local Supabase): a center logs in (approved seed center) → publishes a request (drives the real action + selector) → it appears on the **donor** list → center finalizes it → it leaves the donor list. Asserts the action actually writes (gotcha #2). Donor specs stay data-independent.

## 7. Effort (rough)

3.1 dashboard `~0.5d` · 3.2 create+selector+publish `~1.5d` (the bulk) · 3.3 detail+finalizar+extender `~1d` · 3.4 profile+reception `~0.75d` · migration `0004` + queries threaded through. Natural multi-agent workflow candidate (spec → implement → verify → review → PR), one slice at a time.

## 8. Seed catalog (apply WITH migration `0004`, slice 3.2)

`general` is dropped; the 6 originals are retagged and the catalog grows to **3 supplies per area** so every "Sugeridos · {área}" list is non-empty. **Do not apply to `seed.ts` until `0004` adds the enum values** — until then these category strings are invalid and `db:seed` will fail (local + CI). The 6 original *names* are preserved, so existing seeded requests that reference them by name still resolve.

| Area | `supply_category` | Supplies |
|---|---|---|
| Quirófano | `surgical` | Guantes quirúrgicos*, Gasas estériles*, Suturas |
| Emergencias | `emergency` | Suero fisiológico 500 ml*, Jeringas 5 ml estériles*, Solución antiséptica |
| Farmacia | `pharmacy` | Acetaminofén 500 mg*, Alcohol isopropílico*, Antibióticos (amoxicilina) |
| Hospitalización | `inpatient` | Sábanas clínicas, Sonda Foley, Mascarillas N95 |
| Refugio infantil | `pediatrics` | Acetaminofén pediátrico (jarabe), Suero oral, Pañales infantiles |
| Adultos mayores | `geriatrics` | Pañales para adulto, Suplemento nutricional, Tensiómetro |

*\* = one of the 6 originals, retagged (was pediatrics/surgical/general).*

Copy-paste-ready `seed.ts` array:

```ts
.values([
  // surgical (Quirófano)
  { name: "Guantes quirúrgicos", category: "surgical" },
  { name: "Gasas estériles", category: "surgical" },
  { name: "Suturas", category: "surgical" },
  // emergency (Emergencias)
  { name: "Suero fisiológico 500 ml", category: "emergency" },
  { name: "Jeringas 5 ml estériles", category: "emergency" },
  { name: "Solución antiséptica", category: "emergency" },
  // pharmacy (Farmacia)
  { name: "Acetaminofén 500 mg", category: "pharmacy" },
  { name: "Alcohol isopropílico", category: "pharmacy" },
  { name: "Antibióticos (amoxicilina)", category: "pharmacy" },
  // inpatient (Hospitalización)
  { name: "Sábanas clínicas", category: "inpatient" },
  { name: "Sonda Foley", category: "inpatient" },
  { name: "Mascarillas N95", category: "inpatient" },
  // pediatrics (Refugio infantil)
  { name: "Acetaminofén pediátrico (jarabe)", category: "pediatrics" },
  { name: "Suero oral", category: "pediatrics" },
  { name: "Pañales infantiles", category: "pediatrics" },
  // geriatrics (Adultos mayores)
  { name: "Pañales para adulto", category: "geriatrics" },
  { name: "Suplemento nutricional", category: "geriatrics" },
  { name: "Tensiómetro", category: "geriatrics" },
])
```

The `supply_category` pgEnum becomes: `["surgical", "emergency", "pharmacy", "inpatient", "pediatrics", "geriatrics"]` (Spanish UI labels map in a `labels.ts`, English identifiers per convention).
