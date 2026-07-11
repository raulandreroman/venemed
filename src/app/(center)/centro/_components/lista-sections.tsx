"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import type { CenterListaItem } from "@/db/queries";
import { Tag } from "@/components/ui";

const TRUNCATE_AT = 4;

/**
 * The dashboard v2's three item sections (Figma 210:11795 / needs-only
 * 210:13213): Urgente (need + isUrgent), Necesitamos (need, not urgent), No
 * aceptamos (excess). A section with zero items is hidden entirely. Each
 * section truncates to 4 rows with a "+ N insumos más" toggle (client state —
 * expands in place, no navigation).
 *
 * When there are zero excess items, "No aceptamos" is replaced by a discovery
 * link into the editor's aviso-de-exceso step (`?paso=exceso`).
 */
export function ListaSections({ items }: { items: CenterListaItem[] }) {
  const urgent = items.filter((it) => it.bucket === "need" && it.isUrgent);
  const necesitamos = items.filter((it) => it.bucket === "need" && !it.isUrgent);
  const noAceptamos = items.filter((it) => it.bucket === "excess");

  return (
    <div className="flex flex-col gap-6">
      {urgent.length > 0 && (
        <Section
          title="Urgente"
          titleClassName="text-neutral-900"
          count={urgent.length}
          items={urgent}
          rowClassName="bg-error-tint"
          renderTrailing={() => <Tag variant="urgent">Urgente</Tag>}
        />
      )}

      {necesitamos.length > 0 && (
        <Section
          title="Necesitamos"
          titleClassName="text-neutral-900"
          count={necesitamos.length}
          items={necesitamos}
          rowClassName="bg-neutral-100"
        />
      )}

      {noAceptamos.length > 0 ? (
        <Section
          title="No aceptamos"
          titleClassName="text-warning"
          count={noAceptamos.length}
          items={noAceptamos}
          rowClassName="bg-warning-tint"
          rowTextClassName="text-warning"
        />
      ) : (
        <Link
          href="/centro/lista/editar?paso=exceso"
          className="self-start text-sm font-semibold text-accent hover:underline"
        >
          + Avisar lo que tienes en exceso
        </Link>
      )}
    </div>
  );
}

function Section({
  title,
  titleClassName,
  count,
  items,
  rowClassName,
  rowTextClassName = "text-neutral-900",
  renderTrailing,
}: {
  title: string;
  titleClassName: string;
  count: number;
  items: CenterListaItem[];
  rowClassName: string;
  rowTextClassName?: string;
  renderTrailing?: (item: CenterListaItem) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, TRUNCATE_AT);
  const hiddenCount = items.length - visible.length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className={`text-lg font-bold ${titleClassName}`}>{title}</h2>
        <span className="text-sm text-neutral-400">({count})</span>
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <li
            key={item.id}
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${rowClassName}`}
          >
            <span className={`text-[15px] font-medium ${rowTextClassName}`}>
              {item.name}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {item.quantity != null && (
                <span
                  className={`text-sm font-medium tabular-nums ${rowTextClassName} opacity-70`}
                >
                  × {item.quantity}
                </span>
              )}
              {renderTrailing?.(item)}
            </div>
          </li>
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
    </section>
  );
}
