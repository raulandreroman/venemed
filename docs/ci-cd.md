# CI / CD

Flujo de integración y despliegue de VeneMed.

## Despliegue (Vercel)

- **Push a `main`** → despliegue a **producción**.
- **Pull request** → despliegue de **preview** automático por PR.

Vercel ejecuta el build de Next.js en cada despliegue (con las variables de
entorno de la DB disponibles en build time), por lo que el build no se repite
en GitHub Actions.

## Integración continua (GitHub Actions)

El workflow [`ci`](../.github/workflows/ci.yml) corre en cada `pull_request` y
en cada `push` a `main`. Hace solo **lint + typecheck**:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `npx tsc --noEmit`

No corre `pnpm build`: el build de Next necesita las variables de la DB en
build time y Vercel ya lo hace en cada despliegue. Mantener CI en lint+typecheck
lo hace rápido y sin secretos.

## Protección de ramas

- `main` está **protegida**: no se permite push directo.
- Los cambios entran por **pull request**, con el check `ci` requerido en verde.
- Los **admins pueden saltar** la protección para hotfixes de emergencia.
