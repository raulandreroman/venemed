import Link from "next/link";

import { Button, RequestCard } from "@/components/ui";
import { getActiveRequests, getLandingStats } from "@/db/queries";
import { formatRelativeTime } from "@/lib/format";

// Surge-facing read path: ISR, regenerated at most once per minute.
// Underlying queries are additionally memoized via unstable_cache.
export const revalidate = 60;

const STEPS = [
  {
    n: 1,
    title: "El centro publica una solicitud",
    body: "El hospital o clínica detalla qué necesita.",
  },
  {
    n: 2,
    title: "Los donantes ven y comparten",
    body: "Donantes o centros de acopio saben a dónde distribuir los recursos.",
  },
  {
    n: 3,
    title: "La ventana se cierra a tiempo",
    body: "De esta forma evitamos que se pierdan donaciones.",
  },
];

export default async function LandingPage() {
  const [stats, requests] = await Promise.all([
    getLandingStats(),
    getActiveRequests(),
  ]);
  const featured = requests.slice(0, 3);
  const lastUpdated = stats.lastUpdated
    ? formatRelativeTime(stats.lastUpdated)
    : "—";

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-neutral-100 bg-surface px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-bold text-neutral-900">VeneMed</span>
        </Link>
        <Link
          href="/centro"
          className="rounded-xl border-[1.5px] border-neutral-300 bg-surface px-4 py-2 text-[15px] font-semibold text-neutral-900"
        >
          Ingresar
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-5 bg-surface px-6 pb-8 pt-10">
        <h1 className="text-[28px] font-bold leading-[34px] text-neutral-900">
          El puente directo entre tu ayuda y los hospitales.
        </h1>
        <p className="text-base leading-6 text-neutral-500">
          Conectamos centros de salud con donantes para que ninguna ayuda se
          pierda.
        </p>
        <Button href="/solicitudes" variant="primary" fullWidth>
          Ver solicitudes activas
        </Button>
      </section>

      {/* Live stats */}
      <section className="flex items-center justify-between border-y border-neutral-300 bg-surface px-6 py-4">
        <Stat value={String(stats.activeRequests)} label="solicitudes" />
        <div className="h-8 w-px bg-neutral-300" />
        <Stat value={String(stats.approvedCenters)} label="centros" />
        <div className="h-8 w-px bg-neutral-300" />
        <Stat value={lastUpdated} label="actualizado" />
      </section>

      {/* Cómo funciona */}
      <section className="flex flex-col gap-4 bg-neutral-50 px-6 py-6">
        <h2 className="text-[22px] font-bold text-neutral-900">Cómo funciona</h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step) => (
            <li key={step.n} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-base font-bold text-neutral-700">
                {step.n}
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-neutral-900">
                  {step.title}
                </p>
                <p className="text-sm leading-5 text-neutral-500">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Featured active requests */}
      <section className="flex flex-col gap-3 bg-surface px-6 pt-6">
        {featured.map((req) => (
          <RequestCard key={req.id} request={req} />
        ))}
        <Link
          href="/solicitudes"
          className="flex items-center justify-center py-4 text-sm font-semibold text-accent"
        >
          Ver todas las solicitudes  →
        </Link>
      </section>

      {/* Center CTA */}
      <section className="bg-surface p-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-accent-border bg-accent-subtle p-5">
          <p className="text-lg font-semibold leading-6 text-neutral-900">
            ¿Trabajas en un hospital, refugio o casa de cuidado?
          </p>
          <p className="text-sm leading-5 text-neutral-700">
            Recibe solo lo que tu centro puede procesar. Activa solicitudes con
            ventanas de tiempo y evita el colapso.
          </p>
          <Button href="/centro" variant="primary" fullWidth>
            Solicitar acceso al portal
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-3.5 bg-neutral-50 px-6 py-8">
        <p className="text-lg font-bold text-neutral-900">VeneMed</p>
        <p className="text-sm text-neutral-500">
          Ayuda que llega a tiempo, sin desperdicio.
        </p>
        <nav className="flex gap-[18px] pt-2 text-sm font-medium text-neutral-700">
          <Link href="/">Sobre</Link>
          <Link href="/centro">Centros</Link>
          <Link href="/solicitudes">Cómo ayudar</Link>
          <Link href="/">Contacto</Link>
        </nav>
        <div className="flex gap-[18px] text-xs font-medium text-neutral-500">
          <span>Instagram</span>
          <span>X</span>
          <span>TikTok</span>
        </div>
        <p className="text-xs text-neutral-500">© 2026 VeneMed</p>
      </footer>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex w-[85px] flex-col items-center gap-0.5">
      <p className="text-lg font-semibold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-accent">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M10 3h4a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-5H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h5V4a1 1 0 0 1 1-1z"
          fill="#ffffff"
        />
      </svg>
    </span>
  );
}
