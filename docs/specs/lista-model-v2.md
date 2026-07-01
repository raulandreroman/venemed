# Lista model v2 — one evergreen list per center

> **Status**: draft — for review. Last updated 2026-07-01.
> A model pivot: *solicitud* → **lista**, **one evergreen lista per center**, **no time windows** (freshness-confirm replaces expiry), per-item **urgency**, and the old *aviso de exceso* folded in as a **"No aceptamos"** item bucket. Supersedes large parts of [data-model.md](data-model.md), [cron-jobs.md](cron-jobs.md), [donor-slice.md](donor-slice.md), [aviso-exceso.md](aviso-exceso.md), [center-workspace.md](center-workspace.md).
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

`draft → active → paused → closed`. **`expired` is removed.** Transitions:
- **active**: the live lista, appears on the donor surface.
- **paused**: reception toggle off ("Perfil · Pausado") — hidden from donors, reactivatable.
- **closed**: center finalizes, or reception pause closes it ("Cerrada hace 12 min al desactivar recepción"). Terminal; a new lista can be created after.

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
