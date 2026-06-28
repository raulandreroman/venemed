# VeneMed — Backend fields, expiry cron & share tracking (0001)

> **Status**: draft. Last updated 2026-06-28.
> Implementation spec for the `feat/backend-fields-cron` pass. Adds two `request` columns (migration 0001), surfaces them in the donor UI, makes the card "Compartir" actually share, ships the expiry cron from `docs/specs/cron-jobs.md`, and wires the `recordShare` server action + precise cache tags. Related: `docs/specs/data-model.md` (§4.4 request, §4.8 share_event), `docs/specs/cron-jobs.md`.

## 1. Purpose & scope

This pass closes the gap between the donor slice as shipped and three things the data/cron specs already call for but the code doesn't yet do:

1. **Center-written descriptor + per-request delivery instructions.** The donor card shows a bold one-line summary (Figma list 30:15714) and the detail's "Dónde entregar" should carry instructions specific to *this* drop-off, not only the center's static address. Today there is no field for either. We add `request.title` and `request.delivery_instructions`.
2. **The expiry cron** (`docs/specs/cron-jobs.md`) is fully specified but unbuilt — no `src/db/jobs.ts`, no route, no `vercel.json`, no `CRON_SECRET`. Expired requests currently only drop off the list via the 60 s ISR window; nothing ever flips `status` to `expired`.
3. **Share tracking.** `share_event` and `request.share_count` exist in the schema but nothing writes them — the share UI builds intent URLs and stops. We add a `recordShare` server action and wire every share affordance to it. As a precondition, the card "Compartir" button (today just a `<Link>` to the detail) must become a real share control.

In scope: migration 0001, seed backfill, the two UI surfaces, the card share fix, the cron job + route + config + env, the `recordShare` action, and the cache-tag wiring the cron and the action both depend on. Out of scope: center-side authoring of these fields (no center dashboard yet), the optional liveness/health-check cron (§8 of cron-jobs.md), and PostHog instrumentation (logged as a follow-up).

> **Branch & deploy posture.** Work lands on `feat/backend-fields-cron` and ships via PR. `main` is protected — never push to it. There is **one** Supabase DB shared by dev and the live prod site; migration 0001 is **additive (new nullable columns)**, so it is safe to apply while prod serves traffic. Re-running the seed briefly resets *sample* data only (no real users exist yet) — acceptable.

> **CI gate.** Both `pnpm lint` and `npx tsc --noEmit` must stay green, plus `pnpm build`. Watch the project-specific eslint rules — e.g. a synchronous `setState` inside an effect is an error here. Every code change below is written to keep all three green.

## 2. Deliverables at a glance

| # | Area | Files |
|---|---|---|
| 1 | Schema + migration | `src/db/schema.ts`, `src/db/migrations/0001_*.sql` (+ `meta/`) |
| 2 | Seed backfill | `src/db/seed.ts` |
| 3 | Query selections + types | `src/db/queries.ts` |
| 4 | Card descriptor + real share | `src/components/ui/request-card.tsx` |
| 5 | Detail title + delivery instructions | `src/app/(public)/solicitudes/[id]/_components/detail-body.tsx` |
| 6 | Share action | `src/db/jobs.ts` *(cron)* + a new `src/app/actions/share.ts` *(server action)* |
| 7 | Cron route + config + env | `src/app/api/cron/expire-requests/route.ts`, `vercel.json`, `.env.example` |
| 8 | Share wiring | `src/components/share-section.tsx`, `src/app/(public)/solicitudes/[id]/_components/share-cta-button.tsx`, `src/components/ui/request-card.tsx` |

## 3. Migration 0001 — `title` + `delivery_instructions`

### 3.1 Schema edit (`src/db/schema.ts`)

Add `varchar` to the `drizzle-orm/pg-core` import and two columns to the `request` table. Place them right after `kind`/`status` so the descriptor reads as a first-class part of the row.

```ts
// import block — add varchar
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,        // ← new
  boolean,
  smallint,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
```

```ts
// inside request = pgTable("request", { ... }) — after `status`
  // center-written descriptor for the donor card/detail (data-model §4.4; Figma 30:15714).
  // NULLABLE in DB so 0001 applies additively over live rows; required at the app
  // layer for any new request (enforced when center authoring ships).
  title: varchar("title", { length: 40 }),
  // per-request delivery instructions shown under "Dónde entregar" — augments the
  // center's static address with drop-off specifics for THIS request.
  deliveryInstructions: varchar("delivery_instructions", { length: 120 }),
```

> **Divergence from data-model §4.4, recorded deliberately.** The data-model currently says delivery details *always inherit from the center* with "no per-request delivery columns in v1." Designers' A4-7 + this pass add a per-request `delivery_instructions` override. The center address/reference/schedule still render as the base; `delivery_instructions` is an *additive* per-request note layered on top (see §6.2). Update data-model §4.4 to match in the same PR (one-line amendment) so the two specs don't drift.

Field rules:

- **`title`** — `varchar(40)`. Short noun phrase the center writes, e.g. "Insumos pediátricos". Rendered bold on the card and as the page `<h1>`-adjacent summary on the detail. NULL allowed in DB; required at the app layer for new requests.
- **`delivery_instructions`** — `varchar(120)`. One-to-two sentence drop-off note, e.g. "Entregar en emergencia, planta baja. Preguntar por la Lic. Mora." NULL allowed; optional even at the app layer (the center address alone is a valid minimum).

### 3.2 Generating the migration

Run `pnpm db:generate`. Drizzle writes `src/db/migrations/0001_<slug>.sql` and updates `meta/_journal.json` + a new snapshot. The generated SQL must be the additive form — confirm it reads like:

```sql
ALTER TABLE "request" ADD COLUMN "title" varchar(40);--> statement-breakpoint
ALTER TABLE "request" ADD COLUMN "delivery_instructions" varchar(120);
```

No `NOT NULL`, no default backfill, no table rewrite — `ADD COLUMN` of a nullable column is a metadata-only change in Postgres and is safe against the live prod table. Apply with `pnpm db:migrate` (uses `POSTGRES_URL_NON_POOLING`, the direct connection, per `drizzle.config.ts`).

> Do **not** hand-write the SQL — generate it so the snapshot/journal stay consistent with the schema. If `db:generate` produces a different filename slug, that's expected (random); commit whatever it emits.

## 4. Seed backfill (`src/db/seed.ts`)

Give each sample request a realistic Spanish `title` and `deliveryInstructions`. Add the two keys to the three existing `request` inserts (`reqA`, `reqB`, `reqC`). Suggested values, matched to the existing centers/items:

| Request | `title` | `deliveryInstructions` |
|---|---|---|
| `reqA` (Hospital J.M. de los Ríos, need, pediatrics) | `"Insumos pediátricos"` | `"Entregar en Recepción de donaciones, entrada principal. Preguntar por la coordinadora de turno."` |
| `reqB` (Refugio Casa Esperanza, need, general+pediatrics) | `"Higiene y limpieza"` | `"Portón azul, timbre 2. Recibimos en horario de la mañana preferiblemente."` |
| `reqC` (Refugio Casa Esperanza, surplus, general) | `"Excedente de ropa"` | `"No traer más ropa usada por ahora; el depósito está lleno."` |

Example edit for `reqA` (apply the same shape to B and C):

```ts
  .values({
    centerId: centerId("Hospital J.M. de los Ríos"),
    kind: "need",
    status: "active",
    title: "Insumos pediátricos",
    deliveryInstructions:
      "Entregar en Recepción de donaciones, entrada principal. Preguntar por la coordinadora de turno.",
    windowHours: 12,
    publishedAt: jmRiosPublished,
    expiresAt: hoursFromNow(jmRiosPublished, 12),
    city: "Caracas",
    categories: ["pediatrics"],
  })
```

Keep each `title` ≤ 40 chars and each `deliveryInstructions` ≤ 120 chars to respect the column limits (the suggested values above already fit). Update the closing `console.log` line if you like, but no count changes are needed. Re-run with `pnpm db:seed` after the migration is applied.

## 5. Query selections + types (`src/db/queries.ts`)

### 5.1 Types

Add `title` to `RequestCardData` (the card needs it) and `deliveryInstructions` to `RequestDetailData` (only the detail needs it; keep the card payload lean).

```ts
export type RequestCardData = {
  id: string;
  kind: "need" | "surplus";
  city: string | null;
  title: string | null;            // ← new: center-written descriptor
  centerName: string;
  centerDescription: string | null;
  centerType: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  windowHours: number;
  categories: string[] | null;
  items: RequestItemData[];
};

export type RequestDetailData = RequestCardData & {
  status: "active" | "paused" | "closed" | "expired" | "draft";
  deliveryInstructions: string | null;  // ← new: per-request drop-off note
  closedAt: Date | null;
  closedReason: "fulfilled" | "cancelled" | "expired" | null;
  shareCount: number;
  center: { /* unchanged */ };
  items: (RequestItemData & { isFulfilled: boolean })[];
};
```

### 5.2 Selections + mappers

- In `queryActiveRequests` — add `title: request.title` to the `.select({...})` and `title: r.title` to the returned object map.
- In `queryRequestById` — add `title: request.title` and `deliveryInstructions: request.deliveryInstructions` to the `.select({...})`, and `title: r.title` + `deliveryInstructions: r.deliveryInstructions` to the returned object.

No `WHERE`/`ORDER BY` changes. Both new columns are plain passthroughs.

### 5.3 Cache tags (precise revalidation)

The cron (§7) and `recordShare` (§8) need to invalidate exactly the right cached reads. The existing tags are *close* but the cron-jobs spec (§7) names `active-requests` and `landing-stats`, while the code currently tags `requests` and `stats`. **Standardize on the cron-jobs spec's tag names** so cron + action + queries all agree:

| Reader | Current tag(s) | Target tag(s) |
|---|---|---|
| `getActiveRequests` | `["requests"]` | `["active-requests"]` |
| `getRequestById` | `["requests", \`request:${id}\`]` | `["active-requests", \`request:${id}\`]` |
| `getLandingStats` | `["stats"]` | `["landing-stats"]` |

Edits:

```ts
// getActiveRequests
return unstable_cache(
  () => queryActiveRequests(normalized),
  ["active-requests", key],
  { revalidate: 60, tags: ["active-requests"] },   // ← was ["requests"]
)();

// getRequestById
return unstable_cache(() => queryRequestById(id), ["request", id], {
  revalidate: 60,
  tags: ["active-requests", `request:${id}`],      // ← was ["requests", ...]
})();

// getLandingStats
return unstable_cache(queryLandingStats, ["landing-stats"], {
  revalidate: 60,
  tags: ["landing-stats"],                          // ← was ["stats"]
})();
```

> Why keep `active-requests` on the detail read too: when the cron flips a request to `expired`, the detail must re-fetch so a donor who deep-links doesn't see a just-expired request as active. Tagging the detail with both the list tag and its own id tag means *either* a broad list invalidation *or* a targeted `request:<id>` invalidation refreshes it. `getRequestById`'s own `revalidate: 60` stays as the backstop.

## 6. Donor UI surfaces

### 6.1 Card descriptor (`src/components/ui/request-card.tsx`)

There's a TODO placeholder already (`{/* TODO(descriptor)... */}`). Replace it: render `request.title` as a bold summary line under the center name, falling back to nothing when absent. Keep `centerDescription` as the lighter secondary line beneath it.

```tsx
{/* center */}
<h3 className="mt-3 text-lg font-bold leading-tight text-neutral-900">
  {request.centerName}
</h3>
{request.title && (
  <p className="mt-1 text-[15px] font-semibold text-neutral-900">
    {request.title}
  </p>
)}
{request.centerDescription && (
  <p className="mt-0.5 text-sm text-neutral-500">
    {request.centerDescription}
  </p>
)}
```

### 6.2 Detail: title + delivery instructions (`detail-body.tsx`)

**Title** — render `req.title` as the bold summary line under the center name in *both* `ActiveDetailBody` and `ClosedDetailBody` (same treatment as the card, so closed/expired detail still shows what was requested):

```tsx
<h1 className="mt-3 text-[22px] font-bold leading-tight text-neutral-900">
  {req.centerName}
</h1>
{req.title && (
  <p className="mt-1 text-[15px] font-semibold text-neutral-900">{req.title}</p>
)}
{req.centerDescription && (
  <p className="mt-1 text-sm text-neutral-500">{req.centerDescription}</p>
)}
```

**Delivery instructions** — in `ActiveDetailBody`'s "Dónde entregar" section, render `req.deliveryInstructions` as a distinct, emphasized line *after* the center address/reference and *before* the map link, so it reads as the per-request specifics layered on the center's base address:

```tsx
{/* dónde entregar */}
<section>
  <h2 className="text-lg font-semibold text-neutral-900">Dónde entregar</h2>
  {center.addressLine && (
    <p className="mt-2 text-[15px] text-neutral-900">{center.addressLine}</p>
  )}
  {center.addressReference && (
    <p className="mt-2 text-sm text-neutral-500">{center.addressReference}</p>
  )}
  {req.deliveryInstructions && (
    <p className="mt-2 rounded-xl bg-neutral-100 px-4 py-3 text-[15px] text-neutral-900">
      {req.deliveryInstructions}
    </p>
  )}
  <MapLink query={mapQuery(center.addressLine, center.city)} />
</section>
```

The closed/expired body keeps "Centro receptor" address-only — no delivery instructions on a request that can no longer receive drop-offs.

## 7. Expiry cron (per `docs/specs/cron-jobs.md`)

### 7.1 `src/db/jobs.ts` — `expireDueRequests()`

New server-only module. Runs the single idempotent UPDATE (cron-jobs §3), bulk-inserts one `moderation_event` per flipped row, and revalidates exactly the affected tags (§7 of cron-jobs, reconciled with §5.3 tag names here).

```ts
import "server-only";
import { and, inArray, lt, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "./index";
import { request, moderationEvent } from "./schema";

export async function expireDueRequests(): Promise<{ expired: number }> {
  // Flip active/paused requests whose window has lapsed. WHERE clause makes this
  // idempotent + concurrency-safe (a second run flips nothing extra). DB now() is
  // the single clock (timestamptz) — no app-side time involved.
  const flipped = await db
    .update(request)
    .set({ status: "expired", closedAt: sql`now()`, closedReason: "expired" })
    .where(
      and(
        inArray(request.status, ["active", "paused"]),
        lt(request.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: request.id });

  if (flipped.length === 0) return { expired: 0 }; // empty run: skip audit + revalidate

  // Audit: one append-only event per flipped row (actor = null = system/cron).
  await db.insert(moderationEvent).values(
    flipped.map((r) => ({
      actorUserId: null,
      subjectType: "request" as const,
      subjectId: r.id,
      action: "expired_by_cron",
    })),
  );

  // Precise revalidation so a just-expired request never renders as active.
  revalidateTag("active-requests");
  revalidateTag("landing-stats");
  for (const r of flipped) revalidateTag(`request:${r.id}`);

  return { expired: flipped.length };
}
```

Notes:
- No `kind` filter → `surplus` notices expire on the same schedule as `need` (cron-jobs §3).
- `paused` included for correctness/future even though it's unused in the v1 UI.
- Batching cap (`LIMIT 500`) is *not* added at v1 volumes; if added later, log on hitting the cap (no silent truncation).

### 7.2 `src/app/api/cron/expire-requests/route.ts`

```ts
import { NextResponse } from "next/server";
import { expireDueRequests } from "@/db/jobs";

export const dynamic = "force-dynamic"; // never cached
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { expired } = await expireDueRequests();
  return NextResponse.json({ ok: true, expired });
}
```

- `GET` only (Vercel cron uses GET). Returns `{ ok: true, expired: N }`.
- Rejects any request whose `Authorization` header doesn't exactly match `Bearer ${CRON_SECRET}` → 401. Vercel auto-sends this header on cron-invoked routes when `CRON_SECRET` is set.

### 7.3 `vercel.json` (project root) — default, dependency-free

Declare the cron in `vercel.json`. This is the documented, zero-dependency path and the one to ship:

```json
{
  "crons": [{ "path": "/api/cron/expire-requests", "schedule": "*/5 * * * *" }]
}
```

Every 5 minutes (Vercel Pro allows arbitrary frequency). Crons only run against the **production** deployment; trigger manually for preview/local (§9).

> **Why `vercel.json` and not `vercel.ts`.** This project does **not** have `@vercel/config` in `package.json` (verified), so a `vercel.ts` with `import { type VercelConfig } from "@vercel/config/v1"` fails `npx tsc --noEmit` and `pnpm build` — directly violating acceptance criteria #2 and #3. `vercel.json` requires no dependency, is read by Vercel the same way, and keeps CI green.
>
> The `vercel.ts` form is **only** an option if `@vercel/config` is first added to `dependencies` *and* `pnpm build` + `npx tsc --noEmit` are verified green with it present. Do not introduce `vercel.ts` speculatively — the cron-jobs §5 preference for `.ts` does not override the build gate. If you do add the dependency and verify the build, the equivalent config is:
> ```ts
> import { type VercelConfig } from "@vercel/config/v1";
> export const config: VercelConfig = {
>   crons: [{ path: "/api/cron/expire-requests", schedule: "*/5 * * * *" }],
> };
> ```
> Ship exactly one of the two files, never both.

### 7.4 `CRON_SECRET` env var

- Add `CRON_SECRET="..."` to `.env.example` (with a comment that Vercel auto-injects it as the bearer token on cron-invoked routes).
- Add the real value in Vercel project settings for **all environments** (Production at minimum; Preview so manual triggers work). Not committed.

## 8. Share tracking + card "Compartir" fix

### 8.1 `recordShare` server action (`src/app/actions/share.ts`)

New file, `"use server"`. This action is **unauthenticated** (any anonymous visitor can invoke it as an RPC), so it must guard its writes — without a guard, a caller could pass any string to insert unbounded `share_event` rows, inflate `share_count` on arbitrary ids, and repeatedly fire `revalidateTag("landing-stats")` + `revalidateTag(\`request:${id}\`)` to bust the shared caches on every call (cache-invalidation amplification under surge). Two minimal safeguards (no more — don't over-build into rate-limiting/captcha here):

1. **Validate `requestId` is a UUID** before touching the DB. A non-UUID is rejected outright (the column is `uuid`, so a malformed id can't match anyway, but rejecting early avoids a pointless round-trip and the revalidate calls).
2. **Gate every write + revalidate behind a real active request.** Do the counter bump as an `UPDATE ... WHERE id = ? AND status = 'active' RETURNING id`. Only when a row is actually returned (the id exists *and* is active) do we insert the `share_event` and revalidate. This bounds writes to genuine, shareable requests and makes the revalidate count fan-out track real activity instead of attacker volume.

Channel is the existing `share_channel` enum: `whatsapp | instagram | x | copy_link | unknown`.

```ts
"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db/index";
import { request, shareEvent } from "@/db/schema";

export type ShareChannel = "whatsapp" | "instagram" | "x" | "copy_link" | "unknown";

// RFC-4122 shape check — cheap reject before any DB/cache work.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordShare(
  requestId: string,
  channel: ShareChannel = "unknown",
): Promise<void> {
  if (!UUID_RE.test(requestId)) return; // not a real id — no writes, no revalidate

  await db.transaction(async (tx) => {
    // Bump the denormalized counter AND assert the request exists + is active in
    // one statement. RETURNING tells us whether anything was actually affected.
    const bumped = await tx
      .update(request)
      .set({ shareCount: sql`${request.shareCount} + 1` })
      .where(and(eq(request.id, requestId), eq(request.status, "active")))
      .returning({ id: request.id });

    if (bumped.length === 0) return; // unknown or non-active id → no event, no revalidate

    // Only now, for a confirmed active request, write the analytics row...
    await tx.insert(shareEvent).values({ requestId, channel });

    // ...and refresh the detail (share_count) + the landing share aggregate.
    revalidateTag(`request:${requestId}`);
    revalidateTag("landing-stats");
  });
}
```

Notes:
- `share_count` increment uses a SQL expression (`shareCount + 1`), not read-modify-write — safe under concurrency.
- The UUID check + `status = 'active'` rowcount gate together bound writes and cache invalidation to real, active requests. An anonymous caller can't inflate counts on arbitrary/closed ids or repeatedly bust the shared `landing-stats` / `request:<id>` caches — the `revalidateTag` calls only run when a row was actually flipped.
- `revalidateTag` runs inside the transaction callback *after* the gate, so it never fires for a rejected id. (It is not transactional itself — that's fine; it's a cache hint, and we only reach it on a confirmed write.)
- Fire-and-forget from the client: callers invoke it but do not block the share UX on its resolution (the navigator.share / window.open happens regardless). Because this is a server action invoked over RPC, **callers must attach `.catch(() => {})`** (see §8.2/§8.3) — a bare `void recordShare(...)` leaks an unhandled promise rejection when the action throws. The "failures are swallowed client-side" guarantee is delivered by that `.catch`, not by `void`.
- Don't revalidate `active-requests`: the card doesn't show share counts, so a list-wide invalidation per share would be wasteful churn.

### 8.2 Card "Compartir" — make it actually share (`request-card.tsx`)

Today both footer buttons are `<Link>`s to the detail. The "Ver detalle" button stays a link. The "Compartir" button must become a real share control mirroring `ShareCtaButton`: native `navigator.share` when available, else navigate to the detail's `#comparte` section so the donor can pick a channel.

Because the card is a Server Component (no `"use client"`), extract the share affordance into a small client component and drop it into the footer. New file `src/components/ui/share-card-button.tsx`:

```tsx
"use client";
import { useCallback } from "react";
import { Button } from "./button";
import { recordShare, type ShareChannel } from "@/app/actions/share";

export function ShareCardButton({
  requestId,
  message,
  path,
}: {
  requestId: string;
  message: string;
  path: string;
}) {
  const onClick = useCallback(async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url });
        // fire-and-forget; .catch swallows a failed RPC (NOT bare `void` — that
        // would surface the server action's rejection as an unhandled rejection).
        recordShare(requestId, "unknown").catch(() => {}); // native sheet: channel unknown
        return;
      } catch {
        // cancelled/unsupported — fall through to the detail's share section
      }
    }
    window.location.href = `${path}#comparte`;
  }, [requestId, message, path]);

  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="flex-1">
      <ShareArrow />
      Compartir
    </Button>
  );
}
```

In `request-card.tsx`, build a short share message (the card already has `centerName`/`city`/`title`), replace the `<Button … href>` "Compartir" with `<ShareCardButton …/>`, and keep "Ver detalle" as-is. Move the existing `ShareArrow` glyph into the client component (or export it) so both compile. Suggested message helper:

```ts
const shareMessage =
  `Ayuda a ${request.centerName}${request.city ? ` (${request.city})` : ""} en VeneMed:`;
```

> Keep the lint rule in mind: the `onClick` handler is `async` but used as an event handler — that's fine; do **not** introduce a `setState`-in-effect. The "Copiado" feedback already lives in `ShareSection`; the card button has no transient state.

### 8.3 Wire the detail share buttons

- **`share-section.tsx`** — accept a new `requestId: string` prop. In each handler, call `recordShare(requestId, channel)` with the right channel right before/after firing the intent: `shareWhatsApp → "whatsapp"`, `shareX → "x"`, `shareInstagram → navigator.share ? "instagram" : "copy_link"`, `copyLink → "copy_link"`. It's a Client Component already; importing the server action and calling it is allowed (Next wires it as an RPC). Use `recordShare(...).catch(() => {})` so the UI never awaits analytics **and** a failed RPC never surfaces as an unhandled promise rejection — a bare `void recordShare(...)` does *not* swallow the rejection.
- **`share-cta-button.tsx`** — accept `requestId`, call `recordShare(requestId, "unknown").catch(() => {})` after a successful `navigator.share` (the scroll-to-`#comparte` fallback records nothing; the channel button the donor then taps in `ShareSection` records it).
- **`detail-body.tsx`** — thread `req.id` into both `<ShareSection requestId={req.id} …/>` and `<ShareCtaButton requestId={req.id} …/>`.

> Don't double-count: the CTA button only records on a *successful* native share. When it falls back to scrolling, the eventual `ShareSection` channel tap is the single recorded event.

## 9. Testing & manual verification

- **Migration applies:** `pnpm db:generate` produces additive `ADD COLUMN` SQL; `pnpm db:migrate` succeeds against the shared DB without locking the live table.
- **Seed:** `pnpm db:seed` runs clean; sample requests show titles + delivery instructions in the UI.
- **Cron auth:** `curl -i https://<deploy>/api/cron/expire-requests` → **401**. `curl -H "Authorization: Bearer $CRON_SECRET" …` → `200 {"ok":true,"expired":N}`.
- **Cron flip:** seed a row with `expires_at` in the past → one run flips it to `expired`, writes one `moderation_event` (`action='expired_by_cron'`), and the detail re-renders as closed. Run twice → second run returns `{ expired: 0 }` (idempotent).
- **Share increments count:** tap a share channel on the detail → a `share_event` row is inserted and `request.share_count` increments by 1; landing share stat reflects it after revalidation. Card "Compartir" with `navigator.share` present opens the native sheet and records `unknown`; without it, navigates to `#comparte`.
- **Share guard:** calling `recordShare` with a non-UUID string, an unknown id, or a non-active request's id writes **no** `share_event`, increments **no** counter, and fires **no** `revalidateTag` (confirm via DB row counts + that `share_count` is unchanged). A failed action call on the client logs nothing user-visible and never throws an unhandled rejection (the `.catch(() => {})` swallows it).
- **Card descriptor / detail instructions:** card shows the bold `title`; detail shows `title` + the `delivery_instructions` block under "Dónde entregar".

## 10. Acceptance criteria

1. `pnpm lint` passes (no new eslint errors, including the no-`setState`-in-effect rule).
2. `npx tsc --noEmit` passes (new types/props/exports all resolve).
3. `pnpm build` succeeds.
4. Migration 0001 is additive (two nullable `varchar` columns), generated via `db:generate`, and applies cleanly to the shared Supabase DB while prod runs.
5. Seed backfills realistic Spanish `title` + `delivery_instructions` on all sample requests.
6. Donor card renders `request.title` as the bold summary; detail renders `title` + `delivery_instructions` in "Dónde entregar".
7. Card "Compartir" performs a real share (native or `#comparte` fallback) — no longer a plain detail link.
8. Cron route returns **401** without the correct `CRON_SECRET` bearer, and `{ ok, expired }` with it; `expireDueRequests` is idempotent and writes audit events.
9. `vercel.json` declares the `*/5 * * * *` cron for `/api/cron/expire-requests` (the dependency-free default; `vercel.ts` only if `@vercel/config` is added and the build is verified green); `CRON_SECRET` is in `.env.example` and set in Vercel.
10. `recordShare(requestId, channel)` validates `requestId` as a UUID and only inserts a `share_event` + increments `request.share_count` + revalidates when an `UPDATE ... WHERE id = ? AND status = 'active' RETURNING` affects a row (a non-UUID, unknown, or non-active id is a no-op — no writes, no cache invalidation). All detail + card share affordances call it with the correct channel as `recordShare(...).catch(() => {})` (never a bare `void`), so a failed RPC is swallowed and never surfaces as an unhandled promise rejection.
11. `getActiveRequests` / `getRequestById` / `getLandingStats` tag their cached reads (`active-requests` / `request:<id>` / `landing-stats`) so the cron and `recordShare` revalidate precisely.
12. Lands via PR onto `feat/backend-fields-cron`; `main` untouched.

## 11. File list (created / modified)

**Created**
- `src/db/migrations/0001_<slug>.sql` (+ updated `meta/_journal.json`, new snapshot) — generated
- `src/db/jobs.ts` — `expireDueRequests()`
- `src/app/api/cron/expire-requests/route.ts` — cron GET handler
- `src/app/actions/share.ts` — `recordShare` server action + `ShareChannel` type
- `src/components/ui/share-card-button.tsx` — client share control for the card
- `vercel.json` — cron schedule (dependency-free; `vercel.ts` only if `@vercel/config` is added to deps and the build is verified green)

**Modified**
- `src/db/schema.ts` — `varchar` import + `title` / `deliveryInstructions` columns
- `src/db/seed.ts` — backfill title + delivery instructions on the 3 sample requests
- `src/db/queries.ts` — types (`RequestCardData.title`, `RequestDetailData.deliveryInstructions`), selections, mappers, cache-tag rename
- `src/components/ui/request-card.tsx` — descriptor line + `ShareCardButton` in footer
- `src/app/(public)/solicitudes/[id]/_components/detail-body.tsx` — title line (both bodies) + delivery-instructions block; thread `req.id` into share components
- `src/components/share-section.tsx` — `requestId` prop + `recordShare` calls per channel
- `src/app/(public)/solicitudes/[id]/_components/share-cta-button.tsx` — `requestId` prop + `recordShare` on native share
- `.env.example` — `CRON_SECRET`
- `docs/specs/data-model.md` — one-line §4.4 amendment (per-request `delivery_instructions` now exists)
