# VeneMed — Donor Vertical Slice (Implementation Spec)

> **Status**: ready to build. Last updated 2026-06-28.
> **Scope**: the logged-out **donor** experience under `src/app/(public)`, reading the real seeded data (2 approved centers, 3 active requests incl. 1 surplus, 6 items, 6 supplies). This is the surge-facing **read path** — it must be cached and must not hit the DB on every request.
> **Related**: `docs/specs/data-model.md` (source of truth for the schema). Stack is already scaffolded (Next.js 16 App Router, React 19 RSC, TypeScript, Tailwind v4, Drizzle/postgres-js). **Do not re-scaffold.**

---

## 1. Goal & non-goals

### Goal
Ship a demo-able donor slice of three routes that render the seeded data with working filter/sort and a distinct surplus rendering, matching the Figma UI Kit visual language, mobile-first at 390px, in Spanish (Venezuela). `pnpm build` must pass.

### Out of scope (explicit)
- **Auth / OTP / sessions** — donor surface is fully logged-out. The "Solicitar acceso al portal" CTA links to `/centro` (existing stub) but no auth flow is built here.
- **Center back office** `(center)` and **admin moderation** `(admin)` surfaces.
- **Offline / PWA / IndexedDB / Background Sync** — read path only; no service worker.
- **Real share analytics writes** (`share_event` inserts, `share_count` increments). Share buttons build the share intent URLs only; persisting a `share_event` is a later slice.
- **Maps** — "Abrir en mapas" renders as a link/affordance only; no embedded map (lat/lng are out of v1 UI per data-model §4.1).
- **Pagination / infinite scroll** — the seeded list is small; render the full active list.
- Mutations of any kind. The whole slice is read-only against Postgres.

---

## 2. Source designs (Figma `tGvDuvWW99K4QzDH0GlmW7`)

| Screen | Node | Notes |
|---|---|---|
| Landing `/` | `11:3` | header, hero, live stats, "Cómo funciona", 3 request cards, center CTA, footer |
| Active list `/solicitudes` | `30:15714` | search, filter chips, sort toggle, full card list |
| Detail (active) `/solicitudes/[id]` | `20:2` | app bar, tags, center, countdown+progress, items, dónde/cuándo, share |
| Detail (closed/expired) | `20:73` | "Cumplida" tag, closed banner, "Qué se pidió", "Centro receptor", no countdown/share |
| "Cómo ayudar" share sheet | `30:16798` | bottom sheet: Cuándo / Dónde / Abrir en mapas / Comparte |

Re-read any node with `get_design_context` / `get_screenshot` / `get_metadata` (fileKey above) during implementation. Key visual facts observed:
- Primary blue button (full-width, rounded), white surface cards with subtle border/shadow on a light-gray page.
- Card anatomy: city pill (top-left) + urgency pill (top-right, red dot "Vence en N h"), center name (bold), center description line, then up to ~2 rows of item chips + "+N más", a muted "Solicitado hace…/ayer…" line, and a footer row with "Compartir" (ghost) + "Ver detalle" (primary).
- Detail countdown is a red-tinted block: big "Vence en N horas", "Publicado hace N h · ventana de N h", and a horizontal progress bar (elapsed/window).
- Closed detail swaps the red block for a green banner ("Esta solicitud se cerró el …"), heading "Qué se pidió" (past tense), "Centro receptor", and removes the share section; bottom CTA becomes "Ver solicitudes activas".

---

## 3. Routes

All routes live under `src/app/(public)`. Each route file is a React Server Component that calls the data-access layer (§5) directly.

| Path | File | Rendering | Cache |
|---|---|---|---|
| `/` | `(public)/page.tsx` | Static-ish RSC | `export const revalidate = 60` (ISR, 60 s) |
| `/solicitudes` | `(public)/solicitudes/page.tsx` | RSC reading `searchParams` | `export const revalidate = 60`; data via `unstable_cache` (see §4) |
| `/solicitudes/[id]` | `(public)/solicitudes/[id]/page.tsx` | RSC, dynamic param | `export const revalidate = 60` |

Supporting files:
- `(public)/layout.tsx` — optional shared shell (max-width 390px container, font), or rely on root layout. Add `lang="es"` fix (see §10).
- `(public)/solicitudes/[id]/not-found.tsx` — for unknown ids (`notFound()` from `next/navigation`).

### Caching strategy (must-have)
This is the surge read path. Two layers:
1. **Route segment ISR**: `export const revalidate = 60` on all three pages → HTML served from the CDN, regenerated at most once per minute.
2. **Query memoization**: wrap each query in `unstable_cache(fn, keyParts, { revalidate: 60, tags: [...] })` so even regenerations and the filtered list dedupe DB work.
   - `getLandingStats` → tag `["stats"]`, key `["landing-stats"]`.
   - `getActiveRequests` → key includes the normalized filter/sort params; tag `["requests"]`.
   - `getRequestById` → key `["request", id]`; tag `["requests", "request:"+id]`.
   - A later center/admin mutation slice will call `revalidateTag("requests")` / `revalidateTag("stats")` on publish/close. Not built here, but tag now so it's free later.

> The `/solicitudes` page reads `searchParams`, which normally forces dynamic rendering. That is acceptable: the **DB work** is still cached by `unstable_cache` keyed on the params, so distinct filter combinations memoize and the DB is not hit per request. Keep the page's data call inside the cached function; do not add `force-dynamic`.

---

## 4. Data-access layer — `src/db/queries.ts`

Single module, server-only (`import "server-only";` at top). Exports three functions. All use the existing `db` from `src/db/index.ts` and Drizzle operators. The list relies on the **denormalized** `request.city` and `request.categories[]` (no center/item join needed for filtering — only for display).

### Shared types

```ts
export type RequestSort = "recent" | "urgency"; // Reciente | Urgencia
export type RequestFilters = {
  search?: string;   // matches center name, city, or item name
  city?: string;     // request.city
  type?: string;     // center.type enum value
  category?: string; // a value present in request.categories[]
  sort?: RequestSort; // default "recent"
};

export type RequestCardData = {
  id: string;
  kind: "need" | "surplus";
  city: string | null;
  centerName: string;
  centerDescription: string | null;
  centerType: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  windowHours: number;
  categories: string[] | null;
  items: { id: string; name: string; category: string }[]; // name = supply.name ?? custom_name
};

export type RequestDetailData = RequestCardData & {
  status: "active" | "paused" | "closed" | "expired" | "draft";
  closedAt: Date | null;
  closedReason: "fulfilled" | "cancelled" | "expired" | null;
  center: {
    name: string; description: string | null; city: string; type: string;
    addressLine: string | null; addressReference: string | null;
    regularScheduleText: string | null;
  };
  items: { id: string; name: string; category: string; isFulfilled: boolean }[];
};
```

### 4.1 `getActiveRequests(filters): Promise<RequestCardData[]>`

Donor surface shows **only `active` and `closed`** requests, but the *list* page shows the live feed → filter to `status = 'active'`. (`closed` is reachable by direct detail link, not listed.)

Drizzle sketch:

```ts
import { and, eq, ilike, or, sql, asc, desc, arrayContains } from "drizzle-orm";
import { request, center, requestItem, supply } from "./schema";

// base: single-table-ish scan on request, join center for name/desc/type/search
const rows = await db
  .select({
    id: request.id,
    kind: request.kind,
    city: request.city,
    categories: request.categories,
    publishedAt: request.publishedAt,
    expiresAt: request.expiresAt,
    windowHours: request.windowHours,
    centerName: center.name,
    centerDescription: center.description,
    centerType: center.type,
  })
  .from(request)
  .innerJoin(center, eq(center.id, request.centerId))
  .where(and(
    eq(request.status, "active"),
    eq(center.status, "approved"),
    filters.city ? eq(request.city, filters.city) : undefined,
    filters.type ? eq(center.type, filters.type) : undefined,
    // category filter uses the denormalized text[]; categories store enum-ish
    // values (e.g. "pediatrics"). arrayContains(request.categories, [filters.category])
    filters.category ? arrayContains(request.categories, [filters.category]) : undefined,
    // search across center name, city, and item names (subquery EXISTS for items)
    filters.search ? or(
      ilike(center.name, `%${filters.search}%`),
      ilike(request.city, `%${filters.search}%`),
      sql`EXISTS (
        SELECT 1 FROM ${requestItem} ri
        LEFT JOIN ${supply} s ON s.id = ri.supply_id
        WHERE ri.request_id = ${request.id}
          AND (s.name ILIKE ${"%" + filters.search + "%"}
               OR ri.custom_name ILIKE ${"%" + filters.search + "%"})
      )`,
    ) : undefined,
  ))
  .orderBy(
    filters.sort === "urgency"
      ? asc(request.expiresAt)        // Urgencia: soonest expiry first
      : desc(request.publishedAt),    // Reciente: newest first (default)
  );
```

Then fetch items for the result ids in one round-trip and group in JS:

```ts
const ids = rows.map(r => r.id);
const items = ids.length ? await db
  .select({
    id: requestItem.id, requestId: requestItem.requestId,
    name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
    category: requestItem.category,
  })
  .from(requestItem)
  .leftJoin(supply, eq(supply.id, requestItem.supplyId))
  .where(inArray(requestItem.requestId, ids)) : [];
// group items by requestId, attach to rows -> RequestCardData[]
```

Wrap the whole thing in `unstable_cache` keyed on a normalized filters object (lowercased/trimmed search, sorted keys) so identical queries memoize. Sorting is purely time-based (no `priority`, per data-model §9): **Urgencia = `expires_at asc`**, **Reciente = `published_at desc`**.

### 4.2 `getRequestById(id): Promise<RequestDetailData | null>`

One request joined to its center, plus its items (with `isFulfilled`). Donor surface allows `active` **and** `closed`/`expired` (closed detail view); return `null` for `draft`/`paused`/not-found so the page can `notFound()`. (`paused` per data-model shows a closed-style state — for this slice, treat `paused` as not publicly viewable → `notFound()`; keep it simple.)

```ts
const [r] = await db.select({ /* request.* + center.* fields */ })
  .from(request)
  .innerJoin(center, eq(center.id, request.centerId))
  .where(and(
    eq(request.id, id),
    eq(center.status, "approved"),
    inArray(request.status, ["active", "closed", "expired"]),
  ))
  .limit(1);
if (!r) return null;
const items = await db.select({
    id: requestItem.id,
    name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
    category: requestItem.category,
    isFulfilled: requestItem.isFulfilled,
  })
  .from(requestItem)
  .leftJoin(supply, eq(supply.id, requestItem.supplyId))
  .where(eq(requestItem.requestId, id))
  .orderBy(asc(requestItem.createdAt));
```

Wrap in `unstable_cache` keyed `["request", id]`.

### 4.3 `getLandingStats(): Promise<{ activeRequests: number; approvedCenters: number; lastUpdated: Date | null }>`

Cheap aggregates (data-model §8), cached.

```ts
const [{ count: activeRequests }] = await db.select({ count: sql<number>`count(*)::int` })
  .from(request).where(eq(request.status, "active"));
const [{ count: approvedCenters }] = await db.select({ count: sql<number>`count(*)::int` })
  .from(center).where(eq(center.status, "approved"));
const [{ last }] = await db.select({ last: sql<Date | null>`max(${request.publishedAt})` })
  .from(request).where(eq(request.status, "active"));
return { activeRequests, approvedCenters, lastUpdated: last };
```

With the seed this returns `{ activeRequests: 3, approvedCenters: 2, lastUpdated: <most recent publishedAt> }`. "hace 3 min" is computed in the UI via `formatRelativeTime(lastUpdated)`.

---

## 5. UI primitives — `src/components/ui/`

Build from the Figma UI Kit visual language. Keep them server-renderable; only the few interactive ones are Client Components (`"use client"`). Tailwind v4 utility classes; mobile-first (base styles target 390px, no breakpoint prefixes needed for the core layout).

| Component | File | Client? | Purpose / props |
|---|---|---|---|
| `Button` | `button.tsx` | no | `variant: "primary" \| "ghost"`, `size`, `asChild`/`href` support. Full-width primary blue, rounded; ghost = text + icon ("Compartir"). |
| `Pill` / `Tag` | `tag.tsx` | no | Small rounded label. Variants: `city` (neutral), `urgency` (red dot + "Vence en N h"), `fulfilled` (green check "Cumplida"). |
| `Chip` | `chip.tsx` | yes | Filter/category chip — selectable (city, center type, category). Toggles a `searchParams` value. Also a static `ItemChip` (non-interactive, for card item rows) — keep that one server-side in `request-card`. |
| `Card` | `card.tsx` | no | White surface, border, rounded, padding. Base for `RequestCard` and stat/step blocks. |
| `RequestCard` | `request-card.tsx` | no | Renders `RequestCardData`. Need vs surplus styling (see §6). Header pills, center name/desc, item chips + "+N más", "Solicitado …" line, footer (Compartir ghost + Ver detalle primary linking to `/solicitudes/[id]`). |
| `AppBar` | `app-bar.tsx` | no | Detail top bar: back arrow (link to `/solicitudes`), centered title "Detalle de solicitud", optional share/external icon. |
| `Countdown` | `countdown.tsx` | yes | Live "Vence en N horas" + "Publicado hace N h · ventana de N h". Client so it can tick; falls back to server-computed initial value. Active only. |
| `ProgressBar` | `progress-bar.tsx` | no | Elapsed/window ratio bar (red). `value` 0–1 computed from publishedAt/expiresAt. |
| `SearchBox` | `search-box.tsx` | yes | Controlled input, placeholder "Buscar por centro, ciudad o ayuda"; writes `?search=` (debounced, router.replace). |
| `SortToggle` | `sort-toggle.tsx` | yes | Two-segment toggle "Reciente" / "Urgencia"; writes `?sort=`. |
| `ShareSection` | `share-section.tsx` | yes | "Comparte esta solicitud" — WhatsApp / Instagram / X / Copiar link buttons. Builds share intent URLs (`https://wa.me/?text=…`, X intent, `navigator.clipboard` for copy). **No** `share_event` write (out of scope). |
| `Stat` | `stat.tsx` | no | Landing live-stat cell (number + label), 3-up row. |
| `Step` | `step.tsx` | no | "Cómo funciona" numbered step row. |
| `Footer` | `footer.tsx` | no | Site footer (VeneMed, link columns, "© 2026 VeneMed"). |
| `EmptyState` | `empty-state.tsx` | no | "No hay solicitudes que coincidan" for empty filtered list. |

Interactive filter/search/sort components mutate the URL `searchParams` (via `next/navigation` `useRouter().replace`) so the RSC list re-renders server-side with new filters — keeps the data on the server and cacheable. No client data fetching.

Page composition components (not primitives) can live alongside their routes or in `src/components/`:
- `Hero`, `LiveStats`, `HowItWorks` (landing sections),
- `RequestList` (maps `RequestCardData[]` → `RequestCard`), `Filters` (chips row), used by `/solicitudes`,
- `RequestDetail` (active) and `ClosedRequestDetail` (closed/expired) views.

---

## 6. Surplus vs need rendering (must be visually distinct)

`request.kind` discriminates (data-model §4.4). For `kind === "surplus"` ("no enviar más de X"):
- **Card** (`RequestCard`): label the card as a surplus/"No enviar" notice (e.g. an amber/neutral header treatment instead of the red-urgency need treatment), and frame the item list as "No enviar" rather than "Necesita". Keep the same countdown/expiry (surplus reuses the lifecycle).
- **Detail**: the items section heading becomes "No enviar" (vs "Qué necesita el centro") and items use a "do-not-send" styling (e.g. muted/strikethrough or a distinct icon), not the need styling. The seeded surplus (`reqC`, Refugio Casa Esperanza, item "Ropa usada", category General) is the demo case.

Implement as a `kind` branch inside `RequestCard` and the detail view — a small `isSurplus` flag selecting heading copy + accent classes. Do not fork into a whole separate card.

---

## 7. Detail page states

`getRequestById` returns the request with `status`. The page branches:

- **`active`** (Figma `20:2`): AppBar; tags row (`city` pill + red "Vence en N h" pill); center name + description; **Countdown block** (red, big "Vence en N horas" + "Publicado hace N h · ventana de N h" + `ProgressBar`); "Qué necesita el centro" item list (or "No enviar" if surplus); "Dónde entregar" (`center.addressLine` + `center.addressReference` + "Abrir en mapas" affordance); "Cuándo entregar" ("Hoy hasta las HH:MM" derived from `expiresAt`'s clock time + "Horario regular del centro · " + `center.regularScheduleText`); **ShareSection**; bottom "Volver" button.
- **`closed` / `expired`** (Figma `20:73`): AppBar (no share icon); tags row with green "Cumplida" pill (or neutral "Vencida" for `expired`); center name + description; **green closed banner** ("Esta solicitud se cerró el {closedAt dd mmm yyyy} · Ventana de N h completada · Centro ya recibió la ayuda"); heading "Qué se pidió" (past tense) + item list; "Centro receptor" (address only); **no countdown, no share**; bottom CTA "Ver solicitudes activas" → `/solicitudes`.

Delivery copy inherits entirely from the center (data-model §4.1/§4.4) — no per-request delivery fields.

The "Cómo ayudar" bottom sheet (Figma `30:16798`) is an enhanced share affordance combining Cuándo / Dónde / Abrir en mapas / Comparte. For this slice it may be rendered inline as the detail's "Comparte esta solicitud" + delivery sections (the sheet is an alternative presentation of the same data). A true bottom-sheet overlay is optional polish, not an acceptance gate.

---

## 8. Copy & helpers — `src/lib/format.ts` (Spanish, es-VE)

All user-facing strings are Spanish. Centralize formatters:

```ts
// "Vence en 8 h" / "Vence en 45 min" / "Vencida"
formatTimeLeft(expiresAt: Date, now = new Date()): string
// long form for the detail block: "Vence en 8 horas"
formatTimeLeftLong(expiresAt: Date, now = new Date()): string
// "hace 3 min" / "hace 4 h" / "ayer" / "Solicitado hoy, 6:00 am"
formatRelativeTime(date: Date, now = new Date()): string
// progress 0..1 = elapsed / window, for ProgressBar
expiryProgress(publishedAt: Date, expiresAt: Date, now = new Date()): number
// "Hoy hasta las 4:30 pm" from expiresAt clock time
formatDeliveryCutoff(expiresAt: Date): string
// "25 jun 2026" for the closed banner
formatShortDate(date: Date): string
// category enum -> Spanish label: pediatrics->"Pediatría", surgical->"Quirófano"/"Cirugía", general->"General"
categoryLabel(value: string): string
// center type enum -> Spanish: hospital->"Hospital", childrens_shelter->"Refugio de niños", etc.
centerTypeLabel(value: string): string
```

Reference copy strings (from Figma):
- Hero: "El puente directo entre tu ayuda y los hospitales." / sub "Conectamos centros de salud con donantes para que ninguna ayuda se pierda." / CTA "Ver solicitudes activas".
- Stats labels: "solicitudes" / "centros" / "hace … (actualizado)".
- "Cómo funciona" steps: 1) "El centro publica una solicitud" — "El hospital o clínica indica qué necesita." 2) "Los donantes ven y comparten" — "Donantes y centros de acopio saben a dónde distribuir los recursos." 3) "La ventana se cierra a tiempo" — "De esta forma evitamos que se pierdan donaciones."
- Center CTA block: "¿Trabajas en un hospital, refugio o casa de cuidado?" / "Recibe solo lo que tu centro puede procesar. Activa solicitudes con ventanas de tiempo y evita el colapso." / button "Solicitar acceso al portal" → `/centro`.
- List header: "Solicitudes activas"; search placeholder "Buscar por centro, ciudad o ayuda"; sort "Reciente" / "Urgencia"; "Ver todas las solicitudes" (landing link).
- Detail: AppBar "Detalle de solicitud"; "Qué necesita el centro" / "Qué se pidió"; "Dónde entregar" / "Cuándo entregar" / "Centro receptor"; "Abrir en mapas"; "Comparte esta solicitud" / "Cada compartida llega más rápido al donante correcto."; "Volver" / "Ver solicitudes activas".
- Closed banner: "Esta solicitud se cerró el {fecha}" / "Ventana de N h completada · Centro ya recibió la ayuda".
- Tags: "Cumplida" (closed/fulfilled), "Vencida" (expired).

> `categories`/`category` are stored inconsistently in the seed: `request.categories[]` holds enum-ish values (`"pediatrics"`, `"general"`) while `request_item.category` holds Spanish labels (`"Pediatría"`, `"General"`). The **category filter chip** operates on `request.categories[]` (enum values) — render chip labels via `categoryLabel()`. Item rows display `request_item.category` directly (already Spanish). Keep this distinction in mind when wiring `?category=`.

---

## 9. Filtering & sorting behavior (`/solicitudes`)

- URL is the single source of truth: `?search=&city=&type=&category=&sort=`. The page reads `searchParams`, normalizes, calls `getActiveRequests`.
- **Search** (`SearchBox`): debounced; matches center name OR city OR item name (ILIKE). Empty → no constraint.
- **Filter chips** (`Filters`): city (distinct `request.city`), center type (`center.type` enum), category (`request.categories[]` values). Each chip toggles its param; multiple dimensions combine with AND. Render available chip values from the data (or a fixed small set for the demo).
- **Sort toggle**: "Reciente" (default, `published_at desc`) / "Urgencia" (`expires_at asc`). No priority.
- Empty result → `EmptyState`.

---

## 10. Pre-flight fixes (small, required for a clean demo)

- `src/app/layout.tsx`: change `<html lang="en">` → `lang="es"`; update `metadata` title/description to VeneMed Spanish copy. The root body already provides a flex column; the `(public)` content should be centered in a 390px max-width container (move the `max-w-[390px]` wrapper into `(public)/layout.tsx`).
- Replace the placeholder body font (`Arial`) usage if it conflicts with the Geist variables already wired in the root layout — keep Geist.
- Add `import "server-only"` to `src/db/queries.ts`.

---

## 11. Acceptance criteria ("demo-able")

1. **`pnpm build` passes** (no type errors, no lint failures blocking build).
2. **`/` renders seeded data**: live stats show `3 solicitudes`, `2 centros`, and a "hace … (actualizado)" relative time; "Cómo funciona" 3 steps; the first ~3 active request cards; center CTA; footer.
3. **`/solicitudes` renders all 3 active requests** as cards. Search by "Caracas" / a center name / an item name narrows results. City/type/category chips filter correctly (AND-combined). The seeded surplus appears and is **visually distinct**.
4. **Sort works**: "Urgencia" orders by soonest `expires_at` (J.M. de los Ríos, 12 h window published −4 h, is most urgent); "Reciente" orders by newest `published_at` (Refugio need, published −1 h, first). Toggling re-orders the list.
5. **`/solicitudes/[id]`** for an active request shows tags (city + "Vence en N h"), center name/description, a countdown block with progress bar, the item list under "Qué necesita el centro" (or "No enviar" for the surplus), "Dónde/Cuándo entregar" from the center, and the share section.
6. **Closed/expired state**: a request with `status` closed/expired renders the green "Cumplida"/"Vencida" banner, "Qué se pidió", "Centro receptor", no countdown, no share, and the "Ver solicitudes activas" CTA. (Manually flip one seeded row's status, or temporarily query a closed id, to demo.)
7. **Unknown id** → `not-found.tsx` (404), not a crash.
8. **Caching honored**: all three routes export `revalidate = 60`; queries wrapped in `unstable_cache`. The DB is not queried on every request (verified by the route segments being ISR + cached functions).
9. **Mobile 390px**: layout is correct and uncramped at 390px viewport; primary buttons full-width; cards stack vertically; matches the Figma visual language.
10. **Spanish throughout** (es-VE): all visible copy and time helpers ("Vence en 8 h", "hace 3 min") are Spanish.

---

## 12. File checklist

```
src/db/queries.ts                                  # getActiveRequests, getRequestById, getLandingStats
src/lib/format.ts                                  # formatTimeLeft, formatRelativeTime, etc.
src/components/ui/{button,tag,chip,card,request-card,app-bar,
                  countdown,progress-bar,search-box,sort-toggle,
                  share-section,stat,step,footer,empty-state}.tsx
src/components/{hero,live-stats,how-it-works,request-list,filters,
               request-detail,closed-request-detail}.tsx
src/app/(public)/layout.tsx                        # 390px container
src/app/(public)/page.tsx                          # landing (revalidate=60)
src/app/(public)/solicitudes/page.tsx              # list (revalidate=60, reads searchParams)
src/app/(public)/solicitudes/[id]/page.tsx         # detail (revalidate=60)
src/app/(public)/solicitudes/[id]/not-found.tsx    # 404
src/app/layout.tsx                                  # lang="es" + metadata fix
```
