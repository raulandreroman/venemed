"use client";

import { useCallback, useRef, useState } from "react";

import { AppBar, Button, Tag } from "@/components/ui";
import { publishLista } from "@/app/(center)/actions/publicar";
import type { CenterEditableLista } from "@/db/queries";
import {
  EXCESS_REASON_MAX,
  INSTRUCTIONS_MAX,
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
};

type Supply = { id: string; name: string };

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
  const [excessView, setExcessView] = useState<"intro" | "form">(
    initialStep === 2 || hadInitialExcess ? "form" : "intro",
  );
  const [urgentMode, setUrgentMode] = useState(false);
  const [urgentDraft, setUrgentDraft] = useState<Set<string>>(new Set());
  const [selectorTarget, setSelectorTarget] = useState<"need" | "excess" | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable per mount so a retried submit dedupes via lista.idempotency_key.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const hasUrgent = needItems.some((it) => it.isUrgent);

  const removeNeedItem = useCallback((key: string) => {
    setNeedItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const setNeedQuantity = useCallback((key: string, quantity: number | null) => {
    setNeedItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, quantity } : it)),
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
            };
          });
        });
      } else if (selectorTarget === "excess") {
        setExcessItems(items);
      }
      setSelectorTarget(null);
    },
    [selectorTarget],
  );

  const enterUrgentMode = useCallback(() => {
    setUrgentDraft(
      new Set(needItems.filter((it) => it.isUrgent).map((it) => it.key)),
    );
    setUrgentMode(true);
  }, [needItems]);

  const toggleUrgentDraft = useCallback((key: string) => {
    setUrgentDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const cancelUrgentMode = useCallback(() => setUrgentMode(false), []);

  const confirmUrgentMode = useCallback(() => {
    setNeedItems((prev) =>
      prev.map((it) => ({ ...it, isUrgent: urgentDraft.has(it.key) })),
    );
    setUrgentMode(false);
  }, [urgentDraft]);

  const goToStep2 = useCallback(() => {
    if (needItems.length === 0) {
      setError("Agrega al menos un insumo.");
      return;
    }
    setError(null);
    setExcessView(excessItems.length > 0 ? "form" : "intro");
    setStep(2);
  }, [needItems, excessItems]);

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
          ...(it.quantity != null ? { quantity: it.quantity } : {}),
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
    [hadInitialExcess, needItems, excessItems, nota, excessReason],
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
            {urgentMode && (
              <p className="mt-1 text-sm text-neutral-500">
                Marca insumos como urgente
              </p>
            )}

            {needItems.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {needItems.map((it) => (
                  <li key={it.key}>
                    <NeedRow
                      item={it}
                      editing={urgentMode}
                      draftChecked={urgentDraft.has(it.key)}
                      onToggleDraft={() => toggleUrgentDraft(it.key)}
                      onRemove={() => removeNeedItem(it.key)}
                      onSetQuantity={(q) => setNeedQuantity(it.key, q)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {urgentMode ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={cancelUrgentMode}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" fullWidth onClick={confirmUrgentMode}>
                    Confirmar
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={enterUrgentMode}
                    disabled={needItems.length === 0}
                    className="text-accent"
                  >
                    <WarningIcon />
                    {hasUrgent ? "Editar urgentes" : "Marcar como urgente"}
                  </Button>
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
                </>
              )}
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
      />
    </>
  );
}

function NeedRow({
  item,
  editing,
  draftChecked,
  onToggleDraft,
  onRemove,
  onSetQuantity,
}: {
  item: SelectedItem;
  editing: boolean;
  draftChecked: boolean;
  onToggleDraft: () => void;
  onRemove: () => void;
  onSetQuantity: (quantity: number | null) => void;
}) {
  const bg = editing
    ? "bg-accent-subtle"
    : item.isUrgent
      ? "bg-error-tint"
      : "bg-accent-subtle";

  if (editing) {
    return (
      <button
        type="button"
        onClick={onToggleDraft}
        aria-pressed={draftChecked}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ${bg}`}
      >
        <span className="text-[15px] font-medium text-neutral-900">
          {item.name}
        </span>
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border ${
            draftChecked
              ? "border-accent bg-accent text-accent-on"
              : "border-neutral-300 bg-surface"
          }`}
        >
          {draftChecked && (
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
      </button>
    );
  }

  return (
    <div
      className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 ${bg}`}
    >
      <span className="text-[15px] font-medium text-neutral-900">
        {item.name}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <QuantityControl
          name={item.name}
          quantity={item.quantity ?? null}
          onSet={onSetQuantity}
        />
        {item.isUrgent && <Tag variant="urgent">Urgente</Tag>}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${item.name}`}
          className="text-neutral-500 hover:text-neutral-700"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

/**
 * Optional per-item quantity affordance (field-insight-whatsapp §1). Shows a
 * filled "× N" pill when set, a ghost "+ Cantidad" when unset; tapping either
 * reveals an inline numeric input. Commits a positive int on Enter/blur; an
 * empty or invalid value clears the quantity (null). Display-only — the unit is
 * implied by the item name, so there's no unit field.
 */
function QuantityControl({
  name,
  quantity,
  onSet,
}: {
  name: string;
  quantity: number | null;
  onSet: (quantity: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const start = () => {
    setDraft(quantity != null ? String(quantity) : "");
    setOpen(true);
  };

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    onSet(Number.isInteger(n) && n > 0 ? n : null);
    setOpen(false);
  };

  if (open) {
    return (
      <input
        type="number"
        inputMode="numeric"
        min={1}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-label={`Cantidad de ${name}`}
        placeholder="Cant."
        className="h-8 w-20 rounded-md border-[1.5px] border-accent bg-surface px-2 text-sm tabular-nums text-neutral-900 outline-none focus:ring-2 focus:ring-accent/30"
      />
    );
  }

  if (quantity != null) {
    return (
      <button
        type="button"
        onClick={start}
        aria-label={`Editar cantidad de ${name}`}
        className="rounded-full border border-neutral-300 bg-surface px-2.5 py-1 text-sm font-medium tabular-nums text-neutral-700 hover:border-neutral-400"
      >
        × {quantity}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="rounded-full px-2.5 py-1 text-sm font-medium text-accent hover:bg-accent-subtle"
    >
      + Cantidad
    </button>
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

function WarningIcon() {
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
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
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
