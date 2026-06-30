# VeneMed

**ES** — Plataforma de ayuda médica con ventanas de tiempo para Venezuela. Los centros de salud (hospitales, clínicas, hogares de ancianos, refugios infantiles, centros de acopio) publican *solicitudes* de insumos con una ventana de 12/24/48 h. Los donantes navegan de forma **anónima, sin login**, y comparten las solicitudes como enlaces con una cuenta regresiva, de modo que **dejan de circular** cuando la ventana cierra o se pausa — evitando donaciones desperdiciadas y la saturación de los centros. Interfaz en español (es-VE), mobile-first (390px).

**EN** — A time-windowed medical-aid platform for Venezuela. Health centers publish supply *requests* (solicitudes) with a 12/24/48 h window. Donors browse **anonymously, no login**, and share request links with a countdown so they **stop circulating** once the window closes or is paused — preventing wasted donations and center overload. Built urgently after an earthquake; reliability under a donor traffic surge matters.

**Prod:** https://venemed.vercel.app

## Stack

Next.js 16 (App Router, RSC-first) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage) · Drizzle ORM over postgres-js · Supabase phone-OTP auth via Twilio Verify (WhatsApp-primary / SMS-fallback) · Playwright e2e · pnpm · Vercel (Fluid Compute).

## Status

| Area | State |
| --- | --- |
| Donor surface (public, no auth) — landing, list, detail bottom-sheet, share tracking, CDN-cached | ✅ Done |
| Center back office — phone-OTP auth, registration + moderation gate, edit, dashboard, create solicitud + insumos, manage (Finalizar / Extender / Reactivar) | ✅ Done |
| Admin moderation — login, queue, center review, approve/reject + audit | ✅ Done |
| Aviso de exceso (surplus shown as a center banner) | 🔍 In review (PR #27) |
| Security-audit fixes | 🔍 In review (PR #28) |
| Offline / PWA (read + draft-with-confirm) · Twilio WhatsApp sender onboarding · admin centers directory | 🔜 Next |

Fuller detail lives in [CONTRIBUTING.md](CONTRIBUTING.md).

## Quickstart

Local dev runs against a **fully-local Supabase stack** (Postgres + Auth + Storage) on Docker — never the cloud/prod DB.

**Prerequisites:** [Docker](https://www.docker.com/) running · [pnpm](https://pnpm.io/) · Node.

```bash
pnpm install
cp .env.example .env.local   # local Supabase creds are deterministic, public demo keys
pnpm dev:local               # supabase:start && db:setup (migrate + seed) && dev
```

Open the dev server (port 3140 in this project's notes); the donor list shows seeded solicitudes. Center login/registration work fully offline via the test-OTP map (code `123456`). Tear down with `pnpm supabase:stop` (data persists across start/stop).

Granular steps and all `pnpm` scripts are documented in [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Links

- **Figma** — design file: https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — collaboration guide (human-facing: setup, workflow, surfaces, conventions)
- **[AGENTS.md](AGENTS.md)** — agent/dev guide (architecture, deep gotchas, hard-won lessons)
- **[docs/specs/](docs/specs/)** — canonical specs (data model, donor/center/admin slices, cron jobs, e2e)
- **Prod** — https://venemed.vercel.app
