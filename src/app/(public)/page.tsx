import type { Metadata } from "next";
import Link from "next/link";

import { Button, Logo, RequestCard } from "@/components/ui";
import { getActiveListas, getLandingStats } from "@/db/queries";
import { LANDING_STATS_ENABLED } from "@/lib/flags";
import { formatRelativeTime } from "@/lib/format";

// Surge-facing read path: ISR, regenerated at most once per minute.
// Underlying queries are additionally memoized via unstable_cache.
export const revalidate = 60;

// Title/description/openGraph come from the root layout defaults; only the
// canonical is page-specific.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    n: 1,
    title: "El centro publica su lista",
    body: "El solicitante detalla qué necesita, y qué no.",
  },
  {
    n: 2,
    title: "Donantes ven y comparten",
    body: "Organizaciones o donantes individuales saben a dónde distribuir los recursos.",
  },
  {
    n: 3,
    title: "La lista se mantiene al día",
    body: "Los centros confirman lo que sigue vigente; lo desactualizado baja de prioridad.",
  },
];

export default async function LandingPage() {
  const [stats, requests] = await Promise.all([
    LANDING_STATS_ENABLED ? getLandingStats() : null,
    getActiveListas(),
  ]);
  const featured = requests.slice(0, 3);
  const lastUpdated = stats?.lastUpdated
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
          className="rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 py-2 text-[15px] font-semibold text-neutral-900"
        >
          Ingresar
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-5 bg-surface px-6 pb-8 pt-10">
        <h1 className="text-[28px] font-bold leading-[34px] text-neutral-900">
          El puente directo entre tu ayuda y quien la necesita.
        </h1>
        <p className="text-base leading-6 text-neutral-500">
          Comunidades organizadas publican lo que necesitan. Los donantes lo ven
          y lo comparten. Sin que nada se pierda.
        </p>
        <Button href="/listas" variant="primary" fullWidth>
          Ver listas activas
        </Button>
      </section>

      {/* Live stats (flag-gated, off by default) */}
      {stats && (
        <section className="flex items-center justify-between border-y border-neutral-300 bg-surface px-6 py-4">
          <Stat value={String(stats.activeRequests)} label="listas" />
          <div className="h-8 w-px bg-neutral-300" />
          <Stat value={String(stats.approvedCenters)} label="centros" />
          <div className="h-8 w-px bg-neutral-300" />
          <Stat value={lastUpdated} label="actualizado" />
        </section>
      )}

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
          href="/listas"
          className="flex items-center justify-center py-4 text-sm font-semibold text-accent"
        >
          Ver todas las listas  →
        </Link>
      </section>

      {/* Center CTA */}
      <section className="bg-surface p-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-accent-border bg-accent-subtle p-5">
          <p className="text-lg font-semibold leading-6 text-neutral-900">
            ¿Trabajas en un hospital, refugio o centro de acopio?
          </p>
          <p className="text-sm leading-5 text-neutral-700">
            Crea una lista fácil de compartir que permitirá mayor claridad en las
            donaciones.
          </p>
          <Button href="/centro" variant="primary" fullWidth>
            Registrar mi centro
          </Button>
        </div>
      </section>

      {/* Privacy reassurance */}
      <section className="bg-surface px-6 pb-8 pt-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
              <ShieldIcon />
            </span>
            <p className="text-lg font-semibold text-neutral-900">
              Tus datos, protegidos
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-600">
            <li className="flex gap-2.5">
              <Dot />
              <span>Los donantes son anónimos: sin cuenta y sin rastreo.</span>
            </li>
            <li className="flex gap-2.5">
              <Dot />
              <span>La identidad de las personas de los centros nunca es pública.</span>
            </li>
            <li className="flex gap-2.5">
              <Dot />
              <span>No vendemos datos ni mostramos publicidad.</span>
            </li>
          </ul>
          <Link
            href="/privacidad"
            className="w-fit text-sm font-semibold text-accent"
          >
            Leer la política de privacidad  →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-3.5 bg-neutral-50 px-6 py-8">
        <p className="text-lg font-bold text-neutral-900">VeneMed</p>
        <p className="text-sm text-neutral-500">
          Ayuda que llega a tiempo, sin desperdicio.
        </p>
        <nav className="flex flex-wrap gap-[18px] pt-2 text-sm font-medium text-neutral-700">
          <Link href="/">Sobre</Link>
          <Link href="/centro">Centros</Link>
          <Link href="/listas">Cómo ayudar</Link>
          <Link href="/privacidad">Privacidad</Link>
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

function Dot() {
  return (
    <span
      aria-hidden
      className="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-300"
    />
  );
}

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

