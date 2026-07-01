# Contributing to VeneMed

**Language / Idioma:** **[English](#english)** · **[Español](#español)**

This is the human collaboration guide for designers, developers, and PMs. It is complementary to [`AGENTS.md`](./AGENTS.md), which is the canonical guide for AI agents and carries the deep gotchas. When in doubt about a runtime detail or a hard-won lesson, read `AGENTS.md`; for canonical product/data behavior, read the specs in [`docs/specs/`](./docs/specs/).

---

<a id="english"></a>
# English

## What VeneMed is

VeneMed is a **time-windowed medical-aid platform for Venezuela**. Health centers (hospitals, clinics, elderly homes, children's shelters, collection centers) publish *solicitudes* — requests for supplies (*insumos*) with a 12/24/48h window. Donors browse **anonymously, with no login**, and share requests as links with a countdown so they **stop circulating** once the window closes or is paused. This prevents wasted donations and center overload.

It was built urgently in response to an earthquake, so **reliability under a donor traffic surge matters**. The UI is Spanish (es-VE) and mobile-first (390px).

### The three surfaces

- **Donor (public, no auth)** — `src/app/(public)`. Landing `/`, active-requests list `/solicitudes`, request detail `/solicitudes/[id]` (opens as an intercepted bottom-sheet `@modal` over the list, full-page on direct load). Includes share-with-countdown tracking. This is where the surge lands → it is **CDN-cached**.
- **Center back office (auth, gated by middleware)** — `src/app/(center)/centro`. Phone-OTP login, `registro`, `en-revision`, `rechazado`, `perfil` (with inline edit + a "Recepción de donaciones" close-all toggle), the dashboard (Todas/Activas/Inactivas filter, activas/inactivas split, Reactivar), `solicitudes/nueva` (create + insumo selector + publish), and `solicitudes/[id]` detail (Finalizar / Extender / Reactivar) with a published confirmation.
- **Admin moderation** — `src/app/(admin)/admin`. Phone-OTP login (`is_platform_admin` flag), the moderation queue, `centros/[id]` center review, approve/reject with a reason and an append-only `moderation_event` audit trail. (A centers directory / suspend UI is **not built** yet.)

## Design file (Figma)

The source of truth for visual design is the Figma file:

**https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp**

Relevant areas: Back Office page (node `7:34`), Admin section (node `51:1868`). The designer brief lives in [`docs/briefs/`](./docs/briefs/).

## Project status

| Area | State | Notes |
|---|---|---|
| Donor surface (public, no auth) | ✅ Done | Landing, active-requests list, detail bottom-sheet, share tracking, CDN-cached. In `main`. |
| Center auth (phone OTP, WhatsApp/SMS via Twilio Verify) | ✅ Done | Login + moderation-gate routing. SMS-first at launch; WhatsApp auto-promotes once the Meta sender is approved. |
| Center registration + edit | ✅ Done | Registro creates a center as `pending_review`; edit center data inline on the profile. |
| Center workspace (dashboard, create, manage) | ✅ Done | Dashboard (Todas/Activas/Inactivas, Reactivar), crear solicitud + insumo selector + publish, request detail (Finalizar/Extender/Reactivar), profile + "Recepción de donaciones" toggle. Landed across PRs #14–#20. |
| Admin moderation | ✅ Done | Admin login OTP, moderation queue, center review, approve/reject + audit. In `main` (PR #9). |
| Admin centers directory / suspend UI | ⛔ Not built | Out of scope of the shipped admin slice. |
| Aviso de exceso (surplus as center banner, not card) | 🟡 In review | Open PR #27 (`feat/aviso-exceso`). Reuses `request.kind='surplus'`; a yellow center-level banner supersedes the old "No enviar" card. |
| Security-audit fixes | 🟡 In review | Open PR #28 (`security/audit-fixes`): constant-time cron auth + RLS deny-all on the Supabase Data API. |
| Local dev DB + CI infra | ✅ Done | Local Supabase stack via the CLI on Docker; CI lint+tsc gate + Playwright e2e on an ephemeral local Supabase; auto-migrate on prod deploy; 5-min expiry cron via GitHub Actions. |
| Offline / PWA (read + draft-with-confirm) | 🔭 Planned | Data model already has sync columns (client `id`, `idempotency_key`, `updated_at`). |
| Twilio WhatsApp sender onboarding | ⏳ In progress | Meta sender approval pending; WhatsApp auto-promotes from SMS once approved. |

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
pnpm dev              # serve against local — the donor list shows seeded requests
pnpm supabase:stop    # tear down when done (data persists across start/stop)
```

Deterministic local credentials: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. Phone OTP works **offline** via an `[auth.sms.test_otp]` map in `supabase/config.toml` (test codes are `123456`). Migrations stay **Drizzle-owned** — nothing goes in `supabase/migrations/`.

To work against the real cloud env locally, `vercel env pull .env.local` restores the prod credentials. Never commit `.env*` (only `.env.example`).

### Key env vars

`POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (direct, migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TEST_CENTER_PHONE`, `TEST_CENTER_PHONE_2`, `TEST_ADMIN_PHONE`, `TEST_OTP_CODE`. The feature flag `NEXT_PUBLIC_FEATURE_CENTER_TYPE` (default `false`) hides the "Tipo de centro" registration field and the donor "Sector" filter.

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
pnpm db:seed             # ⚠️ DESTRUCTIVE: deletes+recreates centers/requests/supplies — LOCAL only
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
   - **`expire-requests.yml`** — a schedule (every 5 min) that curls the prod expiry-cron endpoint. Not a PR gate.
4. **Vercel**: PRs get an auth-gated preview deploy; pushing to `main` deploys to production (`https://venemed.vercel.app`).
5. **Squash-merge** to `main`.

Use **conventional commits**; end commit messages with `Claude-Session: <url>`.

**Stacked PRs**: retarget the child PR to `main` *before* merging or deleting the parent branch (deleting the parent auto-closes the child), then rebase the child onto `main` to drop the squashed-duplicate commits.

## Conventions

- **Identifiers in English, UI copy in Spanish (es-VE).** Table/column/enum names are English (`request` = *solicitud*, `supply` = *insumo*, `center` = *centro*); user-facing strings are es-VE.
- **Design system** lives in `src/components/ui` + `globals.css` tokens (from the Figma UI Kit). Font **Inter**; type scale Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Single-accent principle:** the blue accent `#1F5AA8` is **only** for actions (buttons, links, active/selected, focus). Everything else is neutral; semantic colors (`success/warning/error`) only signal state. **Use tokens, don't hardcode hex.** Mobile-first **390px**.
- **Server Components by default**; `"use client"` only where interactivity needs it. Match the surrounding code.
- **Authorization is in server code, not RLS.** Data access is Drizzle/postgres-js, which bypasses RLS; Supabase Auth is only the identity/session layer. Authorization is enforced in server code by the logged-in center's `center_id`.
- A few Next 16 / app rules worth knowing up front: a `"use server"` file may export **only** async functions (import types with `import type`); `cookies()` is async; `revalidateTag` needs the 2-arg form `revalidateTag(tag, "max")`; never call `setState` synchronously in a `useEffect` body (hard eslint error); always normalize phones via `normalizeVePhone()` → canonical `+58XXXXXXXXXX`.

## Where to go deeper

- **[`AGENTS.md`](./AGENTS.md)** — the canonical AI-agent guide with the full set of architecture decisions and hard-won gotchas (read this before writing center/action code).
- **[`docs/specs/`](./docs/specs/)** — canonical specs: `data-model.md`, `cron-jobs.md`, `donor-slice.md`, `donor-fidelity.md`, `center-auth.md`, `center-registration.md`, `center-edit.md`, `center-workspace.md`, `admin-moderation.md`, `aviso-exceso.md`, `backend-fields-cron.md`, `e2e-smoke.md`, `local-dev-db.md`.
- **[`docs/ci-cd.md`](./docs/ci-cd.md)** — CI/CD details (Spanish). Data-model diagram at `docs/diagrams/data-model.drawio.xml`.

---

<a id="español"></a>
# Español

## Qué es VeneMed

VeneMed es una **plataforma de ayuda médica con ventanas de tiempo para Venezuela**. Los centros de salud (hospitales, clínicas, hogares de ancianos, casas de abrigo, centros de acopio) publican *solicitudes* de *insumos* con una ventana de 12/24/48h. Los donantes navegan **de forma anónima, sin login**, y comparten las solicitudes como enlaces con una cuenta regresiva para que **dejen de circular** cuando la ventana cierra o se pausa. Así se evitan donaciones desperdiciadas y la saturación de los centros.

Se construyó con urgencia tras un terremoto, así que **la confiabilidad bajo un pico de tráfico de donantes importa**. La interfaz está en español (es-VE) y es mobile-first (390px).

### Las tres superficies

- **Donante (público, sin auth)** — `src/app/(public)`. Landing `/`, lista de solicitudes activas `/solicitudes`, detalle `/solicitudes/[id]` (se abre como bottom-sheet interceptado `@modal` sobre la lista; página completa si se entra directo). Incluye el seguimiento de "compartir con cuenta regresiva". Aquí llega el pico → está **cacheado en CDN**.
- **Back office de centro (con auth, protegido por middleware)** — `src/app/(center)/centro`. Login por OTP de teléfono, `registro`, `en-revision`, `rechazado`, `perfil` (con edición inline + un toggle "Recepción de donaciones" para cerrar todo), el dashboard (filtro Todas/Activas/Inactivas, separación activas/inactivas, Reactivar), `solicitudes/nueva` (crear + selector de insumos + publicar) y el detalle `solicitudes/[id]` (Finalizar / Extender / Reactivar) con confirmación de publicada.
- **Moderación admin** — `src/app/(admin)/admin`. Login por OTP de teléfono (flag `is_platform_admin`), cola de moderación, revisión de centro `centros/[id]`, aprobar/rechazar con motivo y una bitácora de auditoría `moderation_event` solo-agregar. (El directorio de centros / UI para suspender **aún no está construido**.)

## Archivo de diseño (Figma)

La fuente de verdad del diseño visual es el archivo de Figma:

**https://www.figma.com/design/tGvDuvWW99K4QzDH0GlmW7/VenemedApp**

Áreas relevantes: página Back Office (nodo `7:34`), sección Admin (nodo `51:1868`). El brief del diseñador está en [`docs/briefs/`](./docs/briefs/).

## Estado del proyecto

| Área | Estado | Notas |
|---|---|---|
| Superficie de donante (público, sin auth) | ✅ Listo | Landing, lista de solicitudes activas, detalle bottom-sheet, seguimiento de compartir, cacheado en CDN. En `main`. |
| Auth de centro (OTP de teléfono, WhatsApp/SMS vía Twilio Verify) | ✅ Listo | Login + ruteo según la compuerta de moderación. SMS primero al lanzar; WhatsApp se auto-promueve cuando se apruebe el remitente de Meta. |
| Registro + edición de centro | ✅ Listo | El registro crea el centro como `pending_review`; edición de datos inline en el perfil. |
| Workspace de centro (dashboard, crear, gestionar) | ✅ Listo | Dashboard (Todas/Activas/Inactivas, Reactivar), crear solicitud + selector de insumos + publicar, detalle (Finalizar/Extender/Reactivar), perfil + toggle "Recepción de donaciones". Entregado entre los PRs #14–#20. |
| Moderación admin | ✅ Listo | Login admin por OTP, cola de moderación, revisión de centro, aprobar/rechazar + auditoría. En `main` (PR #9). |
| Directorio de centros admin / UI de suspender | ⛔ No construido | Fuera del alcance del slice de admin entregado. |
| Aviso de exceso (excedente como banner del centro, no card) | 🟡 En revisión | PR #27 abierto (`feat/aviso-exceso`). Reusa `request.kind='surplus'`; un banner amarillo a nivel de centro reemplaza la antigua card "No enviar". |
| Correcciones de auditoría de seguridad | 🟡 En revisión | PR #28 abierto (`security/audit-fixes`): auth de cron en tiempo constante + RLS deny-all en la Data API de Supabase. |
| DB local de desarrollo + infra de CI | ✅ Listo | Stack local de Supabase vía el CLI en Docker; gate de lint+tsc en CI + e2e de Playwright sobre un Supabase local efímero; auto-migración al desplegar a prod; cron de expiración cada 5 min vía GitHub Actions. |
| Offline / PWA (lectura + borrador-con-confirmación) | 🔭 Planificado | El modelo de datos ya tiene columnas de sync (`id` de cliente, `idempotency_key`, `updated_at`). |
| Onboarding del remitente de WhatsApp en Twilio | ⏳ En progreso | Aprobación del remitente de Meta pendiente; WhatsApp se auto-promueve desde SMS al aprobarse. |

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
pnpm dev              # sirve contra local — la lista de donante muestra las solicitudes del seed
pnpm supabase:stop    # apagar al terminar (los datos persisten entre start/stop)
```

Credenciales locales deterministas: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. El OTP de teléfono funciona **offline** vía un mapa `[auth.sms.test_otp]` en `supabase/config.toml` (los códigos de prueba son `123456`). Las migraciones son **propiedad de Drizzle** — nada va en `supabase/migrations/`.

Para trabajar contra el entorno cloud real desde local, `vercel env pull .env.local` restaura las credenciales de prod. Nunca commitees `.env*` (solo `.env.example`).

### Variables de entorno clave

`POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (directa, migraciones), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TEST_CENTER_PHONE`, `TEST_CENTER_PHONE_2`, `TEST_ADMIN_PHONE`, `TEST_OTP_CODE`. El feature flag `NEXT_PUBLIC_FEATURE_CENTER_TYPE` (por defecto `false`) oculta el campo "Tipo de centro" del registro y el filtro "Sector" del donante.

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
pnpm db:seed             # ⚠️ DESTRUCTIVO: borra+recrea centers/requests/supplies — SOLO local
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
   - **`expire-requests.yml`** — un schedule (cada 5 min) que hace curl al endpoint de cron de expiración en prod. No es un gate de PR.
4. **Vercel**: los PRs reciben un preview con auth; hacer push a `main` despliega a producción (`https://venemed.vercel.app`).
5. **Squash-merge** a `main`.

Usa **conventional commits**; termina los mensajes de commit con `Claude-Session: <url>`.

**PRs apilados (stacked)**: reapunta el PR hijo a `main` *antes* de mergear o borrar la rama padre (borrar el padre auto-cierra al hijo), luego haz rebase del hijo sobre `main` para descartar los commits duplicados del squash.

## Convenciones

- **Identificadores en inglés, copy de UI en español (es-VE).** Nombres de tablas/columnas/enums en inglés (`request` = *solicitud*, `supply` = *insumo*, `center` = *centro*); los textos para el usuario en es-VE.
- **El design system** vive en `src/components/ui` + tokens de `globals.css` (del UI Kit de Figma). Fuente **Inter**; escala tipográfica Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Principio de acento único:** el azul de acento `#1F5AA8` es **solo** para acciones (botones, enlaces, activo/seleccionado, focus). Todo lo demás es neutral; los colores semánticos (`success/warning/error`) solo señalan estado. **Usa tokens, no hardcodees hex.** Mobile-first **390px**.
- **Server Components por defecto**; `"use client"` solo donde la interactividad lo necesite. Imita el código circundante.
- **La autorización está en el código del servidor, no en RLS.** El acceso a datos es Drizzle/postgres-js, que evita RLS; Supabase Auth es solo la capa de identidad/sesión. La autorización se aplica en el servidor por el `center_id` del centro logueado.
- Algunas reglas de Next 16 / app que conviene saber de entrada: un archivo `"use server"` solo puede exportar funciones async (importa tipos con `import type`); `cookies()` es async; `revalidateTag` necesita la forma de 2 argumentos `revalidateTag(tag, "max")`; nunca llames `setState` de forma síncrona dentro de un `useEffect` (error duro de eslint); normaliza siempre los teléfonos con `normalizeVePhone()` → canónico `+58XXXXXXXXXX`.

## Dónde profundizar

- **[`AGENTS.md`](./AGENTS.md)** — la guía canónica para agentes de IA, con el conjunto completo de decisiones de arquitectura y los gotchas aprendidos a golpes (léela antes de escribir código de centro/actions).
- **[`docs/specs/`](./docs/specs/)** — specs canónicas: `data-model.md`, `cron-jobs.md`, `donor-slice.md`, `donor-fidelity.md`, `center-auth.md`, `center-registration.md`, `center-edit.md`, `center-workspace.md`, `admin-moderation.md`, `aviso-exceso.md`, `backend-fields-cron.md`, `e2e-smoke.md`, `local-dev-db.md`.
- **[`docs/ci-cd.md`](./docs/ci-cd.md)** — detalles de CI/CD (en español). Diagrama del modelo de datos en `docs/diagrams/data-model.drawio.xml`.

## Licencia

VeneMed es open source bajo la [Licencia MIT](./LICENSE). Al abrir un pull
request, aceptas licenciar tu contribución bajo los mismos términos. / VeneMed is
open source under the [MIT License](./LICENSE); by opening a pull request you
agree to license your contribution under the same terms.
