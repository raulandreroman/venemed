# Lista model v2 — one evergreen list per center

> **Status**: CANONICAL — model of record (shipped in `main`, slices A/B/C = PRs #36/#41/#39). Last updated 2026-07-02.
> A model pivot: *solicitud* → **lista**, **one evergreen lista per center**, **no time windows** (freshness-confirm replaces expiry), per-item **urgency**, and the old *aviso de exceso* folded in as a **"No aceptamos"** item bucket.
> This spec **absorbed and replaced** the retired time-window specs — `data-model.md`, `cron-jobs.md`, `donor-slice.md`, `donor-fidelity.md`, `aviso-exceso.md`, `center-workspace.md`, `backend-fields-cron.md` (deleted 2026-07-02; their still-true content lives in §11–§14 below).
> Source design: Figma «VenemedApp» → page **"Back Office - Junio 30"** (Flow principal `205:7312`, Dashboard `205:7121`, Dashboard-Lista states `210:11795`/`13030`/`13091`/`13152`/`13213`).

## 1. The pivot, in one paragraph

A center no longer publishes many windowed *solicitudes*. It maintains **one living lista** — a single, evergreen board of what it needs right now. The lista has three item buckets — **Urgente**, **Necesitamos**, **No aceptamos** — and no countdown. Instead of expiring on a 12/24/48h timer, a lista just gets **stale**: "Actualizada hace 5 días · ¿sigue vigente?" nudges the center to re-confirm; a stale list **sinks in the donor ordering** rather than being taken down. This kills the time-window machinery (windows, `expires_at`, the expiry cron, time-based urgency) and replaces it with **freshness + manual urgency**.

> **Confirmed directions (user, 2026-07-01):** one lista per center · excess = an item bucket (retire `kind='surplus'`) · no auto-expiry, staleness nudge + sink-to-bottom · not launched, so **destructive migrations are fine**.

## 2. Source frames

Page **"Back Office - Junio 30"** (`205:6702`). IDs drift — re-resolve by name. The board is **mid-transition**: several frames still show old "vence en X h / ventana" copy — treat all window/countdown references as **removed** per §1, superseding the stale frames.

| Frame | Node | Establishes |
|---|---|---|
| Dashboard · Lista v2 | `210:11795` | The whole model: header (center + Verificado), summary "12 insumos · 3 urgentes · 2 no aceptados · Actualizada hace 5 días", the **freshness card** ("Tu lista se actualizó… · Sí, sigue vigente / Editar"), sections **Urgente / Necesitamos / No aceptamos**, "+ N insumos más", footer **Editar lista / Compartir lista**. |
| Dashboard · Solo necesitamos | `210:13213` | Needs-only variant: "0 urgentes · 0 no aceptados", only **Necesitamos**, and a **"+ Avisar lo que tienes en exceso"** link to add the excess bucket. |
| Dashboard · Vacío | `210:13030` | Empty: "Aún no tienes una lista · Crea tu primera lista…" + primary CTA. |
| Dashboard · Error | `210:13091` | "No pudimos cargar tu lista" + reintentar. |
| Dashboard · Offline | `210:13152` | Offline banner variant. |
| Creación de lista | `205:7312` flow | Step 1 (items + "Marcar como urgente" edit mode + Nota) → Step 2 "Aviso de exceso" (excess items + Razón ≤40) → "¡Lista publicada!". Selector sheet "Agregar ítems". |
| Reactivar lista | `205:7604`/`7659`/`7676` | Reactivating a closed/paused lista (post reception-pause). |
| Perfil · Activo / Pausado | `205:7150`/`205:7223` | Reception toggle: "Tu centro aparece/dejará de aparecer en la lista pública." |

## 3. Data model v2

### 3a. Entity rename — `request` → `lista`

The entity's meaning changed (a per-center evergreen list, not a time-boxed request). With destructive migrations allowed, rename for honesty:

- `request` → **`lista`** (table). One active row per center.
- `request_item` → **`lista_item`**.
- `share_event.request_id` → `lista_id`; `moderation_event` subject enum value `'request'` → `'lista'`; `request_kind`/`request_status` → `lista_status` (kind enum retired, see 3c).
- App identifiers follow: `publishRequest`→`publishLista`, `getActiveRequests`→`getActiveListas`, `CreateRequestForm`→`ListaEditor`, etc. Spanish routes/dirs per §5.

> This reverses the earlier "keep `request`" recommendation — that held only while the entity's meaning was unchanged. It changed. *(Decision D1.)*

### 3b. One active lista per center

- Partial unique index: **`unique (center_id) where status in ('active','paused')`**. A center has at most one live lista; "create" the first time, "edit" thereafter. Closed listas accumulate as history ("Listas inactivas").
- Retire the old `request_one_active_surplus_per_center` index (no surplus entity anymore).

### 3c. Items carry a bucket + urgency

`lista_item` gains:

- **`bucket`** enum `lista_item_bucket` = `'need' | 'excess'` (default `'need'`). Drives Necesitamos/No aceptamos.
- **`is_urgent boolean not null default false`** — only meaningful for `need` items (excess never urgent). Drives the Urgente section + badge.

The three UI sections are pure read-time derivations:
- **Urgente** = `bucket='need' AND is_urgent`
- **Necesitamos** = `bucket='need' AND NOT is_urgent`
- **No aceptamos** = `bucket='excess'`

The entity-level `request.kind` (`need`/`surplus`) is **removed** — surplus is now a bucket on items, not a kind of list. *(Decision D2 — confirmed: item bucket.)*

### 3d. Columns removed / added on `lista`

**Remove** (window machinery + surplus + title):
- `window_hours`, `expires_at` — no windows.
- `kind` (need/surplus) — folded into item bucket.
- `closed_reason` value `'expired'` — no expiry path (enum shrinks to `fulfilled | cancelled`, or drop `closed_reason` entirely if unused elsewhere — audit).
- `title` — **dropped** (confirmed). The new dashboard/create has no per-lista title; the lista *is* the center's board. Donor card derives its label from the center + item summary, not a title. *(Decision D3 — resolved.)*

**Add:**
- **`excess_reason varchar(40)`** — the "Razón (opcional)" from the aviso step, now list-level (it described the excess bucket). Nullable.
- **Freshness**: reuse **`updated_at`** as the "Actualizada hace X" source; "Sí, sigue vigente" **touches `updated_at`** (a content-free reconfirm). Optionally add explicit `confirmed_at` if we want to distinguish "edited" from "reconfirmed" — *recommend reuse `updated_at` for v1* (simplest; the nudge only cares about time-since-touch). *(Decision D4.)*

**Keep:** `center_id`, `short_id`, `status`, `delivery_instructions`, `published_at`, `closed_at`, denormalized `city` + `categories[]`, `share_count`, `idempotency_key`, timestamps.

### 3e. Lifecycle without expiry

`draft → active → (paused ⇄ active) → closed`. **`expired` is removed.** Transitions (as built):
- **active**: the live lista, appears on the donor surface.
- **paused**: reception-off **pauses** the center's `active` lista(s) → `status='paused'` (`recepcion.ts`). A paused lista is **preserved, not closed**: the donor list filters `status='active'` so it drops off the public surface, but it still shows on the center dashboard (which reads `active|paused`) with a "Recepción pausada" notice. Resuming reception (or "Reactivar lista") flips it back to `active` and resets `updatedAt` (freshness). The one-active-per-center unique index covers `active|paused`, so a paused lista still reserves the center's single-lista slot.
- **closed**: the center finalizes ("Finalizar") → `closedReason='fulfilled'`. Terminal; a new lista can be created after. **Legacy note:** rows closed by the *old* close-on-pause behavior (`closedReason='cancelled'`) stay `closed`; the center brings them back via the same "Reactivar lista" button (which also resumes reception).

## 4. Freshness replaces the window

No timer takes a lista down. Instead:

1. **Staleness signal** — `now − updated_at`. The dashboard freshness card shows when a lista hasn't been touched in **≥ N days** (propose **N = 3**; confirm): *"Tu lista se actualizó hace 5 días — Confirma que sigue vigente…"* with **"Sí, sigue vigente"** (touch `updated_at`) and **"Editar"**.
2. **Donor ordering sinks stale lists** — the donor list sorts fresh-first; lists past a staleness threshold (**> 7 days**) drop to the bottom rather than disappearing. No hard takedown. *(Decision D5 — resolved: nudge ≥3d, sink >7d.)*
3. **No expiry cron.** Delete `src/db/jobs.ts:expireDueRequests`, the `/api/cron/expire-requests` endpoint, the GitHub Actions `expire-requests.yml` schedule, and the `expires_at`/`window_hours` reads. Freshness is computed at read time from `updated_at` — **no background job needed**. *(Amends [cron-jobs.md](cron-jobs.md) — the expiry cron is retired.)*

> **Countdown removed everywhere.** The `Countdown` component, "Vence en N h" urgency pills, and `sort=urgency` (`expires_at asc`) all go. Donor urgency is now the **manual per-item "Urgente"** signal (§3c) — see §6 for donor sort.

## 5. The rename — routes, dirs, copy

- **Routes**: `/solicitudes` → `/listas` (donor `(public)`, center `(center)`, and the `@modal/(.)solicitudes` interceptor). Center create/edit route `centro/solicitudes/nueva` → `centro/lista` (single lista → not `/nueva/[id]`; it's *the* lista).
- **Shared-link redirect**: donor links `/solicitudes/<id>` circulate; add a **permanent redirect** `/solicitudes/:path* → /listas/:path*` (vercel.ts `redirects` or middleware), kept indefinitely. *(Decision D6 — non-negotiable given the share model.)*
- **Dir**: `src/lib/solicitudes/` → `src/lib/listas/`.
- **Copy**: all Spanish `solicitud(es)` → `lista(s)`. Key strings: "Listas activas", "Ver todas las listas", "Creación de lista", "Publicar lista", "¡Lista publicada!", "Editar lista", "Compartir lista", "Aún no tienes una lista", "Reactivar lista", "No pudimos cargar tu lista", summary "N insumos · N urgentes · N no aceptados", "Actualizada hace X", "Sí, sigue vigente", section headers "Urgente / Necesitamos / No aceptamos", "+ N insumos más", "+ Avisar lo que tienes en exceso".

## 6. Donor surface

Donor frames exist on the **Landing** page (`11:2`): landing `11:3`, active list `30:15714`, cards `209:6277`/`30:16399`. Copy is still in flux ("Solicitado…" → "Actualizada…", frame titled "Solicitudes activas" → "Listas activas"), but the card model is settled.

- **List = one card per center** (its active lista), not one card per request. `getActiveListas` returns active listas (one per center).
- **Card anatomy** (frames `209:6277` / `30:16399`):
  - City pill (top-left) + **"Urgente"** pill with red dot (top-right) — shown when the lista has **≥1 urgent item** (derived, not time-based).
  - Center name (bold).
  - **Item chips**: urgent items rendered in **red/error tint first**, then needed items in **neutral**, then **"+N más"**. (Urgente + Necesitamos buckets, urgent-first.)
  - **"No aceptamos: X, Y"** amber summary pill when the lista has excess-bucket items.
  - Freshness line: **"Actualizada hace…"** (currently mocked "Solicitado hoy, 6:00 a.m.").
  - Footer: **Compartir** (ghost) + **Ver más** (primary).
- **Detail** = the lista with its Urgente / Necesitamos / No aceptamos sections (the "No aceptamos" replaces the old surplus banner).
- **Sort**: the sort row shows only **"Reciente"** — the old "Urgencia" (`expires_at asc`) is gone; urgency is surfaced **on the card** (badge + red chips), not in the order. Default **fresh-first** (`updated_at desc`) with **stale lists sunk** (§4.2, >7d). Filter chips (city, category) + search (center/city/insumo) unchanged. *(Decision D7 — resolved from frames; urgent-sort-boost dropped in favor of the on-card badge.)*
- **Caching**: donor reads stay cached (`active-listas`, `landing-stats`, `lista:<id>`); edits/reconfirm/pause `revalidateTag(...,"max")`.

> **Slice C is unblocked** — the card model is defined; only copy is still being finalized in Figma. Center slices (A/B) don't depend on it.

## 7. Author / edit flow

One lista per center means **create-once, then edit**:

- **First time** (empty state `210:13030`): "Crea tu primera lista" → **Creación de lista** wizard: step 1 items (+ mark urgent) + Nota → step 2 optional **excess** ("Aviso de exceso": add No-aceptamos items + Razón) → **¡Lista publicada!**.
- **Thereafter**: dashboard **"Editar lista"** re-opens the same editor pre-filled (the "nueva" form becomes the edit form). "+ Avisar lo que tienes en exceso" (needs-only variant) jumps to the excess step.
- **Urgency edit mode** (frames `210:11225`→`11372`): "Marcar como urgente" → checkboxes → Confirmar → items get the "Urgente" badge; button becomes "Editar urgentes". Writes `lista_item.is_urgent`.
- **Reconfirm**: "Sí, sigue vigente" touches `updated_at` (no content change).
- Publish is idempotent (`idempotency_key`); edits are last-write-wins per the single lista row.

## 8. Impact map

**Schema / data** (destructive migration `0007`, since not launched):
- `src/db/schema.ts` — rename tables/enums, drop `window_hours`/`expires_at`/`kind`/`title`/`expired`, add `lista_item.bucket` + `is_urgent`, `lista.excess_reason`, new one-active-per-center index.
- `src/db/seed.ts` — reseed as one lista per center with need/urgent/excess items.
- `src/db/queries.ts` — `getActiveListas` (one per center), freshness/sort, drop expiry reads.
- `src/db/jobs.ts` + `src/app/api/cron/expire-requests/` + `.github/workflows/expire-requests.yml` — **delete** (no expiry).

**Center**:
- `src/app/(center)/centro/solicitudes/**` → `centro/lista/**`; dashboard (freshness card, 3 sections, states Vacío/Error/Offline), editor (buckets + urgency edit mode), reconfirm + reactivate actions.
- `src/app/(center)/actions/{publicar,gestionar}.ts` → publish/edit one lista, `confirmVigente()`, retire aviso-specific actions (folded in).
- Retire `centro/aviso/**` (excess is now a step/bucket of the lista).

**Donor**:
- `src/app/(public)/solicitudes/**` → `listas/**` (one card per center), detail sections, remove `Countdown`/urgency-pill/`sort=urgency`. Redirect old paths.

**Shared UI**: `Countdown` removed; `request-card.tsx`/`aviso-banner.tsx` reworked into lista card + sections; `confirm-dialog`, `app-bar` copy.

**Specs to amend**: `data-model.md` (entity, no windows, buckets), `cron-jobs.md` (retire expiry), `donor-slice.md` (one card/center, no countdown), `aviso-exceso.md` (superseded — excess is a bucket), `center-workspace.md`.

## 9. Slices

| Slice | Scope | Effort |
|---|---|---|
| **A — schema + rename** | Migration `0007` (rename + drop windows/kind + add buckets/urgency/excess_reason + one-per-center index), retire expiry cron, reseed, `src` rename + route redirect. No new UI behavior beyond removals. | [1.5d] |
| **B — center dashboard + editor** | One-lista dashboard (freshness card, 3 sections, empty/error/offline states), create-once/edit editor with urgency edit-mode + excess step, reconfirm + reactivate actions. | [2.5d] |
| **C — donor surface** | One-card-per-center list (city + Urgente badge + urgent-first chips + No-aceptamos summary), detail sections, fresh-first sort + stale-sink, countdown removal. Frames exist (`11:2`); copy still being finalized. | [1.5d] |

A is the foundation; B builds on it; C uses the existing donor frames.

## 10. Decisions

| # | Decision | Recommendation / status |
|---|---|---|
| D1 | Rename entity `request` → `lista` (+ identifiers) | **Yes** — meaning changed + destructive OK |
| D2 | Excess storage | **Item bucket** (`lista_item.bucket`), retire `kind='surplus'` — *confirmed* |
| D3 | Drop per-lista `title` | **Dropped** — *resolved* |
| D4 | Freshness source | **Reuse `updated_at`**; "Sí, sigue vigente" touches it (add `confirmed_at` only if edit-vs-reconfirm must differ) |
| D5 | Staleness thresholds | **Nudge ≥3d, sink >7d**, no hard takedown — *resolved* |
| D6 | Old shared-link redirect | **Permanent redirect** `/solicitudes/* → /listas/*` |
| D7 | Donor sort + card model | **Resolved from frames** (`11:2`): one card/center, Urgente badge + urgent-first chips + No-aceptamos summary; sort **Reciente/fresh-first + stale-sink** (urgency on-card, not in sort) |

All decisions resolved. Only remaining external dependency: donor **copy** is still being finalized in Figma (frame titles/labels) — cosmetic, doesn't block build.

---

# Folded appendix — content absorbed from the retired specs

> §§1–10 above are the model. §§11–14 preserve the still-true, code-verified detail from the seven specs this doc replaced. Verified against `src/db/schema.ts`, `queries.ts`, the actions, and the donor/center components on 2026-07-02.

## 11. Supporting data model (non-lista tables)

The lista/lista_item tables are defined in §3. The rest of the schema (unchanged in substance by the pivot, only the `request`→`lista` FKs/enums renamed):

### `center`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK `defaultRandom()` | |
| `name` | text not null | |
| `type` | enum `center_type` **nullable** | `hospital`, `clinic`, `elder_care_home`, `childrens_shelter`, `collection_center`. Null when the center-type flag is off. |
| `description` | text nullable | |
| `city` | text **not null** | drives the donor city filter |
| `state` | text nullable | |
| `address_line` / `address_reference` | text nullable | "Dónde entregar" source |
| `regular_schedule_text` | text nullable | regular receiving hours |
| `lat` / `lng` | numeric nullable | reserved for maps; not in UI |
| `whatsapp_phone` | text nullable | **optional, unverified** delivery-coordination contact (no longer an OTP target). `normalizeVePhone()` validates it. |
| `status` | enum `center_status` not null default `pending_review` | `pending_review`, `approved`, `rejected`, `suspended` — the moderation gate |
| `rejection_reason` | text nullable | shown on "Centro rechazado" |
| `verified_at` | timestamptz nullable | admin-approval time |
| `reception_paused_at` | timestamptz nullable | reception kill-switch (§14) |
| `created_at` / `updated_at` | timestamptz not null default now | |

### `app_user` (post migration 0008 — email auth)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = Supabase `auth.users` uid (1:1) |
| `name` | text nullable | |
| `email` / `email_verified_at` | | the verified session email (unique, lowercased) — **replaced** the dropped `phone`/`phone_verified_at` |
| `cargo` | varchar(60) nullable | operator's role/title at the center |
| `is_platform_admin` | boolean not null default false | moderators/staff |
| `last_login_at` | timestamptz nullable | |
| `created_at` / `updated_at` | timestamptz not null default now | |

### `membership` — links `app_user → center`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → `app_user` not null cascade | `uniqueIndex on (user_id)` — one center per user in v1 (closes the concurrent-duplicate race) |
| `center_id` | uuid → `center` not null cascade | |
| `role` | enum `member_role` not null default `center_admin` | `center_admin` (Responsable) / `center_member` (Operador) |
| `created_at` | timestamptz not null default now | |

Single-use email team invitations live in the **`invitation`** table + `invitation_status` enum (added PR #43; see `src/lib/team/`).

### `supply` (*insumo* catalog)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | "Acetaminofén 500 mg" |
| `category` | enum `supply_category` not null | see §14 (6 area values + dormant `general`) |
| `is_active` | boolean not null default true | hide deprecated items without deleting |

### `moderation_event` (append-only audit)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_user_id` | uuid → `app_user` nullable | null for system actions |
| `subject_type` | enum `moderation_subject_type` not null | `center`, **`lista`** (was `request`) |
| `subject_id` | uuid not null | polymorphic, no FK |
| `action` | text not null | `approved`, `rejected`, `suspended`, … (no `expired_by_cron` — cron gone) |
| `reason` | text nullable | |
| `created_at` | timestamptz not null default now | |

### `share_event` (write-only analytics)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `lista_id` | uuid → `lista` not null cascade | (was `request_id`) |
| `channel` | enum `share_channel` not null default `unknown` | `whatsapp`, `instagram`, `x`, `copy_link`, `unknown` |
| `created_at` | timestamptz not null default now | |

**Principles that still hold:** single-writer per center (last-write-wins per row, no CRDTs); catalog **or** free-text items (`supply_id` nullable ⇒ free-text `custom_name`); soft/auditable moderation (status transition + `moderation_event`, never hard delete); status drives visibility (explicit enums, never implicit nulls).

## 12. Backend mechanics — share tracking & delivery note

### Share tracking (`recordShare`)
`share_count` (denormalized counter on `lista`) + `share_event` (one row per share) are written **only** by the `recordShare(listaId, channel)` server action (`src/app/actions/share.ts`); the share UI otherwise just builds intent URLs / calls `navigator.share`. It's unauthenticated (anonymous donors call it over RPC), so it's guarded:

1. **UUID shape-check** the id first — non-UUID is a cheap no-op (avoids a round-trip + pointless revalidate).
2. **Existence + active gate folded into the bump**: `UPDATE lista SET share_count = share_count + 1 WHERE id = ? AND status = 'active' RETURNING id`. Only a returned row triggers the `share_event` insert + revalidate — bounding all writes/invalidation to genuine active listas.
3. Increment is a SQL expression (`share_count + 1`), not read-modify-write — concurrency-safe.
4. On a confirmed share, revalidate **`lista:<id>`** + **`landing-stats`** but **NOT `active-listas`** (the donor card shows no share count → a list-wide bust per share would be wasteful churn).

**Channel map:** WhatsApp→`whatsapp`, X→`x`, copy-link→`copy_link`, Instagram→`navigator.share ? instagram : copy_link`, native share sheet→`unknown`. **Fire-and-forget:** callers use `recordShare(...).catch(() => {})` (the `.catch`, not a bare `void`, swallows a failed RPC without an unhandled rejection). Native-share CTAs record only on *successful* share; the scroll-to-`#comparte` fallback records nothing (the channel button then tapped records the single event).

### Per-lista `delivery_instructions` (`varchar(120)`, nullable)
A drop-off note layered on the center's static address — the center address/reference/schedule are the base, `delivery_instructions` is an additive override. Rendered in "Dónde entregar" *after* the center address/reference and *before* the map link, emphasized. Shown only on the **active** detail (a closed lista renders address-only). Authored via the editor's "Nota" field; selected by `getListaById` / `getCenterListaById` / `getCenterListaForEdit`.

## 13. Donor surface details (filters, states, sheet, fidelity)

Extends §6. Confirmed live in `filter-select.tsx`, `search-box.tsx`, `listas/page.tsx`, `request-sheet.tsx`, `@modal/(.)listas/[id]`, the share components.

- **URL is the single source of truth**: `?search=&city=&type=&category=&sort=`. The RSC page reads `searchParams`, normalizes, calls `getActiveListas`. Controls mutate the URL via `router.replace(..., { scroll: false })` inside `startTransition`; the list re-renders **server-side — no client data fetching**.
- **Search** (`SearchBox`): debounced ~300ms; ILIKE across **center name OR city OR item name** (`center.name`, `lista.city`, and item `supply.name`/`custom_name` via EXISTS). Placeholder "Buscar por centro, ciudad o ayuda…".
- **Filters** are two labeled pill-dropdowns (native `<select>` for a11y + zero-JS fallback): **"Ubicación"** (`uniqueSorted(city)`) and **"Sector"** (`centerTypeLabel`), each with a leading "Todas/Todos" clear option. Facets are computed from a **second unfiltered `getActiveListas({})`** so an option never disappears mid-filter. Dimensions combine with AND. Memoize `getActiveListas` in `unstable_cache` keyed on the normalized filters (don't add `force-dynamic`).
- **Empty states**: filtered → "No hay listas que coincidan / Prueba con otros filtros…"; unfiltered → "No hay listas activas / Vuelve pronto…". Unknown id → `not-found.tsx` (404), not a crash. Pending transitions expose `data-pending` on the controls.
- **Detail = intercepted bottom sheet**: `@modal` slot + `(.)listas/[id]` interceptor — opening from the list overlays a sheet; direct visit / refresh / deep link renders the **full page** (with `AppBar`); scrim/back dismisses. Content stays a Server Component (`getListaById`) so the shareable URL is byte-identical SSR in both — *sharing is the core action, the URL must stay SSR*. Sheet a11y: `role="dialog" aria-modal="true"`, Escape dismiss, body-scroll lock, focus trap, focus restored to the triggering card on close.
- **Detail delivery sections**: "Dónde entregar" (`addressLine` + `addressReference` + "Abrir en mapas" link, no embedded map) and "Cuándo entregar" (`regularScheduleText`). All delivery copy inherits from the center (plus the per-lista note, §12).
- **Share UX**: active-detail footer CTA is **"Compartir lista"** (`navigator.share` when available, else scroll to `ShareSection`); closed-detail CTA is "Ver listas activas". `ShareSection` = WhatsApp/Instagram/X circles (brand hues `#25D366`/`#C13584`/`#0f1419` are sanctioned brand exceptions) + "Copiar link" (accent = action).
- **Single-accent fidelity** (Figma foundations `32:4167`): accent `#1F5AA8` **only** for actions (primary buttons, links, active/selected, focus ring); everything else neutral; semantic colors signal **state only**. Sanctioned non-action accent-subtle surfaces: the landing conversion panel + the "+N más" count pill. Font **Inter** (400/500/600/700); scale Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12; tap targets ≥48×48. Semantic hexes: error `#C0362C`/`#FCEBE9`, warning `#B45309`/`#FEF4E6`, success `#1E7D52`/`#E8F5EE`.
- **Caching posture**: donor routes `export const revalidate = 60`; queries in `unstable_cache` (`active-listas`, `landing-stats`, `lista:<id>`); center edit/reconfirm/pause call `revalidateTag(..., "max")`.

## 14. Center workspace details (reception, short_id, catalog)

Extends §7. Confirmed against `recepcion.ts`, `publicar.ts`, `gestionar.ts`, schema.

### Reception kill-switch — `center.reception_paused_at timestamptz null`
`null` = receiving. A **timestamp** (not a bool) so "Pausada · desde hace 12 min" renders for free.
- **Pause ON** → stamp `reception_paused_at = now()` **and pause** the center's `active` listas → `status='paused'`, in one transaction. The lista is **preserved, not closed**: the donor list (`status='active'`) drops it, but the center dashboard still shows it. (This is why the `paused` *status* is now in use — reception-off **pauses** rather than closes; see §3e.)
- **Pause OFF** → clear `reception_paused_at` **and** restore the center's `paused` listas → `status='active'`, resetting `updatedAt` (freshness), in one transaction — the lista reappears to donors immediately.
- **"Reactivar lista"** (`gestionar.ts` `reactivateLista`) reactivates a `paused` (or legacy `closed`) lista and, when reception is still paused, **also clears `reception_paused_at`** (the UI shows a confirm first). It no longer throws when reception is paused.
- Publishing / reactivating is **Responsable-only** for the toggle (`requireResponsable()`); an Operador is bounced to `/centro`.

### `lista.short_id bigint generated always as identity`
Human-friendly "#1044" — a **global monotonic** sequence (not per-center), matching the Figma "#{short_id}" card meta. `ADD COLUMN … GENERATED ALWAYS AS IDENTITY` backfills existing rows.

### `supply_category` — area = category (1:1), 6 values + dormant `general`
| Area (UI) | `supply_category` |
|---|---|
| Quirófano | `surgical` |
| Emergencias | `emergency` |
| Farmacia | `pharmacy` |
| Hospitalización | `inpatient` |
| Refugio infantil | `pediatrics` |
| Adultos mayores | `geriatrics` |

`general` is a **dormant** enum value — kept, never dropped (dropping forces a full type recreation); custom/free-text items fall back to it. Publish derives the lista's denormalized `categories[]` from its items' `supply.category`.

### Profile stats
Profile shows lifetime **Activas + Cumplidas** (Cumplidas = `closed/fulfilled` count); the "Donantes" stat was removed per product. *(Verify against the profile component before relying on the exact labels.)*
