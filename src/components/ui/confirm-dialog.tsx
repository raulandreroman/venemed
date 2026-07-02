"use client";

import { useEffect, useRef } from "react";

import { Button } from "./button";

/**
 * Centered confirm dialog on a scrim (Figma 77:1524 "Confirm Finalizar"), as
 * distinct from the bottom-sheet chrome (RequestSheet / InsumoSelector). A
 * reusable primitive — the center detail uses it for "Finalizar solicitud" and
 * §3.4 reuses it for the reception toggle.
 *
 * Controlled by `open`; toggled on click events by the parent (never via a
 * synchronous setState in a useEffect body — gotcha #3). The effect below only
 * attaches listeners + locks scroll; it never sets parent state.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  pending = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "outline" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
    >
      <button
        type="button"
        aria-label="Cancelar"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-[340px] rounded-2xl bg-surface p-5 shadow-xl outline-none"
      >
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        <p className="mt-2 text-sm text-neutral-500">{body}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            fullWidth
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
