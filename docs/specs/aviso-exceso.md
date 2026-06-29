# Aviso de exceso (surplus) — scope

> **Status**: scoped — all decisions resolved (2026-06-29 review). Ready to slice.
> A center-level "don't bring these" notice. Supersedes the old surplus *rendering*; reuses the surplus *entity* under the hood.

## 1. What it is + the verdict

An **aviso de exceso** lets an approved center say *"we're overstocked — please **don't** bring these items right now."* It's a **center-level notice** (one active per center) that lists insumos-not-to-send, has a time window, and an optional reason. It surfaces as a **yellow banner** on the center dashboard, on each of the center's request details, and — critically — on the **donor** surface above that center's cards, so donors stop sending what's already piled up.

This is exactly the banner model we deferred in `center-workspace.md` §5.4 (surplus "as a banner, not a solicitud").

**Supersede or reuse? → Reuse the entity, supersede the rendering.**

`request.kind = 'surplus'` **already exists** (data-model §4.4: "reuses the request entity wholesale" — same lifecycle, window, expiry cron, sharing, `request_item` list). The seed already creates one ("Excedente de ropa"). So:

- **Reuse under the hood**: an aviso *is* a `request` with `kind='surplus'` + its `request_item` rows. No new entity, no parallel lifecycle/cron. ✅ (the cheaper, less-duplicative path)
- **Supersede the presentation**: the old plan rendered surplus as its own amber **"No enviar" card** (built today in `request-card.tsx` + `detail-body.tsx`). The new design replaces that with a **center-level banner** attached to the center's *need* cards. So we **remove the standalone surplus card** and add banner rendering.

> This **supersedes `data-model.md` §4.4's rendering note** ("renders as a distinct 'No enviar' card") — that file needs a follow-up edit. The *storage* decision (Option A, reuse `request`) stands.

## 2. Designed screens (Figma `Back Office`)

| Screen | Figma | Notes |
|---|---|---|
| Aviso form | `80:2048` | "Lo que no estamos aceptando" (items via the insumo selector), Ventana **12/24/48/Sin límite**, Razón (≤40). "Publicar aviso" / "Continuar sin aviso de exceso." |
| Aviso review (active) | `80:2590` | "Aviso activo · vence en 18 h", "Por favor no traigan:" chips, "Razón:". "Continuar sin cambios" / "Editar aviso." |
| Dashboard w/ aviso | `94:2788` | Yellow banner "Aviso de exceso activo · No aceptamos: … · vence en 18 h" + **Editar**. |
| Center detail w/ aviso | `94:3038` | Same banner inside each request detail ("No estás aceptando: …"). |
| Donor card w/ aviso | `94:2910` | Yellow banner **above** the center's donor card: "No aceptan: … · vence en 18 h". |

(IDs drift — the designer is editing live; re-resolve by name under section "Backoffice · Aviso de exceso".)

## 3. Data model — reuse `request(kind='surplus')` + small deltas

The aviso is a `request`: `kind='surplus'`, `status` lifecycle as-is, `request_item` = the excess items, `published_at`/`expires_at` as-is, `city` denormalized. Deltas needed (**migration `0006`**):

1. **`request.window_hours` → nullable.** "Sin límite" = `window_hours = null` + `expires_at = null` (indefinite; center removes it manually). Verify the expiry cron (`jobs.ts:expireDueRequests`) only flips rows with `expires_at <= now()` — a `null` expiry is excluded by SQL null-comparison, so sin-límite avisos never auto-clear. ✅
2. **One active aviso per center.** Partial unique index: `unique (center_id) where kind = 'surplus' and status = 'active'`. (A center can re-issue after the old one closes/expires.)
3. **Reason (≤40)** → **reuse `request.title`** (already `varchar(40)`, nullable). A surplus has no separate title; the reason *is* its descriptor. No new column. *(Decision — see §6.)*

So `0006` is two tiny changes (nullable `window_hours` + partial unique index). The seed's existing surplus row adapts (reason in `title`, which it already uses).

## 4. Donor surface change (the supersede)

Today `getActiveRequests` returns **all** active requests and the donor card/detail render `kind='surplus'` as a "No enviar" card. Change to:

- **Cards list = needs only.** `getActiveRequests` filters `kind='need'` for the card list.
- **Banners = per-center surplus.** New `getActiveSurplusByCenter()` → `Map<centerId, {items[], expiresAt, reason}>`. The list attaches each center's active aviso as a banner **above that center's need cards**; the need **detail** shows the same banner.
- **Remove** the standalone surplus path entirely (decision §6.4 — banner-only): the surplus card in `request-card.tsx` and the surplus rendering in `detail-body.tsx` (+ the `Tag variant="surplus"` "No enviar" treatment). An aviso has **no donor card, no `/solicitudes/<id>` page, no share row** — `getRequestById` should not serve a `kind='surplus'` row as a standalone page (404/redirect). Keep the amber treatment only as the **banner**.
- Caching: the banner data shares the donor surge cache — tag it `active-requests` (and bust on aviso publish/edit/remove via `revalidateTag(...,"max")`, like publish).

## 5. Center surface

- **Entry point = post-publish prompt** (decision §6.2). After a center publishes a solicitud (`7 · Solicitud publicada`), prompt *"¿hay algo que ya no necesitas?"* and offer the aviso form; **"Continuar sin aviso de exceso"** skips straight to the dashboard. Editing an existing aviso enters via the dashboard/detail banner's **Editar** → the review screen (`80:2590`) → form.
- **Aviso flow** at e.g. `/centro/aviso` (Spanish route): the form (`80:2048`) reusing the **insumo selector** (already built) for "lo que no estamos aceptando", the 12/24/48/**Sin límite** window (a 4th `SegmentedControl` option), Razón (≤40, stored in `title`). Edit reuses the same form pre-filled; review screen (`80:2590`) when one is already active.
- **Banner** component (shared): dashboard (`94:2788`), and each center request detail (`94:3038`) — "Aviso de exceso activo · No aceptamos: … · vence en Xh" + **Editar**.
- **Actions** (`"use server"`, async-only, gotcha #1): `publishAviso(input)` (insert surplus request + items; enforce one-active-per-center — replace/close any existing active first, or 23505 on the partial index → edit path), `updateAviso(id, input)`, `removeAviso(id)` (→ `status='closed'`). All `requireCenter()`-scoped, revalidate `active-requests`/`landing-stats`.

## 6. Decisions (resolved 2026-06-29)

1. **Reason → reuse `request.title`.** No new column.
2. **Entry point = post-publish prompt.** After a center publishes a solicitud (the `7 · Solicitud publicada` step), we **ask "¿hay algo que ya no necesitas?"** and offer the aviso form; "Continuar sin aviso de exceso" skips it. Plus the dashboard/detail banner's **Editar** to edit an existing aviso. (No separate menu entry needed for v1.)
3. **"Sin límite" = nullable `window_hours`** (+ null `expires_at`). Audit that no code assumes `window_hours` non-null before relaxing it.
4. **Banner-only — no standalone share.** An aviso is **not** an individually navigable donor page: no donor card, no `/solicitudes/<id>` detail, no share row. (See §4 — remove the surplus path from `detail-body.tsx`, and `getRequestById` should not serve a surplus as a standalone page.)

## 7. Slices (suggested)

- **5.1 — data + donor supersede**: migration `0006`, switch donor list/detail from surplus-card → per-center banner, the shared banner component, center dashboard/detail banners (read-only). Verifiable via the existing seeded surplus.
- **5.2 — author the aviso**: the form/edit/review flow + `publishAviso`/`updateAviso`/`removeAviso` actions + entry point; e2e drives a real publish → banner appears on the donor list + dashboard, and remove → banner gone.

Rough: 5.1 `~1d` · 5.2 `~1d`. Also a small **follow-up to `data-model.md` §4.4** (rendering note) and the **Extender additive-semantics fix** (separate; flagged from the same Figma scan).
