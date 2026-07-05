"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

type Sort = "recent" | "alphabetical";

const OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Reciente" },
  { value: "alphabetical", label: "Alfabético" },
];

export function SortToggle() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const current: Sort =
    (searchParams.get("sort") as Sort) === "alphabetical"
      ? "alphabetical"
      : "recent";

  function select(value: Sort) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "recent") {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div role="tablist" className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={current === opt.value}
          className={`px-4 py-2 rounded ${
            current === opt.value
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700"
          }`}
          onClick={() => select(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
