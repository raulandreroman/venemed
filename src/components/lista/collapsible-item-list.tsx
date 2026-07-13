"use client";

import { useState } from "react";

import { ItemRow, type ListaSectionItem } from "./item-row";

/**
 * An item list that truncates to `truncateAt` rows with a "+ N insumos más"
 * toggle (expands in place, no navigation). The only client-interactive piece
 * of the shared lista sections — used by the center dashboard; the donor detail
 * renders full lists and never mounts this, so its surge path stays JS-free
 * (#111).
 */
export function CollapsibleItemList({
  items,
  truncateAt,
  rowClassName,
  textClassName,
  className = "",
}: {
  items: ListaSectionItem[];
  truncateAt: number;
  rowClassName?: string;
  textClassName?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, truncateAt);
  const hiddenCount = items.length - visible.length;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            rowClassName={rowClassName}
            textClassName={textClassName}
          />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-center text-sm font-semibold text-accent hover:underline"
        >
          + {hiddenCount} insumos más
        </button>
      )}
    </div>
  );
}
