import type { Metadata } from "next";

import { getActiveListas, type ListaFilters } from "@/db/queries";
import { centerTypeLabel } from "@/lib/format";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import type { CenterType } from "@/lib/registro/validation";
import { AppBar, RequestCard } from "@/components/ui";

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

  const filters: ListaFilters = {
    search: sp.search,
    city: sp.city,
    type: CENTER_TYPE_ENABLED ? sp.type : undefined,
    category: sp.category,
    sort: "recent",
  };

  // Two cached calls: facets from the full active feed (so chips never
  // disappear while filtering) + the filtered list shown to the donor.
  const [allActive, requests] = await Promise.all([
    getActiveListas({}),
    getActiveListas(filters),
  ]);

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
          requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))
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
