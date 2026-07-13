import type { ReactNode } from "react";

import { CollapsibleItemList } from "./collapsible-item-list";
import { ItemRow, type ListaSectionItem } from "./item-row";

/**
 * The lista's three item sections — the polished donor treatment (Figma
 * 210:14154), now shared by the donor detail AND the center dashboard so both
 * look identical (#111): an "Insumos urgentes" card (`bg-error-tint/40`, bang
 * badge, error-tinted rows), the non-urgent needs as a plain list, and a "Por
 * favor no traigan" excess card (`bg-warning-tint/40`).
 *
 * Server-safe and presentational. Optional behaviors let the dashboard opt into
 * truncation and an empty-excess discovery link without changing the donor look:
 *  - `publishedAgo` / `excessReason` — the sub-line under each card header.
 *  - `truncateAt` — cap each list with a "+ N insumos más" toggle (the only
 *    client-interactive bit; the donor omits it and ships no JS here).
 *  - `emptyExcessSlot` — rendered in place of the excess card when there's no
 *    excess (the dashboard's "avisar lo que tienes en exceso" link).
 */
export function ListaItemSections({
  items,
  publishedAgo = null,
  excessReason = null,
  truncateAt,
  emptyExcessSlot,
  className = "",
}: {
  items: ListaSectionItem[];
  publishedAgo?: string | null;
  excessReason?: string | null;
  truncateAt?: number;
  emptyExcessSlot?: ReactNode;
  className?: string;
}) {
  const urgent = items.filter((it) => it.bucket === "need" && it.isUrgent);
  const necesitamos = items.filter(
    (it) => it.bucket === "need" && !it.isUrgent,
  );
  const noAceptamos = items.filter((it) => it.bucket === "excess");

  return (
    <div className={className}>
      {/* Qué necesita el centro */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">
          Qué necesita el centro
        </h2>

        {urgent.length > 0 && (
          <div className="mt-3 rounded-2xl bg-error-tint/40 p-3">
            <div className="flex items-center gap-2.5">
              <BangIcon className="text-error" />
              <div>
                <p className="text-[15px] font-semibold text-error">
                  Insumos urgentes
                </p>
                {publishedAgo && (
                  <p className="text-xs text-error">{publishedAgo}</p>
                )}
              </div>
            </div>
            <ItemList
              items={urgent}
              truncateAt={truncateAt}
              rowClassName="bg-error/10"
              textClassName="text-error"
              className="mt-3"
            />
          </div>
        )}

        {necesitamos.length > 0 && (
          <ItemList
            items={necesitamos}
            truncateAt={truncateAt}
            className="mt-3"
          />
        )}
      </section>

      {noAceptamos.length > 0 ? (
        <section className="mt-4 rounded-2xl bg-warning-tint/40 p-3">
          <div className="flex items-center gap-2.5">
            <BangIcon className="text-warning" />
            <div>
              <p className="text-[15px] font-semibold text-warning">
                Por favor no traigan
              </p>
              {excessReason ? (
                <p className="text-xs text-warning">{excessReason}</p>
              ) : (
                publishedAgo && (
                  <p className="text-xs text-warning">{publishedAgo}</p>
                )
              )}
            </div>
          </div>
          <ItemList
            items={noAceptamos}
            truncateAt={truncateAt}
            rowClassName="bg-warning/10"
            textClassName="text-warning"
            className="mt-3"
          />
        </section>
      ) : (
        emptyExcessSlot && <div className="mt-4">{emptyExcessSlot}</div>
      )}
    </div>
  );
}

/** Full list, or a truncating client list when `truncateAt` is set and the
 * list overflows it. Keeps the donor path free of the client island. */
function ItemList({
  items,
  truncateAt,
  rowClassName,
  textClassName,
  className = "",
}: {
  items: ListaSectionItem[];
  truncateAt?: number;
  rowClassName?: string;
  textClassName?: string;
  className?: string;
}) {
  if (truncateAt != null && items.length > truncateAt) {
    return (
      <CollapsibleItemList
        items={items}
        truncateAt={truncateAt}
        rowClassName={rowClassName}
        textClassName={textClassName}
        className={className}
      />
    );
  }
  return (
    <ul className={`flex flex-col gap-2 ${className}`}>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          rowClassName={rowClassName}
          textClassName={textClassName}
        />
      ))}
    </ul>
  );
}

/** Circular "!" badge for the urgent / excess sub-cards. */
function BangIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-base font-bold ${className}`}
      aria-hidden="true"
    >
      !
    </span>
  );
}
