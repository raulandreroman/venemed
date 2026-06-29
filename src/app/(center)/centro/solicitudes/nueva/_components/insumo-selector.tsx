"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui";

import type { SelectedItem } from "./create-request-form";

type Supply = { id: string; name: string };

/**
 * Insumo selector (Figma 32:5006 "6 · Selector de insumos") as a CONTROLLED
 * bottom-sheet co-located with the create form — NOT an intercepted @modal route
 * (that's the donor detail-over-list pattern only). Selection flows back into
 * the form via `onConfirm` so it survives. Reuses RequestSheet's chrome recipe
 * (neutral scrim, max-w-[390px] rounded-t panel, drag handle, body-scroll-lock,
 * Escape, focus-trap) but is driven by open/onClose props, not router.back().
 *
 * Merge model: items already selected that don't belong to THIS area's catalog
 * (e.g. picked under a different area, or earlier customs) are preserved; the
 * area's checkboxes + newly typed customs drive the rest.
 */
export function InsumoSelector({
  open,
  onClose,
  areaLabel,
  supplies,
  selected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  areaLabel: string | null;
  supplies: Supply[];
  selected: SelectedItem[];
  onConfirm: (items: SelectedItem[]) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const areaIds = useMemo(() => new Set(supplies.map((s) => s.id)), [supplies]);

  // Local working state — initialized from `selected` each time the sheet opens.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [customs, setCustoms] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

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
              .filter((it) => it.supplyId && areaIds.has(it.supplyId))
              .map((it) => it.supplyId as string),
          ),
        );
        setCustoms(selected.filter((it) => !it.supplyId).map((it) => it.name));
        setSearch("");
        setCustomOpen(false);
        setCustomDraft("");
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!open) wasOpen.current = false;
  }, [open, selected, areaIds]);

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

  const addCustom = useCallback(() => {
    const name = customDraft.trim();
    if (!name) return;
    setCustoms((prev) =>
      prev.some((c) => c.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, name],
    );
    setCustomDraft("");
    setCustomOpen(false);
  }, [customDraft]);

  const removeCustom = useCallback((name: string) => {
    setCustoms((prev) => prev.filter((c) => c !== name));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? supplies.filter((s) => s.name.toLowerCase().includes(q)) : supplies;
  }, [supplies, search]);

  const total = checked.size + customs.length;

  const confirm = useCallback(() => {
    // Preserve selected items outside this area's catalog (cross-area picks).
    const preserved = selected.filter(
      (it) => it.supplyId && !areaIds.has(it.supplyId),
    );
    const byId = new Map(supplies.map((s) => [s.id, s.name]));
    const fromArea: SelectedItem[] = [...checked].map((id) => ({
      key: id,
      supplyId: id,
      name: byId.get(id) ?? "Insumo",
    }));
    const fromCustom: SelectedItem[] = customs.map((name) => ({
      key: `custom:${name.toLowerCase()}`,
      name,
    }));
    onConfirm([...preserved, ...fromArea, ...fromCustom]);
    onClose();
  }, [selected, areaIds, supplies, checked, customs, onConfirm, onClose]);

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
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[390px] flex-col rounded-t-[20px] bg-surface shadow-xl outline-none"
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
          <div className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-neutral-300 bg-surface px-4 text-neutral-700 focus-within:border-accent">
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumo…"
              aria-label="Buscar insumo"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
          </div>
        </div>

        {/* scrollable body */}
        <div data-sheet-scroll className="flex-1 overflow-y-auto px-4 pb-4">
          <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Sugeridos · {areaLabel ?? "Área"}
          </p>

          <ul>
            {filtered.map((s) => {
              const isChecked = checked.has(s.id);
              return (
                <li key={s.id} className="border-b border-neutral-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={isChecked}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="text-[15px] text-neutral-900">{s.name}</span>
                    <Checkbox checked={isChecked} />
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-500">
                Sin coincidencias. Usa &ldquo;Otro insumo&rdquo; abajo.
              </li>
            )}
          </ul>

          {/* added customs (removable) */}
          {customs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {customs.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-medium text-accent"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeCustom(name)}
                    aria-label={`Quitar ${name}`}
                    className="text-accent/70 hover:text-accent"
                  >
                    <CloseIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* "Otro insumo (escríbelo)" */}
          <div className="mt-3">
            {customOpen ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  placeholder="Nombre del insumo"
                  aria-label="Otro insumo"
                  className="h-11 flex-1 rounded-xl border border-neutral-300 bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
                <Button type="button" size="sm" onClick={addCustom}>
                  Añadir
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="flex items-center gap-2 py-2 text-[15px] font-semibold text-accent"
              >
                <PlusIcon />
                Otro insumo (escríbelo)
              </button>
            )}
          </div>
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

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
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
