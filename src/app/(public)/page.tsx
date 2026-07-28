import type { Metadata } from "next";
import Link from "next/link";

import { Button, Logo, RequestCard } from "@/components/ui";
import {
  getActiveListas,
  getActiveListaCategories,
  getLandingStats,
  type ListaFilters,
} from "@/db/queries";
import { centerType } from "@/db/schema";
import { CENTER_TYPE_ENABLED, LANDING_STATS_ENABLED } from "@/lib/flags";
import {
  CATEGORY_GROUPS,
  CATEGORY_GROUP_ORDER,
  categoryGroupOf,
  centerTypeLabel,
  formatRelativeTime,
} from "@/lib/format";
import { VE_STATES } from "@/lib/geo/ve-states";
import type { CenterType } from "@/lib/registro/validation";

import { FilterSelect } from "./_components/filter-select";
import { SearchBox } from "./_components/search-box";

// Surge-facing read path: ISR, regenerated at most once per minute.
// Underlying queries are additionally memoized via unstable_cache.
export const revalidate = 60;

// Title/description/openGraph come from the root layout defaults; only the
// canonical is page-specific.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

type SearchParams = {
  search?: string;
  state?: string;
  type?: string;
  category?: string;
  sort?: string;
};

/** Federal entities present in the feed, kept in the canonical VE_STATES order. */
function statesPresent(values: (string | null | undefined)[]): string[] {
  const present = new Set(values.filter((v): v is string => Boolean(v)));
  return VE_STATES.filter((s) => present.has(s));
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Donor home. The full lista feed lives here — hero, search, facets and cards on
 * one page; there is no separate /listas index (it permanently redirects here).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const search = sp.search?.trim().slice(0, 64) || undefined;
  const type =
    CENTER_TYPE_ENABLED &&
    (centerType.enumValues as readonly string[]).includes(sp.type ?? "")
      ? sp.type
      : undefined;

  const filters: ListaFilters = {
    search,
    state: sp.state,
    type,
    category: sp.category,
    sort: sp.sort === "alphabetical" ? "alphabetical" : "recent",
  };

  // Facets come from the FULL active feed (so an option never disappears while
  // filtering); only the last call is narrowed by the donor's selection.
  const [stats, allActive, activeCategories, requests] = await Promise.all([
    LANDING_STATS_ENABLED ? getLandingStats() : null,
    getActiveListas({}),
    getActiveListaCategories(),
    getActiveListas(filters),
  ]);

  const lastUpdated = stats?.lastUpdated
    ? formatRelativeTime(stats.lastUpdated)
    : "—";

  const states = statesPresent(allActive.map((r) => r.state));
  // Enum values present in the feed collapse into donor-facing GROUPS (the six
  // medical departments become one «Medicinas» option) — field-insight §2.
  const groupsPresent = new Set(activeCategories.map(categoryGroupOf));
  const categoryOptions = CATEGORY_GROUP_ORDER.filter((g) =>
    groupsPresent.has(g),
  ).map((g) => ({ value: g, label: CATEGORY_GROUPS[g].label }));
  const types = CENTER_TYPE_ENABLED
    ? uniqueSorted(
        allActive
          .map((r) => r.centerType)
          .filter((t): t is CenterType => t != null),
      )
    : [];

  const hasFilters = Boolean(
    sp.search || sp.state || (CENTER_TYPE_ENABLED && sp.type) || sp.category,
  );

  // The feed already orders verified-first; splitting it lets the unverified
  // block carry its own separator instead of blending into the directory.
  const verified = requests.filter((r) => r.verified);
  const unverified = requests.filter((r) => !r.verified);

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
          className="text-[15px] font-semibold text-accent hover:underline"
        >
          Iniciar sesión
        </Link>
      </header>

      {/* Hero — one block: the promise, who it is for, and the single action */}
      <section className="flex flex-col items-center gap-4 border-b border-neutral-100 bg-surface px-6 pb-7 pt-9 text-center">
        <h1 className="text-[28px] font-bold leading-[34px] text-neutral-900">
          El puente entre la ayuda y quien más la necesita.
        </h1>
        <p className="text-base leading-6 text-neutral-500">
          Listas claras y fáciles de compartir para que la ayuda llegue de
          forma eficiente.
        </p>
        <Button href="/centro/registro" variant="primary" fullWidth>
          Crear una lista
        </Button>
      </section>

      {/* Live stats (flag-gated, off by default) */}
      {stats && (
        <section className="flex items-center justify-between border-b border-neutral-300 bg-surface px-6 py-4">
          <Stat value={String(stats.activeRequests)} label="listas" />
          <div className="h-8 w-px bg-neutral-300" />
          <Stat value={String(stats.approvedCenters)} label="centros" />
          <div className="h-8 w-px bg-neutral-300" />
          <Stat value={lastUpdated} label="actualizado" />
        </section>
      )}

      {/* Filtros — one control shape: search + dropdown pills */}
      <section className="flex flex-col gap-3 bg-surface px-6 pb-4 pt-5">
        <SearchBox />

        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryOptions.length > 0 && (
            <FilterSelect
              param="category"
              label="Categoría"
              placeholder="Todo"
              allLabel="Todo"
              options={categoryOptions}
            />
          )}
          {types.length > 0 && (
            <FilterSelect
              param="type"
              label="Sector"
              placeholder="Sector"
              allLabel="Todos los sectores"
              options={types.map((t) => ({
                value: t,
                label: centerTypeLabel(t),
              }))}
            />
          )}
          {states.length > 0 && (
            <FilterSelect
              param="state"
              label="Estado"
              placeholder="Estado"
              allLabel="Todos los estados"
              options={states.map((s) => ({ value: s, label: s }))}
            />
          )}
        </div>
      </section>

      {/* Lista */}
      <section className="flex flex-1 flex-col gap-3 bg-surface px-6 pb-6">
        <div className="flex items-center justify-between gap-2 pb-1">
          <p className="text-sm font-semibold text-neutral-900">
            {requests.length === 1
              ? "1 lista activa"
              : `${requests.length} listas activas`}
          </p>
          <FilterSelect
            param="sort"
            label="Ordenar listas"
            placeholder="Recientes"
            allLabel="Recientes"
            options={[{ value: "alphabetical", label: "A–Z" }]}
          />
        </div>

        {requests.length > 0 ? (
          <>
            {verified.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
            {unverified.length > 0 && (
              <>
                {/* Unverified centers publish immediately but never mix into
                    the vetted block — the query already sorts them last. */}
                <div className="flex items-center gap-3 pt-2">
                  <span className="h-px flex-1 bg-neutral-200" />
                  <p className="text-xs font-medium text-neutral-500">
                    Sin verificar aún
                  </p>
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
                {unverified.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </>
            )}
          </>
        ) : (
          <EmptyState hasFilters={hasFilters} />
        )}
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
          <Link href="/">Cómo ayudar</Link>
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center">
      <p className="text-base font-semibold text-neutral-900">
        {hasFilters ? "No hay listas que coincidan" : "No hay listas activas"}
      </p>
      <p className="max-w-[260px] text-sm text-neutral-500">
        {hasFilters
          ? "Prueba con otros filtros o limpia la búsqueda."
          : "Vuelve pronto: los centros publican nuevas listas con frecuencia."}
      </p>
    </div>
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
