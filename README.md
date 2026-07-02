# VeneMed

**ES** — Plataforma de ayuda médica para Venezuela basada en **listas**. Cada centro de salud (hospitales, clínicas, hogares de ancianos, refugios infantiles, centros de acopio) mantiene **una sola lista viva** de lo que necesita ahora — con secciones **Urgente / Necesitamos / No aceptamos** y sin cuenta regresiva. En vez de expirar por un temporizador, la lista simplemente se pone **vieja**: "Actualizada hace 5 días · ¿sigue vigente?" invita al centro a reconfirmar, y una lista vieja **baja en el orden** para el donante en lugar de desaparecer. Los donantes navegan **anónimos, sin login**, y comparten la lista de un centro como enlace. Interfaz en español (es-VE), mobile-first (390px).

**EN** — A **list-based** medical-aid platform for Venezuela. Each health center keeps **one living list** of what it needs right now — with **Urgente / Necesitamos / No aceptamos** buckets and no countdown. Instead of expiring on a timer, a list just gets **stale**: an "Actualizada hace 5 días · ¿sigue vigente?" nudge asks the center to re-confirm, and a stale list **sinks in the donor ordering** rather than being taken down. Donors browse **anonymously, no login**, and share a center's list as a link. Built urgently after an earthquake; reliability under a donor traffic surge matters.

> **Model note** — VeneMed started as a *time-windowed* platform (per-request *solicitudes* with a 12/24/48 h countdown). It pivoted to the evergreen **lista** model above (one list per center, freshness instead of expiry, per-item urgency). See [`docs/specs/lista-model-v2.md`](docs/specs/lista-model-v2.md) for the canonical model.

**Prod:** https://venemedapp.org

## Stack

Next.js 16 (App Router, RSC-first) · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage) · Drizzle ORM over postgres-js · Supabase **email-OTP** auth (6-digit code via Resend SMTP) · Playwright e2e · pnpm · Vercel (Fluid Compute).

## Status

| Area | State |
| --- | --- |
| Donor surface (public, no auth) — landing, one-card-per-center list, detail bottom-sheet, share tracking, CDN-cached | ✅ Done |
| Center back office — email-OTP auth, registration + moderation gate, edit, team roles + invitations, one-lista dashboard (freshness card + Urgente/Necesitamos/No aceptamos), create-once/edit editor, reception toggle | ✅ Done |
| Admin moderation — login, queue, center review, approve/reject + audit | ✅ Done |
| Lista model v2 — `request`→`lista`, no time windows, freshness + per-item urgency, excess as an item bucket, expiry cron retired | ✅ Done |
| Offline / PWA (read + draft-with-confirm) · admin centers directory | 🔜 Next |

Fuller detail lives in [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Quickstart

Local dev runs against a **fully-local Supabase stack** (Postgres + Auth + Storage) on Docker — never the cloud/prod DB.

**Prerequisites:** [Docker](https://www.docker.com/) running · [pnpm](https://pnpm.io/) · Node.

```bash
pnpm install
cp .env.example .env.local   # local Supabase creds are deterministic, public demo keys
pnpm dev:local               # supabase:start && db:setup (migrate + seed) && dev
```

Open the dev server (port 3140 in this project's notes); the donor list shows seeded listas. Center login/registration work fully offline via the email test-OTP map (code `123456`). Tear down with `pnpm supabase:stop` (data persists across start/stop).

Granular steps and all `pnpm` scripts are documented in [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Links

- **Figma** — design file: https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — collaboration guide (human-facing: setup, workflow, surfaces, conventions)
- **[AGENTS.md](AGENTS.md)** — agent/dev guide (architecture, deep gotchas, hard-won lessons)
- **[docs/specs/](docs/specs/)** — canonical specs (lista model, donor/center/admin slices, e2e)
- **Prod** — https://venemedapp.org

## License

Released under the [MIT License](LICENSE) — free to use, fork, and build on.
Contributions are welcome; by opening a pull request you agree to license your
contribution under the same terms. See [CONTRIBUTING.md](CONTRIBUTING.md) to get
started.
