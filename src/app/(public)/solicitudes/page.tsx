import { Fragment } from "react";
import type { Metadata } from "next";

import {
  getActiveRequests,
  getActiveSurplusByCenter,
  type RequestFilters,
  type RequestSort,
} from "@/db/queries";
import { centerTypeLabel } from "@/lib/format";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import type { CenterType } from "@/lib/registro/validation";
import { AppBar, AvisoBanner, RequestCard } from "@/components/ui";

import { FilterSelect } from "./_components/filter-select";
import { SearchBox } from "./_components/search-box";
import { SortToggle } from "./_components/sort-toggle";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Solicitudes activas · VeneMed",
  description:
    "Solicitudes activas de centros de salud verificados. Encuentra qué necesitan y compártelo.",
};

type SearchParams = {
  search?: string;
  city?: string;
  type?: string;
  category?: string;
  sort?: string;
};

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const sort: RequestSort = sp.sort === "urgency" ? "urgency" : "recent";
  // Cap the unauthenticated search term before it reaches getActiveRequests:
  // it drives a leading-wildcard ILIKE and is part of the cache key, so bound
  // it to a sane max and drop it if empty after trim (avoid DB/cache amplification).
  const search = sp.search?.trim().slice(0, 64) || undefined;
  const filters: RequestFilters = {
    search,
    city: sp.city,
    type: CENTER_TYPE_ENABLED ? sp.type : undefined,
    category: sp.category,
    sort,
  };

  // Two cached calls: facets from the full active feed (so chips never
  // disappear while filtering) + the filtered list shown to the donor.
  const [allActive, requests, surplusByCenter] = await Promise.all([
    getActiveRequests({}),
    getActiveRequests(filters),
    getActiveSurplusByCenter(),
  ]);

  // Each center's active aviso de exceso renders ONCE, as a banner above that
  // center's first card in the (flat, sorted) feed — so the donor sees what NOT
  // to bring without reordering the urgency/recency sort.
  const bannerShown = new Set<string>();

  const cities = uniqueSorted(allActive.map((r) => r.city));
  const types = CENTER_TYPE_ENABLED
    ? uniqueSorted(
        allActive
          .map((r) => r.centerType)
          .filter((t): t is CenterType => t != null),
      )
    : [];

  const hasFilters = Boolean(
    sp.search || sp.city || (CENTER_TYPE_ENABLED && sp.type) || sp.category,
  );

  return (
    <>
      <AppBar title="Solicitudes activas" backHref="/" />

      {/* Filtros */}
      <section className="flex flex-col gap-3 border-b border-neutral-100 bg-surface p-6">
        <SearchBox />

        {(cities.length > 0 || types.length > 0) && (
          <div className="flex gap-2">
            {cities.length > 0 && (
              <FilterSelect
                param="city"
                label="Ubicación"
                allLabel="Todas las ubicaciones"
                options={cities.map((city) => ({ value: city, label: city }))}
              />
            )}
            {types.length > 0 && (
              <FilterSelect
                param="type"
                label="Sector"
                allLabel="Todos los sectores"
                options={types.map((type) => ({
                  value: type,
                  label: centerTypeLabel(type),
                }))}
              />
            )}
          </div>
        )}

        <SortToggle />
      </section>

      {/* Lista */}
      <section className="flex flex-1 flex-col gap-3 px-6 py-4">
        {requests.length > 0 ? (
          requests.map((request) => {
            const aviso = bannerShown.has(request.centerId)
              ? undefined
              : surplusByCenter.get(request.centerId);
            bannerShown.add(request.centerId);
            return (
              <Fragment key={request.id}>
                {aviso && (
                  <AvisoBanner
                    variant="donor"
                    items={aviso.items}
                    expiresAt={aviso.expiresAt}
                    reason={aviso.reason}
                  />
                )}
                <RequestCard request={request} />
              </Fragment>
            );
          })
        ) : (
          <EmptyState hasFilters={hasFilters} />
        )}
      </section>

      <div className="h-8 shrink-0" />
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center">
      <p className="text-base font-semibold text-neutral-900">
        {hasFilters
          ? "No hay solicitudes que coincidan"
          : "No hay solicitudes activas"}
      </p>
      <p className="max-w-[260px] text-sm text-neutral-500">
        {hasFilters
          ? "Prueba con otros filtros o limpia la búsqueda."
          : "Vuelve pronto: los centros publican nuevas solicitudes con frecuencia."}
      </p>
    </div>
  );
}
