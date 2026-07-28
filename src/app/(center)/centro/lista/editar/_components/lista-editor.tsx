"use client";

import { useCallback, useRef, useState } from "react";

import { AppBar, Button } from "@/components/ui";
import { publishLista } from "@/app/(center)/actions/publicar";
import type { CenterEditableLista } from "@/db/queries";
import {
  DEFAULT_LISTA_ITEM_UNIT,
  LISTA_ITEM_UNIT_CYCLE,
  LISTA_ITEM_UNIT_SHORT,
  type ListaItemUnit,
  formatItemQuantity,
  isListaItemUnit,
} from "@/lib/format";
import {
  EXCESS_REASON_MAX,
  INSTRUCTIONS_MAX,
  RECEPTION_LANDMARK_MAX,
  RECEPTION_NAME_MAX,
  type PublishListaInput,
} from "@/lib/listas/validation";
import { InsumoSelector } from "./insumo-selector";

/** A donation item chosen in the editor: a catalog supply (supplyId+name) or a
 * free-text custom (name only). `key` is stable for React + de-dup. `isUrgent`
 * is only meaningful for need-bucket items; the selector ignores it (only
 * reads key/supplyId/name). */
export type SelectedItem = {
  key: string;
  supplyId?: string;
  name: string;
  isUrgent?: boolean;
  /** For customs only: the picked home category (supply_category enum value).
   * Catalog items derive their category from the supply and ignore this. */
  category?: string;
  /** Optional display-only quantity ("× N"); need-bucket only. null/undefined = unset. */
  quantity?: number | null;
  /** Unit of measure for `quantity` (a `lista_item_unit` enum value, #101);
   * defaults to `unidad`. Only meaningful when quantity is set. */
  unit?: string | null;
};

type Supply = { id: string; name: string; category: string };

/**
 * Local, dependency-free redirect detection (mirrors edit-center-form). A
 * successful publish still throws NEXT_REDIRECT; re-throw it so Next navigates
 * instead of showing a false error.
 */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Lista editor — create-once, then edit (Figma "Creación de lista" 210:11093 /
 * 210:11225 / 210:11372, "Aviso de exceso" 210:12226 / 205:7464). Two-step
 * wizard: (1) insumos + urgencia + nota, (2) optional aviso de exceso. Owns
 * its own AppBar so the title/back-behavior/step-counter can change between
 * steps without a route change (which would drop in-memory form state).
 *
 * Reuses the co-located InsumoSelector sheet (never rebuilt — gotcha #7); the
 * selector doesn't know about `isUrgent`, so its `onConfirm` result is
 * re-merged with the prior urgency flags by `key` here.
 */
export function ListaEditor({
  supplies,
  initial,
  initialStep,
}: {
  supplies: Supply[];
  initial: CenterEditableLista | null;
  initialStep: 1 | 2;
}) {
  const initialNeed = (initial?.items ?? [])
    .filter((it) => it.bucket === "need")
    .map((it) => ({
      key: it.key,
      supplyId: it.supplyId,
      name: it.name,
      isUrgent: it.isUrgent,
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
    }));
  const initialExcess = (initial?.items ?? [])
    .filter((it) => it.bucket === "excess")
    .map((it) => ({
      key: it.key,
      supplyId: it.supplyId,
      name: it.name,
      category: it.category,
    }));
  // On EDIT, "skip the excess form" must not silently wipe previously-saved
  // excess data — only a fresh create with no prior excess may omit it
  // entirely (validator correction #5).
  const hadInitialExcess = initialExcess.length > 0;

  const [step, setStep] = useState<1 | 2>(initialStep);
  const [needItems, setNeedItems] = useState<SelectedItem[]>(initialNeed);
  const [excessItems, setExcessItems] = useState<SelectedItem[]>(initialExcess);
  const [nota, setNota] = useState(initial?.deliveryInstructions ?? "");
  const [excessReason, setExcessReason] = useState(initial?.excessReason ?? "");
  // Reception contact (field-insight §3) — optional, opt-in. Prefill from the
  // center's current lista; the phone shows as national digits (E.164 stored).
  const [receptionName, setReceptionName] = useState(
    initial?.receptionContactName ?? "",
  );
  const [receptionLandmark, setReceptionLandmark] = useState(
    initial?.receptionLandmark ?? "",
  );
  const [excessView, setExcessView] = useState<"intro" | "form">(
    initialStep === 2 || hadInitialExcess ? "form" : "intro",
  );
  // A2 accordion (Figma "Creación v2 · A2"): at most one need-row expanded;
  // the expanded row hosts cantidad + urgente + quitar in place. The FIRST
  // need row starts expanded so the accordion affordance is discoverable
  // (issue #107) — seed from initial items here, and keep parity in the
  // confirm handler after adding insumos. Never seed via a useEffect
  // (set-state-in-effect is a hard eslint error in this repo).
  const [expandedKey, setExpandedKey] = useState<string | null>(
    initialNeed[0]?.key ?? null,
  );
  const [selectorTarget, setSelectorTarget] = useState<"need" | "excess" | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable per mount so a retried submit dedupes via lista.idempotency_key.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const removeNeedItem = useCallback(
    (key: string) => {
      setNeedItems((prev) => prev.filter((it) => it.key !== key));
      // When the open row is removed, fall back to the new first row instead of
      // fully collapsing so the affordance stays visible (issue #107).
      setExpandedKey((cur) => {
        if (cur !== key) return cur;
        const remaining = needItems.filter((it) => it.key !== key);
        return remaining[0]?.key ?? null;
      });
    },
    [needItems],
  );

  const setNeedQuantity = useCallback((key: string, quantity: number | null) => {
    setNeedItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, quantity } : it)),
    );
  }, []);

  const setNeedUnit = useCallback((key: string, unit: string) => {
    setNeedItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, unit } : it)),
    );
  }, []);

  const removeExcessItem = useCallback((key: string) => {
    setExcessItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const openSelector = useCallback((target: "need" | "excess") => {
    setError(null);
    setSelectorTarget(target);
  }, []);

  // The selector rebuilds the array from scratch; re-attach prior `isUrgent`
  // flags by key so confirming a NEW selection never drops existing urgency.
  const handleSelectorConfirm = useCallback(
    (items: SelectedItem[]) => {
      if (selectorTarget === "need") {
        setNeedItems((prev) => {
          const priorByKey = new Map(prev.map((it) => [it.key, it]));
          return items.map((it) => {
            const prior = priorByKey.get(it.key);
            return {
              ...it,
              isUrgent: prior?.isUrgent ?? false,
              quantity: prior?.quantity ?? null,
              unit: prior?.unit ?? DEFAULT_LISTA_ITEM_UNIT,
            };
          });
        });
        // Keep the first row open so the accordion affordance stays
        // discoverable (issue #107); don't steal focus from a row the user
        // already opened.
        if (items.length > 0) {
          setExpandedKey((prev) => prev ?? items[0].key);
        }
      } else if (selectorTarget === "excess") {
        setExcessItems(items);
      }
      setSelectorTarget(null);
    },
    [selectorTarget],
  );

  const toggleUrgent = useCallback((key: string) => {
    setNeedItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, isUrgent: !it.isUrgent } : it)),
    );
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const goToStep2 = useCallback(() => {
    if (needItems.length === 0) {
      setError("Agrega al menos un insumo.");
      return;
    }
    // Reception name is required (#102 C1) — surface it here (on step 1, where
    // the field lives) before the publish action re-validates server-side.
    if (receptionName.trim().length === 0) {
      setError("Agrega el nombre de quien recibe.");
      return;
    }
    setError(null);
    setExcessView(excessItems.length > 0 ? "form" : "intro");
    setStep(2);
  }, [needItems, excessItems, receptionName]);

  const backToStep1 = useCallback(() => setStep(1), []);

  const handlePublish = useCallback(
    async (withExcessForm: boolean) => {
      const includeExcess = withExcessForm || hadInitialExcess;
      setError(null);
      setPending(true);
      const items: PublishListaInput["items"] = [
        ...needItems.map((it) => ({
          ...(it.supplyId
            ? { supplyId: it.supplyId }
            : { customName: it.name, category: it.category }),
          bucket: "need" as const,
          isUrgent: !!it.isUrgent,
          ...(it.quantity != null
            ? { quantity: it.quantity, unit: it.unit ?? DEFAULT_LISTA_ITEM_UNIT }
            : {}),
        })),
        ...(includeExcess
          ? excessItems.map((it) => ({
              ...(it.supplyId
                ? { supplyId: it.supplyId }
                : { customName: it.name, category: it.category }),
              bucket: "excess" as const,
            }))
          : []),
      ];
      const input: PublishListaInput = {
        deliveryInstructions: nota.trim() || undefined,
        excessReason: includeExcess ? excessReason.trim() || undefined : undefined,
        receptionContactName: receptionName.trim() || undefined,
        receptionLandmark: receptionLandmark.trim() || undefined,
        items,
        idempotencyKey: idempotencyKey.current,
      };
      try {
        await publishLista(input); // always ends in redirect()
      } catch (e) {
        if (isNextRedirectError(e)) throw e; // let Next navigate
        setError("No pudimos publicar la lista. Inténtalo de nuevo.");
        setPending(false);
      }
    },
    [
      hadInitialExcess,
      needItems,
      excessItems,
      nota,
      excessReason,
      receptionName,
      receptionLandmark,
    ],
  );

  if (step === 1) {
    return (
      <>
        <AppBar
          title="Creación de lista"
          backHref="/centro"
          align="start"
          trailing={<StepCounter step={1} />}
        />
        <main className="flex flex-1 flex-col gap-5 px-4 pb-28 pt-4">
          <section>
            <h2 className="text-lg font-bold text-neutral-900">
              Lista de insumos
            </h2>

            {needItems.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {needItems.map((it) => (
                  <li key={it.key}>
                    <NeedRow
                      item={it}
                      expanded={expandedKey === it.key}
                      onToggleExpand={() => toggleExpanded(it.key)}
                      onToggleUrgent={() => toggleUrgent(it.key)}
                      onRemove={() => removeNeedItem(it.key)}
                      onSetQuantity={(q) => setNeedQuantity(it.key, q)}
                      onSetUnit={(u) => setNeedUnit(it.key, u)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => openSelector("need")}
                className="text-accent"
              >
                <PlusIcon />
                Agregar insumos
              </Button>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900">
              Nota para los donantes (opcional)
            </h2>
            <textarea
              value={nota}
              maxLength={INSTRUCTIONS_MAX}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Ej: Entregar en recepción, planta baja. Preguntar por el área de logística."
              aria-label="Nota para los donantes"
              className="mt-3 w-full resize-none rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 py-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-2 focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <p className="mt-1.5 text-right text-xs text-neutral-400">
              {nota.length} / {INSTRUCTIONS_MAX}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900">
              Recepción de donaciones
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Para que el donante sepa a quién buscar al llegar.
            </p>

            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label
                  htmlFor="reception-name"
                  className="text-sm font-medium text-neutral-700"
                >
                  Quién recibe
                </label>
                <input
                  id="reception-name"
                  type="text"
                  value={receptionName}
                  maxLength={RECEPTION_NAME_MAX}
                  onChange={(e) => setReceptionName(e.target.value)}
                  placeholder="Ej: María Pérez"
                  className="mt-1.5 h-[52px] w-full rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-2 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div>
                <label
                  htmlFor="reception-landmark"
                  className="text-sm font-medium text-neutral-700"
                >
                  Punto de referencia (opcional)
                </label>
                <input
                  id="reception-landmark"
                  type="text"
                  value={receptionLandmark}
                  maxLength={RECEPTION_LANDMARK_MAX}
                  onChange={(e) => setReceptionLandmark(e.target.value)}
                  placeholder="Ej: Misma calle del café Tributo."
                  className="mt-1.5 h-[52px] w-full rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-2 focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>
          </section>

          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </main>

        <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
          <Button type="button" fullWidth onClick={goToStep2}>
            Siguiente
          </Button>
        </footer>

        <InsumoSelector
          open={selectorTarget === "need"}
          onClose={() => setSelectorTarget(null)}
          supplies={supplies}
          selected={needItems}
          onConfirm={handleSelectorConfirm}
        />
      </>
    );
  }

  // ---- step 2: aviso de exceso ----
  return (
    <>
      <AppBar
        title="Aviso de exceso"
        onBack={backToStep1}
        align="start"
        trailing={excessView === "form" ? <StepCounter step={2} /> : undefined}
      />

      {excessView === "intro" ? (
        <>
          <main className="flex flex-1 flex-col items-center gap-4 px-6 pb-28 pt-10 text-center">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-warning-tint text-warning">
              <BoxIcon />
            </span>
            <h1 className="text-xl font-bold text-neutral-900">
              Avisa lo que tienes en exceso
            </h1>
            <p className="max-w-[300px] text-sm text-neutral-500">
              Evita el desperdicio de recursos y avisa a tus donantes o
              responsables de centros de acopio lo que no necesitas.
            </p>
            <ul className="mt-2 flex flex-col gap-2 self-start text-left text-sm text-neutral-700">
              <li className="flex items-center gap-2">
                <CheckCircleIcon />
                Los donantes ven al instante qué no llevar
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon />
                Lo quitas cuando quieras
              </li>
            </ul>
          </main>
          <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-100 bg-background px-4 py-3">
            <Button
              type="button"
              fullWidth
              onClick={() => setExcessView("form")}
            >
              Crear aviso de exceso
            </Button>
            <Button
              type="button"
              variant="outline"
              fullWidth
              disabled={pending}
              onClick={() => handlePublish(false)}
            >
              {pending ? "Publicando…" : "Ahora no"}
            </Button>
          </footer>
        </>
      ) : (
        <>
          <main className="flex flex-1 flex-col gap-5 px-4 pb-28 pt-4">
            <section>
              <h2 className="text-lg font-bold text-neutral-900">
                Lo que no estamos aceptando
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Selecciona los ítems que tienes en exceso.
              </p>

              {excessItems.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {excessItems.map((it) => (
                    <li key={it.key}>
                      <ExcessRow
                        item={it}
                        onRemove={() => removeExcessItem(it.key)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => openSelector("excess")}
                className="mt-3 text-accent"
              >
                <PlusIcon />
                Agregar insumos
              </Button>
            </section>

            <section>
              <h2 className="text-lg font-bold text-neutral-900">
                Razón (opcional)
              </h2>
              <input
                type="text"
                value={excessReason}
                maxLength={EXCESS_REASON_MAX}
                onChange={(e) => setExcessReason(e.target.value)}
                placeholder="Ej: El depósito está lleno."
                aria-label="Razón del aviso de exceso"
                className="mt-3 h-[52px] w-full rounded-md border-[1.5px] border-neutral-300 bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-2 focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
              <p className="mt-1.5 text-right text-xs text-neutral-400">
                {excessReason.length} / {EXCESS_REASON_MAX}
              </p>
            </section>

            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
          </main>

          <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-100 bg-background px-4 py-3">
            <Button
              type="button"
              fullWidth
              disabled={pending}
              onClick={() => handlePublish(true)}
            >
              {pending ? "Publicando…" : "Publicar aviso"}
            </Button>
            <Button
              type="button"
              variant="outline"
              fullWidth
              disabled={pending}
              onClick={() => handlePublish(false)}
            >
              Continuar sin aviso de exceso
            </Button>
          </footer>
        </>
      )}

      <InsumoSelector
        open={selectorTarget === "excess"}
        onClose={() => setSelectorTarget(null)}
        supplies={supplies}
        selected={excessItems}
        onConfirm={handleSelectorConfirm}
        exclude={needItems}
      />
    </>
  );
}

function NeedRow({
  item,
  expanded,
  onToggleExpand,
  onToggleUrgent,
  onRemove,
  onSetQuantity,
  onSetUnit,
}: {
  item: SelectedItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleUrgent: () => void;
  onRemove: () => void;
  onSetQuantity: (quantity: number | null) => void;
  onSetUnit: (unit: string) => void;
}) {
  const urgent = !!item.isUrgent;
  return (
    <div
      className={`w-full rounded-xl ${urgent ? "bg-error-tint" : "bg-accent-subtle"} ${
        expanded
          ? `border-[1.5px] ${urgent ? "border-error" : "border-accent"}`
          : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span
          className={`min-w-0 flex-1 text-[15px] font-medium ${
            urgent ? "text-error" : "text-neutral-900"
          }`}
        >
          {item.name}
        </span>
        {!expanded && item.quantity != null && (
          <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-500">
            {formatItemQuantity(item.quantity, item.unit)}
          </span>
        )}
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-neutral-500">
              Cantidad{" "}
              <span className="text-neutral-400">(opcional)</span>
            </span>
            <QuantityStepper
              name={item.name}
              quantity={item.quantity ?? null}
              onSet={onSetQuantity}
            />
          </div>
          {/* Unit chips only appear once there's a quantity to measure. */}
          {item.quantity != null && (
            <UnitChips
              name={item.name}
              unit={item.unit ?? DEFAULT_LISTA_ITEM_UNIT}
              onSet={onSetUnit}
            />
          )}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-neutral-500">Urgente</span>
            <button
              type="button"
              role="switch"
              aria-checked={urgent}
              aria-label={`Urgente: ${item.name}`}
              onClick={onToggleUrgent}
              className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${
                urgent ? "bg-accent" : "bg-neutral-300"
              }`}
            >
              <span
                className={`absolute top-[3px] h-5 w-5 rounded-full bg-surface transition-[left] ${
                  urgent ? "left-[21px]" : "left-[3px]"
                }`}
              />
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="self-start text-sm font-semibold text-error"
          >
            Quitar de la lista
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cantidad stepper for the expanded A2 row (field-insight §1): − / numeric
 * input / +. Steps go 5 by 5 (field quantities are round: 15, 50, 300…);
 * the input still takes any exact number. Empty input = no quantity (null);
 * "−" at or below 5 clears it. Unit is picked separately via `UnitChips`.
 */
function QuantityStepper({
  name,
  quantity,
  onSet,
}: {
  name: string;
  quantity: number | null;
  onSet: (quantity: number | null) => void;
}) {
  const commitDraft = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    onSet(Number.isInteger(n) && n > 0 ? n : null);
  };
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-neutral-300 bg-surface">
      <button
        type="button"
        onClick={() => onSet(quantity != null && quantity > 5 ? quantity - 5 : null)}
        aria-label={`Reducir cantidad de ${name}`}
        className="flex h-9 w-9 items-center justify-center text-lg text-neutral-700 hover:bg-neutral-100"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={quantity ?? ""}
        placeholder="—"
        onChange={(e) => commitDraft(e.target.value)}
        aria-label={`Cantidad de ${name}`}
        className="h-9 w-14 border-x border-neutral-300 bg-surface text-center text-sm font-semibold tabular-nums text-neutral-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onSet((quantity ?? 0) + 5)}
        aria-label={`Aumentar cantidad de ${name}`}
        className="flex h-9 w-9 items-center justify-center text-lg text-neutral-700 hover:bg-neutral-100"
      >
        +
      </button>
    </div>
  );
}

/**
 * Unidad picker for the expanded need row (#101 follow-up): a single-select
 * chip row under the quantity stepper, shown only once the item has a quantity
 * (the unit only means something alongside an amount). One tap sets the unit;
 * the chosen chip carries the accent (selected state — sanctioned under the
 * single-accent rule), the rest stay neutral. The offered set
 * (ud./kg/L/caja/paq.) is shown, plus the item's own unit if it's a legacy
 * value outside that set.
 */
function UnitChips({
  name,
  unit,
  onSet,
}: {
  name: string;
  unit: string;
  onSet: (unit: string) => void;
}) {
  const current = isListaItemUnit(unit) ? unit : DEFAULT_LISTA_ITEM_UNIT;
  const units: ListaItemUnit[] = LISTA_ITEM_UNIT_CYCLE.includes(current)
    ? [...LISTA_ITEM_UNIT_CYCLE]
    : [...LISTA_ITEM_UNIT_CYCLE, current];
  return (
    <div
      role="radiogroup"
      aria-label={`Unidad de ${name}`}
      className="animate-unit-chips-in flex flex-wrap gap-2"
    >
      {units.map((u) => {
        const selected = u === current;
        return (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSet(u)}
            className={`h-8 rounded-full border-[1.5px] px-3 text-[13px] font-semibold tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-accent ${
              selected
                ? "border-accent bg-surface text-accent"
                : "border-neutral-300 bg-surface text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {LISTA_ITEM_UNIT_SHORT[u]}
          </button>
        );
      })}
    </div>
  );
}

function ExcessRow({
  item,
  onRemove,
}: {
  item: SelectedItem;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-warning-tint px-4 py-3">
      <span className="text-[15px] font-medium text-warning">{item.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${item.name}`}
        className="shrink-0 text-warning/70 hover:text-warning"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function StepCounter({ step }: { step: 1 | 2 }) {
  return <span className="text-sm text-neutral-400">{step} de 2</span>;
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

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-neutral-400 transition-transform ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckCircleIcon() {
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
      className="shrink-0 text-success"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m22 4-10 10.01-3-3" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}
