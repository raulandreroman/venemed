"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui";
import { categoryLabel } from "@/lib/format";
import {
  CUSTOM_CATEGORY_OPTIONS,
  DEFAULT_CUSTOM_CATEGORY,
} from "@/lib/listas/validation";

import type { SelectedItem } from "./lista-editor";

/** A free-text custom insumo held in the selector's working state, with its
 * picked home category (defaults to `general`/"Otros"). */
type Custom = { name: string; category: string };

type Supply = { id: string; name: string; category: string };

/** Header order in browse mode: relief staples first, clinical after,
 * catch-all last — mirrors the donor chips' relief-first ordering. */
const CATALOG_CATEGORY_ORDER = [
  "food",
  "water",
  "hygiene",
  "bedding",
  "pharmacy",
  "emergency",
  "surgical",
  "inpatient",
  "pediatrics",
  "geriatrics",
  "general",
];

/**
 * Insumo selector (Figma 32:5006 "6 · Selector de insumos") as a CONTROLLED
 * bottom-sheet co-located with the create form — NOT an intercepted @modal route
 * (that's the donor detail-over-list pattern only). Selection flows back into
 * the form via `onConfirm` so it survives. Reuses RequestSheet's chrome recipe
 * (neutral scrim, max-w-[390px] rounded-t panel, drag handle, body-scroll-lock,
 * Escape, focus-trap) but is driven by open/onClose props, not router.back().
 *
 * One flat catalog (the "área" facet was dropped). The search box doubles as the
 * custom-item entry: typing a string with no catalog match surfaces a "Crear
 * «…»" row that adds it as a free-text insumo.
 */
export function InsumoSelector({
  open,
  onClose,
  supplies,
  selected,
  onConfirm,
  exclude = [],
}: {
  open: boolean;
  onClose: () => void;
  supplies: Supply[];
  selected: SelectedItem[];
  onConfirm: (items: SelectedItem[]) => void;
  /** Insumos to hide from the catalog (e.g. items already picked in the OTHER
   * bucket, #109). Catalog items excluded by supplyId, customs by name. */
  exclude?: SelectedItem[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const catalogIds = useMemo(() => new Set(supplies.map((s) => s.id)), [supplies]);

  // Insumos already in the OTHER bucket — hidden from this picker so an item
  // can't be both a need and a surplus (#109). Split like `selected`: catalog
  // items by supplyId, custom items by (lowercased) name.
  const excludedIds = useMemo(
    () =>
      new Set(
        exclude.filter((it) => it.supplyId).map((it) => it.supplyId as string),
      ),
    [exclude],
  );
  const excludedNames = useMemo(
    () =>
      new Set(
        exclude.filter((it) => !it.supplyId).map((it) => it.name.toLowerCase()),
      ),
    [exclude],
  );
  const visibleSupplies = useMemo(
    () => supplies.filter((s) => !excludedIds.has(s.id)),
    [supplies, excludedIds],
  );

  // Local working state — initialized from `selected` each time the sheet opens.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [search, setSearch] = useState("");

  // Seed working state when the sheet opens. State only ever mutates from an
  // effect that GATES on `open` flipping true (not a synchronous body write on
  // every render) — defers via rAF to stay clear of set-state-in-effect.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const raf = requestAnimationFrame(() => {
        setChecked(
          new Set(
            selected
              .filter((it) => it.supplyId && catalogIds.has(it.supplyId))
              .map((it) => it.supplyId as string),
          ),
        );
        setCustoms(
          selected
            .filter((it) => !it.supplyId)
            .map((it) => ({
              name: it.name,
              category: it.category ?? DEFAULT_CUSTOM_CATEGORY,
            })),
        );
        setSearch("");
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!open) wasOpen.current = false;
  }, [open, selected, catalogIds]);

  // Escape + body-scroll-lock + focus-trap while open (RequestSheet recipe).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === panel)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = getFocusable();
      const active = document.activeElement as HTMLElement | null;
      const first = focusable[0] ?? panel;
      const last = focusable[focusable.length - 1] ?? panel;
      if (e.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Add a free-text custom insumo (from the search box) and clear the search.
   * New customs default to the `general` ("Otros") category until picked. */
  const addCustomNamed = useCallback((raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setCustoms((prev) =>
      prev.some((c) => c.name.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, { name, category: DEFAULT_CUSTOM_CATEGORY }],
    );
    setSearch("");
  }, []);

  const removeCustom = useCallback((name: string) => {
    setCustoms((prev) => prev.filter((c) => c.name !== name));
  }, []);

  // Option A (field-insight §2): the category picker is COLLAPSED to a small
  // «{Categoría} ▾» tag on the row; chips render only for the row being edited
  // and collapse back once a category is picked.
  const [categoryOpenFor, setCategoryOpenFor] = useState<string | null>(null);

  const setCustomCategory = useCallback((name: string, category: string) => {
    setCustoms((prev) =>
      prev.map((c) => (c.name === name ? { ...c, category } : c)),
    );
    setCategoryOpenFor(null);
  }, []);

  const query = search.trim();
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q
      ? visibleSupplies.filter((s) => s.name.toLowerCase().includes(q))
      : visibleSupplies;
  }, [visibleSupplies, query]);

  // Browse mode (no search): the 91-item catalog groups under category
  // headers, relief-first (field-insight §2). Searching flattens the list —
  // headers only organize browsing, search stays the fast path.
  const grouped = useMemo(() => {
    if (query) return null;
    const byCategory = new Map<string, Supply[]>();
    for (const s of visibleSupplies) {
      const bucket = byCategory.get(s.category) ?? [];
      bucket.push(s);
      byCategory.set(s.category, bucket);
    }
    return CATALOG_CATEGORY_ORDER.filter((c) => byCategory.has(c)).map(
      (c) => ({ category: c, items: byCategory.get(c)! }),
    );
  }, [visibleSupplies, query]);

  // Offer "create as new insumo" when the typed text matches nothing already
  // present (catalog item or an already-added custom).
  const canCreateFromSearch =
    query.length > 0 &&
    !supplies.some((s) => s.name.toLowerCase() === query.toLowerCase()) &&
    !customs.some((c) => c.name.toLowerCase() === query.toLowerCase()) &&
    !excludedNames.has(query.toLowerCase());

  const total = checked.size + customs.length;

  const confirm = useCallback(() => {
    const byId = new Map(supplies.map((s) => [s.id, s.name]));
    const fromCatalog: SelectedItem[] = [...checked].map((id) => ({
      key: id,
      supplyId: id,
      name: byId.get(id) ?? "Insumo",
    }));
    const fromCustom: SelectedItem[] = customs.map((c) => ({
      key: `custom:${c.name.toLowerCase()}`,
      name: c.name,
      category: c.category,
    }));
    onConfirm([...fromCatalog, ...fromCustom]);
    onClose();
  }, [supplies, checked, customs, onConfirm, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agregar insumos"
      className="fixed inset-0 z-40"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[390px] flex-col rounded-t-[24px] bg-surface shadow-xl outline-none"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        {/* header */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-1 pb-3">
          <h2 className="text-lg font-bold text-neutral-900">Agregar ítems</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
          >
            <CloseIcon />
          </button>
        </div>

        {/* search */}
        <div className="shrink-0 px-4 pb-3">
          <div className="flex h-[52px] w-full items-center gap-2.5 rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 text-neutral-700 focus-within:border-2 focus-within:border-accent">
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escribe el insumo que necesitas"
              aria-label="Buscar insumo"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
          </div>
        </div>

        {/* scrollable body */}
        <div data-sheet-scroll className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Create the typed string as a new custom insumo. */}
          {canCreateFromSearch && (
            <button
              type="button"
              onClick={() => addCustomNamed(query)}
              aria-label={`Crear ${query}`}
              className="mb-1 flex w-full items-center gap-3 border-b border-neutral-100 py-3 text-left"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-accent-subtle text-accent">
                <PlusIcon />
              </span>
              <span className="text-[15px] text-neutral-900">
                Crear{" "}
                <span className="font-semibold text-accent">
                  &ldquo;{query}&rdquo;
                </span>
              </span>
            </button>
          )}

          {/* Selected custom (free-text) insumos render as checked rows at the
              top — tapping the ROW removes it; tapping the category TAG expands
              the chips for that row only (customs only; catalog rows never show
              it). Picking a chip collapses back to the tag. */}
          {customs.length > 0 && (
            <ul>
              {customs.map((c) => (
                <li key={c.name} className="border-b border-neutral-100 py-1">
                  <div className="flex items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeCustom(c.name)}
                      aria-pressed={true}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="truncate text-[15px] text-neutral-900">
                        {c.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryOpenFor((prev) =>
                          prev === c.name ? null : c.name,
                        )
                      }
                      aria-expanded={categoryOpenFor === c.name}
                      aria-label={`Categoría de ${c.name}`}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-200"
                    >
                      {CUSTOM_CATEGORY_OPTIONS.find(
                        (o) => o.value === c.category,
                      )?.label ?? "Otros"}
                      <span aria-hidden="true" className="text-[10px] text-neutral-400">
                        ▾
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustom(c.name)}
                      aria-label={`Quitar ${c.name}`}
                      className="shrink-0"
                    >
                      <Checkbox checked={true} />
                    </button>
                  </div>
                  {categoryOpenFor === c.name && (
                    <div className="pb-2">
                      <p className="pb-1.5 text-xs text-neutral-500">
                        ¿En qué categoría va?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOM_CATEGORY_OPTIONS.map((opt) => {
                          const active = c.category === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setCustomCategory(c.name, opt.value)
                              }
                              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                                active
                                  ? "border-accent bg-accent text-accent-on"
                                  : "border-neutral-300 bg-surface text-neutral-700 hover:border-neutral-400"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {grouped ? (
            grouped.map((g) => (
              <div key={g.category}>
                <p className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {categoryLabel(g.category)}
                </p>
                <ul>
                  {g.items.map((s) => (
                    <CatalogRow
                      key={s.id}
                      supply={s}
                      checked={checked.has(s.id)}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <>
              <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Insumos del catálogo
              </p>
              <ul>
                {filtered.map((s) => (
                  <CatalogRow
                    key={s.id}
                    supply={s}
                    checked={checked.has(s.id)}
                    onToggle={toggle}
                  />
                ))}
                {filtered.length === 0 && !canCreateFromSearch && (
                  <li className="py-6 text-center text-sm text-neutral-500">
                    Sin coincidencias.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 border-t border-neutral-100 bg-surface px-4 py-3">
          <Button type="button" fullWidth onClick={confirm} disabled={total === 0}>
            {total === 0
              ? "Agregar insumos"
              : `Agregar ${total} ${total === 1 ? "insumo" : "insumos"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CatalogRow({
  supply,
  checked,
  onToggle,
}: {
  supply: Supply;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <li className="border-b border-neutral-100 last:border-0">
      <button
        type="button"
        onClick={() => onToggle(supply.id)}
        aria-pressed={checked}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="text-[15px] text-neutral-900">{supply.name}</span>
        <Checkbox checked={checked} />
      </button>
    </li>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border ${
        checked
          ? "border-accent bg-accent text-accent-on"
          : "border-neutral-300 bg-surface"
      }`}
    >
      {checked && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SearchIcon() {
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
      className="shrink-0 text-neutral-500"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
