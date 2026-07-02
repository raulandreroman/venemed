# Contributing to VeneMed

**Language / Idioma:** **[English](#english)** · **[Español](#español)**

This is the human collaboration guide for designers, developers, and PMs. It is complementary to [`AGENTS.md`](./AGENTS.md), which is the canonical guide for AI agents and carries the deep gotchas. When in doubt about a runtime detail or a hard-won lesson, read `AGENTS.md`; for canonical product/data behavior, read the specs in [`docs/specs/`](./docs/specs/) — [`lista-model-v2.md`](./docs/specs/lista-model-v2.md) is the model of record.

---

<a id="english"></a>
# English

## What VeneMed is

VeneMed is a **list-based medical-aid platform for Venezuela**. Each health center (hospitals, clinics, elderly homes, children's shelters, collection centers) maintains **one living list** (*lista*) of the supplies (*insumos*) it needs right now, organized into three buckets — **Urgente / Necesitamos / No aceptamos**. There is **no countdown**: a lista never expires on a timer, it just gets **stale** (`now − updated_at`), and a freshness nudge ("Actualizada hace 5 días · ¿sigue vigente?") asks the center to re-confirm. A stale lista **sinks in the donor ordering** instead of being taken down. Donors browse **anonymously, with no login**, and share a center's lista as a link.

It was built urgently in response to an earthquake, so **reliability under a donor traffic surge matters**. The UI is Spanish (es-VE) and mobile-first (390px).

> **Model history**: VeneMed began *time-windowed* — centers published per-request *solicitudes* with a 12/24/48h countdown and an expiry cron. It pivoted to the evergreen **lista** model above (`request`→`lista`, one lista per center, freshness instead of expiry, per-item urgency, excess folded in as an item bucket). The canonical model is [`docs/specs/lista-model-v2.md`](./docs/specs/lista-model-v2.md).

### The three surfaces

- **Donor (public, no auth)** — `src/app/(public)`. Landing `/`, active-listas list `/listas` (**one card per center**), lista detail `/listas/[id]` (opens as an intercepted bottom-sheet `@modal` over the list, full-page on direct load). Includes share tracking. This is where the surge lands → it is **CDN-cached**.
- **Center back office (auth, gated by middleware)** — `src/app/(center)/centro`. Email-OTP login, `registro`, `en-revision`, `rechazado`, `perfil` (inline edit + a "Recepción de donaciones" toggle that closes all listas), the one-lista dashboard (freshness card + Urgente/Necesitamos/No aceptamos + inactive-listas history), the `lista` create-once/edit editor (item selector + mark-urgent + excess step + publish), and `equipo`/`unirse` (team roles + single-use email invitations).
- **Admin moderation** — `src/app/(admin)/admin`. Email-OTP login (`is_platform_admin` flag), the moderation queue, `centros/[id]` center review, approve/reject with a reason and an append-only `moderation_event` audit trail. (A centers directory / suspend UI is **not built** yet.)

## Design file (Figma)

The source of truth for visual design is the Figma file:

**https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp**

The lista model is designed on the **"Back Office - Junio 30"** page; the donor surface on the **Landing** page. The designer brief lives in [`docs/briefs/`](./docs/briefs/).

## Project status

| Area | State | Notes |
|---|---|---|
| Lista model v2 | ✅ Done | `request`→`lista`, no time windows, freshness + per-item urgency, excess as an item bucket, expiry cron retired. Slices A/B/C = PRs #36/#41/#39. |
| Donor surface (public, no auth) | ✅ Done | Landing, one-card-per-center list, detail bottom-sheet, share tracking, CDN-cached. In `main`. |
| Center auth (email OTP via Resend SMTP) | ✅ Done | Login + moderation-gate routing. Migrated off phone/Twilio OTP (migration 0008). |
| Center registration + edit | ✅ Done | Registro creates a center as `pending_review`; edit center data inline on the profile. |
| Center workspace (dashboard, editor, reception) | ✅ Done | One-lista dashboard (freshness card + 3 buckets), create-once/edit editor with urgency + excess step, "Recepción de donaciones" toggle. |
| Team roles + invitations | ✅ Done | Responsable/Operador roles + single-use email invitations (PR #43). |
| Admin moderation | ✅ Done | Admin login OTP, moderation queue, center review, approve/reject + audit. |
| UI-kit audit | ✅ Done | Token foundation + primitives (Button/Input/Chip/Card/AppBar/Sheet, StatusBadge, RoleTag). PRs #57/#59. |
| Admin centers directory / suspend UI | ⛔ Not built | Out of scope of the shipped admin slice. |
| Offline / PWA (read + draft-with-confirm) | 🔭 Planned | Data model already has sync columns (client `id`, `idempotency_key`, `updated_at`). |
| Local dev DB + CI infra | ✅ Done | Local Supabase stack via the CLI on Docker; CI lint+tsc gate + Playwright e2e on an ephemeral local Supabase; auto-migrate on prod deploy. |

## Local setup

You need **Docker** running (for the local Supabase stack) and **pnpm**.

```bash
# 1. Clone
git clone https://github.com/raulandreroman/venemed.git
cd venemed

# 2. Install
pnpm install

# 3. Env — copy the template and fill in what you need
cp .env.example .env.local
```

Local dev and e2e run against a **fully-local Supabase stack** (Postgres + Auth + Storage) on Docker — never the cloud/prod DB. The local anon/service keys are the well-known public demo keys and are safe to use locally.

```bash
# One-shot: boot local Supabase, migrate + seed, then start dev
pnpm dev:local
```

Or step by step:

```bash
pnpm supabase:start   # boot local Supabase on Docker (first run pulls images)
pnpm db:setup         # drizzle migrate + seed  (== db:migrate && db:seed)
pnpm dev              # serve against local — the donor list shows seeded listas
pnpm supabase:stop    # tear down when done (data persists across start/stop)
```

Deterministic local credentials: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. Email OTP works **offline** via an `[auth.email.test_otp]` map in `supabase/config.toml` (test codes are `123456`). Migrations stay **Drizzle-owned** — nothing goes in `supabase/migrations/`.

To work against the real cloud env locally, `vercel env pull .env.local` restores the prod credentials. Never commit `.env*` (only `.env.example`).

### Key env vars

`POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (direct, migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TEST_CENTER_EMAIL`, `TEST_CENTER_EMAIL_2`, `TEST_ADMIN_EMAIL`, `TEST_OTP_CODE`. The feature flag `NEXT_PUBLIC_FEATURE_CENTER_TYPE` (default `false`) hides the "Tipo de centro" registration field and the donor "Sector" filter.

## Day-to-day commands

```bash
pnpm dev                 # local dev server
pnpm build               # runs scripts/prebuild-migrate.mjs (auto-migrate) then next build
pnpm start               # serve a production build
pnpm lint                # eslint — CI gate
npx tsc --noEmit         # typecheck — CI gate
pnpm db:generate         # drizzle-kit: generate a migration from schema.ts
pnpm db:migrate          # apply migrations
pnpm db:push             # drizzle-kit push
pnpm db:seed             # ⚠️ DESTRUCTIVE: deletes+recreates centers/listas/supplies — LOCAL only
pnpm db:setup            # db:migrate && db:seed
pnpm db:studio           # drizzle studio
pnpm supabase:start | supabase:stop | supabase:status   # local Supabase lifecycle
pnpm dev:local           # supabase:start && db:setup && dev (one-shot)
pnpm test:e2e            # Playwright smoke
pnpm test:e2e:ui         # Playwright UI mode
```

## How to contribute

The flow is **feature branch → PR → CI + Vercel preview → squash-merge to `main` → auto-deploy**.

1. Branch off `main` (e.g. `feat/...`, `fix/...`, `docs/...`).
2. Open a PR. **`main` is protected**: a PR with a green `ci` check is required.
3. CI runs on every PR:
   - **`ci.yml`** — `pnpm install --frozen-lockfile`, `pnpm lint`, `npx tsc --noEmit`. (It does **not** run `build` — Vercel does that with DB env at build time.)
   - **`e2e.yml`** — Playwright smoke against an ephemeral local Supabase spun up on the runner (safe, never prod). Donor specs are data-independent; center/admin specs write bounded test data. Informational for now.
4. **Vercel**: PRs get an auth-gated preview deploy; pushing to `main` deploys to production (`https://venemedapp.org`).
5. **Squash-merge** to `main`.

Use **conventional commits**; end commit messages with `Claude-Session: <url>`.

**Stacked PRs**: retarget the child PR to `main` *before* merging or deleting the parent branch (deleting the parent auto-closes the child), then rebase the child onto `main` to drop the squashed-duplicate commits.

## Conventions

- **Identifiers in English, UI copy in Spanish (es-VE).** Table/column/enum names are English (`lista` = the center's list, `supply` = *insumo*, `center` = *centro*); user-facing strings are es-VE.
- **Design system** lives in `src/components/ui` + `globals.css` tokens (from the Figma UI Kit). Font **Inter**; type scale Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Single-accent principle:** the blue accent `#1F5AA8` is **only** for actions (buttons, links, active/selected, focus). Everything else is neutral; semantic colors (`success/warning/error`) only signal state. **Use tokens, don't hardcode hex.** Mobile-first **390px**.
- **Server Components by default**; `"use client"` only where interactivity needs it. Match the surrounding code.
- **Authorization is in server code, not RLS.** Data access is Drizzle/postgres-js, which bypasses RLS; Supabase Auth is only the identity/session layer. Authorization is enforced in server code by the logged-in center's `center_id`.
- A few Next 16 / app rules worth knowing up front: a `"use server"` file may export **only** async functions (import types with `import type`); `cookies()` is async; `revalidateTag` needs the 2-arg form `revalidateTag(tag, "max")`; never call `setState` synchronously in a `useEffect` body (hard eslint error); the login/identity email is normalized via `normalizeEmail()` (the optional `center.whatsapp_phone` contact field still uses `normalizeVePhone()`).

## Where to go deeper

- **[`AGENTS.md`](./AGENTS.md)** — the canonical AI-agent guide with the full set of architecture decisions and hard-won gotchas (read this before writing center/action code).
- **[`docs/specs/`](./docs/specs/)** — canonical specs: **`lista-model-v2.md`** (the model of record — data model, freshness, donor surface, center workspace), `center-auth.md`, `center-registration.md`, `center-edit.md`, `admin-moderation.md`, `e2e-smoke.md`, `local-dev-db.md`, `ui-kit-audit.md`.
- **[`docs/ci-cd.md`](./docs/ci-cd.md)** — CI/CD details (Spanish). Data-model diagram at `docs/diagrams/data-model.drawio.xml`.

---

<a id="español"></a>
# Español

## Qué es VeneMed

VeneMed es una **plataforma de ayuda médica para Venezuela basada en listas**. Cada centro de salud (hospitales, clínicas, hogares de ancianos, casas de abrigo, centros de acopio) mantiene **una sola lista viva** de los *insumos* que necesita ahora, organizada en tres secciones — **Urgente / Necesitamos / No aceptamos**. No hay cuenta regresiva: una lista no expira por un temporizador, simplemente se pone **vieja** (`now − updated_at`), y un aviso de frescura ("Actualizada hace 5 días · ¿sigue vigente?") invita al centro a reconfirmar. Una lista vieja **baja en el orden** para el donante en lugar de desaparecer. Los donantes navegan **de forma anónima, sin login**, y comparten la lista de un centro como un enlace.

Se construyó con urgencia tras un terremoto, así que **la confiabilidad bajo un pico de tráfico de donantes importa**. La interfaz está en español (es-VE) y es mobile-first (390px).

> **Historia del modelo**: VeneMed empezó *con ventanas de tiempo* — los centros publicaban *solicitudes* por pedido con una cuenta regresiva de 12/24/48h y un cron de expiración. Pivotó al modelo **lista** evergreen de arriba (`request`→`lista`, una lista por centro, frescura en vez de expiración, urgencia por ítem, y el exceso plegado como un bucket de ítems). El modelo canónico está en [`docs/specs/lista-model-v2.md`](./docs/specs/lista-model-v2.md).

### Las tres superficies

- **Donante (público, sin auth)** — `src/app/(public)`. Landing `/`, lista de listas activas `/listas` (**una card por centro**), detalle `/listas/[id]` (se abre como bottom-sheet interceptado `@modal` sobre la lista; página completa si se entra directo). Incluye el seguimiento de compartir. Aquí llega el pico → está **cacheado en CDN**.
- **Back office de centro (con auth, protegido por middleware)** — `src/app/(center)/centro`. Login por OTP de email, `registro`, `en-revision`, `rechazado`, `perfil` (edición inline + un toggle "Recepción de donaciones" que cierra todas las listas), el dashboard de una-sola-lista (card de frescura + Urgente/Necesitamos/No aceptamos + historial de listas inactivas), el editor `lista` de crear-una-vez/editar (selector de ítems + marcar urgente + paso de exceso + publicar), y `equipo`/`unirse` (roles de equipo + invitaciones de un solo uso por email).
- **Moderación admin** — `src/app/(admin)/admin`. Login por OTP de email (flag `is_platform_admin`), cola de moderación, revisión de centro `centros/[id]`, aprobar/rechazar con motivo y una bitácora de auditoría `moderation_event` solo-agregar. (El directorio de centros / UI para suspender **aún no está construido**.)

## Archivo de diseño (Figma)

La fuente de verdad del diseño visual es el archivo de Figma:

**https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp**

El modelo lista está diseñado en la página **"Back Office - Junio 30"**; la superficie de donante en la página **Landing**. El brief del diseñador está en [`docs/briefs/`](./docs/briefs/).

## Estado del proyecto

| Área | Estado | Notas |
|---|---|---|
| Modelo lista v2 | ✅ Listo | `request`→`lista`, sin ventanas de tiempo, frescura + urgencia por ítem, exceso como bucket de ítems, cron de expiración retirado. Slices A/B/C = PRs #36/#41/#39. |
| Superficie de donante (público, sin auth) | ✅ Listo | Landing, lista de una-card-por-centro, detalle bottom-sheet, seguimiento de compartir, cacheado en CDN. En `main`. |
| Auth de centro (OTP por email vía Resend SMTP) | ✅ Listo | Login + ruteo según la compuerta de moderación. Migrado desde OTP de teléfono/Twilio (migración 0008). |
| Registro + edición de centro | ✅ Listo | El registro crea el centro como `pending_review`; edición de datos inline en el perfil. |
| Workspace de centro (dashboard, editor, recepción) | ✅ Listo | Dashboard de una-sola-lista (card de frescura + 3 buckets), editor crear-una-vez/editar con urgencia + paso de exceso, toggle "Recepción de donaciones". |
| Roles de equipo + invitaciones | ✅ Listo | Roles Responsable/Operador + invitaciones de un solo uso por email (PR #43). |
| Moderación admin | ✅ Listo | Login admin por OTP, cola de moderación, revisión de centro, aprobar/rechazar + auditoría. |
| Auditoría del UI-kit | ✅ Listo | Fundación de tokens + primitivas (Button/Input/Chip/Card/AppBar/Sheet, StatusBadge, RoleTag). PRs #57/#59. |
| Directorio de centros admin / UI de suspender | ⛔ No construido | Fuera del alcance del slice de admin entregado. |
| Offline / PWA (lectura + borrador-con-confirmación) | 🔭 Planificado | El modelo de datos ya tiene columnas de sync (`id` de cliente, `idempotency_key`, `updated_at`). |
| DB local de desarrollo + infra de CI | ✅ Listo | Stack local de Supabase vía el CLI en Docker; gate de lint+tsc en CI + e2e de Playwright sobre un Supabase local efímero; auto-migración al desplegar a prod. |

## Configuración local

Necesitas **Docker** corriendo (para el stack local de Supabase) y **pnpm**.

```bash
# 1. Clonar
git clone https://github.com/raulandreroman/venemed.git
cd venemed

# 2. Instalar
pnpm install

# 3. Env — copia la plantilla y completa lo que necesites
cp .env.example .env.local
```

El dev local y los e2e corren contra un **stack de Supabase totalmente local** (Postgres + Auth + Storage) en Docker — nunca la DB cloud/prod. Las llaves anon/service locales son las llaves demo públicas conocidas y son seguras de usar en local.

```bash
# Todo en uno: arrancar Supabase local, migrar + seed, y luego dev
pnpm dev:local
```

O paso a paso:

```bash
pnpm supabase:start   # arranca Supabase local en Docker (la primera vez baja las imágenes)
pnpm db:setup         # migrar + seed de drizzle  (== db:migrate && db:seed)
pnpm dev              # sirve contra local — la lista de donante muestra las listas del seed
pnpm supabase:stop    # apagar al terminar (los datos persisten entre start/stop)
```

Credenciales locales deterministas: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. El OTP por email funciona **offline** vía un mapa `[auth.email.test_otp]` en `supabase/config.toml` (los códigos de prueba son `123456`). Las migraciones son **propiedad de Drizzle** — nada va en `supabase/migrations/`.

Para trabajar contra el entorno cloud real desde local, `vercel env pull .env.local` restaura las credenciales de prod. Nunca commitees `.env*` (solo `.env.example`).

### Variables de entorno clave

`POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (directa, migraciones), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TEST_CENTER_EMAIL`, `TEST_CENTER_EMAIL_2`, `TEST_ADMIN_EMAIL`, `TEST_OTP_CODE`. El feature flag `NEXT_PUBLIC_FEATURE_CENTER_TYPE` (por defecto `false`) oculta el campo "Tipo de centro" del registro y el filtro "Sector" del donante.

## Comandos del día a día

```bash
pnpm dev                 # servidor de dev local
pnpm build               # corre scripts/prebuild-migrate.mjs (auto-migración) y luego next build
pnpm start               # sirve un build de producción
pnpm lint                # eslint — gate de CI
npx tsc --noEmit         # typecheck — gate de CI
pnpm db:generate         # drizzle-kit: genera una migración desde schema.ts
pnpm db:migrate          # aplica migraciones
pnpm db:push             # drizzle-kit push
pnpm db:seed             # ⚠️ DESTRUCTIVO: borra+recrea centers/listas/supplies — SOLO local
pnpm db:setup            # db:migrate && db:seed
pnpm db:studio           # drizzle studio
pnpm supabase:start | supabase:stop | supabase:status   # ciclo de vida de Supabase local
pnpm dev:local           # supabase:start && db:setup && dev (todo en uno)
pnpm test:e2e            # smoke de Playwright
pnpm test:e2e:ui         # modo UI de Playwright
```

## Cómo contribuir

El flujo es **rama de feature → PR → CI + preview de Vercel → squash-merge a `main` → auto-deploy**.

1. Ramifica desde `main` (p. ej. `feat/...`, `fix/...`, `docs/...`).
2. Abre un PR. **`main` está protegido**: se requiere un PR con el check `ci` en verde.
3. CI corre en cada PR:
   - **`ci.yml`** — `pnpm install --frozen-lockfile`, `pnpm lint`, `npx tsc --noEmit`. (**No** corre `build` — eso lo hace Vercel con el env de DB en build time.)
   - **`e2e.yml`** — smoke de Playwright contra un Supabase local efímero levantado en el runner (seguro, nunca prod). Los specs de donante son independientes de datos; los de centro/admin escriben datos de prueba acotados. Informativo por ahora.
4. **Vercel**: los PRs reciben un preview con auth; hacer push a `main` despliega a producción (`https://venemedapp.org`).
5. **Squash-merge** a `main`.

Usa **conventional commits**; termina los mensajes de commit con `Claude-Session: <url>`.

**PRs apilados (stacked)**: reapunta el PR hijo a `main` *antes* de mergear o borrar la rama padre (borrar el padre auto-cierra al hijo), luego haz rebase del hijo sobre `main` para descartar los commits duplicados del squash.

## Convenciones

- **Identificadores en inglés, copy de UI en español (es-VE).** Nombres de tablas/columnas/enums en inglés (`lista` = la lista del centro, `supply` = *insumo*, `center` = *centro*); los textos para el usuario en es-VE.
- **El design system** vive en `src/components/ui` + tokens de `globals.css` (del UI Kit de Figma). Fuente **Inter**; escala tipográfica Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Principio de acento único:** el azul de acento `#1F5AA8` es **solo** para acciones (botones, enlaces, activo/seleccionado, focus). Todo lo demás es neutral; los colores semánticos (`success/warning/error`) solo señalan estado. **Usa tokens, no hardcodees hex.** Mobile-first **390px**.
- **Server Components por defecto**; `"use client"` solo donde la interactividad lo necesite. Imita el código circundante.
- **La autorización está en el código del servidor, no en RLS.** El acceso a datos es Drizzle/postgres-js, que evita RLS; Supabase Auth es solo la capa de identidad/sesión. La autorización se aplica en el servidor por el `center_id` del centro logueado.
- Algunas reglas de Next 16 / app que conviene saber de entrada: un archivo `"use server"` solo puede exportar funciones async (importa tipos con `import type`); `cookies()` es async; `revalidateTag` necesita la forma de 2 argumentos `revalidateTag(tag, "max")`; nunca llames `setState` de forma síncrona dentro de un `useEffect` (error duro de eslint); el email de login/identidad se normaliza con `normalizeEmail()` (el campo de contacto opcional `center.whatsapp_phone` sigue usando `normalizeVePhone()`).

## Dónde profundizar

- **[`AGENTS.md`](./AGENTS.md)** — la guía canónica para agentes de IA, con el conjunto completo de decisiones de arquitectura y los gotchas aprendidos a golpes (léela antes de escribir código de centro/actions).
- **[`docs/specs/`](./docs/specs/)** — specs canónicas: **`lista-model-v2.md`** (el modelo de record — modelo de datos, frescura, superficie de donante, workspace de centro), `center-auth.md`, `center-registration.md`, `center-edit.md`, `admin-moderation.md`, `e2e-smoke.md`, `local-dev-db.md`, `ui-kit-audit.md`.
- **[`docs/ci-cd.md`](./docs/ci-cd.md)** — detalles de CI/CD (en español). Diagrama del modelo de datos en `docs/diagrams/data-model.drawio.xml`.

## Licencia

VeneMed es open source bajo la [Licencia MIT](./LICENSE). Al abrir un pull
request, aceptas licenciar tu contribución bajo los mismos términos. / VeneMed is
open source under the [MIT License](./LICENSE); by opening a pull request you
agree to license your contribution under the same terms.
