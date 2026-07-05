import { SortToggle } from "./_components/sort-toggle";
import { getActiveListas } from "@/db/queries";

type SearchParams = {
  sort?: string;
  // other params...
};

export default async function ListasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sortParam = searchParams.sort;
  const sort: "recent" | "alphabetical" =
    sortParam === "alphabetical" ? "alphabetical" : "recent";

  const listas = await getActiveListas(sort);

  return (
    <div>
      <SortToggle />
      {/* render listas */}
    </div>
  );
}
