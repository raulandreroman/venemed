# VeneMed — Data Model (v1)

> **Status**: draft. Last updated 2026-06-28.
> First data-model spec. Related to the locked architecture decisions (single Next.js app, Neon Postgres + Drizzle, Auth.js + Twilio Verify WhatsApp OTP, offline read + offline-draft-with-confirm).

## 1. Purpose & scope

This spec defines the **persistent data model** for the VeneMed MVP — the Postgres schema behind all three surfaces (public donor, center back office, admin moderation) and the fields that make offline draft-and-sync work.

It does **not** cover: API route shapes, UI state, the Twilio Verify integration internals, or the client-side IndexedDB queue structure (that's a separate offline spec). It does define the **server-side columns** the sync layer depends on.

Goal for this review: agree on entities, the `request` lifecycle, and the sync-critical columns **before** we scaffold migrations, because these are expensive to change once data exists.

> **Identifiers are English; product/UI copy stays Spanish.** Table, column, and enum-value names are English so the codebase reads cleanly. The Spanish words users see are *content*, not identifiers. Key term mapping: `request` = *solicitud*, `supply` = *insumo*, `center` = *centro*. Example values in this doc that are quoted strings ("Hospital J.M. de los Ríos", "Pediatría", "Vence en 8 h") are illustrative UI content and remain Spanish.

## 2. Design principles

- **Single-writer per center.** A request belongs to one center; only that center's users edit it. This is why we do *not* need CRDTs or field-level merge in v1 — last-write-wins per row is safe.
- **Status drives everything.** Public visibility, share-link behavior, and the donor/center/admin views are all derived from a small set of explicit status enums, never from implicit nulls.
- **Sync-aware from row one.** Every user-mutable table carries a client-generatable `id` (UUID), an `idempotency_key`, and `updated_at`, so an offline-drafted row can be created locally and reconciled on reconnect without duplicates.
- **Time is data, not derived state.** A request stores `published_at` and `expires_at` as real columns. "Vence en 8 h", countdowns, and urgency sorting are computed from these at read time. A cron job flips expired rows.
- **Catalog + free text.** Supplies come from a curated catalog (for suggestions like "SUGERIDOS · QUIRÓFANO") but a center can always add a free-text item — the model supports both on the same line-item table.
- **Soft, auditable moderation.** Center approval/rejection is a status transition with a recorded reason and actor, never a hard delete.

## 3. Entity overview

| Entity | Purpose | Public-readable? |
|---|---|---|
| `center` | A health center / organization that publishes requests | Yes (approved only) |
| `app_user` | A person who logs into a center's back office, or a platform admin | No |
| `membership` | Links a user to a center with a role | No |
| `request` | A time-windowed notice from a center (*solicitud*) — either a **need** for supplies or a **surplus** ("no enviar más de X"); `kind` discriminates | Yes (active/closed views) |
| `request_item` | One needed supply line on a request | Yes (with parent) |
| `supply` | Curated catalog of supplies + categories (*insumo*; powers suggestions) | Yes (reference data) |
| `moderation_event` | Audit trail of center approval/rejection and request actions | No |
| `share_event` | Records a share per channel for analytics & the "share count" | No (write-only) |
| Supabase Auth (`auth.users`) | Managed identity (phone, WhatsApp OTP, sessions) — owned by Supabase, not in our schema. `app_user` links to it 1:1 | No |

> The donor surface reads only `center` (approved), `request` (active/closed), `request_item`, and `supply`. Everything a logged-out user can see is in those four tables — which is exactly what we aggressively cache + serve from the CDN during the surge.

## 4. Entities in detail

### 4.1 `center`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Client-generatable |
| `name` | text | "Hospital J.M. de los Ríos" |
| `type` | enum `center_type` | `hospital`, `clinic`, `elder_care_home`, `childrens_shelter`, `collection_center` |
| `description` | text | "Hospital pediátrico público · San Bernardino" |
| `city` | text | "Caracas" — used by the city filter chip |
| `state` | text | Venezuelan state |
| `address_line` | text | "Av. Vollmer, San Bernardino · Caracas 1011" |
| `address_reference` | text | "Entrada principal · pregunta por Recepción de donaciones" |
| `regular_schedule_text` | text | "Lun a Vie · 8:00 am — 6:00 pm" — the center's regular receiving hours |
| `lat` / `lng` | numeric, nullable | Reserved for maps; not in v1 UI |
| `whatsapp_phone` | text (E.164) | Contact + default OTP target |
| `status` | enum `center_status` | `pending_review`, `approved`, `rejected`, `suspended` |
| `rejection_reason` | text, nullable | Shown on "Centro rechazado" |
| `verified_at` | timestamptz, nullable | When an admin approved |
| `created_at` / `updated_at` | timestamptz | |

### 4.2 `app_user`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | **1:1 with `auth.users.id`** — Supabase Auth owns the identity; this is the app-side profile/role row |
| `phone` | text (E.164), unique | Mirrors the phone from Supabase Auth (verified via Twilio Verify / WhatsApp) |
| `name` | text | |
| `is_platform_admin` | boolean | Moderators/staff. Center role lives on `membership` |
| `phone_verified_at` | timestamptz, nullable | |
| `last_login_at` | timestamptz, nullable | |
| `created_at` / `updated_at` | timestamptz | |

> We store **no OTP codes**. Supabase Auth + Twilio Verify own code generation, attempts, and the "intentos agotados" (max-attempts) state. We only record `phone_verified_at` on success.

### 4.3 `membership`

Join between `app_user` and `center`. Kept separate (rather than a FK on `app_user`) so a center can have multiple staff later and a user could belong to more than one center — cheap to add now, painful to retrofit. **v1 enforces exactly one membership per center** (one user per center); the table shape just avoids a migration when multi-staff is added.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid → `app_user` | |
| `center_id` | uuid → `center` | |
| `role` | enum `member_role` | `center_admin`, `center_member` |
| `created_at` | timestamptz | |

### 4.4 `request` (*solicitud*) — the core entity

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Client-generatable (offline draft) |
| `center_id` | uuid → `center` | |
| `kind` | enum `request_kind` | `need` (default) or `surplus`. A `surplus` notice lists items the center is oversupplied on ("no enviar más de X"). Renders as a distinct "No enviar" card on the donor side. |
| `status` | enum `request_status` | `draft`, `active`, `paused`, `closed`, `expired` — see §5 |
| `window_hours` | smallint | 12, 24, or 48 |
| `published_at` | timestamptz, nullable | Set on first transition to `active` |
| `expires_at` | timestamptz, nullable | `published_at + window_hours`; the countdown anchor |
| `closed_at` | timestamptz, nullable | |
| `closed_reason` | enum `closed_reason`, nullable | `fulfilled`, `cancelled`, `expired` |
| `city` | text | Denormalized from `center` at publish; powers the city filter + cached list with no join |
| `categories` | text[] | Denormalized union of this request's item categories at publish; powers the category filter |
| `share_count` | integer, default 0 | Denormalized counter for the landing stat |
| `idempotency_key` | text, unique, nullable | Set by client on offline create; dedupes sync retries |
| `created_at` / `updated_at` | timestamptz | |

> **Delivery details inherit from the center** (v1 decision). A request has no delivery columns of its own — "Dónde entregar" reads `center.address_line` + `center.address_reference`, and "Cuándo entregar" combines `center.regular_schedule_text` with today's cutoff derived from `expires_at`. No per-request override in v1.

> **No quantities** (v1 decision). Items are name + category only; the supply name already carries the spec ("Acetaminofén 500 mg"). See §4.5.

> **`surplus` requests** reuse this entire entity — same lifecycle (§5), same `window_hours` + expiry cron (so a "no enviar" notice auto-clears, true to the time-window model), same sharing, same `request_item` list. The only consumer-visible difference is rendering: a need shows as a "Necesita" card, a surplus as a "No enviar" card.

### 4.5 `request_item`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `request_id` | uuid → `request` | cascade delete |
| `supply_id` | uuid → `supply`, nullable | Null when it's a free-text item |
| `custom_name` | text, nullable | Used when `supply_id` is null |
| `category` | text | Denormalized ("Pediatría") so the card renders without a join |
| `is_fulfilled` | boolean, default false | Drives the "itemDone" closed-state styling |
| `created_at` | timestamptz | |

### 4.6 `supply` (*insumo* catalog)

Reference data powering the "Selector de insumos" and category suggestions (e.g. SUGERIDOS · QUIRÓFANO).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | "Acetaminofén 500 mg" |
| `category` | enum `supply_category` | `pediatrics`, `surgical`, `general`, … (seed list, extensible) |
| `is_active` | boolean, default true | Hide deprecated items without deleting |

### 4.7 `moderation_event`

Append-only audit log for center vetting and notable request actions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `actor_user_id` | uuid → `app_user`, nullable | Null for system/cron actions |
| `subject_type` | enum | `center`, `request` |
| `subject_id` | uuid | |
| `action` | text | `approved`, `rejected`, `suspended`, `expired_by_cron`, … |
| `reason` | text, nullable | |
| `created_at` | timestamptz | |

### 4.8 `share_event`

Write-only event stream for share analytics and `share_count`. Confirmed for v1 (minimal, thin table).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `request_id` | uuid → `request` | |
| `channel` | enum | `whatsapp`, `instagram`, `x`, `copy_link`, `unknown` |
| `created_at` | timestamptz | |

## 5. The `request` lifecycle

The state machine every request moves through — **identical for both `need` and `surplus` kinds**. Public visibility and share-link behavior are pure functions of this status.

| Status | Who sees it | Meaning |
|---|---|---|
| `draft` | Center only | Being composed (incl. offline drafts synced as draft). Not public. |
| `active` | Public + center | Published, within window. Counts toward landing stats, appears in "Solicitudes activas". |
| `paused` | Center (public link shows a closed-style state) | Center temporarily halted difusión. Stops circulating. |
| `closed` | Public (closed detail view) + center | Terminal. Fulfilled or manually cancelled. |
| `expired` | Public (closed detail view) + center | Terminal. Window elapsed; flipped by cron. |

**Allowed transitions:**

```
draft     → active     (publish — confirm step on reconnect for offline drafts)
active    → paused      (center pauses)
paused    → active      (center resumes)
active    → closed      (center marks fulfilled / cancels)
paused    → closed      (center cancels)
active    → expired     (cron: now > expires_at)
paused    → expired     (cron: now > expires_at)
```

`closed` and `expired` are terminal — no transitions out. Publishing sets `published_at` (first time only) and `expires_at = published_at + window_hours`.

> **Expiry cron.** A Vercel Cron job runs every ~5 min: `UPDATE request SET status='expired', closed_at=now(), closed_reason='expired' WHERE status IN ('active','paused') AND expires_at < now()`. Each flip writes a `moderation_event` with `action='expired_by_cron'`. Countdowns in the UI are computed client-side from `expires_at`; the cron is the source of truth for the actual state flip.

## 6. Relationships

```
center 1───* request 1───* request_item *───1 supply (nullable)
center 1───* membership *───1 app_user
request 1───* share_event
(center | request) 1───* moderation_event   [polymorphic subject]
```

- A `center` has many `request`s and many `membership`s.
- A `request` has many `request_item`s; each item optionally references a catalog `supply` (null ⇒ free-text via `custom_name`).
- `moderation_event` and `share_event` are append-only satellites.

## 7. Sync & offline columns

What the offline-draft-with-confirm flow (Tier 2) relies on, server-side:

- **Client-generated UUID `id`** on `request` and `request_item` — the client creates the row offline with its final id, so there's no id remap on sync.
- **`idempotency_key`** (unique) on `request` — the queued mutation carries it; a retried sync that already landed is a no-op insert, not a duplicate request.
- **`updated_at`** on every mutable row — supports last-write-wins and lets the client detect server-side changes during the confirm step.
- **`status='draft'` as the sync landing state** — an offline draft syncs as `draft`, then the **confirm-on-reconnect** action re-validates (window still makes sense? center still approved?) and transitions `draft → active`. We never auto-publish a synced draft.

> The IndexedDB queue, Background Sync registration, and the confirm-UI live in a separate offline spec. This section only fixes the **server columns** those depend on, so migrations don't need to change later.

## 8. Indexing & key query patterns

| Query (surface) | Support |
|---|---|
| Active list, sorted by recency | index on `(status, published_at desc)` |
| Active list, sorted by urgency | index on `(status, expires_at asc)` |
| Filter by city / center type | `request.city` (denormalized) for an index-only scan; center type via join or further denormalization if needed |
| Filter by supply category | `request.categories` (denormalized `text[]`) — GIN index, no join |
| Search "centro, ciudad o ayuda" | Postgres full-text / `pg_trgm` over center name, city, item names |
| Expiry cron sweep | partial index `WHERE status IN ('active','paused')` on `expires_at` |
| Landing stats (count active, count centers, last update) | cheap aggregates, cached |

> **Denormalization (decided: yes).** The donor list filters/sorts on center city + item category but reads from `request`. `request.city` and `request.categories text[]` are populated at publish time (and kept in sync on edit), turning the hot list query into a single-table, index-only scan — worth it for the surge.

## 9. Resolved decisions

- **No `priority`.** Urgency is purely time-left (`expires_at asc`); there is no manual priority flag. *(removed from §4.4)*
- **One user per center in v1.** `membership` retains the multi-staff shape, but v1 enforces a single membership per center. *(§4.3)*
- **Delivery always inherits from the center.** No per-request delivery columns; the request reads the center's address + regular schedule. *(§4.1, §4.4)*
- **No quantities.** Items are name + category only. *(§4.5)*
- **`surplus` as a `request.kind`.** Modeled via Option A — reuses the request entity wholesale. *(§4.4)*
- **Denormalize `city` + `categories[]` onto `request`.** Populated at publish, kept in sync on edit. *(§4.4, §8)*
- **Ship `share_event` in v1** as a thin write-only table. *(§4.8)*

## 10. Open questions for review

None remaining — the model is final pending the Drizzle schema + first migration.
