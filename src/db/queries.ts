import { db } from "./db";
import { eq, asc, desc, and, sql, lt } from "drizzle-orm";
import { listas, centers } from "./schema";
import { unstable_cache } from "next/cache";

export type ListaSort = "recent" | "alphabetical";

// ... other existing code ...

export async function queryActiveListas(sort: ListaSort = "recent") {
  const baseQuery = db
    .select()
    .from(listas)
    .innerJoin(centers, eq(listas.centerId, centers.id))
    .where(
      and(
        eq(listas.active, true),
        // other conditions as needed
      )
    );

  if (sort === "alphabetical") {
    return baseQuery.orderBy(asc(centers.name));
  } else {
    // Default recent: fresh-first
    return baseQuery.orderBy(
      sql`CASE WHEN ${listas.updatedAt} < now() - interval '7 days' THEN 1 ELSE 0 END`,
      desc(listas.updatedAt)
    );
  }
}

export const getActiveListas = unstable_cache(
  async (sort: ListaSort = "recent") => {
    const normalized: ListaSort = sort === "alphabetical" ? "alphabetical" : "recent";
    return queryActiveListas(normalized);
  },
  undefined,
  {
    keys: (sort) => [JSON.stringify({ sort: sort || "recent" })],
    tags: ["active-listas"],
  }
);
