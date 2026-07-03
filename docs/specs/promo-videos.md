# Promo videos (Remotion) — `video/`

Two vertical promo videos (1080×1920, 30 fps) rendered from the Remotion project
in [`video/`](../../video/). One visual system, two audiences:

- **`VenemedPromo`** — for **centros** (the demo handed out to health centers). 920 frames ≈ 30.7 s.
- **`VenemedDonantes`** — for **donantes**. Scene-for-scene mirror of `VenemedPromo` with the POV flipped. Same durations.

This spec is the source of truth for structure, copy, and motion. Tweak freely in
Remotion Studio, but keep the invariants in §2–§4; if copy changes, update the
tables here.

## 0. Running it

```bash
cd video
npm install
npx remotion studio                                  # interactive editing
npx remotion render VenemedPromo out/venemed-promo.mp4
npx remotion render VenemedDonantes out/venemed-donantes.mp4
npx tsc --noEmit                                     # typecheck (own tsconfig)
```

The project is self-contained (npm, not pnpm) and excluded from the app's root
`tsc`/eslint CI gates. Spot-check stills before a full render:
`npx remotion still VenemedPromo out/f.png --frame=300 --scale=0.35`.

## 1. Files

```
video/src/
  Root.tsx          # registers both compositions
  Composition.tsx   # VenemedPromo + shared scene chrome (Frame, Headline, Sub,
                    #   Wordmark, LinkPill, PlatformPill, glyphs) + demo data
  DonorPromo.tsx    # VenemedDonantes (imports the shared chrome — keep it that way
                    #   so the two videos cannot drift apart)
  theme.ts          # color/radius constants + the motion tokens (§3)
  helpers.tsx       # FadeUp / SceneExit (the only animation primitives)
  index.css         # Tailwind v4 + app design tokens copied from src/app/globals.css
  vendor/           # REAL app components, vendored (§2)
public/venemed-logo-mark.png   # copied from src/assets/
```

## 2. Vendored app components (core invariant)

Every product surface shown is the app's real component, vendored with minimal,
documented diffs. Do not restyle them for video; restyle in the app first, then
re-vendor.

| Vendor file | App source | Allowed diffs |
|---|---|---|
| `vendor/ui.tsx` | `src/components/ui/{card,tag,chip,button,share-card-button}.tsx` | Button `<Link>` branch dropped; only non-interactive `ItemChip`; `ShareArrow` extracted |
| `vendor/request-card.tsx` | `src/components/ui/request-card.tsx` | demo-data type instead of `@/db/queries`; `updatedLabel` precomputed (deterministic renders); `ShareCardButton` → its exact visual |
| `vendor/lista-card.tsx` | `src/lib/og/lista-card.tsx` (story share image, PRs #75/#76) | `node:fs` logo → `<Img src={staticFile(...)}>`; local type; only the active-card story path |

App UI is authored at its real 390 px mobile scale and enlarged with CSS `zoom`
(2.2 for the request card, 0.42 for the story-card preview, 2.4 for lone Tags).

Design tokens in `index.css` are copied verbatim from `src/app/globals.css`.
Single-accent rule holds: blue `#1f5aa8` only on actions; semantic colors only
signal state; background `#f7f8fa`. Font is Inter via `@remotion/google-fonts`.

## 3. Motion system (strict)

Token system, not one curve. No springs, no bounce, no CSS transitions/animations,
no Tailwind `animate-*`. Only `useCurrentFrame()` + `interpolate()` (clamped).

```ts
EASE_ENTER = Easing.bezier(0.16, 1, 0.3, 1)   // ease-out: entrances settle
EASE_EXIT  = Easing.bezier(0.55, 0, 1, 0.45)  // ease-in: scenes leave with intent
EASE_FADE  = Easing.bezier(0.33, 1, 0.68, 1)  // gentler ease-out for opacity
DUR = { enter: 26, fade: 18, exit: 12, stagger: 8 } // frames @30fps
```

- `FadeUp` — opacity 0→1 over `DUR.fade` (EASE_FADE); rise `32px→0` over
  `DUR.enter` (EASE_ENTER). Opacity resolves before the transform.
- `SceneExit` — last `DUR.exit` frames: opacity →0 plus −14 px drift (EASE_EXIT).
- Scene layout: centered flex column (gap 44–56) inside 140/90 px safe padding.
  Headlines 78–104 px bold `#111827`; subs 46 px regular `#4b5563`.
- No emojis (line icons only). No em dashes in copy. Guard short headline tails
  ("Al día.") with a non-breaking space.

## 4. Scenes and copy

Demo data: **Hospital Central de San Cristóbal** · "Hospital público, área de
emergencias" · San Cristóbal · urgente: Gasas estériles, Antibióticos IV ·
necesitamos: Guantes de nitrilo, Jeringas 5 ml, Solución fisiológica · no
aceptamos: ropa usada · "Actualizada hace 2 horas".

Durations (frames): 90 / 130 / 175 / 125 / 165 / 120 / 115 = 920. Within a
scene: headline at 0, hero element ~16–30, sub last.

### `VenemedPromo` (centros)

| # | Scene | Headline | Hero | Sub |
|---|---|---|---|---|
| 1 | Intro | — (wordmark) | logo + "VeneMed" | "Insumos médicos, donde se necesitan." |
| 2 | Problema | "Los donantes quieren ayudar." | — | "Pero no saben qué necesita tu centro, ni qué ya sobra." |
| 3 | Lista | "Publica tu lista." | RequestCard | "Urgente, necesitamos y no aceptamos. Una sola lista, siempre al día." |
| 4 | Enlace | "Los donantes la ven y la comparten." | link pill "venemedapp.org" | "Sin descargas. Sin registro. Solo un enlace." |
| 5 | Imagen | "O compártela como imagen." | StoryCard preview + Instagram/WhatsApp pills | "Lista para historias y estados, con un solo toque." |
| 6 | Frescura | "Confírmala con un toque." | Card: "Actualizada hace 5 días · ¿sigue vigente?" + Button "Sí, sigue vigente" | "Nada expira. Tu lista vive mientras la necesites." |
| 7 | CTA | "Registra tu centro hoy." | accent pill "venemedapp.org" | "Gratis. Hecho para Venezuela." |

### `VenemedDonantes` (donantes) — diffs vs. A only

| # | Headline | Hero | Sub |
|---|---|---|---|
| 2 | "Los centros necesitan insumos." | — | "Pero cada uno necesita cosas distintas, y cambian cada día." |
| 3 | "Cada centro publica su lista." | same | "Urgente, necesitamos y no aceptamos. Escrita por el propio centro." |
| 4 | "Ábrela y compártela." | same | same |
| 6 | "Información al día." | Tag neutral "Actualizada hace 2 horas" (the donor sees the freshness tag, not the centro's confirm button) | "Cada centro confirma su lista. Donas exactamente lo que hace falta." |
| 7 | "Encuentra un centro cerca de ti." | same | "Sin registro. Gratis. Hecho para Venezuela." |

Scenes 1 and 5 are identical to `VenemedPromo`.

## 5. Audio

None wired. If a licensed instrumental track lands, put it in `video/public/`
and add `<Audio>` (from `@remotion/media`) with a gentle fade. Both videos must
read perfectly with sound off.
