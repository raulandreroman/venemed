"use client";

import { useCallback, useRef, useState } from "react";

import { Button, SegmentedControl } from "@/components/ui";
import { publishRequest } from "@/app/(center)/actions/publicar";
import {
  INSTRUCTIONS_MAX,
  TITLE_MAX,
  WINDOW_OPTIONS,
  type PublishRequestInput,
  type WindowHours,
} from "@/lib/solicitudes/validation";

import { InsumoSelector } from "./insumo-selector";

/** A donation item chosen in the form: a catalog supply (supplyId+name) or a
 * free-text custom (name only). `key` is stable for React + de-dup. */
export type SelectedItem = {
  key: string;
  supplyId?: string;
  name: string;
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
 * Crear solicitud (Figma 32:4929). Client-owned form state: título + counter,
 * donation items (filled via the co-located selector sheet), 12/24/48 segmented
 * window, instrucciones + counter. Submits the real `publishRequest` server
 * action; the selector returns its picks into state. (The "área" facet was
 * dropped — categories are derived from the chosen insumos server-side.)
 */
export function CreateRequestForm({ supplies }: { supplies: Supply[] }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [windowHours, setWindowHours] = useState<WindowHours>(24);
  const [instructions, setInstructions] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable per mount so a retried submit dedupes via request.idempotency_key.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const openSelector = useCallback(() => {
    setError(null);
    setSelectorOpen(true);
  }, []);

  const canSubmit =
    title.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    items.length > 0 &&
    instructions.length <= INSTRUCTIONS_MAX;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      setError("Completa el título y agrega al menos un insumo.");
      return;
    }
    setError(null);
    setPending(true);
    const input: PublishRequestInput = {
      title: title.trim(),
      windowHours,
      deliveryInstructions: instructions.trim() || undefined,
      items: items.map((it) =>
        it.supplyId ? { supplyId: it.supplyId } : { customName: it.name },
      ),
      idempotencyKey: idempotencyKey.current,
    };
    try {
      await publishRequest(input); // always ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) throw e; // let Next navigate
      setError("No pudimos publicar la solicitud. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [canSubmit, title, windowHours, instructions, items]);

  return (
    <>
      <main className="flex flex-1 flex-col gap-7 px-4 pb-28 pt-4">
        <p className="text-sm text-neutral-500">
          Pide solo lo que tu centro puede recibir y procesar ahora.
        </p>

        {/* Título */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Título de la solicitud
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Qué es lo que necesitas, en pocas palabras.
          </p>
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Insumos pediátricos"
            aria-label="Título de la solicitud"
            className="mt-3 h-12 w-full rounded-xl border border-neutral-300 bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-right text-xs text-neutral-400">
            {title.length} / {TITLE_MAX}
          </p>
        </section>

        {/* Detalle de donación */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Detalle de donación ({items.length})
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Agrega del catálogo o crea uno nuevo.
          </p>
          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {items.map((it) => (
                <span
                  key={it.key}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent"
                >
                  {it.name}
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    aria-label={`Quitar ${it.name}`}
                    className="text-accent/70 hover:text-accent"
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={openSelector}
            className="mt-3 text-accent"
          >
            <PlusIcon />
            Agregar insumos
          </Button>
        </section>

        {/* Ventana de tiempo */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">Ventana de tiempo</h2>
          <p className="mt-1 mb-3 text-sm text-neutral-500">
            Tiempo para recibir donaciones antes de cerrar la solicitud.
          </p>
          <SegmentedControl
            ariaLabel="Ventana de tiempo"
            value={windowHours}
            onChange={(v) => setWindowHours(v)}
            options={WINDOW_OPTIONS.map((h) => ({ value: h, label: `${h} h` }))}
          />
        </section>

        {/* Instrucciones de entrega */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Instrucciones de entrega
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Dónde dejar la donación dentro del centro.
          </p>
          <textarea
            value={instructions}
            maxLength={INSTRUCTIONS_MAX}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="Ej: Entrada principal · pregunta por Recepción de donaciones"
            aria-label="Instrucciones de entrega"
            className="mt-3 w-full resize-none rounded-xl border border-neutral-300 bg-surface px-3 py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-right text-xs text-neutral-400">
            {instructions.length} / {INSTRUCTIONS_MAX}
          </p>
        </section>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </main>

      {/* sticky publish footer */}
      <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
        <Button type="button" fullWidth disabled={pending} onClick={handleSubmit}>
          {pending ? "Publicando…" : "Publicar solicitud"}
        </Button>
      </footer>

      <InsumoSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        supplies={supplies}
        selected={items}
        onConfirm={setItems}
      />
    </>
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

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
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
