# Donor slice — design-fidelity refinement

Refine the existing, building donor slice to match the Figma UI Kit
(`tGvDuvWW99K4QzDH0GlmW7`). This is a **refinement pass**, not a rebuild: do not
touch the data layer (`src/db/queries.ts`, `src/db/schema.ts`) and do not
re-architect working RSC/ISR plumbing. Scope is visual: palette, font, layout,
the single-accent rule, and presenting the detail as a bottom sheet.

Figma nodes (file `tGvDuvWW99K4QzDH0GlmW7`):

| Node | Screen |
|------|--------|
| `32:4167` | UI-Kit foundations (palette, type, spacing) |
| `11:3` | Landing |
| `30:15714` | Active list |
| `20:2` | Detail (active) |
| `20:73` | Detail (closed) |
| `30:16798` | "Cómo ayudar" share sheet |

## Governing principle (from foundations 32:4167)

> **El azul (accent) es el ÚNICO color de acción. Si dudas si algo debe ir azul,
> no lo pongas azul. Todo lo demás es neutral.**

- **Accent** (`#1F5AA8`) is allowed *only* on: primary buttons, links/actions,
  active/selected states, and the focus ring.
- **Semantic** colors (success/warning/error) *only* communicate state.
- **Everything else** — cards, page/section backgrounds, all text, borders,
  separators, decorative chrome — is **neutral**.

A direct consequence for this codebase: the current `--color-primary` /
`--color-primary-tint` tokens (a decorative dark-navy blue used for headings,
the logo and center names) **violate the rule** and must be removed. Headings and
body text map to `neutral/900`, not a blue.

---

## 1. `src/app/globals.css` — exact token block

Replace the entire `@theme inline` block (and the `:root` page colors) with the
following. Hex values are the UI-Kit variables verified via Figma
`get_variable_defs` on `32:4167` — they are the source of truth. **Delete** the
old guesses: `#DC2626`, `#FEE2E2`, `#EA580C`, `#DCFCE7`, `#F3F4F6`, `#D6E4F5`,
`#0E2A52`-as-primary, `#9CA3AF`, `#E5E7EB`, `#F9FAFB`.

```css
@import "tailwindcss";

/*
 * VeneMed design tokens — Figma UI Kit (tGvDuvWW99K4QzDH0GlmW7, node 32:4167).
 * Single-accent system: accent = the only action color; everything else neutral;
 * semantics only communicate state. Mobile-first, 390px.
 */
:root {
  --background: #f7f8fa; /* neutral/50 — page background */
  --foreground: #111827; /* neutral/900 — text */
}

@theme inline {
  /* surfaces */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: #ffffff; /* cards */

  /* accent — the ONLY action color */
  --color-accent: #1f5aa8;         /* accent/default  */
  --color-accent-hover: #174583;   /* accent/hover    */
  --color-accent-pressed: #0e2a52; /* accent/pressed  */
  --color-accent-subtle: #eef4fb;  /* accent/subtle (bg) */
  --color-accent-border: #aec9ea;  /* accent/border   */
  --color-accent-on: #ffffff;      /* text/icon on accent */

  /* neutrals — surfaces, text, borders (the 90% of the UI) */
  --color-neutral-900: #111827; /* primary text */
  --color-neutral-700: #374151; /* secondary text */
  --color-neutral-500: #6b7280; /* tertiary text */
  --color-neutral-300: #c4cad4; /* borders */
  --color-neutral-100: #eef0f4; /* fills / separators */
  --color-neutral-50: #f7f8fa;  /* page background */

  /* semantics — state ONLY */
  --color-success: #1e7d52;      /* success/600 — fulfilled */
  --color-success-tint: #e8f5ee; /* success/50  */
  --color-warning: #b45309;      /* warning/600 — "soon" (12–24 h) */
  --color-warning-tint: #fef4e6; /* warning/50  */
  --color-error: #c0362c;        /* error/600 — "urgent" (<12 h) */
  --color-error-tint: #fcebe9;   /* error/50   */

  /* radii */
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 9999px;

  /* fonts (Inter wired in src/app/layout.tsx) */
  --font-sans: var(--font-inter);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

### Token migration map (apply via find/replace across `src/**`)

The UI-Kit neutral ramp has only 900/700/500/300/100/50 — the old `neutral-200`
and `neutral-400` do not exist in the kit and must be remapped:

| Old class / token | New | Rationale |
|---|---|---|
| `text-primary` | `text-neutral-900` | headings/center names are neutral, not blue |
| `bg-primary` (logo) | (see §5 logo) | becomes the cross glyph |
| `primary-tint` (bg/border) | `accent-subtle` / `accent-border` | only on the conversion panel (§4) |
| `urgent` | `error` | semantic rename |
| `urgent-tint` | `error-tint` | semantic rename |
| `soon` | `warning` | semantic rename |
| `bg-orange-50` | `bg-warning-tint` | kill the Tailwind-default orange |
| `border-neutral-200` | `border-neutral-100` | subtle card/section borders |
| `text-neutral-400` | `text-neutral-500` | captions/placeholders |
| `bg-neutral-400` (dot) | `bg-neutral-500` | low-urgency dot |
| `bg-neutral-200` (expired tag) | `bg-neutral-100` | |
| `text-neutral-200` etc. | nearest kit step | |

---

## 2. Font swap — Geist → Inter

Type scale (Inter), from foundations `32:4167`:

| Role | Size / weight | Tailwind |
|---|---|---|
| Display | 28 Bold | `text-[28px] font-bold` |
| H1 | 22 Bold | `text-[22px] font-bold` |
| H2 | 18 SemiBold | `text-lg font-semibold` |
| Body | 16 Regular | `text-base font-normal` |
| Label | 14 Medium | `text-sm font-medium` |
| Caption | 12 Regular | `text-xs font-normal` |

### Steps

1. **`src/app/layout.tsx`** — replace the Geist imports:

   ```tsx
   import { Inter } from "next/font/google";

   const inter = Inter({
     variable: "--font-inter",
     subsets: ["latin"],
     weight: ["400", "500", "600", "700"],
     display: "swap",
   });
   ```

   On `<html>`: `className={`${inter.variable} h-full antialiased`}`. Remove
   `geistSans`, `geistMono`, and the `Geist_Mono` import.

2. **`globals.css`** — `--font-sans: var(--font-inter);` (done in §1). Remove
   `--font-mono` (not used in the donor slice).

3. **Apply the scale** where headings currently rely on Geist's metrics:
   landing `h1` is Display 28 (already `text-[28px] font-bold` — keep); section
   `h2` "Cómo funciona" is H1 22 (`text-[22px] font-bold` — keep); detail center
   name is H1 22 Bold; detail section headings ("Qué necesita el centro", etc.)
   are H2 18 SemiBold (`text-lg font-semibold`) — currently `text-lg font-bold
   text-primary`, change weight to `font-semibold` and color to `neutral-900`.

---

## 3. Single-accent / fidelity fix checklist (file by file)

Accent that is correct (action) and must **stay** blue: primary `<Button>`,
ghost "Compartir" button, text links ("Abrir en mapas", "Ver todas las
solicitudes →"), selected filter state, focus ring, "Copiar link" share button.

### `src/app/(public)/page.tsx` (landing 11:3)

- [ ] **Logo** — replace the `<span … bg-primary … >V</span>` placeholder with
      the medical-cross glyph (see §5).
- [ ] **Wordmark** `text-primary` → `text-neutral-900` (both header and footer).
- [ ] **KNOWN VIOLATION #1** — the `<Stat … highlight />` "actualizado hace X"
      renders `text-success` (green). Remove the `highlight` prop and the
      green branch; the value is `text-neutral-900` like the other two stats.
      Delete the `highlight` param from the `Stat` component.
- [ ] **KNOWN VIOLATION #2** — "Cómo funciona" step circles are
      `bg-primary-tint text-accent`. Change to **`bg-neutral-100 text-neutral-700`**
      (decorative numbering is not an action).
- [ ] **Conversion panel** ("¿Trabajas en un hospital…") — replace the hardcoded
      `bg-[#eef4fb]` and `border-primary-tint` with the tokens
      `bg-accent-subtle border-accent-border`. This is the one sanctioned
      accent-subtle *surface*: it is the primary conversion CTA container and
      Figma renders it tinted. (Value is identical, but use the token.)
- [ ] "Ver todas las solicitudes →" stays `text-accent` (it's a link).

### `src/app/(public)/solicitudes/page.tsx` (list 30:15714)

- [ ] **Filters** — replace the horizontally-scrolling `Chip` row with two
      dropdown selectors per Figma: **"Ubicación"** and **"Sector"** (see §6).
- [ ] `EmptyState` title `text-primary` → `text-neutral-900`.

### `src/components/ui/request-card.tsx`

- [ ] Center name `text-primary` → `text-neutral-900`.
- [ ] Surplus card border `border-soon/30` → `border-warning/30`.
- [ ] "No enviar" eyebrow `text-soon` → `text-warning`.
- [ ] **"+N más"** overflow: Figma renders it as an accent-subtle pill
      (`bg-accent-subtle text-accent rounded-full px-2 py-0.5 text-xs`). This is
      the lone permitted non-button accent — it is the "more items, tap the card"
      affordance — keep it as a pill matching Figma rather than bare text.
- [ ] **TODO (OUT OF SCOPE — later backend workflow):** Figma cards show a bold
      summary/descriptor line under the center name (e.g. "Higiene adultos
      mayores", "Insumos pediátricos"). That requires the `request.title`
      descriptor field (schema migration), which is owned by a later workflow.
      **Do not add a DB-backed descriptor line now.** Leave:
      `{/* TODO(descriptor): bold summary line — needs request.title field (backend workflow) */}`
- [ ] Footer "Compartir" (ghost/accent) + "Ver detalle" (primary) — keep.

### `src/components/ui/app-bar.tsx`

- [ ] Title `text-primary` → `text-neutral-900` (`text-base font-semibold`).
- [ ] Back-arrow `text-neutral-700` and hover `bg-neutral-100` — keep.

### `src/components/ui/button.tsx`

- [ ] `secondary` variant currently `bg-primary-tint text-primary` → either drop
      the variant (unused in the donor slice) or remap to
      `bg-accent-subtle text-accent hover:bg-accent-subtle/70`.
- [ ] `primary` hover `bg-accent/90` → `hover:bg-accent-hover`; add
      `active:bg-accent-pressed`.
- [ ] Focus ring `ring-accent/40` — keep (accent is allowed for focus).
- [ ] Add `min-h-[48px]` consideration for the `md` size (foundations: tap
      target ≥ 48×48); current `h-12` = 48px ✓.

### `src/components/ui/tag.tsx`

- [ ] `urgent` → `bg-error-tint text-error`; dot `bg-error`.
- [ ] `soon` → `bg-warning-tint text-warning`; dot `bg-warning`.
- [ ] `surplus` → `bg-warning-tint text-warning`.
- [ ] `normal` dot `bg-neutral-400` → `bg-neutral-500`.
- [ ] `fulfilled` → `bg-success-tint text-success`.
- [ ] `expired` `bg-neutral-200` → `bg-neutral-100`.

### `src/components/ui/countdown.tsx`

- [ ] `bg-urgent-tint` → `bg-error-tint`; `text-urgent` → `text-error`;
      `text-urgent/80` → `text-error/80`; progress `bg-urgent/15` →
      `bg-error/15`. (Semantic urgency block — accent stays out of it.)

### `src/components/ui/progress-bar.tsx`

- [ ] `tone="urgent"` fill `bg-urgent` → `bg-error`; rename the tone literal to
      `"error"` (and its one call site in countdown), or keep the prop name and
      just swap the class. Neutral tone `bg-neutral-400` → `bg-neutral-500`.

### `src/components/ui/chip.tsx`

- [ ] If filters become dropdowns (§6), the interactive `Chip` is no longer used
      on the list — remove it or keep only for any remaining chip use. Selected
      state `bg-accent text-accent-on` is correct (selected = action/active).
- [ ] `ItemChip` neutral styling stays; ensure `bg-neutral-100`.

### `src/components/share-section.tsx`

- [ ] Section title `text-primary` → `text-neutral-900`.
- [ ] Brand-colored share circles (WhatsApp `#25D366`, IG `#C13584`, X `#0f1419`)
      are **brand identity**, an allowed exception — keep. "Copiar link"
      `bg-accent` is an action — keep.

### `src/app/(public)/solicitudes/[id]/page.tsx` (detail 20:2 / 20:73)

- [ ] All `text-primary` headings (center name + every section `h2`) →
      `text-neutral-900`; section headings `font-bold` → `font-semibold` (H2 18).
- [ ] **Footer CTA: change "Volver" → "Compartir solicitud"** (active detail).
      Sharing is the core donor action; "Volver" is handled by the AppBar back
      arrow / sheet dismiss. See §7 for the button behavior.
- [ ] Closed-detail green success banner/tag is correct (state) — keep, just
      confirm it uses `success`/`success-tint` tokens.
- [ ] Present this route as a **bottom sheet** when opened from the list (§7).

---

## 4. Accent-subtle: the only two sanctioned non-action uses

To avoid over-neutralizing against Figma, these two are *intentional* and stay
accent-subtle (the value `#eef4fb` is the `accent-subtle` token, not decoration):

1. Landing conversion panel (§3 landing).
2. The "+N más" count pill on cards (§3 request-card).

Everything else that is currently blue-tinted and is **not** a button/link/active
state must become neutral.

---

## 5. Logo — medical-cross glyph (landing 11:3)

Replace the placeholder `V` square. The mark is a rounded square containing a
white medical cross; the mark itself is the one branded use of accent (brand
identity, not an action). Inline SVG, server-renderable, ~36px:

```tsx
function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-accent">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* medical cross */}
        <path
          d="M10 3h4a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-5H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h5V4a1 1 0 0 1 1-1z"
          fill="#ffffff"
        />
      </svg>
    </span>
  );
}
```

Wordmark beside it: `text-xl font-bold text-neutral-900`. (Confirm the exact
mark color against 11:3 when implementing; if Figma uses a distinct brand hue for
the square, use that literal — the logo is exempt from the single-accent rule,
but accent is a safe default.)

---

## 6. List filters — "Ubicación" / "Sector" dropdowns (30:15714)

Figma replaces the overflowing chip strip with two labeled dropdown selectors,
not a scroll of pills.

- Two `<select>`-backed controls side by side under the search box:
  **"Ubicación"** (options = `cities` from `uniqueSorted(allActive.map(r => r.city))`)
  and **"Sector"** (options = `types` from `centerType`, labeled via
  `centerTypeLabel`). Keep a leading "Todas / Todos" option that clears the param.
- Each is a client component (mirror `SortToggle`/`Chip` pattern): on change,
  write/clear `?city=` / `?type=` via `router.replace(..., { scroll: false })`
  inside a `startTransition`; the RSC list re-renders server-side. **Do not add
  client data fetching.** The `category` facet can fold into "Sector" or be
  dropped from the list per Figma (Figma shows two selectors).
- Visual: `h-11 rounded-xl border border-neutral-300 bg-surface px-4 text-sm
  text-neutral-700`, chevron icon `text-neutral-500`, focus
  `focus:border-accent`. Selected/non-default value is neutral text (not accent
  — the *control* isn't an action; only its focus ring is accent).
- Remove the `-mx-6 … overflow-x-auto` chip row. Keep `SearchBox` and
  `SortToggle` as-is (SortToggle's active segment is a selected state → fine).

> Implementation note: prefer a native `<select>` for accessibility + zero-JS
> fallback; style the wrapper. A custom listbox is optional and out of scope for
> fidelity.

---

## 7. Detail as a bottom sheet (20:2 + 30:16798)

### Recommendation: Next.js parallel + intercepting routes

Use a `@modal` parallel slot on the public segment plus an intercepting route, so
that:

- Opening `/solicitudes/[id]` **from the list** intercepts into an overlay
  **bottom sheet** rendered over the list.
- A **direct visit / refresh / deep link** to `/solicitudes/[id]` renders the
  existing **full page** (with `AppBar`).
- Back button / scrim dismiss closes the sheet and returns to the list.

**Why this over a client-only sheet:** the content stays a Server Component fed by
`getRequestById` (no client refetch, no prop-drilling the request through a
client modal), deep links keep their SSR/ISR + correct `generateMetadata`/OG, the
browser back button dismisses naturally, and it degrades to a real page with JS
off — all consistent with the surge/ISR posture of this slice. A pure client
sheet would force client-side data fetching or duplicate state and lose the
shareable SSR URL (which matters because **sharing is the core action**).

### File structure

```
src/app/(public)/
  layout.tsx                       # accept `modal` slot, render {children}{modal}
  @modal/
    default.tsx                    # export default () => null
    (.)solicitudes/[id]/page.tsx   # intercepts → <RequestSheet>{<RequestDetailBody/>}</RequestSheet>
  solicitudes/[id]/page.tsx        # unchanged route → full page (AppBar + RequestDetailBody)
```

- **Extract** the active/closed detail bodies from the current
  `solicitudes/[id]/page.tsx` into a shared server component
  `RequestDetailBody` (e.g. `solicitudes/[id]/_components/detail-body.tsx`) so the
  full page and the intercepted sheet render byte-identical content. **No query
  changes** — both call `getRequestById`.
- `(public)/layout.tsx` gains a `modal` prop:
  `export default function PublicLayout({ children, modal }) { … {children}{modal} … }`.

### Sheet chrome (`RequestSheet`, client component)

Mirror 30:16798:

- **Scrim:** `fixed inset-0 z-40 bg-neutral-900/40` (neutral, ~40% — not accent),
  click → `router.back()`.
- **Panel:** bottom-anchored, `fixed inset-x-0 bottom-0 z-50 mx-auto w-full
  max-w-[390px] rounded-t-[20px] bg-surface shadow-xl max-h-[90dvh]
  overflow-y-auto`.
- **Drag handle:** centered pill at top, `mx-auto mt-2 h-1 w-9 rounded-full
  bg-neutral-300` (decorative → neutral).
- **Dismiss:** scrim click, `Escape` key, and a swipe-down/drag is nice-to-have
  (optional; back-button + scrim are sufficient for fidelity).
- **Sticky footer** inside the panel: the primary CTA **"Compartir solicitud"**
  (full-width primary button), matching the `BottomBar` already in the detail.
- Lock body scroll while open (`overflow-hidden` on mount).

### Footer CTA behavior — "Compartir solicitud"

Both the full page and the sheet use **"Compartir solicitud"** as the primary
footer button (replacing "Volver"). A small client button:

- If `navigator.share` exists → `navigator.share({ title, text, url })` with the
  same message/URL as `ShareSection`.
- Else → scroll to / focus the in-page `ShareSection` (or copy link). Reuse the
  share helpers already in `share-section.tsx`; consider lifting the share
  message + URL builders into `src/lib/` so the CTA and the section share them.
- The closed-detail CTA stays **"Ver solicitudes activas"** (Figma 20:73).

---

## 8. Acceptance criteria

- [ ] `pnpm build` is green (no type/lint errors; RSC/`"use client"` boundaries
      intact; the data layer untouched).
- [ ] **Tokens match the kit exactly.** `globals.css` contains the §1 block and
      `grep -rE "#DC2626|#FEE2E2|#EA580C|#DCFCE7|#F3F4F6|#D6E4F5|#9CA3AF|#E5E7EB|#F9FAFB" src`
      returns nothing. No `--color-primary` / `primary-tint` remain. Semantic
      hexes equal `error #C0362C/#FCEBE9`, `warning #B45309/#FEF4E6`,
      `success #1E7D52/#E8F5EE`.
- [ ] **Inter is loaded** via `next/font/google` (weights 400/500/600/700);
      Geist/Geist_Mono fully removed; `--font-inter` wired into `--font-sans`.
- [ ] **No decorative accent or semantic color.** Audit confirms accent appears
      only on buttons/links/active-states/focus-ring (plus the two sanctioned
      accent-subtle surfaces §4 and the brand logo/share circles). Specifically:
      landing "actualizado" stat is neutral; step circles are
      `neutral/100`+`neutral/700`; all headings/center names are `neutral/900`.
- [ ] **Logo** is the inline medical-cross glyph (no "V" placeholder).
- [ ] **List filters** are "Ubicación"/"Sector" dropdowns; no overflowing chip
      strip.
- [ ] **Detail opens as a sheet** from the list (drag handle, rounded top,
      neutral scrim, sticky footer); direct visit renders the full page; back
      button dismisses; content is identical (shared `RequestDetailBody`).
- [ ] Detail footer primary CTA reads **"Compartir solicitud"** (active) /
      **"Ver solicitudes activas"** (closed).
- [ ] Type scale applied: Display 28 / H1 22 / H2 18 SemiBold / Body 16 /
      Label 14 / Caption 12.
- [ ] The bold card descriptor line is **not** added; a `TODO(descriptor)` marks
      where `request.title` will go (left for the backend workflow).
```
