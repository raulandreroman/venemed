import { formatItemQuantity } from "@/lib/format";

/**
 * Minimal item shape the shared lista sections need. Both `ListaItemData`
 * (donor) and `CenterListaItem` (dashboard) satisfy it structurally, so either
 * surface can pass its items straight through (#111).
 */
export type ListaSectionItem = {
  id: string;
  name: string;
  bucket: "need" | "excess";
  isUrgent: boolean;
  quantity: number | null;
  unit: string;
};

/**
 * One item row — name on the left, "× N unit" amount on the right (need bucket
 * only; excess carries no quantity). Presentational and server-safe, shared by
 * the donor detail and the center dashboard so both render identically.
 */
export function ItemRow({
  item,
  rowClassName = "bg-neutral-100",
  textClassName = "text-neutral-900",
}: {
  item: ListaSectionItem;
  rowClassName?: string;
  textClassName?: string;
}) {
  const amount =
    item.bucket === "excess" ? "" : formatItemQuantity(item.quantity, item.unit);
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${rowClassName}`}
    >
      <p className={`text-[15px] font-semibold ${textClassName}`}>{item.name}</p>
      {amount && (
        <span
          className={`shrink-0 text-sm font-medium tabular-nums ${textClassName} opacity-70`}
        >
          {amount}
        </span>
      )}
    </li>
  );
}
