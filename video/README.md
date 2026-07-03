# VeneMed promo videos (Remotion)

Two vertical promo videos (1080×1920, 30 fps) sharing one visual system:

- **`VenemedPromo`** — for centros (the demo handed to health centers)
- **`VenemedDonantes`** — donor-facing mirror, same structure

**The spec is [`docs/specs/promo-videos.md`](../docs/specs/promo-videos.md)** —
structure, exact copy, motion tokens, and the vendoring rules. Read it before
changing anything; keep it in sync with copy changes.

## Commands

```console
npm install                # self-contained project (npm, not the repo's pnpm)
npx remotion studio        # interactive preview / tweaking
npx remotion render VenemedPromo out/venemed-promo.mp4
npx remotion render VenemedDonantes out/venemed-donantes.mp4
npx tsc --noEmit           # typecheck (own tsconfig; excluded from repo CI)
```

## Ground rules (short version — spec has the full ones)

- Product UI shown in the videos = REAL app components, vendored into
  `src/vendor/` with minimal documented diffs. Restyle in the app first,
  then re-vendor — never restyle the vendored copies.
- Design tokens in `src/index.css` are copied verbatim from
  `src/app/globals.css`. Blue only on actions.
- Motion: only `useCurrentFrame()` + `interpolate()` with the easing tokens in
  `src/theme.ts` (enter ease-out, exit ease-in). No springs, no CSS
  transitions/animations, no `animate-*` classes.
- No emojis, no em dashes. es-VE copy.
