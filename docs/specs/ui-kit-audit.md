# UI Kit Audit — Figma vs. Code

> **Date:** TODO (fill in when finalized)

This report compares the VeneMed **Figma UI Kit** (active file "VenemedApp", foundations on the "UI Kit" page — one variable collection "VeneMed Tokens", single mode) against the **coded design system** (`src/components/ui/` primitives + tokens in `src/app/globals.css`, Tailwind v4 `@theme inline`). Foundations checked: the action blue accent `#1F5AA8`, the radius scale (sm 8 / md 12 / lg 16 / pill 999), the 4px spacing scale, and the Inter type scale (Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12). Concrete geometry (radius, height, padding, gaps, fills, borders, shadows, font size/weight) was captured for Button, Input, Chip, Status Badge / RoleTag, three card variants, Toast, ConfirmDialog, MemberRow, AppBar / Header, and the bottom-sheet Modal, then diffed against `globals.css` and the primitives. All 43 mismatches below are diff-ready.

Note: several findings appear in two dimensions on purpose — the Button/Input radius issues are rooted in a token-scale problem (`--radius-xl: 20px`), so they surface under both `radius` and the per-component group. Apply the token fix once; the per-component entries describe the same edit at the call site.

---

## Summary

### By severity

| Severity | Count |
|---|---|
| 🔴 High | 5 |
| 🟠 Medium | 17 |
| 🟡 Low | 21 |
| **Total** | **43** |

### By dimension

| Dimension | High | Medium | Low | Total |
|---|---|---|---|---|
| color | 1 | 1 | 1 | 3 |
| radius | 2 | 2 | 1 | 5 |
| typography | 0 | 2 | 3 | 5 |
| spacing | 0 | 2 | 4 | 6 |
| button | 1 | 2 | 1 | 4 |
| input | 1 | 2 | 3 | 6 |
| chip-tag | 0 | 3 | 6 | 9 |
| card | 0 | 2 | 1 | 3 |
| appbar-sheet | 0 | 0 | 2 | 2 |
| **Total** | **5** | **17** | **21** | **43** |

---

## Findings

### Color

#### 🔴 Neutral ramp has gaps — even steps leak Tailwind's default achromatic grays
- **Figma:** `neutral/200 #DDE1E8`, `neutral/400 #9AA2B1`, `neutral/600 #4B5563` (cool, blue-tinted gray ramp)
- **Code:** `@theme inline` only defines neutral 50/100/300/500/700/900. Undefined even steps fall back to Tailwind defaults: `neutral-200 ≈ #e3e3e3`, `neutral-400 ≈ #a1a1a1`, `neutral-600 ≈ #5c5c5c` (0 chroma). Used widely — `neutral-400` for muted text in ~20 files, `neutral-200` for borders/track (`page.tsx:128`, `registro-wizard.tsx:206`, `insumo-selector.tsx:216`), `neutral-600` for body text (`privacidad/page.tsx`, `page.tsx:137`).
- **Location:** `src/app/globals.css:27`
- **Fix:** Add missing steps to `@theme inline` so the whole ramp is the Figma cool-gray family: `--color-neutral-200: #dde1e8;` `--color-neutral-400: #9aa2b1;` `--color-neutral-600: #4b5563;` (also `--color-neutral-800: #1f2937` for completeness). Confirmed leak: `node_modules/tailwindcss/theme.css` defines these as `oklch(...0 0)`.

#### 🟠 RoleTag "Responsable" uses wrong primary shades
- **Figma:** Responsable pill bg `#D6E4F5` (primary/100), text `#174583` (primary/700)
- **Code:** `bg-accent-subtle` (`#eef4fb` = primary/50) + `text-accent` (`#1f5aa8` = primary/600) — both a step off
- **Location:** `src/components/ui/role-tag.tsx:9`
- **Fix:** `bg-accent-subtle text-accent` → bg `#D6E4F5` / text `#174583`. Either add tokens (`--color-accent-subtle-strong: #d6e4f5`) or use `bg-[#d6e4f5] text-accent-hover` (`accent-hover` already = `#174583`).

#### 🟡 Card default border too light vs Figma card border
- **Figma:** Donor cards border `#C4CAD4` (neutral/300) w1; back-office card border `#DDE1E8` (neutral/200) w1
- **Code:** Card base uses `border-neutral-100` (`#eef0f4`) for all cards, incl. donor RequestCard
- **Location:** `src/components/ui/card.tsx:9`
- **Fix:** `border-neutral-100` → `border-neutral-300` (`#c4cad4`) for donor card fidelity (or `neutral-200` for back-office). Reads two neutral steps lighter than Figma today.

---

### Radius

#### 🔴 Button corner radius renders at 20px, Figma spec is 12px
- **Figma:** Button radius 12 (radius/md)
- **Code:** `rounded-xl` → `var(--radius-xl)` = 20px (`globals.css:46` overrides Tailwind's default xl)
- **Location:** `src/components/ui/button.tsx:8`
- **Fix:** In `base`, `rounded-xl` → `rounded-md` (`--radius-md` = 12px). Affects every Button variant and the two ConfirmDialog action buttons.

#### 🔴 Form inputs / textareas / selects render at 20px radius, Figma inputbox is 12px
- **Figma:** inputbox radius 12 (radius/md)
- **Code:** `rounded-xl` = 20px on all input/select/textarea shells and wrapping field boxes
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `rounded-xl` → `rounded-md` (12px). Same fix at `center-datos-form.tsx:403,447,506`; `profile-sections.tsx:366,396`; `insumo-selector.tsx:224,261`; `lista-editor.tsx:295,426`; `login-form.tsx:100`; `unirse/[token]/join-form.tsx:110`; `invite-member-button.tsx:176,230`; `otp-step.tsx:306`; `(public)/page.tsx:49` (landing search).

#### 🟠 Radius token scale diverges from Figma: missing sm=8, extra non-spec xl=20
- **Figma:** radius scale = sm 8, md 12, lg 16, pill 999 (four tokens)
- **Code:** `--radius-md 12`, `--radius-lg 16`, `--radius-xl 20`, `--radius-pill 9999` — no `--radius-sm`, and `--radius-xl:20` is not a Figma value
- **Location:** `src/app/globals.css:44`
- **Fix:** Add `--radius-sm: 8px;`; remove `--radius-xl: 20px;` (root cause of Button/Input rendering at 20 via `rounded-xl`). If a 20px brand mark is still wanted, keep xl only for `logo.tsx`.

#### 🟠 Bottom-sheet / modal top corners render at 20px, Figma spec is 24px
- **Figma:** Bottom-sheet top corners radius 24 (topLeft/topRight 24, bottom square)
- **Code:** `rounded-t-[20px]`
- **Location:** `src/app/(public)/listas/[id]/_components/request-sheet.tsx:102`
- **Fix:** `rounded-t-[20px]` → `rounded-t-[24px]`. Same fix at `insumo-selector.tsx:203`, `reception-toggle.tsx:157`, `invite-member-button.tsx:151`, `admin/centros/[id]/reject-sheet.tsx:124`.

#### 🟡 ItemChip / row-icon squares use rounded-md (12px) where Figma small tiles are 8px
- **Figma:** radius/sm 8 for small square containers (checkbox/icon tiles)
- **Code:** `rounded-md` = 12px on 6×6 icon/checkbox squares (no sm token, so md is nearest)
- **Location:** `src/app/(center)/centro/lista/editar/_components/insumo-selector.tsx:292`
- **Fix:** Once `--radius-sm:8px` exists, `rounded-md` → `rounded-sm` on these 24px tile squares (also `insumo-selector.tsx:372`, `lista-editor.tsx:505`). Low: small elements.

---

### Typography

#### 🟠 Button label font size 15px vs Figma 16
- **Figma:** Button text 16 Semi Bold
- **Code:** md size: `text-[15px]` (font-semibold OK)
- **Location:** `src/components/ui/button.tsx:25`
- **Fix:** `md: "h-12 px-5 text-[15px]"` → `"h-12 px-5 text-base"` (16px)

#### 🟠 RoleTag font size + weight off (uses generic Tag)
- **Figma:** RoleTag text 10 Semi Bold
- **Code:** renders via Tag → `text-xs` (12px) `font-medium` (500)
- **Location:** `src/components/ui/tag.tsx:44`
- **Fix:** Give RoleTag its own `text-[10px] font-semibold` instead of inheriting Tag's `text-xs font-medium` (role-tag.tsx L9/L15/L17).

#### 🟡 No type-scale tokens; Display 28 / H1 22 absent from system
- **Figma:** Inter scale Display 28 Bold / H1 22 Bold / H2 18 Semi Bold / Body 16 Regular / Label 14 Medium / Caption 12 Regular
- **Code:** `globals.css` defines NO type-scale variables; sizes are ad-hoc Tailwind `text-*` utilities; Display 28 & H1 22 never appear in `ui/` primitives
- **Location:** `src/app/globals.css:49`
- **Fix:** Add type-scale tokens (e.g. `--text-display:28px/700`, `--text-h1:22px/700`, `--text-h2:18px/600`, `--text-body:16px/400`, `--text-label:14px/500`, `--text-caption:12px/400`) or Tailwind `@theme` font sizes so the Figma scale is canonical.

#### 🟡 Filter Chip font size 14px vs Figma 13, no active-state weight bump
- **Figma:** Chip text 13; Default Medium, Active Semi Bold
- **Code:** `text-sm` (14px) `font-medium` in both selected/unselected
- **Location:** `src/components/ui/chip.tsx:44`
- **Fix:** `text-sm` → `text-[13px]`; add `font-semibold` to the selected branch (currently only color changes).

#### 🟡 Donor card center name weight bold vs Figma Semi Bold
- **Figma:** Solicitud Card CenterName 18 Semi Bold
- **Code:** `h3 text-lg font-bold` (700)
- **Location:** `src/components/ui/request-card.tsx:43`
- **Fix:** `font-bold` → `font-semibold` (18px already matches `text-lg`).

---

### Spacing

#### 🟠 Input / field height too short (48/44px vs 52px)
- **Figma:** inputbox height 52px
- **Code:** `h-12` (48px) on most fields; `h-11` (44px) on some
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `h-12` → `h-[52px]` (add a `--field/input-height` token). Same at `center-datos-form.tsx:403,465,506`; fix `h-11`→`h-[52px]` at `lista-editor.tsx:426` and `insumo-selector.tsx:261`.

#### 🟠 Input horizontal padding too small (12px vs 16px)
- **Figma:** inputbox padding L/R 16px
- **Code:** `px-3` (12px)
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `px-3` → `px-4`. Same at `center-datos-form.tsx:403,465,506`, `lista-editor.tsx:295,426`, `insumo-selector.tsx:261`. (`insumo-selector.tsx:224` already uses `px-4` — normalize toward it.)

#### 🟡 Input height inconsistent across forms (h-11 vs h-12)
- **Figma:** single inputbox height 52px for all fields
- **Code:** mix of `h-12` (48px) and `h-11` (44px) for equivalent text inputs
- **Location:** `src/app/(center)/centro/lista/editar/_components/lista-editor.tsx:426`
- **Fix:** Normalize `h-11` → shared field height (`h-[52px]`); also `insumo-selector.tsx:261`. Ideally extract a shared input class/token.

#### 🟡 Field label→box gap smaller than spec (6px vs 8px)
- **Figma:** field group (label→box) vertical gap 8px (space-2)
- **Code:** `mt-1.5` (6px) between label and input box
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `mt-1.5` → `mt-2` (6px→8px).

#### 🟡 Back-office card padding under spec (16px vs 18px)
- **Figma:** Card de Solicitud backoffice padding 18px
- **Code:** generic Card `p-4` (16px), reused by center-request-card
- **Location:** `src/components/ui/card.tsx:9`
- **Fix:** Back-office variant needs 18px; add an inner padding override on center-request-card (e.g. `p-[18px]`) or accept 16px as an intentional token snap. Donor cards (16px) already match — do not change the shared Card default.

#### 🟡 AppBar horizontal padding wider than spec (16px vs 12px)
- **Figma:** AppBar frame padding L/R 12px
- **Code:** `px-4` (16px)
- **Location:** `src/components/ui/app-bar.tsx:29`
- **Fix:** `px-4` → `px-3` (16px→12px). The `-ml-2` back-button offset partly hides this; verify icon alignment. Height `h-14` (56px) already matches.

---

### Button

#### 🔴 Button corner radius too round (20px vs 12px)
- **Figma:** radius 12 (radius/md)
- **Code:** `rounded-xl` → `--radius-xl` = 20px
- **Location:** `src/components/ui/button.tsx:8`
- **Fix:** In base string `rounded-xl` → `rounded-md` (`--radius-md` 12px). (Same root cause as the radius-scale finding.)

#### 🟠 Button label font size 15px vs 16px
- **Figma:** text 16 Semi Bold
- **Code:** md size uses `text-[15px] font-semibold`
- **Location:** `src/components/ui/button.tsx:25`
- **Fix:** In `sizes.md` `text-[15px]` → `text-base` (16px); keep `font-semibold`.

#### 🟠 'secondary' variant uses blue subtle fill instead of Figma's white/stroke Secondary
- **Figma:** Secondary = fill `#FFF`, stroke `#C4CAD4` w1.5, text `#111827` (code's `outline` variant already matches this)
- **Code:** `secondary: bg-accent-subtle (#eef4fb) text-accent hover:bg-accent-subtle/70`
- **Location:** `src/components/ui/button.tsx:13-14`
- **Fix:** Figma has no blue-subtle secondary — either point `secondary` to the outline styling (`border border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-100` with `focus:border-accent`) or drop it in favor of the existing `outline` variant.

#### 🟡 Ghost hover background uses accent/10 opacity instead of the accent-subtle token
- **Figma:** Ghost hover/pressed bg `#EEF4FB` (accent/subtle)
- **Code:** `ghost: hover:bg-accent/10`
- **Location:** `src/components/ui/button.tsx:16`
- **Fix:** `hover:bg-accent/10` → `hover:bg-accent-subtle`; add `active:bg-accent-subtle active:text-accent-pressed` to match Figma pressed token (`#0E2A52` text).

---

### Input

#### 🔴 Input radius too round (20px vs 12px)
- **Figma:** radius 12 (radius/md)
- **Code:** `rounded-xl` → `--radius-xl` = 20px
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `rounded-xl` → `rounded-md` (`--radius-md` 12px). Same at `center-datos-form.tsx:403,447,506`; `login-form.tsx:100`; `search-box.tsx:40`. Buttons intentionally stay `rounded-xl`, but Figma inputs are 12.

#### 🟠 Placeholder color wrong (too light + off-token)
- **Figma:** placeholder 16 Regular `#9AA2B1` (neutral/400)
- **Code:** `placeholder:text-neutral-300` = `#c4cad4` (the border gray; no neutral-400 token exists)
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** Add `--color-neutral-400: #9aa2b1` to `globals.css @theme`, then `placeholder:text-neutral-300` → `placeholder:text-neutral-400`. Repeat at lines 404 (select empty state), 465, 506; `login-form.tsx:110`; PhoneField:465.

#### 🟠 Input height short (48px vs 52px)
- **Figma:** inputbox height 52
- **Code:** `h-12` = 48px
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `h-12` → `h-[52px]`. Same at `center-datos-form.tsx:403,465,506`; `login-form.tsx:110`; `search-box.tsx:40`.

#### 🟡 Input horizontal padding narrow (12px vs 16px)
- **Figma:** padding 16 left/right
- **Code:** `px-3` = 12px
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `px-3` → `px-4` (16px). Same at lines 403,465,506; `login-form.tsx:110`. `search-box.tsx:40` already `px-4`.

#### 🟡 Border width thinner than spec (1px vs 1.5px default / 2px focus)
- **Figma:** default border w1.5; focus border w2
- **Code:** `border` = 1px; focus keeps 1px (only `ring-2` added, `border-accent` stays 1px)
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `border` → `border-[1.5px]`, and `focus:border-accent` → `focus:border-2 focus:border-accent`. Ring is an acceptable stand-in for the Figma drop-shadow focus ring.

#### 🟡 Input text size 15px vs Body 16
- **Figma:** input text 16 Regular
- **Code:** `text-[15px]`
- **Location:** `src/app/(center)/centro/_components/center-datos-form.tsx:358`
- **Fix:** `text-[15px]` → `text-base` (16px). Same across form fields and `login-form.tsx:110`.

---

### Chip / Tag

#### 🟠 Filter Chip default has border + white fill instead of neutral filled pill
- **Figma:** Chip default: fill `#EEF0F4` (neutral/100), no border, text `#374151` Medium
- **Code:** Unselected chip: `border border-neutral-300 + bg-surface` (white) `text-neutral-700`
- **Location:** `src/components/ui/chip.tsx:44-47`
- **Fix:** Drop the border and white bg → replace `border border-neutral-300 bg-surface text-neutral-700` with `bg-neutral-100 text-neutral-700` (and remove `border` from the shared base at L44).

#### 🟠 RoleTag geometry/type far larger than Figma micro-pill
- **Figma:** RoleTag: height 18, padding 3/8, text 10 Semi Bold
- **Code:** Tag base `px-2.5 (10px) py-1 (4px) text-xs (12px) font-medium` — RoleTag inherits unchanged
- **Location:** `src/components/ui/role-tag.tsx:9-17`
- **Fix:** Give RoleTag its own smaller sizing (e.g. `text-[10px] font-semibold px-2 py-0.5`) → 12px medium becomes 10px semibold with 8px/3px padding.

#### 🟠 RoleTag 'Responsable' uses wrong blue tint/text tokens
- **Figma:** Responsable: bg `#D6E4F5` (primary/100), text `#174583` (primary/700)
- **Code:** `bg-accent-subtle (#eef4fb = primary/50) text-accent (#1f5aa8 = primary/600)`
- **Location:** `src/components/ui/role-tag.tsx:9`
- **Fix:** `bg-accent-subtle text-accent` → a primary/100 bg (`#D6E4F5`) + primary/700 text (`#174583`); neither is a token yet — add them or hardcode.

#### 🟡 RoleTag 'Operador' text darker than Figma
- **Figma:** Operador: bg `#EEF0F4` (neutral/100), text `#6B7280` (neutral/500)
- **Code:** Tag neutral: `bg-neutral-100 text-neutral-700` (`#374151`)
- **Location:** `src/components/ui/role-tag.tsx:17`
- **Fix:** `text-neutral-700` → `text-neutral-500` (override on the RoleTag instance).

#### 🟡 RoleTag 'Pendiente' text is warning/600 instead of warning/700
- **Figma:** Pendiente: bg `#FEF4E6` (warning/50), text `#8A3F07` (warning/700)
- **Code:** Tag soon: `bg-warning-tint (#fef4e6 ok) text-warning (#b45309 = warning/600)`
- **Location:** `src/components/ui/role-tag.tsx:15`
- **Fix:** Pendiente text `#b45309` → `#8A3F07` (warning/700); token warning/700 not defined — add it or hardcode.

#### 🟡 Filter Chip active state not Semi Bold
- **Figma:** Chip Active: fill `#1F5AA8`, text `#FFFFFF` Semi Bold
- **Code:** `font-medium` in shared base; selected keeps medium
- **Location:** `src/components/ui/chip.tsx:44-46`
- **Fix:** Add `font-semibold` to the selected branch (or swap base `font-medium` → `font-semibold` when selected).

#### 🟡 Filter Chip hover fill too light
- **Figma:** Chip Hover: fill `#C4CAD4` (neutral/300)
- **Code:** `hover:bg-neutral-100` (`#eef0f4`)
- **Location:** `src/components/ui/chip.tsx:47`
- **Fix:** `hover:bg-neutral-100` → `hover:bg-neutral-300`.

#### 🟡 Filter Chip text size / horizontal padding off
- **Figma:** Chip: text 13, padding 14 left/right (8 top/bottom)
- **Code:** `text-sm (14px)`, `px-3 (12px) py-1.5 (6px)`
- **Location:** `src/components/ui/chip.tsx:44`
- **Fix:** `text-sm` → `text-[13px]`; `px-3` → `px-3.5` (14px).

#### 🟡 No dedicated Status Badge component for center moderation states
- **Figma:** Status Badge: pill h30, pad 6/10-12, 8px leading dot, text 13 Semi Bold — Pendiente `#FEF4E6/#B45309/#8A3F07`, Verificado `#E8F5EE/#1E7D52/#155E3E`, Rechazado `#FCEBE9/#C0362C/#962820`
- **Code:** No matching `ui/` primitive; status pills (if any) are ad-hoc at page level
- **Location:** `src/components/ui/tag.tsx:12-20`
- **Fix:** Add a StatusBadge primitive (dot + 13px semibold, the three tint/dot/text triples) rather than reusing Tag, whose text-700 colors don't match the darker Figma text (`#155E3E/#8A3F07/#962820`).

---

### Card

#### 🟠 Card border color too light vs Figma
- **Figma:** border `#C4CAD4` (neutral/300), width 1 — both donor cards (Landing + detail)
- **Code:** `border-neutral-100` (`#eef0f4`)
- **Location:** `src/components/ui/card.tsx:9`
- **Fix:** `border-neutral-100` → `border-neutral-300`. Card base is shared; if only the donor card should change, override on RequestCard's Card wrapper via className.

#### 🟠 Card has a drop shadow the Figma card does not
- **Figma:** No drop shadow (donor landing + detail cards both flat)
- **Code:** `shadow-sm`
- **Location:** `src/components/ui/card.tsx:9`
- **Fix:** Remove `shadow-sm` from the base class (`... bg-surface p-4 shadow-sm` → `... bg-surface p-4`).

#### 🟡 Center name weight bold instead of semibold
- **Figma:** CenterName 18 Semi Bold (600) `#111827`
- **Code:** `text-lg font-bold` (700)
- **Location:** `src/components/ui/request-card.tsx:43`
- **Fix:** `font-bold` → `font-semibold` on the h3.

---

### AppBar / Sheet

#### 🟡 Bottom-sheet top corner radius is 20px, Figma spec is 24px
- **Figma:** Bottom-sheet top corners rounded 24 (topLeftRadius 24 / topRightRadius 24)
- **Code:** `rounded-t-[20px]`
- **Location:** `src/app/(public)/listas/[id]/_components/request-sheet.tsx:102`
- **Fix:** `rounded-t-[20px]` → `rounded-t-[24px]` (no 24px token; add `--radius-2xl:24px` or keep the arbitrary value).

#### 🟡 AppBar horizontal padding is 16px, Figma spec is 12px
- **Figma:** AppBar 390×56, padding 8 top/bottom · 12 left/right
- **Code:** `h-14 (56px)` ✓ but `px-4 (16px)`
- **Location:** `src/components/ui/app-bar.tsx:29`
- **Fix:** `<header>` class `px-4` → `px-3` (12px). Height already matches.

---

## Recommended batches

Grouped into four PR-sized chunks, ordered so token-level roots land first (later batches then reduce to call-site edits):

1. **PR 1 — Token foundation (`globals.css` only).** Highest leverage, unblocks the rest.
   - Add missing neutral steps (200/400/600, +800). *(color: neutral ramp — high)*
   - Add `--radius-sm: 8px`; remove `--radius-xl: 20px`. *(radius scale — medium; root cause of the Button/Input 20px bugs)*
   - Add type-scale tokens (Display/H1/H2/Body/Label/Caption). *(typography — low)*
   - Add `--field-height` (52px) token for reuse in PR 2.

2. **PR 2 — Button + Input.** Depends on PR 1's radius/neutral/field-height tokens.
   - Button: `rounded-md`, `text-base`, secondary→outline styling, ghost hover token. *(4 findings)*
   - Input/field: `rounded-md`, `h-[52px]`, `px-4`, `text-base`, `border-[1.5px]`/focus w2, `placeholder:text-neutral-400`, plus label→box `mt-2` and h-11→h-[52px] normalization. *(input + spacing — ~9 findings across many files)*

3. **PR 3 — Chip + Tag/RoleTag/StatusBadge.** Mostly self-contained primitives.
   - Chip: neutral filled default (no border/white), `text-[13px]`, active `font-semibold`, hover `neutral-300`, padding `px-3.5`. *(5 findings)*
   - RoleTag: own 10px/semibold sizing + micro-pill geometry, correct Responsable/Operador/Pendiente colors. *(4 findings)*
   - New StatusBadge primitive for moderation states. *(1 finding)*

4. **PR 4 — Card + AppBar + Sheet.** Small surface polish.
   - Card: `border-neutral-300`, drop `shadow-sm`, back-office `p-[18px]`, center name `font-semibold`, small tile `rounded-sm`. *(card + a couple radius/spacing findings)*
   - AppBar `px-3`; bottom-sheet `rounded-t-[24px]` across the five sheets. *(appbar-sheet — 2 findings)*

---

## Caveats

- **Figma bridge availability:** the inventory was captured via figma-console against the active "VenemedApp" file with foundations read from the "VeneMed Tokens" variable collection and components from local component sets. All dimensions above were diffed against real Figma values — none are code-only guesses.
- **Off-token Figma values noted, not filed as code bugs:** the inventory flagged that some Figma components themselves diverge from the token set — ConfirmDialog uses off-token blue `#1B469E` / red `#CA2F2F`, and BannerConexión uses off-token colors. These are Figma-side inconsistencies to reconcile in the kit, not mismatches the code must chase; they are excluded from the 43 count.
- **Intentional divergences to confirm with design:** donor Card padding (16px) already matches Figma — only the back-office variant needs 18px; do not change the shared default. Buttons intentionally may keep a larger radius than inputs if design wants — but Figma currently specs both at 12px, so this audit treats 12px as canonical.
- **Duplicate-rooted findings:** Button/Input radius (high) appear under both `radius` and their per-component groups; they are one fix (remove `--radius-xl`, use `rounded-md`). Counted once per dimension per the source inventory, which is why the totals sum to 43.
